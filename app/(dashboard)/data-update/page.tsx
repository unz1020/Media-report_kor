"use client";

import { useMemo, useState } from "react";
import styles from "./update.module.css";

type IntakeMode = "gmail" | "manual";
type ImportState = "idle" | "preview";

const qaItems = [
  { type: "ok", title: "Excel 기준 성과 데이터", desc: "Spend / IMP / Click / CTR / CV는 첨부 리포트를 Fact Source로 사용합니다." },
  { type: "ok", title: "메일 본문 Insight 추출", desc: "인사말·서명·이전 회신은 제외하고 성과 요약 / 주요 변동 / 이슈 / 액션으로 정리합니다." },
  { type: "warn", title: "본문 숫자 1건 검산 필요", desc: "메일 본문의 CTR 표현과 Excel 원본 값이 다르면 자동 수정하지 않고 확인 항목으로 남깁니다." }
] as const;

export default function DataUpdatePage() {
  const [mode, setMode] = useState<IntakeMode>("gmail");
  const [importState, setImportState] = useState<ImportState>("idle");
  const [advertiser, setAdvertiser] = useState("자코모");
  const [mailQuery, setMailQuery] = useState("자코모 Daily Report has:attachment");
  const [mailBody, setMailBody] = useState("");

  const canPreview = useMemo(() => mode === "gmail" || mailBody.trim().length > 0, [mode, mailBody]);

  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">AE only · daily intake</div>
          <h1 className="page-title">Daily Report 업데이트</h1>
          <p className="page-desc">메일 본문은 Insight, 첨부 Excel은 Fact로 분리합니다. 둘을 하나의 Daily Bundle로 묶어 검수 후 반영합니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">FACT ≠ INSIGHT</span></div>
      </div>

      <section className={styles.dailyHero}>
        <div className={styles.modeTabs}>
          <button className={mode === "gmail" ? styles.modeActive : ""} onClick={() => setMode("gmail")}>Gmail에서 가져오기</button>
          <button className={mode === "manual" ? styles.modeActive : ""} onClick={() => setMode("manual")}>직접 업로드</button>
        </div>

        {mode === "gmail" ? (
          <div className={styles.gmailPanel}>
            <div className={styles.gmailIntro}>
              <div><span className={styles.gmailMark}>M</span></div>
              <div><h2>Gmail Daily Report Intake</h2><p>광고주와 검색 규칙을 기준으로 메일 본문과 Excel 첨부를 한 세트로 가져옵니다.</p></div>
              <span className={styles.betaBadge}>CONNECTOR</span>
            </div>
            <div className={styles.formGrid}>
              <label><span>광고주</span><select value={advertiser} onChange={(e) => setAdvertiser(e.target.value)}><option>자코모</option><option>교원웰스</option><option>솔테라이브러리</option></select></label>
              <label className={styles.queryField}><span>Gmail 검색 규칙</span><input value={mailQuery} onChange={(e) => setMailQuery(e.target.value)} /></label>
              <label><span>기준일</span><input type="date" defaultValue="2026-09-15" /></label>
            </div>
            <div className={styles.gmailActions}>
              <button className={styles.connectButton} onClick={() => setImportState("preview")}>최신 리포트 불러오기</button>
              <span>실서비스에서는 Google OAuth + Gmail API로 연결합니다. 현재는 Intake/검수 UX를 먼저 검증합니다.</span>
            </div>
          </div>
        ) : (
          <div className={styles.manualPanel}>
            <div className={styles.manualGrid}>
              <div className={styles.dropzone}><div className="eyebrow">FACT SOURCE</div><h3>Daily Monitoring Excel</h3><p>.xlsx / .xls / .csv 파일을 드래그하거나 선택</p><button className={styles.secondaryButton}>Excel 선택</button></div>
              <div className={styles.mailPaste}><div className="eyebrow">INSIGHT SOURCE</div><h3>메일 본문</h3><textarea value={mailBody} onChange={(e) => setMailBody(e.target.value)} placeholder="메일 본문의 성과 분석 부분을 그대로 붙여넣으세요. 인사말·서명은 포함되어도 자동 제외합니다." /><button disabled={!canPreview} className={styles.secondaryButton} onClick={() => setImportState("preview")}>분석하기</button></div>
            </div>
          </div>
        )}
      </section>

      <section className={styles.bundleFlow}>
        <div><span>01</span><strong>메일/파일 수집</strong><small>Gmail 또는 직접 업로드</small></div>
        <i>→</i>
        <div><span>02</span><strong>Fact 파싱</strong><small>Excel 숫자·날짜·매체</small></div>
        <i>→</i>
        <div><span>03</span><strong>Insight 파싱</strong><small>요약·변동·이슈·액션</small></div>
        <i>→</i>
        <div><span>04</span><strong>QA / Diff</strong><small>수정본·불일치 검산</small></div>
        <i>→</i>
        <div><span>05</span><strong>Publish</strong><small>AE 확인 후 반영</small></div>
      </section>

      {importState === "preview" ? (
        <section className={styles.previewSection}>
          <div className={styles.previewHead}><div><div className="eyebrow">DAILY BUNDLE PREVIEW</div><h2>{advertiser} · 2026.09.15</h2><p>한 번의 Publish로 Performance와 Briefing이 같이 업데이트됩니다.</p></div><span className={styles.readyBadge}>검수 준비</span></div>

          <div className={styles.sourceSummary}>
            <article><span className={styles.sourceIcon}>XLS</span><div><strong>Daily Monitoring Excel</strong><p>JACOMO_Daily_0915.xlsx · 186 rows</p></div><b className={styles.okText}>Fact Source</b></article>
            <article><span className={styles.sourceIcon}>✉</span><div><strong>Gmail Insight</strong><p>[자코모] 9월 15일 Daily Report</p></div><b className={styles.insightText}>Insight Source</b></article>
          </div>

          <div className={styles.reviewGrid}>
            <article className={styles.reviewPanel}>
              <div className={styles.reviewTitle}><div><h3>Excel Fact Preview</h3><p>성과 데이터는 이 값을 기준으로 대시보드에 반영합니다.</p></div><span>186 rows</span></div>
              <div className={styles.factTable}>
                <div className={styles.factHeader}><span>매체</span><span>Spend</span><span>IMP</span><span>CTR</span><span>CV</span></div>
                <div><strong>Meta</strong><span>₩18.4M</span><span>4.82M</span><span>1.27%</span><span>418</span></div>
                <div><strong>NAVER GFA</strong><span>₩14.8M</span><span>5.21M</span><span>0.72%</span><span>162</span></div>
                <div><strong>Google / DV360</strong><span>₩11.2M</span><span>2.91M</span><span>1.38%</span><span>221</span></div>
                <div><strong>Kakao</strong><span>₩8.6M</span><span>3.77M</span><span>0.77%</span><span>104</span></div>
              </div>
            </article>

            <article className={styles.reviewPanel}>
              <div className={styles.reviewTitle}><div><h3>Mail Insight Preview</h3><p>메일 본문에서 해석만 구조화합니다. 숫자는 Excel과 교차검증합니다.</p></div><span>4 sections</span></div>
              <div className={styles.insightSections}>
                <div><span>성과 요약</span><strong>전체 효율은 안정적인 흐름으로 운영 중</strong></div>
                <div><span>주요 변동</span><strong>Meta 정성편 CTR 상승, Google 전환 증가</strong></div>
                <div><span>운영 이슈</span><strong>NAVER 클릭 대비 전환 기여도 추가 점검 필요</strong></div>
                <div><span>Next Action</span><strong>Meta 고효율 소재 중심 운영 유지</strong></div>
              </div>
            </article>
          </div>

          <div className={styles.qaPanel}>
            <div className={styles.reviewTitle}><div><h3>자동 QA</h3><p>메일과 Excel이 충돌하면 자동 덮어쓰지 않고 AE 확인 항목으로 남깁니다.</p></div><span className={styles.warnBadge}>1 확인</span></div>
            <div className={styles.qaList}>{qaItems.map((item) => <div key={item.title} className={styles.qaRow}><i className={item.type === "ok" ? styles.qaOk : styles.qaWarn}>{item.type === "ok" ? "✓" : "!"}</i><div><strong>{item.title}</strong><span>{item.desc}</span></div></div>)}</div>
            <div className={styles.changeSummary}><div><span>신규 데이터</span><strong>186</strong></div><div><span>과거값 수정</span><strong>7</strong></div><div><span>Insight 추출</span><strong>4</strong></div><div><span>확인 필요</span><strong>1</strong></div></div>
            <button className={styles.publish}>검수 완료 · 오늘 대시보드 반영</button>
          </div>
        </section>
      ) : (
        <section className={styles.emptyPreview}><strong>Daily Bundle 미리보기</strong><p>Gmail에서 리포트를 불러오거나 직접 업로드하면 Excel Fact와 Mail Insight를 한 화면에서 검수합니다.</p></section>
      )}

      <section className={styles.secondarySources}>
        <article><div className="eyebrow">MONTHLY / ASSET</div><h3>다른 운영 자료는 기존 방식 유지</h3><p>Media Mix는 최초/변경 시, 소재·게재지면은 Google Drive 폴더 동기화 또는 일괄 업로드로 관리합니다.</p></article>
        <div><span>Media Mix</span><strong>최초 + 변경 시</strong></div><div><span>Creative / Placement</span><strong>Drive 자동수집</strong></div>
      </section>
    </>
  );
}
