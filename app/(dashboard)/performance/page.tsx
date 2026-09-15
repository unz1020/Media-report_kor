import { mediaRows } from "@/lib/mock-data";

const hierarchyRows = [
  {level:0,name:"Meta",type:"매체",spend:"₩18.4M",imp:"6.8M",click:"91.4K",ctr:"1.34%",cv:"412",status:"LIVE"},
  {level:1,name:"9월 브랜딩 캠페인",type:"캠페인",spend:"₩12.1M",imp:"4.2M",click:"61.8K",ctr:"1.47%",cv:"286",status:"LIVE"},
  {level:2,name:"Reels · 관심사 타겟",type:"광고세트",spend:"₩7.2M",imp:"2.4M",click:"39.1K",ctr:"1.63%",cv:"192",status:"LIVE"},
  {level:3,name:"정성편 15s A",type:"소재",spend:"₩3.6M",imp:"1.1M",click:"18.7K",ctr:"1.70%",cv:"98",status:"LIVE"},
  {level:0,name:"NAVER",type:"매체",spend:"₩14.8M",imp:"5.6M",click:"42.1K",ctr:"0.75%",cv:"181",status:"LIVE"},
  {level:0,name:"Google / DV360",type:"매체",spend:"₩11.2M",imp:"3.1M",click:"18.4K",ctr:"0.59%",cv:"167",status:"LIVE"},
  {level:0,name:"Kakao",type:"매체",spend:"₩8.6M",imp:"2.4M",click:"13.7K",ctr:"0.57%",cv:"105",status:"LIVE"},
];

export default function PerformancePage() {
  return (
    <>
      <div className="page-head refined-head">
        <div><div className="eyebrow">Performance</div><h1 className="page-title">성과 보고</h1><p className="page-desc">매체 → 캠페인 → 광고그룹 → 소재 단위로 성과를 내려가며 확인합니다.</p></div>
        <div className="page-meta"><span className="view-pill">업데이트 09.15 10:31</span></div>
      </div>

      <div className="report-toolbar performance-toolbar">
        <div className="toolbar-group"><button className="toolbar-control strong-control">2026.09.01 – 09.15⌄</button><button className="toolbar-control muted-control">비교 기간 ON</button><button className="toolbar-control">전체 매체⌄</button><button className="toolbar-control">캠페인⌄</button></div>
        <div className="toolbar-group right"><button className="toolbar-control">분석 기준⌄</button><button className="toolbar-control">다운로드</button></div>
      </div>

      <section className="metric-strip performance-metrics">
        <article className="metric-card selected-metric"><span className="metric-kicker">집행액</span><strong>₩60.2M</strong><div><b className="metric-up">+4.8%</b><span>직전 동기간</span></div></article>
        <article className="metric-card selected-metric"><span className="metric-kicker">노출</span><strong>18.05M</strong><div><b className="metric-up">+9.1%</b><span>직전 동기간</span></div></article>
        <article className="metric-card"><span className="metric-kicker">클릭</span><strong>168.2K</strong><div><b className="metric-up">+7.4%</b><span>직전 동기간</span></div></article>
        <article className="metric-card"><span className="metric-kicker">CTR</span><strong>0.93%</strong><div><b className="metric-up">+0.05%p</b><span>직전 동기간</span></div></article>
        <article className="metric-card"><span className="metric-kicker">전환</span><strong>905</strong><div><b className="metric-up">+11.8%</b><span>Performance 매체</span></div></article>
      </section>

      <section className="card section-space report-panel performance-chart-panel">
        <div className="report-panel-head"><div><h2>일별 성과 추이</h2><p>선택 지표를 최대 2개까지 비교</p></div><div className="metric-switch"><button className="active">집행액</button><button className="active secondary">전환</button><button>CTR</button><button>노출</button></div></div>
        <div className="dual-chart-placeholder">
          <div className="axis-label left">₩</div><div className="axis-label right">CV</div>
          {[1,2,3,4].map(i => <span key={i} className="fake-grid" style={{top:`${i*19}%`}}/>)}
          <svg viewBox="0 0 900 210" className="performance-svg"><polyline points="0,176 65,162 130,151 195,132 260,126 325,112 390,94 455,89 520,74 585,62 650,57 715,44 780,36 845,25 900,20" className="perf-line-a"/><polyline points="0,188 65,184 130,169 195,173 260,151 325,147 390,130 455,124 520,112 585,104 650,86 715,83 780,70 845,62 900,49" className="perf-line-b"/></svg>
          <div className="chart-xlabels"><span>9/1</span><span>9/4</span><span>9/7</span><span>9/10</span><span>9/13</span><span>9/15</span></div>
        </div>
      </section>

      <section className="card section-space report-panel">
        <div className="report-panel-head table-title-row"><div><h2>성과 상세</h2><p>플랫폼 공통 구조로 Drill-down · 행을 펼쳐 하위 단위 확인</p></div><div className="table-tools"><button className="toolbar-control">열 설정</button><button className="toolbar-control">세분화⌄</button></div></div>
        <div className="report-tabs"><button className="active">캠페인</button><button>광고그룹</button><button>소재</button><button>게재위치</button></div>
        <div className="table-wrap report-table-wrap"><table className="report-table hierarchy-table"><thead><tr><th>이름</th><th>단위</th><th>집행액</th><th>노출</th><th>클릭</th><th>CTR</th><th>전환</th><th>상태</th></tr></thead><tbody>{hierarchyRows.map((row,index)=><tr key={`${row.name}-${index}`} className={row.level>0?"child-row":""}><td><div className="hierarchy-name" style={{paddingLeft:`${row.level*22}px`}}>{row.level<3 && <span className="disclosure">{row.level<2?'⌄':'·'}</span>}<span className={`platform-dot ${row.name.startsWith('Meta')?'meta':row.name.startsWith('NAVER')?'naver':row.name.startsWith('Google')?'google':row.name.startsWith('Kakao')?'kakao':'neutral'}`}/><strong>{row.name}</strong></div></td><td><span className="row-type">{row.type}</span></td><td className="num-cell">{row.spend}</td><td className="num-cell">{row.imp}</td><td className="num-cell">{row.click}</td><td className="num-cell">{row.ctr}</td><td className="num-cell">{row.cv}</td><td><span className="operation-state live"><i/>{row.status}</span></td></tr>)}</tbody></table></div>
      </section>

      <section className="grid two-col section-space">
        <article className="card report-panel"><div className="report-panel-head"><div><h2>매체 요약</h2><p>측정 가능한 공통 지표 기준</p></div></div><div className="compact-media-list">{mediaRows.slice(0,5).map(row=><div key={row.media}><span className={`platform-dot ${row.className}`}/><strong>{row.media}</strong><span>{row.spend}</span><b>{row.ctr}</b></div>)}</div></article>
        <article className="card report-panel insight-panel"><div className="report-panel-head"><div><h2>AE Insight</h2><p>Client 공개 전 검토</p></div><span className="view-pill">DRAFT</span></div><div className="insight-copy"><strong>Meta 소재 효율과 Google 전환 성과가 전체 개선을 견인</strong><p>정성편 15s의 CTR 상승과 Google 전환 증가가 확인됩니다. NAVER는 클릭 대비 전환 기여도를 소재 단위로 추가 점검합니다.</p><div className="insight-tags"><span>Meta CTR ↑</span><span>Google CV ↑</span><span>NAVER 점검</span></div></div></article>
      </section>
    </>
  );
}
