import { DailyReportIntakeV2 } from "./daily-report-intake-v2";
import { LookerReportIntake } from "./looker-report-intake";
import { PlacementReportIntake } from "./placement-report-intake";
import styles from "./update.module.css";

export default function DataUpdatePage() {
  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">AE 전용 · 자료 수집</div>
          <h1 className="page-title">데이터 업데이트</h1>
          <p className="page-desc">Excel · 메일 · PDF · 게재 보고서를 원본별로 검수해 성과 데이터와 게재 확인 자료를 각각 올바른 영역에 반영합니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">원본 자료 전용</span></div>
      </div>

      <DailyReportIntakeV2 />
      <LookerReportIntake />
      <PlacementReportIntake />

      <section className={styles.secondarySources}>
        <article><div className="eyebrow">월간 · 소재 자료</div><h3>운영 자료는 원본 성격에 맞춰 분리 관리</h3><p>미디어 믹스는 최초/변경 시 반영하고, 게재 보고 메일은 실제 노출 확인 자료로 저장합니다. 소재 원본은 Google Drive 폴더 동기화 또는 일괄 업로드를 함께 사용합니다.</p></article>
        <div><span>미디어 믹스</span><strong>최초 + 변경 시</strong></div><div><span>게재 확인</span><strong>Gmail 게재보고</strong></div><div><span>소재 원본</span><strong>Drive 자동수집</strong></div>
      </section>
    </>
  );
}
