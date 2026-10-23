// Run: node --test scripts/verify-auth-callback.cjs
// Synthetic fixtures only. No network, environment credentials, or application writes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const TOKEN_COOKIE = "media_report_gmail_token";
const STATE_COOKIE = "media_report_gmail_state";
const secrets = ["synthetic-code-secret", "synthetic-state-secret", "synthetic-access-secret", "synthetic-refresh-secret", "synthetic-cookie-secret", "synthetic-upstream-secret"];
const token = { access_token: secrets[2], refresh_token: secrets[3], expires_at: 9e12 };
const session = {
  user: { email: "member@example.invalid", display_name: null, role: "member", is_active: true },
  advertisers: [{ id: "test-id", name: "Test advertiser", slug: "test-advertiser", accessLevel: "viewer", is_active: true }],
  months: ["2026-10"],
};
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2592000 };
function compile(file) {
  const result = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  return result.outputText;
}
const callbackCode = compile("app/api/gmail/callback/route.ts");
const shellCode = compile("components/app-shell.tsx");

function callbackHarness(options = {}) {
  const calls = { exchange: [], fetch: [], encrypt: [], logs: [] };
  class NextRequest {
    constructor() {
      this.nextUrl = new URL("https://app.example.invalid/api/gmail/callback");
      this.nextUrl.searchParams.set("code", secrets[0]);
      this.nextUrl.searchParams.set("state", options.state ?? secrets[1]);
      if (options.error) this.nextUrl.searchParams.set("error", options.error);
      if (options.noCode) this.nextUrl.searchParams.delete("code");
      if (options.noState) this.nextUrl.searchParams.delete("state");
      this.url = this.nextUrl.href;
      this.cookies = { get: name => name === STATE_COOKIE && !options.noStoredState ? { value: secrets[1] } : undefined };
    }
  }
  const NextResponse = {
    redirect(url) {
      const mutations = [];
      return { location: url.href, mutations, cookies: {
        set(name, value, flags) { mutations.push({ action: "set", name, value, flags }); },
        delete(name) { mutations.push({ action: "delete", name }); },
      } };
    },
  };
  const oauth = {
    GMAIL_TOKEN_COOKIE: TOKEN_COOKIE, GMAIL_STATE_COOKIE: STATE_COOKIE,
    gmailCookieOptions: () => cookieOptions,
    async exchangeCodeForToken(...args) {
      calls.exchange.push(args);
      if (options.exchangeError) throw new Error(secrets.join(" "));
      return options.token === undefined ? token : options.token;
    },
    encryptToken(value) {
      calls.encrypt.push(value);
      if (options.encryptError) throw new Error(secrets.join(" "));
      return secrets[4];
    },
  };
  const context = { exports: {}, URL, console: { error: (...args) => calls.logs.push(args) },
    require(name) {
      if (name === "next/server") return { NextRequest, NextResponse };
      if (name === "@/lib/gmail-oauth") return oauth;
      throw new Error(`Unexpected import: ${name}`);
    },
    async fetch(...args) {
      calls.fetch.push(args);
      if (options.networkError) throw new TypeError(`fetch failed ENOTFOUND ${secrets.join(" ")}`);
      const status = options.status ?? 200;
      return { status, ok: status >= 200 && status < 300,
        async json() {
          if (options.invalidJson) throw new SyntaxError(secrets.join(" "));
          return options.payload === undefined ? session : options.payload;
        },
        async text() { throw new Error("Upstream response text must never be read"); },
      };
    },
  };
  vm.runInNewContext(callbackCode, context, { filename: "callback.js" });
  return { calls, run: () => context.exports.GET(new NextRequest()) };
}
function assertSafe(result, calls) {
  const exposed = JSON.stringify([result.location, calls.logs]);
  for (const secret of [...secrets, session.user.email, session.advertisers[0].name]) assert.ok(!exposed.includes(secret), `Exposed fixture data: ${secret}`);
}
async function failed(options, reason, destination) {
  const harness = callbackHarness(options);
  const result = await harness.run();
  assert.equal(result.location, `https://app.example.invalid${destination || `/data-update?gmail=error&reason=${reason}`}`);
  assert.deepEqual(result.mutations, [{ action: "delete", name: TOKEN_COOKIE }, { action: "delete", name: STATE_COOKIE }]);
  assert.equal(harness.calls.encrypt.length, options.encryptError ? 1 : 0);
  assert.equal(JSON.stringify(harness.calls.logs), JSON.stringify([[`gmail_callback_failed:${reason}`]]));
  assertSafe(result, harness.calls);
  return harness.calls;
}

test("success requires token exchange and server-side workspace session before encrypted cookie", async () => {
  const h = callbackHarness();
  const result = await h.run();
  assert.equal(result.location, "https://app.example.invalid/data-update?gmail=connected");
  assert.deepEqual(h.calls.exchange, [[secrets[0], "https://app.example.invalid"]]);
  assert.equal(h.calls.fetch.length, 1);
  const [url, init] = h.calls.fetch[0];
  assert.equal(url, "https://akxuvlzaldoygmetzrdq.supabase.co/functions/v1/workspace-team");
  assert.equal(init.headers.authorization, `Bearer ${token.access_token}`);
  assert.equal(init.method, "POST");
  assert.equal(init.cache, "no-store");
  assert.equal(init.body, '{"action":"session"}');
  assert.deepEqual(h.calls.encrypt, [token]);
  assert.deepEqual(result.mutations, [
    { action: "set", name: TOKEN_COOKIE, value: secrets[4], flags: cookieOptions },
    { action: "delete", name: STATE_COOKIE },
  ]);
  assert.deepEqual(h.calls.logs, []);
  assertSafe(result, h.calls);
});
test("registered session with no advertiser memberships is valid", async () => {
  const h = callbackHarness({ payload: { ...session, advertisers: [], months: [] } });
  assert.match((await h.run()).location, /gmail=connected$/);
});
test("state mismatch, absent state/cookie/code fail closed without network", async () => {
  for (const options of [{ state: "mismatch" }, { noStoredState: true }, { noState: true }, { noCode: true }]) {
    const calls = await failed(options, "invalid_state");
    assert.equal(calls.exchange.length, 0);
    assert.equal(calls.fetch.length, 0);
  }
});
test("provider errors are mapped to fixed reasons and never reflected", async () => {
  for (const [error, reason] of [["access_denied", "oauth_denied"], [secrets.join(" "), "oauth_error"]]) {
    const calls = await failed({ error }, reason);
    assert.equal(calls.exchange.length, 0);
    assert.equal(calls.fetch.length, 0);
  }
});
test("membership/auth rejection preserves denied route and removes cookies", async () => {
  for (const status of [401, 403]) await failed({ status }, "access_denied", "/overview?access=denied");
});
test("workspace DNS and 5xx failures are availability errors, not access denial", async () => {
  await failed({ networkError: true }, "workspace_unavailable");
  for (const status of [400, 429, 500, 502, 503]) await failed({ status }, "workspace_unavailable");
});
test("malformed JSON and invalid HTTP-200 session payloads cannot authorize a cookie", async () => {
  await failed({ invalidJson: true }, "workspace_unavailable");
  for (const payload of [null, [], {}, { error: secrets[5] },
    { ...session, user: null }, { ...session, user: { ...session.user, email: "" } },
    { ...session, user: { ...session.user, role: "" } }, { ...session, advertisers: null },
    { ...session, advertisers: [{ ...session.advertisers[0], accessLevel: "admin" }] },
    { ...session, months: ["bad-month"] }]) {
    await failed({ payload }, "workspace_unavailable");
  }
});
test("token exchange exceptions and malformed tokens never reach workspace", async () => {
  for (const options of [{ exchangeError: true }, { token: null }, { token: { ...token, access_token: "" } }, { token: { ...token, expires_at: NaN } }]) {
    const calls = await failed(options, "token_exchange");
    assert.equal(calls.fetch.length, 0);
  }
});
test("encryption failure is classified separately and clears OAuth state", async () => {
  const calls = await failed({ encryptError: true }, "session_encryption");
  assert.equal(calls.exchange.length, 1);
  assert.equal(calls.fetch.length, 1);
});

function renderGate(search, sessionError = "") {
  let state = "";
  const effects = [];
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, URLSearchParams, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return { useState: () => [state, value => { state = value; }], useEffect: fn => effects.push(fn) };
    if (name === "next/navigation") return { usePathname: () => "/data-update" };
    if (name === "next/link") return { default: "Link" };
    if (name === "@/components/workspace-context") return {
      WorkspaceProvider: "WorkspaceProvider", useWorkspace: () => ({ session: null, sessionLoading: false, sessionError }),
    };
    throw new Error(`Unexpected import: ${name}`);
  } };
  vm.runInNewContext(`${shellCode}\nexports.testGate = AppShellInner;`, context);
  // No window during first (server/hydration) render. Query is read only in effect.
  const first = JSON.stringify(context.exports.testGate({ children: null }));
  context.window = { location: { search } };
  for (const effect of effects) effect();
  const hydrated = JSON.stringify(context.exports.testGate({ children: null }));
  return { first, hydrated };
}
test("login gate shows Korean allowlisted callback errors only after hydration", () => {
  const messages = {
    invalid_state: "로그인 요청이 만료", oauth_denied: "Google 로그인이 취소",
    oauth_error: "Google 로그인 중 오류", token_exchange: "Google 로그인 정보를 확인하지 못",
    workspace_unavailable: "팀 서버에 연결할 수 없", session_encryption: "로그인 세션을 안전하게 저장하지 못",
    access_denied: "등록되지 않았거나 접근이 해제",
  };
  for (const [reason, text] of Object.entries(messages)) {
    const result = renderGate(`?gmail=error&reason=${reason}`);
    assert.ok(result.first.includes("등록된 Google 계정으로 로그인"));
    assert.ok(result.hydrated.includes(text));
    assert.ok(result.hydrated.includes('"role":"alert"'));
  }
  assert.ok(renderGate("?access=denied").hydrated.includes(messages.access_denied));
  assert.ok(renderGate("", "WORKSPACE_UNAVAILABLE").hydrated.includes(messages.workspace_unavailable));
  for (const reason of [secrets[5], "__proto__", "constructor"]) {
    const result = renderGate(`?gmail=error&reason=${reason}`);
    assert.ok(result.hydrated.includes("등록된 Google 계정으로 로그인"));
    assert.ok(!result.hydrated.includes(reason));
  }
});
