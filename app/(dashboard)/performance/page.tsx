import { mediaRows } from "@/lib/mock-data";

export default function PerformancePage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Performance</div>
          <h1 className="page-title">성과 보고</h1>
          <p className="page-desc">매체별 측정 수준에 맞춰 성과와 Delivery 지표를 비교합니다.</p>
        </div>
        <div className="page-meta"><span className="badge info">09.01–09.15</span></div>
      </div>

      <div className="filters" aria-label="성과 필터">
        {['전체 매체','Performance','Delivery','Meta','NAVER','Google','Kakao','TVING'].map((item, index) => <button key={item} className={`filter-btn ${index === 0 ? 'active' : ''}`}>{item}</button>)}
      </div>

      <section className="grid kpi-grid">
        <article className="card kpi"><div className="kpi-label"><span>집행액</span><span>SPEND</span></div><div className="kpi-value">₩60.2M</div><div className="kpi-foot"><span className="delta up">+4.8%</span><span>직전 동기간</span></div></article>
        <article className="card kpi"><div className="kpi-label"><span>노출</span><span>IMP</span></div><div className="kpi-value">18.05M</div><div className="kpi-foot"><span className="delta up">+9.1%</span><span>직전 동기간</span></div></article>
        <article className="card kpi"><div className="kpi-label"><span>클릭</span><span>CLICK</span></div><div className="kpi-value">168.2K</div><div className="kpi-foot"><span className="delta up">+7.4%</span><span>직전 동기간</span></div></article>
        <article className="card kpi"><div className="kpi-label"><span>CTR</span><span>RATE</span></div><div className="kpi-value">0.93%</div><div className="kpi-foot"><span className="delta up">+0.05%p</span><span>직전 동기간</span></div></article>
        <article className="card kpi"><div className="kpi-label"><span>전환</span><span>CV</span></div><div className="kpi-value">905</div><div className="kpi-foot"><span className="delta up">+11.8%</span><span>Performance 매체</span></div></article>
      </section>

      <section className="grid two-col section-space">
        <article className="card">
          <div className="card-head"><div><h2>매체 성과 비교</h2><p>Performance 매체의 Spend / CTR / CV 비교</p></div><span className="badge performance">Performance</span></div>
          <div className="chart-wrap">
            <svg className="chart-svg" viewBox="0 0 720 245" role="img" aria-label="매체별 광고비 비교">
              {[35,75,115,155,195].map(y => <line key={y} x1="35" y1={y} x2="700" y2={y} className="chart-grid-line" />)}
              {[
                {x:90,h:142,label:'Meta',v:'18.4M'},
                {x:225,h:116,label:'NAVER',v:'14.8M'},
                {x:360,h:88,label:'Google',v:'11.2M'},
                {x:495,h:67,label:'Kakao',v:'8.6M'},
                {x:630,h:56,label:'TVING',v:'7.2M'}
              ].map((b,i) => <g key={b.label}><rect x={b.x-31} y={205-b.h} width="62" height={b.h} rx="6" fill={i===0 ? '#5b5cf0' : '#dfe3ea'} /><text x={b.x} y={225} textAnchor="middle" className="chart-axis">{b.label}</text><text x={b.x} y={195-b.h} textAnchor="middle" className="chart-axis">{b.v}</text></g>)}
            </svg>
          </div>
        </article>

        <article className="card briefing-card">
          <div className="card-head"><div><h2>성과 해석</h2><p>현재는 샘플 브리핑 · 향후 AE 작성/AI Draft</p></div><span className="badge info">DRAFT</span></div>
          <div className="briefing-body">
            <span className="briefing-number">09.15 DAILY INSIGHT</span>
            <h3>효율 개선 소재 중심으로 예산이 안정적으로 소진 중입니다.</h3>
            <p>Meta 정성편 소재가 CTR을 견인하고 있으며 Google의 전환 효율도 직전 동기간 대비 개선된 흐름입니다. NAVER는 클릭 대비 전환 기여도를 추가 확인할 필요가 있습니다.</p>
            <div className="briefing-points"><div className="briefing-point">↑ Meta · 정성편 CTR 1.42%</div><div className="briefing-point">↑ Google · CV +14.3%</div><div className="briefing-point">→ NAVER · 소재별 전환 기여 점검 필요</div></div>
          </div>
        </article>
      </section>

      <section className="card section-space">
        <div className="card-head"><div><h2>매체 상세</h2><p>행을 선택하면 향후 Campaign → Ad Group → Creative 순으로 Drill-down</p></div><button className="btn">내보내기</button></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>매체</th><th>측정 등급</th><th>집행액</th><th>노출</th><th>클릭</th><th>CTR</th><th>전환</th><th>상태</th></tr></thead>
            <tbody>{mediaRows.map(row => <tr key={row.media}><td><div className="media-cell"><span className={`media-logo ${row.className}`}>{row.media.slice(0,1)}</span>{row.media}</div></td><td><span className={`badge ${row.measurement === 'Performance' ? 'performance' : row.measurement === 'Delivery' ? 'delivery' : 'live-only'}`}>{row.measurement}</span></td><td>{row.spend}</td><td>{row.impressions}</td><td>{row.clicks}</td><td>{row.ctr}</td><td>{row.conversions}</td><td><span className="badge live">{row.status}</span></td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
