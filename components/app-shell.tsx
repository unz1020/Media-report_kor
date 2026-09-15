"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/overview", label: "Overview", icon: "overview" },
  { href: "/performance", label: "Performance", icon: "chart" },
  { href: "/creative", label: "Creative & Placement", icon: "image" },
  { href: "/reports", label: "Reports", icon: "report" }
] as const;

function Icon({ name }: { name: string }) {
  if (name === "overview") return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
  if (name === "chart") return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></svg>;
  if (name === "image") return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 4"/></svg>;
  if (name === "report") return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>;
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/></svg>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div className="brand-copy"><strong>Media Report</strong><span>Advertising OS</span></div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="nav" aria-label="주 메뉴">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-link ${pathname === item.href ? "active" : ""}`}>
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="nav-label">AE TOOLS</div>
          <div className="ae-only">
            <Link href="/data-update" className={`nav-link ${pathname === "/data-update" ? "active" : ""}`}>
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>
              Data Update
            </Link>
          </div>
          <div className="sidebar-user">
            <div className="avatar">AE</div>
            <div><strong>박운상</strong><span>Agency workspace</span></div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="selector-group">
            <select className="selector" aria-label="광고주 선택" defaultValue="jacomo">
              <option value="jacomo">자코모</option>
              <option value="kyowon">교원웰스</option>
              <option value="solte">솔테라이브러리</option>
            </select>
            <select className="selector" aria-label="조회 월 선택" defaultValue="2026-09">
              <option value="2026-09">2026년 9월</option>
              <option value="2026-08">2026년 8월</option>
            </select>
          </div>
          <div className="top-actions">
            <span className="sync-label">마지막 업데이트 · 09.15 10:31</span>
            <Link href="/reports" className="btn"><span>브리핑</span></Link>
            <Link href="/data-update" className="btn primary"><span className="hide-mobile">데이터 </span>업데이트</Link>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
