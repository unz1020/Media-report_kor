export default function DataUpdatePage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">AE only · data pipeline</div>
          <h1 className="page-title">데이터 업데이트</h1>
          <p className="page-desc">파일을 업로드하고 자동 분석 결과를 검수한 뒤 Client View에 반영합니다.</p>
        </div>
        <div className="page-meta"><span className="badge review">Review before publish</span></div>
      </div>

      <section className="grid three-col">
        {[
          {step:'01',title:'Daily Monitoring',desc:'매체별 데일리 성과 Excel',meta:'매일 또는 최신 리포트'},
          {step:'02',title:'Media Mix',desc:'월간 계획·예산·매체·기간',meta:'최초 + 변경 시'},
          {step:'03',title:'Placement Report',desc:'게재보고·라이브 캡처·증빙',meta:'수신 시 추가'}
        ].map(item => <article className="card card-pad" key={item.step}><div className="eyebrow">{item.step} INPUT</div><h2 style={{fontSize:16,margin:'8px 0 5px'}}>{item.title}</h2><p className="page-desc">{item.desc}</p><div style={{marginTop:18,padding:'20px 12px',border:'1px dashed var(--border-strong)',borderRadius:10,textAlign:'center',background:'var(--surface-2)'}}><strong style={{fontSize:11}}>파일을 드래그하거나 선택</strong><div style={{fontSize:10,color:'var(--muted)',marginTop:5}}>{item.meta}</div><button className="btn" style={{marginTop:12}}>파일 선택</button></div></article>)}
      </section>

      <section className="grid two-col section-space">
        <article className="card">
          <div className="card-head"><div><h2>최근 분석 결과</h2><p>샘플 Preview · 실제 파일 Parser 연결 전</p></div><span className="badge info">09.15 10:31</span></div>
          <div className="notice-list">
            <div className="notice"><span className="notice-dot good"/><div><strong>신규 데이터 214건</strong><p>09.15 Daily Monitoring 행이 정상 인식되었습니다.</p></div></div>
            <div className="notice"><span className="notice-dot good"/><div><strong>기존 데이터 수정 18건</strong><p>과거 전환 후처리 값이 변경되어 최신값 반영 대상입니다.</p></div></div>
            <div className="notice"><span className="notice-dot"/><div><strong>캠페인 매칭 필요 1건</strong><p>MEDIA_BR_2609_NEW가 기존 캠페인과 연결되지 않았습니다.</p></div></div>
            <div className="notice"><span className="notice-dot"/><div><strong>게재 증빙 확인 필요 1건</strong><p>서울버스TV 파일의 소재명이 Media Mix와 다릅니다.</p></div></div>
          </div>
        </article>

        <article className="card">
          <div className="card-head"><div><h2>반영 전 검수</h2><p>RAW → NORMALIZED → REVIEW → PUBLISHED</p></div><span className="badge review">2 확인 필요</span></div>
          <div className="progress-list">
            <div className="detail-grid"><div className="detail-box"><span>자동 인식</span><strong>232 rows</strong></div><div className="detail-box"><span>중복 제외</span><strong>4 files</strong></div><div className="detail-box"><span>수정 대상</span><strong>18 rows</strong></div><div className="detail-box"><span>수동 확인</span><strong>2 items</strong></div></div>
            <button className="btn primary" style={{justifyContent:'center'}}>검수 완료 후 대시보드 반영</button>
            <p className="page-desc">실제 기능 연결 후에는 이 버튼을 눌러야 Client View가 업데이트됩니다.</p>
          </div>
        </article>
      </section>
    </>
  );
}
