import styles from "./update.module.css";

export default function DataUpdatePage() {
  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">AE only · data pipeline</div>
          <h1 className="page-title">데이터 · 소재 업데이트</h1>
          <p className="page-desc">한 건씩 연결하지 않습니다. 폴더 또는 자료 묶음을 넣으면 자동 분류·연결하고 애매한 항목만 검수합니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">AUTO MATCH FIRST</span></div>
      </div>

      <section className={styles.sourceGrid}>
        <article className={`${styles.sourceCard} ${styles.sourcePrimary}`}>
          <div className={styles.sourceHead}><div><div className="eyebrow">PRIMARY SOURCE</div><h2>Google Drive 폴더 연결</h2><p>광고주별 작업 폴더 하나를 연결하면 새 이미지·영상·PDF·게재보고서를 주기적으로 읽어 자동 반영 후보로 가져옵니다.</p></div><span className={styles.sourceBadge}>추천</span></div>
          <div className={styles.connectRow}><button className={styles.connectButton}>Google Drive 연결</button><span className={styles.helper}>예: 자코모 / 2026 / 09월 운영 폴더</span></div>
          <div className={styles.flow}><div className={styles.flowStep}><span>01</span><strong>폴더 스캔</strong></div><div className={styles.flowStep}><span>02</span><strong>파일·이미지 분석</strong></div><div className={styles.flowStep}><span>03</span><strong>자동 매칭</strong></div><div className={styles.flowStep}><span>04</span><strong>검수 후 반영</strong></div></div>
        </article>

        <article className={styles.sourceCard}>
          <div className={styles.sourceHead}><div><div className="eyebrow">FALLBACK</div><h2>폴더 / 파일 일괄 업로드</h2><p>Drive를 쓰지 않는 경우 폴더째 드래그하거나 여러 파일을 한 번에 넣습니다. ZIP 업로드도 같은 흐름으로 처리합니다.</p></div></div>
          <div className={styles.connectRow}><button className={styles.secondaryButton}>폴더 선택</button><button className={styles.secondaryButton}>파일 선택</button></div>
          <p className={styles.helper}>파일명 규칙을 강제하지 않고, 원본 이름을 그대로 유지합니다.</p>
        </article>
      </section>

      <section className={styles.inputGrid}>
        <article className={styles.inputCard}><div className="eyebrow">PERFORMANCE</div><h3>Daily Monitoring</h3><p>매체별 데일리 Excel/CSV. 날짜·매체·캠페인·성과를 자동 인식합니다.</p><div className={styles.inputMeta}><span>업데이트</span><strong>매일</strong></div></article>
        <article className={styles.inputCard}><div className="eyebrow">PLAN / CALENDAR</div><h3>Media Mix</h3><p>예산과 시작·종료일을 읽어 Overview와 Schedule의 온에어 캘린더를 자동 생성합니다.</p><div className={styles.inputMeta}><span>업데이트</span><strong>최초 + 변경 시</strong></div></article>
        <article className={styles.inputCard}><div className="eyebrow">PROOF / ASSET</div><h3>Placement & Creative</h3><p>게재보고서, 이미지, 영상, 캡처를 함께 넣습니다. PDF 안 이미지도 소재/지면 후보로 분리합니다.</p><div className={styles.inputMeta}><span>업데이트</span><strong>수신 시</strong></div></article>
      </section>

      <section className={styles.pipelineGrid}>
        <article className={styles.panel}>
          <h3>자동 연결 결과</h3><p>파일명을 바꾸거나 소재를 하나씩 연결하지 않고, 아래 신호를 조합해 매칭합니다.</p>
          <div className={styles.matchStats}><div className={styles.matchStat}><span>자동 연결</span><strong>42</strong></div><div className={styles.matchStat}><span>검수 필요</span><strong>3</strong></div><div className={styles.matchStat}><span>신규 미분류</span><strong>1</strong></div></div>
          <div className={styles.matchList}>
            <div className={styles.matchRow}><div><strong>정성편_15s_final.mp4 → Meta / Reels</strong><span>파일명 + 영상 프레임 + Media Mix 기간 일치</span></div><b className={`${styles.confidence} ${styles.high}`}>96%</b></div>
            <div className={styles.matchRow}><div><strong>240914_포커스미디어_게재.jpg → Focus Media</strong><span>이미지 내용 + 게재보고서 + 촬영일 일치</span></div><b className={`${styles.confidence} ${styles.high}`}>93%</b></div>
            <div className={styles.matchRow}><div><strong>banner_final_v3.png → NAVER or Kakao</strong><span>규격은 유사하지만 파일명·폴더 정보가 부족함</span></div><b className={`${styles.confidence} ${styles.medium}`}>72%</b></div>
          </div>
        </article>

        <article className={styles.panel}>
          <h3>매칭 원칙</h3><p>수동 연결은 예외 처리로만 사용합니다.</p>
          <div className={styles.rules}>
            <div className={styles.rule}><strong>1. 파일/폴더 문맥</strong><span>파일명, 상위 폴더, 수정일, 확장자와 기존 광고주 자료를 같이 봅니다.</span></div>
            <div className={styles.rule}><strong>2. 이미지·영상 내용</strong><span>문구, 로고, 제품, 화면비, 프레임 특징을 분석해 기존 소재와 유사도를 계산합니다.</span></div>
            <div className={styles.rule}><strong>3. 운영 데이터 교차검증</strong><span>Media Mix 기간·매체와 게재보고서 정보를 비교해 후보를 좁힙니다.</span></div>
            <div className={styles.rule}><strong>4. 확신도 기반 검수</strong><span>높은 확률은 자동 연결, 애매한 몇 건만 AE가 한 번에 승인합니다.</span></div>
          </div>
          <button className={styles.publish}>검수 완료 후 Dashboard 반영</button>
        </article>
      </section>
    </>
  );
}
