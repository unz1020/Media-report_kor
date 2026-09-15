import { mediaRows, planTrend, spendTrend } from "@/lib/mock-data";

function TrendChart() {
  const width = 720;
  const height = 230;
  const padX = 14;
  const padY = 18;
  const makePoints = (values: number[]) => values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * (width - padX * 2);
    const y = height - padY - (v / 110) * (height - padY * 2);
    return `${x},${y}`;
  }).join(" ");

  const area = `${padX},${height-padY} ${makePoints(spendTrend)} ${width-padX},${height-padY}`;

  return (
    <div className="chart-wrap">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="9월 누적 집행액과 계획 추이">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b5cf0" stopOpacity="0.17" />
            <stop offset="100%" stopColor="#5b5cf0" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[35, 75, 115, 155, 195].map((y) => <line key={y} x1="14" y1={y} x2="706" y2={y} className="chart-grid-line" />)}
        <polygon points={area} className="chart-area" />
        <polyline points={makePoints(planTrend)} className="chart-line-2" />
        <polyline points={makePoints(spendTrend)} className="chart-line" />
        {[0, 4, 8, 12, 14].map((i) => {
          const x = padX + (i / 14) * (width - padX * 2);
          return <text key={i} x={x} y="226" textAnchor="middle" className="chart-axis">9/{i + 1}</text>;
        })}
      </svg>
      <div className="chart-legend"><span><i className="legend-dot" />실제 집행</span><span><i className="legend-dot gray" />계획</span></div>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Monthly dashboard</div>
          <h1 className="page-title">9월 광고 운영 현황</h1>
          <p className="page-desc">성과, 집행 상태, 소재와 게재 현황을 한 화면에서 확인합니다.</p>
        </div>
        <div className="page-meta"><span className="badge live">● 정상 운영</span><span className="badge info">Client View</span></div>
      </div>

      <section className="grid kpi-grid">
        <article className="card kpi"><div className="kpi-label"><span>월 예산</span><span>PLAN</span></div><div className="kpi-value">₩120M</div><div className="kpi-foot"><span className="delta neutral">100%</span><span>9월 승인 예산</span></div></article>
        <article className="card kpi"><div className="kpi-label"><span>현재 집행액</span><span>SPEND</span></div><div className="kpi-value">₩76.4M</div><div className="kpi-foot"><span className="delta up">+6.2%</span><span>전일 대비</span></div></article>
        <article className="card kpi"><div className="kpi-label"><span>예산 소진율</span><span>PACE</span></div><div className="kpi-value">63.7%</div><div className="kpi-foot"><span className="delta up">+1.8%p</span><span>계획 대비 양호</span></div></article>
        <article className="card kpi"><div className="kpi-label"><span>LIVE 매체</span><span>MEDIA</span></div><div className="kpi-value">8</div><div className="kpi-foot"><span className="delta neutral">6 Digital</span><span>2 ATL</span></div></article>
        <article className="card kpi"><div className="kpi-label"><span>LIVE 소재</span><span>CREATIVE</span></div><div className="kpi-value">24</div><div className="kpi-foot"><span className="delta down">3 확인</span><span>종료임박·게재확인</span></div></article>
      </section>

      <section className="grid two-col section-space">
        <article className="card">
          <div className="card-head"><div><h2>누적 광고비 추이</h2><p>계획 대비 실제 집행액 · 9월 1–15일</p></div><span className="badge performance">Performance</span></div>
          <TrendChart />
        </article>

        <article className="card">
          <div className="card-head"><div><h2>매체별 예산 소진</h2><p>현재 월 계획 대비</p></div><span className="eyebrow">PACE</span></div>
          <div className="progress-list">
            {[['Meta',76],['NAVER',69],['Google',63],['Kakao',57],['TVING',71],['OOH',60]].map(([name, value]) => (
              <div className="progress-row" key={name as string}><strong>{name}</strong><div className="progress-track"><div className="progress-fill" style={{ width: `${value}%` }} /></div><span className="progress-num">{value}%</span></div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid two-col section-space">
        <article className="card">
          <div className="card-head"><div><h2>매체 운영 현황</h2><p>측정 가능 수준에 따라 Performance / Delivery / Live Only로 구분</p></div><a href="/performance" className="btn ghost">상세 보기 →</a></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>매체</th><th>측정 등급</th><th>집행액</th><th>IMP</th><th>CTR</th><th>상태</th></tr></thead>
              <tbody>{mediaRows.map((row) => <tr key={row.media}><td><div className="media-cell"><span className={`media-logo ${row.className}`}>{row.media.slice(0,1)}</span>{row.media}</div></td><td><span className={`badge ${row.measurement === 'Performance' ? 'performance' : row.measurement === 'Delivery' ? 'delivery' : 'live-only'}`}>{row.measurement}</span></td><td>{row.spend}</td><td>{row.impressions}</td><td>{row.ctr}</td><td><span className={`badge ${row.status === 'LIVE' ? 'live' : row.status === 'REVIEW' ? 'review' : 'ended'}`}>{row.status}</span></td></tr>)}</tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <div className="card-head"><div><h2>오늘 확인 필요</h2><p>AE 검수 기준 · Client 공개 전</p></div><span className="badge review">3건</span></div>
          <div className="notice-list">
            <div className="notice"><span className="notice-dot"/><div><strong>종료 예정 소재 2건</strong><p>Meta 프로모션 소재가 3일 내 종료됩니다. 연장 여부를 확인하세요.</p></div></div>
            <div className="notice"><span className="notice-dot"/><div><strong>게재 확인 필요 1건</strong><p>서울버스TV의 최근 게재 증빙이 아직 등록되지 않았습니다.</p></div></div>
            <div className="notice"><span className="notice-dot good"/><div><strong>예산 소진 정상</strong><p>현재 전체 소진율은 월간 계획 범위 안에서 운영 중입니다.</p></div></div>
          </div>
        </article>
      </section>
    </>
  );
}
