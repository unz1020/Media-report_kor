import { createClient } from "npm:@supabase/supabase-js@2.99.3";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "private, no-store" },
});
function check(result: { error: unknown }) { if (result.error) throw result.error; }

// Google verifies identity; DB membership, never request metadata, grants access.
async function identity(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error("GOOGLE_AUTH_REQUIRED");
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization } });
  if (!response.ok) throw new Error("GOOGLE_AUTH_INVALID");
  const profile = await response.json();
  if (!profile.email || profile.verified_email !== true) throw new Error("GOOGLE_EMAIL_UNVERIFIED");
  const result = await db.from("workspace_users").select("email,display_name,role,is_active,last_seen_at")
    .eq("email", String(profile.email).toLowerCase()).eq("is_active", true).maybeSingle();
  check(result);
  if (!result.data) throw new Error("WORKSPACE_ACCESS_DENIED");
  return result.data;
}
async function memberships(email: string) {
  const result = await db.from("workspace_user_advertisers")
    .select("advertiser_id,access_level,advertisers(id,slug,name,is_active)").eq("email", email);
  check(result);
  return (result.data || []).flatMap((row: any) => row.advertisers?.is_active
    ? [{ ...row.advertisers, accessLevel: row.access_level }] : []);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const user = await identity(req);
    const body = await req.json();
    const advertisers = await memberships(user.email);
    if (body.action === "session") {
      const imports = advertisers.length ? await db.from("report_imports").select("month,advertiser_id")
        .in("advertiser_id", advertisers.map((a: any) => a.id)).eq("status", "published") : { data: [], error: null };
      check(imports);
      const seen = await db.from("workspace_users").update({ last_seen_at: new Date().toISOString() }).eq("email", user.email);
      check(seen);
      return json({ user, advertisers, months: [...new Set((imports.data || []).map((r: any) => String(r.month).slice(0,7)))].sort().reverse() });
    }
    if (body.action === "activity") {
      if (!advertisers.length) return json({ activity: [] });
      const result = await db.from("workspace_activity").select("*")
        .in("advertiser_id", advertisers.map((a: any) => a.id)).order("created_at", { ascending: false }).limit(50);
      check(result);
      return json({ activity: result.data });
    }
    if (user.role !== "admin") return json({ error: "TEAM_ADMIN_REQUIRED" }, 403);
    if (body.action === "list_members") {
      const [members, access] = await Promise.all([
        db.from("workspace_users").select("email,display_name,role,is_active,last_seen_at,invited_by").order("created_at"),
        db.from("workspace_user_advertisers").select("email,advertiser_id,access_level"),
      ]);
      check(members); check(access);
      return json({ members: (members.data || []).map((member: any) => ({
        ...member, memberships: (access.data || []).filter((r: any) => r.email === member.email),
      })) });
    }
    if (["save_member","revoke_member"].includes(body.action)) {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "INVALID_EMAIL" },400);
      const ids = Array.isArray(body.advertiserIds) ? [...new Set(body.advertiserIds)] : [];
      if (body.action === "save_member" && (!["editor","viewer"].includes(body.accessLevel) ||
        !ids.length || ids.some(id => !advertisers.some((a: any) => a.id === id && a.accessLevel === "owner")))) {
        return json({ error: "ADVERTISER_ACCESS_DENIED" },403);
      }
      const result = await db.rpc("manage_workspace_member", {
        caller_email: user.email, member_email: email, member_name: String(body.displayName || email).trim().slice(0,100),
        member_access: String(body.accessLevel || "viewer"), advertiser_ids: ids,
        revoke_access: body.action === "revoke_member",
      });
      check(result);
      return json({ ok: true });
    }
    return json({ error: "UNKNOWN_ACTION" },400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as any)?.message || "WORKSPACE_ERROR");
    return json({ error: message }, /DENIED|ADMIN_REQUIRED/.test(message) ? 403 : /AUTH|UNVERIFIED/.test(message) ? 401 : 500);
  }
});
