import { DailyReportIntakeV2 } from "./daily-report-intake-v2";
import { LookerReportIntake } from "./looker-report-intake";
import styles from "./update.module.css";

export default function DataUpdatePage() {
  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">AE only · source intake</div>
          <h1 className="page-title">Data Update</h1>
          <p className="page-desc">Excel · 메일 · Data Studio PDF를 원본별로 검수한 뒤 같은 Performance 데이터 구조에 반영합니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">SOURCE ONLY</span></div>
      </div>

      <DailyReportIntakeV2 />
      <LookerReportIntake />

      <section className={styles.secondarySources}>
        <article><div className="eyebrow">MONTHLY / ASSET</div><h3>다른 운영 자료는 기존 방식 유지</h3><p>Media Mix는 최초/변경 시, 소재·게재지면은 Google Drive 폴더 동기화 또는 일괄 업로드로 관리합니다.</p></article>
        <div><span>Media Mix</span><strong>최초 + 변경 시</strong></div><div><span>Creative / Placement</span><strong>Drive 자동수집</strong></div>
      </section>
    </>
  );
}
