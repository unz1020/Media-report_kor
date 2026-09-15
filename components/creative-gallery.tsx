"use client";

import { useMemo, useState } from "react";
import { creatives } from "@/lib/mock-data";

const filters = ["전체", "META", "NAVER GFA", "GOOGLE", "TVING", "ATL"] as const;
type Creative = (typeof creatives)[number];

function Preview({ item, large = false }: { item: Creative; large?: boolean }) {
  if (item.type === "ooh") {
    return <div className={`preview ooh ${large ? "large-preview" : ""}`}><div className="placement-label">실제 게재 이미지</div><div className="ooh-scene"><div className="ooh-frame"><div className="ooh-screen"><span>JACOMO</span><strong>40TH</strong><small>소파는 결국 자코모.</small></div></div></div></div>;
  }
  if (item.type === "video") {
    return <div className={`preview video ${large ? "large-preview" : ""}`}><div className="placement-label">{item.channel === "GOOGLE" ? "YouTube Preview" : "CTV / OTT Preview"}</div><div className="video-frame"><div className="video-copy"><span>JACOMO 40TH</span><strong>소파는 결국 자코모.</strong><div className="play">▶</div></div><div className="video-controls"><i/><i/><i/></div></div></div>;
  }
  return <div className={`preview feed ${large ? "large-preview" : ""}`}><div className="placement-label">{item.channel === "META" ? "Instagram Feed" : "Native Feed"}</div><div className="mock-phone"><div className="mock-app-head"><span className="tiny-avatar"/>Sponsored</div><div className="mock-art"><span>JACOMO</span><strong>40TH</strong><small>소파는 결국 자코모.</small></div><div className="mock-actions">♡　◯　↗</div><div className="mock-copy"><div className="mock-line"/><div className="mock-line short"/><div className="mock-line"/></div></div></div>;
}

function ChannelTag({ item }: { item: Creative }) {
  const cls = item.channel === "META" ? "meta" : item.channel.includes("NAVER") ? "naver" : item.channel === "GOOGLE" ? "google" : item.channel === "TVING" ? "tving" : "atl";
  return <span className="channel-tag"><i className={`platform-dot ${cls}`}/>{item.channel}</span>;
}

function UrlLink({ url }: { url: string }) {
  if (!url || url === "-") return <div className="url-box url-empty">연결 URL 없음</div>;
  return <a className="url-box url-link" href={url} target="_blank" rel="noreferrer"><span>{url}</span><b>열기 ↗</b></a>;
}

export function CreativeGallery() {
  const [active, setActive] = useState<(typeof filters)[number]>("전체");
  const [selected, setSelected] = useState<Creative | null>(null);
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const items = useMemo(() => {
    if (active === "전체") return creatives;
    if (active === "ATL") return creatives.filter((item) => item.measurement === "Live Only");
    return creatives.filter((item) => item.channel === active);
  }, [active]);

  return <>
    <div className="creative-toolbar">
      <div className="filters compact-filters" aria-label="소재 매체 필터">{filters.map(filter => <button key={filter} type="button" onClick={()=>setActive(filter)} className={`filter-btn ${active===filter?"active":""}`}>{filter}</button>)}</div>
      <div className="creative-toolbar-actions"><button className="toolbar-control">상태 · LIVE⌄</button><button className="toolbar-control">최근 게재 확인⌄</button><div className="view-toggle"><button className={view==="gallery"?"active":""} onClick={()=>setView("gallery")}>▦</button><button className={view==="list"?"active":""} onClick={()=>setView("list")}>☰</button></div></div>
    </div>

    <div className={view === "gallery" ? "creative-grid refined-gallery" : "creative-list-view"}>
      {items.map(item => <article key={item.id} className={`card creative-card refined-creative-card ${view === "list" ? "list-card" : ""}`} onClick={()=>setSelected(item)} tabIndex={0} onKeyDown={e=>{if(e.key==="Enter")setSelected(item)}}>
        <Preview item={item}/>
        <div className="creative-body refined-creative-body">
          <div className="creative-meta-row"><ChannelTag item={item}/><span className="operation-state live"><i/>LIVE</span></div>
          <h3 className="creative-title">{item.title}</h3><p className="creative-sub">{item.subtitle}</p>
          <div className="creative-stat-row"><div><span>측정</span><strong>{item.measurement}</strong></div><div><span>Spend</span><strong>{item.spend}</strong></div><div><span>주요 KPI</span><strong>{item.ctr}</strong></div></div>
          <div className="creative-card-foot"><span>최근 게재 확인 · 09.14</span><span>상세 보기 →</span></div>
        </div>
      </article>)}
    </div>

    {selected && <div className="drawer-backdrop" role="presentation" onMouseDown={()=>setSelected(null)}><aside className="drawer refined-drawer" role="dialog" aria-modal="true" aria-label="소재 상세" onMouseDown={e=>e.stopPropagation()}>
      <div className="drawer-head"><div><ChannelTag item={selected}/><h2 className="drawer-title">{selected.title}</h2><p className="page-desc">{selected.subtitle}</p></div><button type="button" className="icon-btn" onClick={()=>setSelected(null)} aria-label="닫기">×</button></div>
      <div className="drawer-tabs"><button className="active">게재지면</button><button>원본 소재</button><button>성과</button><button>URL / UTM</button></div>
      <div className="drawer-section placement-hero"><Preview item={selected} large/></div>
      <div className="drawer-section"><div className="detail-section-head"><h4>운영 정보</h4><span className="operation-state live"><i/>LIVE</span></div><div className="detail-grid refined-detail-grid"><div className="detail-box"><span>측정 등급</span><strong>{selected.measurement}</strong></div><div className="detail-box"><span>Spend</span><strong>{selected.spend}</strong></div><div className="detail-box"><span>주요 KPI</span><strong>{selected.ctr}</strong></div><div className="detail-box"><span>게재 확인</span><strong>09.14</strong></div></div></div>
      <div className="drawer-section"><div className="detail-section-head"><h4>Landing & Tracking</h4><span className="url-status">✓ QA 정상</span></div><label className="url-label">Original Landing</label><UrlLink url={selected.landing}/><label className="url-label second">Tracking URL · UTM</label><UrlLink url={selected.tracking}/></div>
      <div className="drawer-section"><div className="detail-section-head"><h4>게재 증빙</h4><button className="text-button">보고서 열기 →</button></div><div className="proof-row"><div className="proof-thumb">09.14</div><div><strong>최근 게재 확인 완료</strong><p>게재보고서 / 실제 노출 캡처 연결</p></div><span className="operation-state live"><i/>확인</span></div></div>
    </aside></div>}
  </>;
}
