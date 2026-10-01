import { createClient } from "npm:@supabase/supabase-js@2.99.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const BUCKET = "placement-proof-images";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function verifyGoogleUser(req: Request) {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("GOOGLE_AUTH_REQUIRED");

  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("GOOGLE_AUTH_INVALID");
  const profile = await response.json() as { email?: string; verified_email?: boolean };
  const email = (profile.email || "").toLowerCase();
  if (!email || profile.verified_email !== true) throw new Error("GOOGLE_EMAIL_UNVERIFIED");

  const { data: user, error } = await supabase
    .from("workspace_users")
    .select("email, role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!user) throw new Error("WORKSPACE_ACCESS_DENIED");
  return user as { email: string; role: string; is_active: boolean };
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
  return { advertiser, accessLevel: String(access.access_level || "") };
}

function safeExt(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const user = await verifyGoogleUser(req);
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (body?.action !== "signed_url") return json({ error: "UNKNOWN_ACTION" }, 400);
      const advertiserName = String(body.advertiser || "");
      const path = String(body.path || "");
      if (!advertiserName || !path) return json({ error: "INVALID_SIGNED_URL_REQUEST" }, 400);
      const { advertiser } = await resolveAdvertiser(user.email, advertiserName);
      if (!path.startsWith(`${advertiser.id}/`) || !/^[a-z0-9_./-]+$/i.test(path) || path.split("/").some(segment => !segment || segment === "." || segment === "..")) return json({ error: "IMAGE_ACCESS_DENIED" }, 403);
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
      if (error) throw error;
      return json({ signedUrl: data.signedUrl });
    }

    const form = await req.formData();
    const advertiserName = String(form.get("advertiser") || "");
    const reportDate = String(form.get("reportDate") || "");
    const sourceFile = String(form.get("sourceFile") || "");
    const file = form.get("file");
    const importId = String(form.get("importId") || "");
    const expectedUpdatedAt = String(form.get("expectedUpdatedAt") || "");
    if (!advertiserName || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !sourceFile || !(file instanceof File)) {
      return json({ error: "INVALID_UPLOAD_REQUEST" }, 400);
    }
    if (!ALLOWED_TYPES.has(file.type)) return json({ error: "UNSUPPORTED_IMAGE_TYPE" }, 415);
    if (file.size > MAX_BYTES) return json({ error: "IMAGE_TOO_LARGE" }, 413);

    const { advertiser, accessLevel } = await resolveAdvertiser(user.email, advertiserName);
    if (!["owner", "editor"].includes(accessLevel)) return json({ error: "WRITE_ACCESS_DENIED" }, 403);

    let importQuery = supabase.from("report_imports").select("id, metadata, updated_at")
      .eq("advertiser_id", advertiser.id).eq("report_date", reportDate).eq("source_file", sourceFile);
    if (importId) importQuery = importQuery.eq("id", importId);
    const { data: imports, error: importError } = await importQuery.order("updated_at", { ascending: false }).limit(1);
    if (importError) throw importError;
    const reportImport = imports?.[0];
    if (!reportImport) return json({ error: "PLACEMENT_PROOF_IMPORT_NOT_FOUND" }, 404);

    if (!reportImport.metadata?.bundle?.placementProof) return json({ error: "PLACEMENT_PROOF_IMPORT_NOT_FOUND" }, 404);
    if (expectedUpdatedAt && expectedUpdatedAt !== reportImport.updated_at) return json({ error: "PLACEMENT_CHANGED" }, 409);
    const path = `${advertiser.id}/${reportDate}/${reportImport.id}-${crypto.randomUUID()}.${safeExt(file)}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const metadata = (reportImport.metadata && typeof reportImport.metadata === "object") ? reportImport.metadata as Record<string, unknown> : {};
    const bundle = (metadata.bundle && typeof metadata.bundle === "object") ? metadata.bundle as Record<string, unknown> : {};
    const proof = (bundle.placementProof && typeof bundle.placementProof === "object") ? bundle.placementProof as Record<string, unknown> : {};
    const nextMetadata = {
      ...metadata,
      bundle: {
        ...bundle,
        placementProof: {
          ...proof,
          manualImagePath: path,
        },
      },
    };

    const updatedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase.from("report_imports")
      .update({ metadata: nextMetadata, updated_at: updatedAt, updated_by: user.email })
      .eq("id", reportImport.id).eq("updated_at", reportImport.updated_at).select("id").maybeSingle();
    if (updateError || !updated) {
      await supabase.storage.from(BUCKET).remove([path]);
      if (updateError) throw updateError;
      return json({ error: "PLACEMENT_CHANGED" }, 409);
    }
    const audit = await supabase.from("workspace_activity").insert({
      actor_email: user.email, advertiser_id: advertiser.id, action: "placement_image_saved",
      detail: { importId: reportImport.id, reportDate },
    });
    if (audit.error) throw audit.error;
    return json({ ok: true, path, updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("DENIED") ? 403 : (message.includes("AUTH") || message.includes("GOOGLE_EMAIL")) ? 401 : 500;
    return json({ error: message }, status);
  }
});
