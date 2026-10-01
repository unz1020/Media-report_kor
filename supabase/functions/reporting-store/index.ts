import { normalizeInsightInput, retainInsightOverride } from "./insight-input.ts";
import { normalizePlacementInput } from "./placement-input.ts";
import { createClient } from "npm:@supabase/supabase-js@2.99.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function firstOfMonth(date: string) {
  return /^\d{4}-\d{2}/.test(date) ? `${date.slice(0, 7)}-01` : null;
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return date.toISOString().slice(0, 10);
}

function isoOrNull(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function verifyGoogleUser(req: Request) {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("GOOGLE_AUTH_REQUIRED");

  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("GOOGLE_AUTH_INVALID");
  const profile = await response.json() as { email?: string; verified_email?: boolean; name?: string };
  const email = (profile.email || "").toLowerCase();
  if (!email || profile.verified_email !== true) throw new Error("GOOGLE_EMAIL_UNVERIFIED");

  const { data: user, error } = await supabase
    .from("workspace_users")
    .select("email, display_name, role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!user) throw new Error("WORKSPACE_ACCESS_DENIED");
  return user as { email: string; display_name: string | null; role: string; is_active: boolean };
}

async function resolveAdvertiser(email: string, input: string) {
  if (!input || /[,()]/.test(input)) throw new Error("ADVERTISER_NOT_FOUND");
  const { data: advertiser, error } = await supabase
    .from("advertisers")
    .select("id, slug, name, is_active")
    .or(`name.eq.${input},slug.eq.${input}`)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!advertiser) throw new Error("ADVERTISER_NOT_FOUND");

  const { data: access, error: accessError } = await supabase
    .from("workspace_user_advertisers")
    .select("access_level")
    .eq("email", email)
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();
  if (accessError) throw accessError;
  if (!access) throw new Error("ADVERTISER_ACCESS_DENIED");
  return { advertiser, accessLevel: access.access_level as string };
}

async function getOrCreateImport(input: {
  advertiserId: string;
  reportDate: string;
  sourceFile: string;
  sourceSheet?: string;
  sourceType: string;
  sourceUrl?: string | null;
  mailSubject?: string | null;
  mailDate?: string | null;
  metadata: Record<string, unknown>;
  actorEmail: string;
}) {
  const sourceSheet = input.sourceSheet || "";
  const { data: existing, error: findError } = await supabase
    .from("report_imports")
    .select("id, metadata, updated_at")
    .eq("advertiser_id", input.advertiserId)
    .eq("report_date", input.reportDate)
    .eq("source_file", input.sourceFile)
    .eq("source_sheet", sourceSheet)
    .maybeSingle();
  if (findError) throw findError;

  retainInsightOverride(input.metadata, existing?.metadata);
  const payload = {
    advertiser_id: input.advertiserId,
    report_date: input.reportDate,
    month: firstOfMonth(input.reportDate),
    source_type: input.sourceType,
    source_file: input.sourceFile,
    source_sheet: sourceSheet,
    source_url: input.sourceUrl || null,
    mail_subject: input.mailSubject || null,
    mail_date: isoOrNull(input.mailDate),
    parser_version: "supabase-v1",
    status: "published",
    metadata: input.metadata,
    updated_by: input.actorEmail,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabase.from("report_imports").update(payload).eq("id", existing.id).eq("updated_at", existing.updated_at).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("INSIGHT_CHANGED");
    return existing.id as string;
  }

  const { data, error } = await supabase.from("report_imports").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function replaceFacts(importId: string, advertiserId: string, bundle: any) {
  await Promise.all([
    supabase.from("placement_facts").delete().eq("import_id", importId),
    supabase.from("daily_facts").delete().eq("import_id", importId),
    supabase.from("creative_facts").delete().eq("import_id", importId),
    supabase.from("daily_insights").delete().eq("import_id", importId),
  ]);

  const placements = (bundle.placements || []).map((row: any) => ({
    import_id: importId,
    advertiser_id: advertiserId,
    report_date: bundle.reportDate,
    media: row.platform || "미확인",
    placement: row.placement || "미확인",
    achievement: row.achievement ?? null,
    guaranteed: row.guaranteed || null,
    spend: row.spend ?? null,
    impressions: row.impressions ?? null,
    clicks: row.clicks ?? null,
    ctr: row.ctr ?? null,
    views: row.views ?? null,
    vtr: row.vtr ?? null,
    conversions: row.conversions ?? null,
    cpc: row.cpc ?? null,
    cpm: row.cpm ?? null,
    cpv: row.cpv ?? null,
    source_sheet: row.sourceSheet || null,
    extra_metrics: {},
  }));
  if (placements.length) {
    const { error } = await supabase.from("placement_facts").insert(placements);
    if (error) throw error;
  }

  const daily = (bundle.dailyPerformance || []).map((row: any) => ({
    import_id: importId,
    advertiser_id: advertiserId,
    date: row.date,
    media: row.platform || "미확인",
    placement: row.placement || "미확인",
    spend: row.spend ?? null,
    impressions: row.impressions ?? null,
    clicks: row.clicks ?? null,
    ctr: row.ctr ?? null,
    views: row.views ?? null,
    vtr: row.vtr ?? null,
    conversions: row.conversions ?? null,
    cpc: row.cpc ?? null,
    cpm: row.cpm ?? null,
    cpv: row.cpv ?? null,
    source_sheet: row.sourceSheet || null,
    extra_metrics: {},
  }));
  if (daily.length) {
    const { error } = await supabase.from("daily_facts").insert(daily);
    if (error) throw error;
  }

  const creative = (bundle.creativeDailyPerformance || []).map((row: any) => ({
    import_id: importId,
    advertiser_id: advertiserId,
    date: row.date,
    media: row.platform || "미확인",
    placement: row.placement || null,
    creative_name: row.creative || "미확인",
    impressions: row.impressions ?? null,
    clicks: row.clicks ?? null,
    ctr: row.ctr ?? null,
    source_sheet: row.sourceSheet || null,
    extra_metrics: {},
  }));
  if (creative.length) {
    const { error } = await supabase.from("creative_facts").insert(creative);
    if (error) throw error;
  }

  if ((bundle.operationNotes || []).length) {
    const { error } = await supabase.from("daily_insights").insert({
      advertiser_id: advertiserId,
      import_id: importId,
      report_date: bundle.reportDate,
      media: null,
      subject: null,
      body_excerpt: null,
      notes: bundle.operationNotes,
    });
    if (error) throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const user = await verifyGoogleUser(req);
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "load_state") {
      const month = String(body.month || "");
      if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: "INVALID_MONTH" }, 400);
      const { advertiser, accessLevel } = await resolveAdvertiser(user.email, String(body.advertiser || ""));
      const start = `${month}-01`;
      const end = nextMonth(month);
      const [{ data: imports, error: importError }, { data: insights, error: insightError }] = await Promise.all([
        supabase.from("report_imports").select("*").eq("advertiser_id", advertiser.id).eq("month", start).eq("status", "published").order("report_date", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("daily_insights").select("*").eq("advertiser_id", advertiser.id).gte("report_date", start).lt("report_date", end).order("report_date", { ascending: true }),
      ]);
      if (importError) throw importError;
      if (insightError) throw insightError;
      return json({ user, advertiser, accessLevel, imports: imports || [], insights: insights || [] });
    }

    if (action === "save_insight") {
      const input = body.input || {};
      const { advertiser, accessLevel } = await resolveAdvertiser(user.email, String(input.advertiser || ""));
      if (!["owner", "editor"].includes(accessLevel)) return json({ error: "WRITE_ACCESS_DENIED" }, 403);
      let edit;
      try { edit = normalizeInsightInput(input); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "INVALID_INSIGHT_NOTES" }, 400); }
      const { data, error } = await supabase.rpc("edit_daily_insight", {
        caller_email: user.email, advertiser_id_input: advertiser.id,
        insight_id_input: edit.insightId, expected_updated_at_input: edit.expectedUpdatedAt, notes_input: edit.notes,
      });
      if (error) throw new Error(error.message);
      return json({ ok: true, insight: data });
    }

    if (action === "save_manual_proof") {
      const input = body.input || {};
      const { advertiser, accessLevel } = await resolveAdvertiser(user.email, String(input.advertiser || ""));
      if (!["owner", "editor"].includes(accessLevel)) return json({ error: "WRITE_ACCESS_DENIED" }, 403);
      let setup;
      try { setup = normalizePlacementInput(input); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "INVALID_PLACEMENT" }, 400); }
      const importId = String(input.importId || "");
      const clientId = String(input.clientId || "");
      if (!importId && !/^[0-9a-f-]{36}$/i.test(clientId)) return json({ error: "INVALID_PLACEMENT_ID" }, 400);
      let query = supabase.from("report_imports").select("*").eq("advertiser_id", advertiser.id);
      if (importId) query = query.eq("id", importId);
      else query = query.eq("source_file", `[manual-placement] ${clientId}`).eq("report_date", `${setup.month}-01`).eq("source_type", "other");
      const { data: existing, error: findError } = await query.maybeSingle();
      if (findError) throw findError;
      if (importId && !existing) return json({ error: "PLACEMENT_NOT_FOUND" }, 404);
      const previous = existing?.metadata?.bundle?.placementProof;
      if (existing && (!previous || previous.month !== setup.month)) return json({ error: "PLACEMENT_SCOPE_DENIED" }, 403);
      if (importId && (!input.expectedUpdatedAt || input.expectedUpdatedAt !== existing.updated_at)) return json({ error: "PLACEMENT_CHANGED" }, 409);
      const reportDate = existing?.report_date || `${setup.month}-01`;
      const sourceFile = existing?.source_file || `[manual-placement] ${clientId}`;
      const proof = {
        ...(previous || {}), ...setup, advertiser: advertiser.name, reportDate, sourceFile,
        serviceType: previous?.serviceType || "디지털 사전 세팅", setupOrigin: previous?.setupOrigin || (existing ? undefined : "manual"),
        messageId: previous?.messageId || "", mailSubject: previous?.mailSubject || "",
        mailDate: previous?.mailDate || "", attachments: previous?.attachments || [],
        sourceSummary: previous?.sourceSummary || "수동 등록", location: previous?.location || "",
        airingTime: previous?.airingTime || "", dailyFrequency: previous?.dailyFrequency ?? null,
        durationSec: previous?.durationSec ?? null, budgetReference: previous?.budgetReference ?? null,
      };
      const bundle = { ...(existing?.metadata?.bundle || {
        advertiser: advertiser.name, reportDate, campaignStart: `${setup.month}-01`, campaignEnd: reportDate,
        sourceFile, parsedSheets: [], ignoredSheets: [], placements: [], dailyPerformance: [],
        creativeDailyPerformance: [], mediaPlan: [], planSourceSheets: [], mailChecks: [], operationNotes: [],
        qa: { matchedMailMetrics: 0, mismatchedMailMetrics: 0, unmatchedMailMetrics: 0, ignoredSheetCount: 0 },
      }), placementProof: proof };
      const updatedAt = new Date().toISOString();
      let savedId: string;
      if (existing) {
        const { data: updated, error } = await supabase.from("report_imports").update({
          metadata: { ...existing.metadata, bundle }, updated_at: updatedAt, updated_by: user.email,
        }).eq("id", existing.id).eq("updated_at", existing.updated_at).select("id").maybeSingle();
        if (error) throw error;
        if (!updated) return json({ error: "PLACEMENT_CHANGED" }, 409);
        savedId = existing.id;
      } else {
        savedId = await getOrCreateImport({ advertiserId: advertiser.id, reportDate, sourceFile,
          sourceSheet: "", sourceType: "other", metadata: { manualSetup: true, bundle }, actorEmail: user.email });
      }
      const { data: savedImport, error: savedError } = await supabase.from("report_imports").select("updated_at").eq("id", savedId).single();
      if (savedError) throw savedError;
      const audit = await supabase.from("workspace_activity").insert({
        actor_email: user.email, advertiser_id: advertiser.id, action: "placement_saved",
        detail: { importId: savedId, media: setup.media, placement: setup.placement, month: setup.month, status: setup.status },
      });
      if (audit.error) throw audit.error;
      return json({ ok: true, proof: { ...proof, importId: savedId, publishedAt: savedImport.updated_at } });
    }

    if (action === "publish_bundle") {
      const bundle = body.bundle || {};
      if (!bundle.advertiser || !bundle.reportDate || !bundle.sourceFile) return json({ error: "INVALID_BUNDLE" }, 400);
      const { advertiser, accessLevel } = await resolveAdvertiser(user.email, String(bundle.advertiser));
      if (!['owner','editor'].includes(accessLevel)) return json({ error: "WRITE_ACCESS_DENIED" }, 403);
      const importId = await getOrCreateImport({
        advertiserId: advertiser.id,
        reportDate: bundle.reportDate,
        sourceFile: bundle.sourceFile,
        sourceSheet: "",
        sourceType: String(body.sourceType || "gmail_excel"),
        sourceUrl: bundle.sourceUrl || null,
        mailSubject: body.mailSubject || null,
        mailDate: body.mailDate || null,
        metadata: { bundle },
        actorEmail: user.email,
      });
      await replaceFacts(importId, advertiser.id, bundle);
      const audit = await supabase.from("workspace_activity").insert({
        actor_email: user.email, advertiser_id: advertiser.id, action: "report_published",
        detail: { importId, sourceFile: bundle.sourceFile, reportDate: bundle.reportDate },
      });
      if (audit.error) throw audit.error;
      if ((bundle.operationNotes || []).length) {
        await supabase.from("daily_insights").update({ subject: body.mailSubject || null }).eq("import_id", importId);
      }
      return json({ ok: true, importId });
    }

    if (action === "publish_mail_only") {
      const input = body.input || {};
      if (!input.advertiser || !input.reportDate || !input.mailSubject) return json({ error: "INVALID_MAIL_INSIGHT" }, 400);
      const { advertiser, accessLevel } = await resolveAdvertiser(user.email, String(input.advertiser));
      if (!['owner','editor'].includes(accessLevel)) return json({ error: "WRITE_ACCESS_DENIED" }, 403);
      const importId = await getOrCreateImport({
        advertiserId: advertiser.id,
        reportDate: input.reportDate,
        sourceFile: `[mail] ${input.mailSubject}`,
        sourceSheet: "mail-only",
        sourceType: "other",
        mailSubject: input.mailSubject,
        mailDate: input.mailDate || null,
        metadata: { mailOnly: true, input },
        actorEmail: user.email,
      });
      await supabase.from("daily_insights").delete().eq("import_id", importId);
      const { error } = await supabase.from("daily_insights").insert({
        advertiser_id: advertiser.id,
        import_id: importId,
        report_date: input.reportDate,
        media: null,
        subject: input.mailSubject,
        body_excerpt: null,
        notes: input.notes || [],
      });
      if (error) throw error;
      const audit = await supabase.from("workspace_activity").insert({
        actor_email: user.email, advertiser_id: advertiser.id, action: "insight_published",
        detail: { importId, sourceFile: input.mailSubject, reportDate: input.reportDate },
      });
      if (audit.error) throw audit.error;
      return json({ ok: true, importId });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "INSIGHT_CHANGED" ? 409 : message === "INSIGHT_NOT_FOUND" ? 404 : message.startsWith("INVALID_INSIGHT") ? 400 : message.includes("DENIED") ? 403 : (message.includes("AUTH") || message.includes("GOOGLE_EMAIL")) ? 401 : 500;
    return json({ error: message }, status);
  }
});
