import { DailyReportIntakeV2 } from "./daily-report-intake-v2";
import { LookerReportIntake } from "./looker-report-intake";
import styles from "./update.module.css";

export default function DataUpdatePage() {
  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">AE 전용 · 자료 수집</div>
          <h1 className="page-title">데이터 업데이트</h1>
          <p className="page-desc">Excel · 메일 · Data Studio PDF를 원본별로 검수한 뒤 같은 성과 데이터 구조에 반영합니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">원본 자료 전용</span></div>
      </div>

      <DailyReportIntakeV2 />
      <LookerReportIntake />

      <section className={styles.secondarySources}>
        <article><div className="eyebrow">월간 · 소재 자료</div><h3>다른 운영 자료는 기존 방식 유지</h3><p>미디어 믹스는 최초/변경 시, 소재·게재지면은 Google Drive 폴더 동기화 또는 일괄 업로드로 관리합니다.</p></article>
        <div><span>미디어 믹스</span><strong>최초 + 변경 시</strong></div><div><span>소재 · 게재지면</span><strong>Drive 자동수집</strong></div>
      </section>
    </>
  );
}
