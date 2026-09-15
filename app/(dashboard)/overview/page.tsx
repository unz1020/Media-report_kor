import { mediaRows, planTrend, spendTrend } from "@/lib/mock-data";

function TrendChart() {
  const width = 760;
  const height = 250;
  const padX = 20;
  const padY = 20;
  const makePoints = (values: number[]) => values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * (width - padX * 2);
    const y = height - 34 - (v / 110) * (height - padY * 2 - 16);
    return `${x},${y}`;
  }).join(" ");
  const area = `${padX},${height - 34} ${makePoints(spendTrend)} ${width-padX},${height - 34}`;
  return (
    <div className="report-chart">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="누적 광고비 추이">
        <defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5965e8" stopOpacity="0.13"/><stop offset="100%" stopColor="#5965e8" stopOpacity="0"/></linearGradient></defs>
        {[40,80,120,160,200].map(y => <line key={y} x1="20" y1={y} x2="740" y2={y} className="chart-grid-line"/>)}
        <polygon points={area} className="chart-area" />
        <polyline points={makePoints(planTrend)} className="chart-line-2" />
        <polyline points={makePoints(spendTrend)} className="chart-line" />
        {[0,4,8,12,14].map(i => { const x = padX + (i/14)*(width-padX*2); return <text key={i} x={x} y="244" textAnchor="middle" className="chart-axis">9/{i+1}</text>; })}
      </svg>
    </div>
  );
}

const attention = [
  { tone: "danger", label: "종료 임박", value: "2", text: "3일 내 종료되는 프로모션 소재" },
  { tone: "warning", label: "게재 확인", value: "1", text: "서울버스TV 증빙 업데이트 필요" },
  { tone: "good", label: "예산 페이스", value: "정상", text: "계획 대비 +1.8%p 범위" },
];

export default function OverviewPage() {
  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1 className="page-title">9월 광고 운영 현황</h1>
          <p className="page-desc">계획 · 집행 · 성과 · 게재 상태를 하나의 월간 뷰에서 확인합니다.</p>
        </div>
        <div className="page-meta"><span className="status-dot-label"><i/> 정상 운영</span><span className="view-pill">Client View</span></div>
      </div>

      <div className="report-toolbar">
        <div className="toolbar-group"><span className="toolbar-label">기간</span><button className="toolbar-control">2026.09.01 – 09.15⌄</button><button className="toolbar-control muted-control">비교 · 08.01 – 08.15</button></div>
        <div className="toolbar-group right"><button className="toolbar-control">다운로드</button><button className="toolbar-control">공유</button></div>
      </div>

      <section className="metric-strip">
        <article className="metric-card primary-metric"><span className="metric-kicker">집행액</span><strong>₩76.4M</strong><div><b className="metric-up">+6.2%</b><span>직전 동기간</span></div></article>
        <article className="metric-card"><span className="metric-kicker">월 예산</span><strong>₩120M</strong><div><b>63.7%</b><span>소진</span></div></article>
        <article className="metric-card"><span className="metric-kicker">노출</span><strong>21.8M</strong><div><b className="metric-up">+9.1%</b><span>직전 동기간</span></div></article>
        <article className="metric-card"><span className="metric-kicker">클릭</span><strong>192.4K</strong><div><b className="metric-up">+7.4%</b><span>직전 동기간</span></div></article>
        <article className="metric-card"><span className="metric-kicker">LIVE</span><strong>8 <small>매체</small></strong><div><b>24</b><span>소재 운영 중</span></div></article>
      </section>

      <section className="overview-layout section-space">
        <article className="card report-panel main-chart-card">
          <div className="report-panel-head"><div><h2>성과 추이</h2><p>누적 광고비 · 계획 대비 실제 집행</p></div><div className="metric-switch"><button className="active">광고비</button><button>노출</button><button>클릭</button><button>전환</button></div></div>
          <TrendChart />
          <div className="chart-footer"><span><i className="legend-dot"/>실제 집행</span><span><i className="legend-dot gray"/>계획</span><span className="chart-note">현재 페이스 63.7% · 목표 페이스 61.9%</span></div>
        </article>

        <aside className="card report-panel attention-panel">
          <div className="report-panel-head"><div><h2>Attention</h2><p>오늘 우선 확인할 운영 항목</p></div><span className="attention-count">3</span></div>
          <div className="attention-list">{attention.map(item => <div className={`attention-item ${item.tone}`} key={item.label}><div className="attention-icon">{item.tone === 'danger' ? '!' : item.tone === 'warning' ? '•' : '✓'}</div><div className="attention-copy"><div><strong>{item.label}</strong><b>{item.value}</b></div><p>{item.text}</p></div></div>)}</div>
          <a className="attention-link" href="/data-update">검수 항목 전체 보기 →</a>
        </aside>
      </section>

      <section className="card section-space report-panel">
        <div className="report-panel-head table-title-row"><div><h2>매체 운영 현황</h2><p>Performance / Delivery / Live Only 통합</p></div><div className="table-tools"><button className="toolbar-control">열 설정</button><a href="/performance" className="toolbar-control strong-control">성과 상세 →</a></div></div>
        <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>측정</th><th>집행액</th><th>노출</th><th>클릭</th><th>CTR</th><th>전환</th><th>운영 상태</th></tr></thead><tbody>{mediaRows.map(row => <tr key={row.media}><td><div className="platform-cell"><span className={`platform-dot ${row.className}`}/><div><strong>{row.media}</strong><small>월간 운영</small></div></div></td><td><span className={`measure-chip ${row.measurement === 'Performance' ? 'perf' : row.measurement === 'Delivery' ? 'delivery' : 'liveonly'}`}>{row.measurement}</span></td><td className="num-cell">{row.spend}</td><td className="num-cell">{row.impressions}</td><td className="num-cell">{row.clicks}</td><td className="num-cell">{row.ctr}</td><td className="num-cell">{row.conversions}</td><td><span className={`operation-state ${row.status === 'LIVE' ? 'live' : 'review'}`}><i/>{row.status}</span></td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}
