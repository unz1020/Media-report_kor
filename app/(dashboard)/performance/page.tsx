"use client";

import { useMemo, useState } from "react";
import { mediaRows } from "@/lib/mock-data";

const rows = [
  {id:"meta",parent:null,level:0,media:"Meta",name:"Meta",type:"매체",spend:"₩18.4M",imp:"6.8M",click:"91.4K",ctr:"1.34%",cv:"412",status:"LIVE"},
  {id:"meta-campaign",parent:"meta",level:1,media:"Meta",name:"9월 브랜딩 캠페인",type:"캠페인",spend:"₩12.1M",imp:"4.2M",click:"61.8K",ctr:"1.47%",cv:"286",status:"LIVE"},
  {id:"meta-adgroup",parent:"meta",level:2,media:"Meta",name:"Reels · 관심사 타겟",type:"광고그룹",spend:"₩7.2M",imp:"2.4M",click:"39.1K",ctr:"1.63%",cv:"192",status:"LIVE"},
  {id:"meta-creative",parent:"meta",level:3,media:"Meta",name:"정성편 15s A",type:"소재",spend:"₩3.6M",imp:"1.1M",click:"18.7K",ctr:"1.70%",cv:"98",status:"LIVE"},
  {id:"meta-placement",parent:"meta",level:4,media:"Meta",name:"Instagram Reels",type:"게재위치",spend:"₩2.1M",imp:"640K",click:"11.6K",ctr:"1.81%",cv:"61",status:"LIVE"},
  {id:"naver",parent:null,level:0,media:"NAVER",name:"NAVER GFA",type:"매체",spend:"₩14.8M",imp:"5.6M",click:"42.1K",ctr:"0.75%",cv:"181",status:"LIVE"},
  {id:"naver-campaign",parent:"naver",level:1,media:"NAVER",name:"9월 프리미엄 소파",type:"캠페인",spend:"₩9.4M",imp:"3.8M",click:"30.4K",ctr:"0.80%",cv:"122",status:"LIVE"},
  {id:"naver-creative",parent:"naver",level:3,media:"NAVER",name:"프리미엄 가죽 소재 A",type:"소재",spend:"₩3.8M",imp:"1.4M",click:"11.6K",ctr:"0.81%",cv:"41",status:"LIVE"},
  {id:"naver-placement",parent:"naver",level:4,media:"NAVER",name:"GFA Native Feed",type:"게재위치",spend:"₩3.8M",imp:"1.4M",click:"11.6K",ctr:"0.81%",cv:"41",status:"LIVE"},
  {id:"google",parent:null,level:0,media:"Google / DV360",name:"Google / DV360",type:"매체",spend:"₩11.2M",imp:"3.1M",click:"18.4K",ctr:"0.59%",cv:"167",status:"LIVE"},
  {id:"google-campaign",parent:"google",level:1,media:"Google / DV360",name:"40주년 Video Reach",type:"캠페인",spend:"₩7.4M",imp:"2.4M",click:"11.1K",ctr:"0.46%",cv:"108",status:"LIVE"},
  {id:"google-creative",parent:"google",level:3,media:"Google / DV360",name:"브랜드 필름 15s",type:"소재",spend:"₩3.1M",imp:"1.2M",click:"7.7K",ctr:"0.64%",cv:"57",status:"LIVE"},
  {id:"google-placement",parent:"google",level:4,media:"Google / DV360",name:"YouTube In-stream",type:"게재위치",spend:"₩3.1M",imp:"1.2M",click:"7.7K",ctr:"0.64%",cv:"57",status:"LIVE"},
  {id:"kakao",parent:null,level:0,media:"Kakao",name:"Kakao",type:"매체",spend:"₩8.6M",imp:"2.4M",click:"13.7K",ctr:"0.57%",cv:"105",status:"LIVE"},
  {id:"kakao-campaign",parent:"kakao",level:1,media:"Kakao",name:"9월 비즈보드 브랜딩",type:"캠페인",spend:"₩5.7M",imp:"1.7M",click:"10.2K",ctr:"0.60%",cv:"72",status:"LIVE"},
  {id:"kakao-placement",parent:"kakao",level:4,media:"Kakao",name:"Kakao Bizboard",type:"게재위치",spend:"₩5.7M",imp:"1.7M",click:"10.2K",ctr:"0.60%",cv:"72",status:"LIVE"}
] as const;

const metricData = {
  "집행액": {value:"₩60.2M", delta:"+4.8%", points:"0,176 65,162 130,151 195,132 260,126 325,112 390,94 455,89 520,74 585,62 650,57 715,44 780,36 845,25 900,20"},
  "전환": {value:"905", delta:"+11.8%", points:"0,188 65,184 130,169 195,173 260,151 325,147 390,130 455,124 520,112 585,104 650,86 715,83 780,70 845,62 900,49"},
  "CTR": {value:"0.93%", delta:"+0.05%p", points:"0,150 65,142 130,155 195,136 260,126 325,118 390,121 455,103 520,98 585,84 650,89 715,73 780,64 845,58 900,52"},
  "노출": {value:"18.05M", delta:"+9.1%", points:"0,182 65,174 130,158 195,149 260,138 325,123 390,111 455,101 520,88 585,79 650,66 715,55 780,43 845,31 900,24"}
} as const;

type MetricName = keyof typeof metricData;
type DetailTab = "캠페인" | "광고그룹" | "소재" | "게재위치";

export default function PerformancePage() {
  const [selectedMedia, setSelectedMedia] = useState("전체 매체");
  const [compare, setCompare] = useState(true);
  const [selectedMetrics, setSelectedMetrics] = useState<MetricName[]>(["집행액", "전환"]);
  const [activeTab, setActiveTab] = useState<DetailTab>("캠페인");
  const [expanded, setExpanded] = useState(() => new Set(["meta", "naver", "google", "kakao"]));

  const tableRows = useMemo(() => {
    const wantedType = activeTab;
    return rows.filter((row) => {
      if (selectedMedia !== "전체 매체" && row.media !== selectedMedia) return false;
      if (row.level === 0) return true;
      if (!row.parent || !expanded.has(row.parent)) return false;
      return row.type === wantedType;
    });
  }, [activeTab, expanded, selectedMedia]);

  const toggleMetric = (metric: MetricName) => {
    setSelectedMetrics((current) => {
      if (current.includes(metric)) return current.length === 1 ? current : current.filter((item) => item !== metric);
      return current.length >= 2 ? [current[1], metric] : [...current, metric];
    });
  };

  const togglePlatform = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="page-head refined-head">
        <div><div className="eyebrow">Performance</div><h1 className="page-title">성과 보고</h1><p className="page-desc">매체 → 캠페인 → 광고그룹 → 소재 → 게재위치까지 실제로 필터링하고 내려가며 확인합니다.</p></div>
        <div className="page-meta"><span className="view-pill">업데이트 09.15 10:31</span></div>
      </div>

      <div className="report-toolbar performance-toolbar">
        <div className="toolbar-group">
          <button className="toolbar-control strong-control">2026.09.01 – 09.15</button>
          <button className={`toolbar-control ${compare ? "strong-control" : "muted-control"}`} onClick={() => setCompare((value) => !value)}>비교 기간 {compare ? "ON" : "OFF"}</button>
          <select className="toolbar-control" value={selectedMedia} onChange={(event) => setSelectedMedia(event.target.value)} aria-label="매체 필터">
            <option>전체 매체</option><option>Meta</option><option>NAVER</option><option>Google / DV360</option><option>Kakao</option>
          </select>
          <button className="toolbar-control">캠페인 전체</button>
        </div>
        <div className="toolbar-group right"><button className="toolbar-control">분석 기준</button><button className="toolbar-control">다운로드</button></div>
      </div>

      <section className="metric-strip performance-metrics">
        <article className="metric-card selected-metric"><span className="metric-kicker">집행액</span><strong>₩60.2M</strong><div><b className="metric-up">+4.8%</b><span>{compare ? "직전 동기간" : "현재 기간"}</span></div></article>
        <article className="metric-card"><span className="metric-kicker">노출</span><strong>18.05M</strong><div><b className="metric-up">+9.1%</b><span>{compare ? "직전 동기간" : "현재 기간"}</span></div></article>
        <article className="metric-card"><span className="metric-kicker">클릭</span><strong>168.2K</strong><div><b className="metric-up">+7.4%</b><span>{compare ? "직전 동기간" : "현재 기간"}</span></div></article>
        <article className="metric-card"><span className="metric-kicker">CTR</span><strong>0.93%</strong><div><b className="metric-up">+0.05%p</b><span>{compare ? "직전 동기간" : "현재 기간"}</span></div></article>
        <article className="metric-card"><span className="metric-kicker">전환</span><strong>905</strong><div><b className="metric-up">+11.8%</b><span>Performance 매체</span></div></article>
      </section>

      <section className="card section-space report-panel performance-chart-panel">
        <div className="report-panel-head"><div><h2>일별 성과 추이</h2><p>클릭해서 최대 2개 지표를 비교합니다.</p></div><div className="metric-switch">{(["집행액","전환","CTR","노출"] as MetricName[]).map((metric, index) => <button key={metric} onClick={() => toggleMetric(metric)} className={selectedMetrics.includes(metric) ? `active ${selectedMetrics.indexOf(metric) === 1 ? "secondary" : ""}` : ""}>{metric}</button>)}</div></div>
        <div className="dual-chart-placeholder">
          <div className="axis-label left">{selectedMetrics[0]}</div><div className="axis-label right">{selectedMetrics[1] ?? ""}</div>
          {[1,2,3,4].map(i => <span key={i} className="fake-grid" style={{top:`${i*19}%`}}/>)}
          <svg viewBox="0 0 900 210" className="performance-svg">
            <polyline points={metricData[selectedMetrics[0]].points} className="perf-line-a"/>
            {selectedMetrics[1] && <polyline points={metricData[selectedMetrics[1]].points} className="perf-line-b"/>}
          </svg>
          <div className="chart-xlabels"><span>9/1</span><span>9/4</span><span>9/7</span><span>9/10</span><span>9/13</span><span>9/15</span></div>
        </div>
      </section>

      <section className="card section-space report-panel">
        <div className="report-panel-head table-title-row"><div><h2>성과 상세</h2><p>상단 매체 필터와 탭이 실제 표에 반영됩니다. 매체 행을 눌러 펼치거나 접을 수 있습니다.</p></div><div className="table-tools"><button className="toolbar-control">열 설정</button><button className="toolbar-control">세분화</button></div></div>
        <div className="report-tabs">{(["캠페인","광고그룹","소재","게재위치"] as DetailTab[]).map(tab => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
        <div className="table-wrap report-table-wrap"><table className="report-table hierarchy-table"><thead><tr><th>이름</th><th>단위</th><th>집행액</th><th>노출</th><th>클릭</th><th>CTR</th><th>전환</th><th>상태</th></tr></thead><tbody>{tableRows.map((row)=><tr key={row.id} className={row.level>0?"child-row":""} onClick={() => row.level === 0 && togglePlatform(row.id)} style={{cursor:row.level === 0 ? "pointer" : "default"}}><td><div className="hierarchy-name" style={{paddingLeft:`${Math.min(row.level,1)*22}px`}}>{row.level===0 && <span className="disclosure">{expanded.has(row.id)?'⌄':'›'}</span>}<span className={`platform-dot ${row.media === 'Meta'?'meta':row.media === 'NAVER'?'naver':row.media.startsWith('Google')?'google':row.media === 'Kakao'?'kakao':'neutral'}`}/><strong>{row.name}</strong></div></td><td><span className="row-type">{row.type}</span></td><td className="num-cell">{row.spend}</td><td className="num-cell">{row.imp}</td><td className="num-cell">{row.click}</td><td className="num-cell">{row.ctr}</td><td className="num-cell">{row.cv}</td><td><span className="operation-state live"><i/>{row.status}</span></td></tr>)}</tbody></table></div>
      </section>

      <section className="grid two-col section-space">
        <article className="card report-panel"><div className="report-panel-head"><div><h2>매체 요약</h2><p>현재 필터와 별개인 전체 월 누적</p></div></div><div className="compact-media-list">{mediaRows.slice(0,5).map(row=><div key={row.media}><span className={`platform-dot ${row.className}`}/><strong>{row.media}</strong><span>{row.spend}</span><b>{row.ctr}</b></div>)}</div></article>
        <article className="card report-panel insight-panel"><div className="report-panel-head"><div><h2>AE Insight</h2><p>Client 공개 전 검토</p></div><span className="view-pill">DRAFT</span></div><div className="insight-copy"><strong>Meta 소재 효율과 Google 전환 성과가 전체 개선을 견인</strong><p>정성편 15s의 CTR 상승과 Google 전환 증가가 확인됩니다. NAVER는 클릭 대비 전환 기여도를 소재 단위로 추가 점검합니다.</p><div className="insight-tags"><span>Meta CTR ↑</span><span>Google CV ↑</span><span>NAVER 점검</span></div></div></article>
      </section>
    </>
  );
}
