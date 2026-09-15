import { DailyReportIntakeV2 } from "./daily-report-intake-v2";
import styles from "./update.module.css";

export default function DataUpdatePage() {
  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">AE only · daily intake</div>
          <h1 className="page-title">Daily Report 업데이트</h1>
          <p className="page-desc">메일 본문은 Insight/운영메모, 첨부 Excel은 Fact로 분리합니다. 둘을 하나의 Daily Bundle로 검수 후 반영합니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">FACT ≠ INSIGHT</span></div>
      </div>

      <DailyReportIntakeV2 />

      <section className={styles.secondarySources}>
        <article><div className="eyebrow">MONTHLY / ASSET</div><h3>다른 운영 자료는 기존 방식 유지</h3><p>Media Mix는 최초/변경 시, 소재·게재지면은 Google Drive 폴더 동기화 또는 일괄 업로드로 관리합니다.</p></article>
        <div><span>Media Mix</span><strong>최초 + 변경 시</strong></div><div><span>Creative / Placement</span><strong>Drive 자동수집</strong></div>
      </section>
    </>
  );
}
