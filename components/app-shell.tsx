"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { seoulReportingMonth, shiftWorkspaceMonth } from "@/lib/workspace-months";
import { useEffect, useState, type ReactNode } from "react";
import { ADVERTISERS, WorkspaceProvider, useWorkspace, type AdvertiserKey } from "@/components/workspace-context";

const loginErrors: Record<string, string> = {
  invalid_state: "로그인 요청이 만료되었거나 확인되지 않았습니다. Google 계정으로 다시 로그인하세요.",
  oauth_denied: "Google 로그인이 취소되었습니다. 계속하려면 다시 로그인하고 권한을 허용하세요.",
  oauth_error: "Google 로그인 중 오류가 발생했습니다. 잠시 후 다시 로그인하세요.",
  token_exchange: "Google 로그인 정보를 확인하지 못했습니다. 다시 로그인하고, 반복되면 관리자에게 문의하세요.",
  workspace_unavailable: "팀 서버에 연결할 수 없습니다. 잠시 후 다시 로그인하세요. 계속되면 관리자에게 서버 상태 확인을 요청하세요.",
  session_encryption: "로그인 세션을 안전하게 저장하지 못했습니다. 관리자에게 로그인 설정 확인을 요청한 뒤 다시 로그인하세요.",
  google_identity: "Google 계정을 확인하지 못했습니다. Google 계정으로 다시 로그인하고, 반복되면 관리자에게 문의하세요.",
  access_denied: "등록되지 않았거나 접근이 해제된 계정입니다. 관리자에게 팀 계정 등록을 요청하세요.",
};

const navItems = [
  { href: "/overview", label: "개요", icon: "overview" },
  { href: "/performance", label: "성과", icon: "chart" },
  { href: "/schedule", label: "일정", icon: "calendar" },
  { href: "/creative", label: "소재 · 게재지면", icon: "image" },
  { href: "/reports", label: "리포트", icon: "report" },
] as const;

function Icon({ name }: { name: string }) {
  if (name === "overview") return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
  if (name === "chart") return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></svg>;
  if (name === "calendar") return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h3M13 14h3M8 18h3"/></svg>;
  if (name === "image") return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 4"/></svg>;
  if (name === "report") return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>;
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/></svg>;
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [callbackError, setCallbackError] = useState("");
  const [customMonthOpen, setCustomMonthOpen] = useState(false);
  const preparingMonth = shiftWorkspaceMonth(seoulReportingMonth());
  useEffect(() => {
    // Read only after hydration; no useSearchParams/Suspense requirement at build time.
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("gmail") === "error" ? params.get("reason") : null;
    const message = reason && Object.prototype.hasOwnProperty.call(loginErrors, reason) ? loginErrors[reason] : "";
    setCallbackError(message || (params.get("access") === "denied" ? loginErrors.access_denied : ""));
  }, [pathname]);
  const { advertiserKey, month, months, setAdvertiserKey, setMonth, dataSyncState, dataSyncError,
    session, sessionLoading, sessionError, refreshSession, canEdit, allowedAdvertiserKeys, reloadData } = useWorkspace();
  if (sessionLoading) return <main className="workspace-gate"><h1>계정 확인 중…</h1></main>;
  if (!session) return <main className="workspace-gate">
    <div className="brand-mark">M</div><h1>Media Report 로그인</h1>
    <p role={callbackError ? "alert" : undefined}>{callbackError || (sessionError === "WORKSPACE_ACCESS_DENIED" ? loginErrors.access_denied : sessionError === "WORKSPACE_UNAVAILABLE" ? loginErrors.workspace_unavailable : "등록된 Google 계정으로 로그인해 팀 리포트를 확인하세요.")}</p>
    <a className="btn primary" href="/api/gmail/connect?mode=workspace">Google 계정으로 로그인</a>
    <button className="btn" onClick={() => void refreshSession()}>다시 확인</button>
  </main>;
  const syncText = dataSyncState === "saving"
    ? "DB 저장 중…"
    : dataSyncState === "loading"
      ? "DB 동기화 중…"
      : dataSyncState === "ready"
        ? "DB 동기화 완료"
        : dataSyncState === "error"
          ? "DB 연결 확인"
          : "DB 준비";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">M</div><div className="brand-copy"><strong>Media Report</strong><span>광고 운영 대시보드</span></div></div>
        <div className="nav-label">업무 메뉴</div>
        <nav className="nav" aria-label="주 메뉴">
          {navItems.map((item) => <Link key={item.href} href={item.href} className={`nav-link ${pathname === item.href ? "active" : ""}`}><Icon name={item.icon}/>{item.label}</Link>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">AE 도구</div>
          {canEdit && <div className="ae-only"><Link href="/data-update" className={`nav-link ${pathname === "/data-update" ? "active" : ""}`}><Icon name="report"/>데이터 업데이트</Link></div>}
          <Link href="/team" className={`nav-link ${pathname === "/team" ? "active" : ""}`}><Icon name="overview"/>팀 관리</Link>
          <div className="sidebar-user"><div className="avatar">{session.user.role === "admin" ? "관리" : "AE"}</div><div><strong>{session.user.display_name || session.user.email}</strong><span>{canEdit ? "편집 가능" : "조회 전용"}</span></div></div>
          <button className="btn" onClick={async () => { await fetch("/api/gmail/disconnect", { method: "POST" }); await refreshSession(); }}>로그아웃</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="selector-group">
            <select className="selector" aria-label="광고주 선택" disabled={dataSyncState === "saving"} value={advertiserKey} onChange={(event) => setAdvertiserKey(event.target.value as AdvertiserKey)}>
              {allowedAdvertiserKeys.map(key => <option key={key} value={key}>{ADVERTISERS[key].label}</option>)}
            </select>
            <select className="selector" aria-label="조회 월 선택" disabled={dataSyncState === "saving"} value={month} onChange={(event) => setMonth(event.target.value)}>
              {months.map(value => <option key={value} value={value}>{value.slice(0,4)}년 {Number(value.slice(5))}월</option>)}
            </select>
            <button type="button" className="btn month-direct-toggle" aria-expanded={customMonthOpen} aria-controls="workspace-custom-month" disabled={dataSyncState === "saving"} onClick={() => setCustomMonthOpen(open => !open)}>다른 월</button>
            {customMonthOpen && <label className="workspace-month-field" id="workspace-custom-month">조회·정리할 월<input type="month" aria-label="직접 조회 월 선택" min="1970-01" max="9999-12" value={month} disabled={dataSyncState === "saving"} onChange={event => { if (event.target.value) setMonth(event.target.value); }}/><small>선택한 월만 조회하며 과거 자료를 복사하지 않습니다.</small></label>}
          </div>
          <div className="top-actions">
            <span className="sync-label" title={dataSyncError || "보고서 데이터는 Supabase에서 광고주별로 동기화됩니다."}>{syncText}</span>
            {canEdit && <Link href="/data-update#monthly-media" className="btn month-prepare-link" aria-disabled={dataSyncState === "saving"} onClick={event => { if (dataSyncState === "saving") { event.preventDefault(); return; } setMonth(preparingMonth); }}>{Number(preparingMonth.slice(5))}월 매체 정리</Link>}
            <Link href="/reports" className="btn"><span>리포트</span></Link>
            <button className="btn" onClick={() => void reloadData()}>새로고침</button>
            {canEdit && <Link href="/data-update" className="btn primary"><span className="hide-mobile">데이터 </span>업데이트</Link>}
          </div>
        </header>
        <div className="content">{!allowedAdvertiserKeys.length ? <p>접근 가능한 광고주가 없습니다. 관리자에게 권한을 요청하세요.</p> : pathname === "/data-update" && !canEdit ? <p>조회 전용 계정입니다. 담당 관리자에게 편집 권한을 요청하세요.</p> : children}</div>
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <WorkspaceProvider><AppShellInner>{children}</AppShellInner></WorkspaceProvider>;
}
