// Deterministic SSR checks for the top navigation. Synthetic fixtures only; no network or credentials.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "components/app-shell.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  fileName: "components/app-shell.tsx",
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0, "AppShell must transpile cleanly");
const fixtures = {
  session: { user: { email: "fixture@example.invalid", display_name: "Synthetic Member", role: "member" } },
  advertiserKey: "fixture-advertiser", month: "2026-10", months: ["2026-10", "2026-09"],
  dataSyncState: "ready", dataSyncError: "", sessionLoading: false, sessionError: "", canEdit: true,
  allowedAdvertiserKeys: ["fixture-advertiser"],
  setAdvertiserKey() {}, setMonth() {}, refreshSession() {}, reloadData() {},
};
function render({ pathname = "/overview", workspace = {}, children = React.createElement("p", null, "Synthetic page") } = {}) {
  const state = { ...fixtures, ...workspace };
  const dependencies = {
    "react": React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { usePathname: () => pathname },
    "@/lib/workspace-months": { seoulReportingMonth: () => "2026-10", shiftWorkspaceMonth: () => "2026-11" },
    "@/components/workspace-context": {
      ADVERTISERS: { "fixture-advertiser": { label: "Synthetic advertiser" } },
      WorkspaceProvider: ({ children: inner }) => inner,
      useWorkspace: () => state,
    },
  };
  const context = { exports: {}, require(name) {
    if (name === "./app-shell.module.css") return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected import: ${name}`);
  } };
  vm.runInNewContext(compiled.outputText, context, { filename: "app-shell.js" });
  return renderToStaticMarkup(React.createElement(context.exports.AppShell, null, children));
}
function count(markup, pattern) { return [...markup.matchAll(pattern)].length; }

const routes = [
  ["/overview", "개요"], ["/performance", "성과"], ["/schedule", "일정"],
  ["/creative", "소재 · 게재지면"], ["/reports", "리포트"],
];
for (const [route, label] of routes) {
  const html = render({ pathname: route });
  assert.ok(html.includes('data-navigation="top"'), `${route}: top-navigation shell missing`);
  assert.match(html, /<nav\b[^>]*aria-label="주 메뉴"/, `${route}: primary navigation missing`);
  const primary = html.match(/<nav\b[^>]*aria-label="주 메뉴"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(primary, `${route}: primary navigation content exists`);
  assert.equal(count(primary, /<a\b/g), 5, `${route}: all five primary links remain`);
  for (const [href, name] of routes) { assert.ok(primary.includes(`href="${href}"`) && primary.includes(name), `${route}: retain ${name}`); }
  assert.equal(count(html, /aria-current="page"/g), 1, `${route}: exactly one current primary route`);
  const active = html.match(/<a\b[^>]*aria-current="page"[^>]*>(.*?)<\/a>/);
  assert.ok(active && active[1].includes(label), `${route}: expected ${label} to be current`);
  assert.ok(html.indexOf("<header") < html.indexOf('<main class="main"'), `${route}: header must precede main`);
  assert.equal(count(html, /<aside\b|sidebar/gi), 0, `${route}: legacy sidebar/aside must not render`);
}

const editor = render({ pathname: "/overview" });
for (const text of ["Synthetic Member", "팀 관리", "로그아웃", "데이터 업데이트", "광고주 선택", "조회 월 선택", "다른 월", "DB 동기화 완료", "새로고침", "11월 매체 정리"]) {
  assert.ok(editor.includes(text), `Editor shell must retain ${text}`);
}
assert.ok(editor.includes('aria-label="계정 및 도구 메뉴"'), "account menu must remain available");
assert.ok(editor.includes('id="workspace-content"'), "skip target/main content must remain available");
const viewer = render({ pathname: "/overview", workspace: { canEdit: false } });
assert.ok(viewer.includes("팀 관리") && viewer.includes("로그아웃"), "viewer retains team and logout actions");
for (const text of ["데이터 업데이트", "매체 정리"]) assert.ok(!viewer.includes(text), `Viewer must not see editor tool: ${text}`);
assert.ok(viewer.includes("조회 전용"), "viewer role is reflected in account panel");

const saving = render({ workspace: { dataSyncState: "saving" } });
assert.ok(saving.includes("DB 저장 중…"), "saving status remains visible");
assert.match(saving, /<select[^>]*aria-label="광고주 선택"[^>]*disabled/);
assert.match(saving, /<select[^>]*aria-label="조회 월 선택"[^>]*disabled/);
assert.match(saving, /다른 월<\/button>/);

const loading = render({ workspace: { sessionLoading: true, session: null } });
assert.ok(loading.includes("계정 확인 중…"), "loading gate renders");
assert.ok(!loading.includes('data-navigation="top"'), "loading gate precedes application shell");
const unauthenticated = render({ workspace: { session: null, sessionLoading: false } });
assert.ok(unauthenticated.includes("Media Report 로그인"), "unauthenticated gate renders");
assert.ok(unauthenticated.includes("Google 계정으로 로그인"), "login action remains available");
assert.ok(!unauthenticated.includes('data-navigation="top"'), "unauthenticated gate precedes application shell");
console.log("Top navigation SSR checks passed: header order, no sidebar, five routes/current state, editor/viewer permissions, account/team/logout, selectors/month/sync actions, loading and unauthenticated gates.");
