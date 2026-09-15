"use client";

import { useMemo, useState } from "react";
import { creatives } from "@/lib/mock-data";

const filters = ["전체", "META", "NAVER GFA", "GOOGLE", "TVING", "ATL"] as const;

type Creative = (typeof creatives)[number];

function Preview({ item }: { item: Creative }) {
  if (item.type === "ooh") {
    return <div className="preview ooh"><div className="ooh-frame"><div className="ooh-screen">JACOMO<br/>40TH</div></div></div>;
  }
  if (item.type === "video") {
    return <div className="preview video"><div className="video-frame"><div>JACOMO 40TH<div className="play">▶</div></div></div></div>;
  }
  return <div className="preview feed"><div className="mock-phone"><div className="mock-app-head">Sponsored</div><div className="mock-art">JACOMO<br/>40TH</div><div className="mock-copy"><div className="mock-line"/><div className="mock-line short"/><div className="mock-line"/></div></div></div>;
}

export function CreativeGallery() {
  const [active, setActive] = useState<(typeof filters)[number]>("전체");
  const [selected, setSelected] = useState<Creative | null>(null);

  const items = useMemo(() => {
    if (active === "전체") return creatives;
    if (active === "ATL") return creatives.filter((item) => item.measurement === "Live Only");
    return creatives.filter((item) => item.channel === active);
  }, [active]);

  return (
    <>
      <div className="filters" aria-label="소재 매체 필터">
        {filters.map((filter) => <button key={filter} type="button" onClick={() => setActive(filter)} className={`filter-btn ${active === filter ? "active" : ""}`}>{filter}</button>)}
      </div>

      <div className="creative-grid">
        {items.map((item) => (
          <article key={item.id} className="card creative-card" onClick={() => setSelected(item)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSelected(item); }}>
            <Preview item={item} />
            <div className="creative-body">
              <div className="creative-top">
                <div><h3 className="creative-title">{item.title}</h3><p className="creative-sub">{item.channel} · {item.subtitle}</p></div>
                <span className="badge live">{item.status}</span>
              </div>
              <div className="creative-metrics">
                <div><span className="metric-label">측정 등급</span><span className="metric-value">{item.measurement}</span></div>
                <div><span className="metric-label">Spend</span><span className="metric-value">{item.spend}</span></div>
                <div><span className="metric-label">KPI</span><span className="metric-value">{item.ctr}</span></div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {selected && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="소재 상세" onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawer-head"><div><div className="eyebrow">{selected.channel}</div><h2 className="drawer-title">{selected.title}</h2><p className="page-desc">{selected.subtitle}</p></div><button type="button" className="icon-btn" onClick={() => setSelected(null)} aria-label="닫기">×</button></div>
            <div className="drawer-section"><Preview item={selected} /></div>
            <div className="drawer-section"><h4>운영 정보</h4><div className="detail-grid"><div className="detail-box"><span>상태</span><strong>🟢 LIVE</strong></div><div className="detail-box"><span>측정 등급</span><strong>{selected.measurement}</strong></div><div className="detail-box"><span>Spend</span><strong>{selected.spend}</strong></div><div className="detail-box"><span>주요 KPI</span><strong>{selected.ctr}</strong></div></div></div>
            <div className="drawer-section"><h4>Original Landing</h4><div className="url-box">{selected.landing}</div></div>
            <div className="drawer-section"><h4>Tracking URL · UTM</h4><div className="url-box">{selected.tracking}</div></div>
            <div className="drawer-section"><h4>게재 증빙</h4><div className="notice"><span className="notice-dot good"/><div><strong>최근 게재 확인 · 09.14</strong><p>게재보고서 또는 실제 노출 캡처가 연결되는 영역입니다.</p></div></div></div>
          </aside>
        </div>
      )}
    </>
  );
}
