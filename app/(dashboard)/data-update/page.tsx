"use client";

import { DailyReportIntakeV2 } from "./daily-report-intake-v2";
import { MediaMixEditor } from "@/components/media-mix-editor";
import { LayoutCanvas, LayoutPanel } from "@/components/layout-canvas";
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
<LayoutCanvas page="data-update">
      <LayoutPanel id="data-update:media-mix" title="월 미디어믹스"><MediaMixEditor /></LayoutPanel>

      <LayoutPanel id="data-update:데일리 리포트 수집:1" title="데일리 리포트 수집"><DailyReportIntakeV2 /></LayoutPanel>
      <LayoutPanel id="data-update:성과 리포트 업로드:2" title="성과 리포트 업로드"><LookerReportIntake /></LayoutPanel>
      <LayoutPanel id="data-update:게재 보고 자료:3" title="게재 보고 자료"><PlacementReportIntake /></LayoutPanel>

      <LayoutPanel id="data-update:운영 자료는 원본 성격에 맞춰 분리 관리:4" title="운영 자료는 원본 성격에 맞춰 분리 관리"><section className={styles.secondarySources}>
        <article><div className="eyebrow">월간 · 소재 자료</div><h3>운영 자료는 원본 성격에 맞춰 분리 관리</h3><p>미디어 믹스는 최초/변경 시 반영하고, 게재 보고 메일은 실제 노출 확인 자료로 저장합니다. 소재 원본은 Google Drive 폴더 동기화 또는 일괄 업로드를 함께 사용합니다.</p></article>
        <div><span>미디어 믹스</span><strong>최초 + 변경 시</strong></div><div><span>게재 확인</span><strong>Gmail 게재보고</strong></div><div><span>소재 원본</span><strong>Drive 자동수집</strong></div>
      </section></LayoutPanel>
    </LayoutCanvas>
</>
  );
}
