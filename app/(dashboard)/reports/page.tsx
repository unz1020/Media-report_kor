const reports = [
  { date: "09.15", title: "9월 15일 데일리 브리핑", desc: "성과 요약 · 주요 변동 · 운영 이슈 · 금일 액션", type: "Briefing", status: "Published" },
  { date: "09.14", title: "포커스미디어 게재보고", desc: "서울·경기 엘리베이터TV · 40주년 CF 30s", type: "Placement", status: "Verified" },
  { date: "09.12", title: "서울버스TV 게재보고", desc: "서울 주요 노선 · 신규 CF 런칭 소재", type: "Placement", status: "Review" },
  { date: "09.10", title: "9월 미디어믹스 v2", desc: "Meta 예산 조정 및 OTT 일정 업데이트", type: "Media Mix", status: "Current" },
  { date: "09.01", title: "9월 미디어믹스 v1", desc: "최초 승인 집행 계획", type: "Media Mix", status: "Archived" }
];

export default function ReportsPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Reports</div>
          <h1 className="page-title">브리핑 · 보고서</h1>
          <p className="page-desc">메일 본문으로 전달하던 인사이트와 게재보고, 미디어믹스 이력을 한 공간에서 관리합니다.</p>
        </div>
        <div className="page-meta"><button className="btn">새 브리핑</button><button className="btn primary">Publish</button></div>
      </div>

      <section className="grid two-col">
        <article className="card briefing-card">
          <div className="card-head"><div><h2>오늘의 브리핑</h2><p>광고주 공개용 · 2026.09.15</p></div><span className="badge info">PUBLISHED</span></div>
          <div className="briefing-body">
            <span className="briefing-number">MONTHLY MONITORING · DAY 15</span>
            <h3>전체 집행은 계획 범위 안에서 안정적으로 운영 중입니다.</h3>
            <p>Meta 정성편과 Google 영상 소재가 효율 개선을 견인하고 있습니다. NAVER는 클릭 대비 전환 기여가 낮아 소재별 성과를 추가 점검할 예정이며, ATL은 포커스미디어 게재가 정상 확인되었습니다.</p>
            <div className="briefing-points">
              <div className="briefing-point">성과 · Meta CTR 개선 / Google 전환 상승</div>
              <div className="briefing-point">운영 · 전체 소진율 63.7%, 계획 대비 정상</div>
              <div className="briefing-point">게재 · Focus Media 확인 완료 / 서울버스TV 증빙 확인 필요</div>
              <div className="briefing-point">액션 · 종료 예정 소재 2건 연장 여부 확인</div>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-head"><div><h2>보고 현황</h2><p>이번 달 업로드·공개 상태</p></div><span className="eyebrow">SEPTEMBER</span></div>
          <div className="progress-list">
            <div className="notice"><span className="notice-dot good"/><div><strong>Daily Monitoring</strong><p>09.15 데이터까지 반영 · 최신</p></div></div>
            <div className="notice"><span className="notice-dot good"/><div><strong>Media Mix</strong><p>v2가 현재 승인본으로 적용 중</p></div></div>
            <div className="notice"><span className="notice-dot"/><div><strong>Placement Report</strong><p>서울버스TV 1건 검수 필요</p></div></div>
          </div>
        </article>
      </section>

      <section className="card section-space">
        <div className="card-head"><div><h2>보고서 히스토리</h2><p>브리핑, 게재보고서, 미디어믹스 버전 이력을 보관합니다.</p></div><button className="btn">전체 파일</button></div>
        <div className="report-list">
          {reports.map((report) => (
            <div className="report-row" key={`${report.date}-${report.title}`}>
              <div className="report-date">2026.{report.date}</div>
              <div><div className="report-title">{report.title}</div><div className="report-desc">{report.desc}</div></div>
              <div className="report-type">{report.type}</div>
              <span className={`badge ${report.status === 'Review' ? 'review' : report.status === 'Archived' ? 'ended' : 'live'}`}>{report.status}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
