"use client";

import { useId, useMemo, useState } from "react";
import type { PublishedInsight } from "@/lib/daily-report-store";
import { isPerformanceReferenceRow, type buildPerformanceReport, type MediaPerformanceReport, type ReportKind, type ReportMetrics } from "@/lib/performance-report";
import { buildPerformanceChanges } from "@/lib/performance-brief";
import { inferMediaMentions, normalizeInsightText } from "@/lib/media-normalization";
import { MediaLabel } from "./media-label";
import styles from "./performance-report.module.css";

type Report = ReturnType<typeof buildPerformanceReport>;
type Metric = "impressions" | "clicks" | "spend" | "views";
const DAILY_METRICS: Metric[] = ["impressions", "clicks", "spend", "views"];
const KINDS: Record<ReportKind, string> = { digital: "디지털", video: "동영상·OTT", broadcast: "방송", ooh: "옥외·공간", other: "기타" };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const number = (value: number | null | undefined) => finite(value) ? Math.round(value).toLocaleString("ko-KR") : "—";
const money = (value: number | null | undefined) => finite(value) ? `${value !== 0 && Math.abs(value) < 1 ? value.toLocaleString("ko-KR", { maximumFractionDigits: 6 }) : number(value)}원` : "—";
const unitCost = (value: number | null | undefined) => !finite(value) ? "—" : `${value!==0&&Math.abs(value)<0.000001?value.toExponential(2):value.toLocaleString("ko-KR",value!==0&&Math.abs(value)<0.01?{maximumSignificantDigits:3}:{maximumFractionDigits:2})}원`;
const percent = (value: number | null | undefined) => finite(value) ? `${value.toFixed(2)}%` : "—";
const raw = (media: MediaPerformanceReport) => media.kind === "ooh" || media.kind === "broadcast" || media.kind === "other";
const labelFor = (media: MediaPerformanceReport, key: Metric) => key === "impressions" ? raw(media) ? "원본 지표 · 노출수" : "노출수" : key === "views" ? "조회수" : key === "spend" ? "집행액" : "클릭수";
const planOnly = (media: MediaPerformanceReport) => !media.rows.length && !media.dailyRows.length && !media.creativeRows?.length && media.plans.length > 0;
const shorten = (value: string, length: number) => value.length > length ? `${value.slice(0, length)}…` : value;
function mailDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "미제공";
}

const compactCount=(n:number|null|undefined)=>finite(n)&&Math.abs(n)>=10000?`${new Intl.NumberFormat("ko-KR",{maximumFractionDigits:1}).format(n/10000)}만`:number(n);
const compactMoney=(n:number|null|undefined)=>!finite(n)?"—":Math.abs(n)>=100000000?`${new Intl.NumberFormat("ko-KR",{maximumFractionDigits:2}).format(n/100000000)}억원`:Math.abs(n)>=10000?`${new Intl.NumberFormat("ko-KR",{maximumFractionDigits:0}).format(n/10000)}만원`:money(n);
function Kpi({ label, value, scope, exact }: { label: string; value: string; scope: string; exact?:string }) {
  return <div className={styles.kpi}><dt>{label}</dt><dd title={exact||value} aria-label={exact||value}>{value}</dd><p>{scope}</p></div>;
}

export function PerformanceReportOverview({ report, insights, startDate, endDate, onOpenMedia, onOpenPlan }: {
  report: Report; insights: PublishedInsight[]; startDate: string; endDate: string;
  onOpenMedia: (name: string) => void; onOpenPlan: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ReportKind | "all">("all");
  const [expanded, setExpanded] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  const evidence = report.media.filter(item => item.rows.length || item.dailyRows.length || item.creativeRows?.length);
  const matches = (item: MediaPerformanceReport) => (kind === "all" || kind === item.kind) && item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const results = evidence.filter(matches);
  const pending = report.media.filter(item => planOnly(item) && matches(item));
  const trendOptions = evidence.filter(item => item.dailyRows.length);
  const notes = insights.filter(item => item.reportDate >= startDate && item.reportDate <= endDate && item.notes.some(note => normalizeInsightText(note).trim()))
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.mailDate.localeCompare(a.mailDate)).slice(0, 2);
  const changes = useMemo(() => buildPerformanceChanges(report.media), [report.media]);
  const sourceFindings = insights.filter(item => item.reportDate >= startDate && item.reportDate <= endDate)
    .flatMap(item => item.notes.filter(note => /원본\s*불일치|수치.{0,12}불일치|날짜.{0,12}충돌|날짜\s*확인\s*필요/.test(note)).map(note => ({item,note})))
    .sort((a,b) => b.item.reportDate.localeCompare(a.item.reportDate)).slice(0,1);
  const paid = evidence.filter(item => finite(item.metrics.spend));
  const paidTotal = paid.reduce((sum, item) => sum + item.metrics.spend!, 0);
  const composition = report.baselineComplete && paidTotal > 0 && paid.every(item => item.metrics.spend! >= 0)
    ? [...paid].sort((a, b) => b.metrics.spend! - a.metrics.spend!) : [];
  const digital = evidence.filter(item => item.kind === "digital" || item.kind === "video");
  const scopeCount = (key: "impressions" | "clicks") => digital.filter(item => item.rows.some(row => finite(row[key]))).length;
  const period = (value: number | null) => report.baselineComplete ? value : null;
  const totals = report.totals;
  return <div className={styles.report}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>보고 요약</p>
      <h2>이번 보고서의 변화와 확인사항</h2>
      <p className={styles.period}>{startDate} ~ {endDate}</p>
      <p className={styles.narrative}>선택 기간의 성과 원본이 있는 매체는 <strong>{evidence.length}개</strong>입니다.
        {report.planOnlyCount > 0 && <> 계획만 등록된 {report.planOnlyCount}개 매체는 성과와 구분해 표시합니다.</>}
      </p>
      <p className={styles.meta}>최근 보고 기준일 {report.latestReportDate ?? "미제공"} <span>·</span> 최근 일별 원본 {report.latestDailyDate ?? "미제공"}</p>
    </header>
    {!report.baselineComplete && <p className={styles.notice} role="status">기간 시작 전 기준 원본이 충분하지 않아 선택 기간의 누적 합계와 효율은 표시하지 않습니다. 제공된 일별 원본은 별도로 볼 수 있습니다.</p>}
    {(changes.length > 0 || sourceFindings.length > 0) && <section className={styles.attention} aria-label="최근 변화와 보고 당시 확인사항">
      {changes.slice(0,2).map(change => <button type="button" className={styles.changeCard} key={change.media} onClick={()=>onOpenMedia(change.media)} aria-label={change.media+" 최근 변화 상세 보기"}>
        <span className={styles.attentionLabel}>최근 일별 변화 · <MediaLabel media={change.media}>{change.media}</MediaLabel></span><strong>{change.percent > 0 ? "+" : ""}{change.percent.toFixed(1)}% <small>{change.metric === "views" ? "원본 조회" : "클릭"}</small></strong>
        <span>{change.previousDate.slice(5)} {number(change.previous)} → {change.date.slice(5)} {number(change.current)}</span><small>같은 지면·지표의 전일 비교 · 효율 판단 아님</small>
      </button>)}
      {sourceFindings.map(({item,note}) => {const media=inferMediaMentions(note).find(name=>report.media.some(m=>m.name===name));return <div key={item.key+note} className={styles.findingCard}>
        <span className={styles.attentionLabel}>보고 당시 원본 대조 메모</span><strong>{item.reportDate}</strong><p>{shorten(normalizeInsightText(note),120)}</p>{media&&<button type="button" onClick={()=>onOpenMedia(media)}><MediaLabel media={media}>{media}</MediaLabel> 근거 확인 →</button>}<small>현재 해결 여부는 별도 기록 전까지 판단하지 않습니다.</small>
      </div>})}
    </section>}
    <dl className={styles.headlineKpis}>
      <Kpi label="보고된 집행액" value={compactMoney(period(totals.reportedSpend))} exact={money(period(totals.reportedSpend))} scope={`${totals.spendMediaCount}개 매체의 비용 제공분 · 전체 예산 아님`} />
      <Kpi label="디지털 노출수" value={compactCount(period(totals.digitalImpressions))} exact={number(period(totals.digitalImpressions))} scope={`디지털·동영상 ${scopeCount("impressions")}개 매체 제공분 · 방송·옥외 제외`} />
      <Kpi label="디지털 클릭수" value={compactCount(period(totals.digitalClicks))} exact={number(period(totals.digitalClicks))} scope={`디지털·동영상 ${scopeCount("clicks")}개 매체 제공분 · 미제공분 제외`} />
      {totals.videoMediaCount > 0 && <Kpi label="동영상 조회수" value={compactCount(period(totals.videoViews))} exact={number(period(totals.videoViews))} scope={`동영상·OTT ${totals.videoMediaCount}개 매체 조회 제공분`} />}
    </dl>
    <p className={styles.footnote}>제공된 원본 범위의 합계이며 전체 매체 실적을 뜻하지 않습니다. 서비스·참고 비용은 집행액에서 제외합니다{totals.excludedReferenceRows > 0 ? ` (${totals.excludedReferenceRows}개 원본 행)` : ""}. 미제공 값은 ‘—’, 실제 0은 ‘0’으로 표시합니다. 요약 단위는 반올림하며 정확한 값은 숫자에 마우스를 올리거나 매체 상세에서 확인합니다.</p>
    <section className={styles.section} aria-labelledby={`${id}-trend`}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>일별 추이</p><h3 id={`${id}-trend`}>한 그래프에서 함께 보는 일별 지표</h3></div></div>
      {trendOptions.length ? <DailyMetricExplorer mediaOptions={trendOptions} startDate={startDate} endDate={endDate} /> : <p className={styles.empty}>선택 기간에 제공된 일별 성과 원본이 없습니다. 누적 성과와 계획 수치로 추이를 만들지 않습니다.</p>}
    </section>
    <div className={composition.length ? styles.contextGrid : styles.contextSingle}>
      {composition.length > 0 && <section className={styles.section} aria-labelledby={`${id}-spend`}>
        <p className={styles.eyebrow}>집행 구성</p><h3 id={`${id}-spend`}>집행액 분포</h3>
        <p className={styles.support}>비용 제공 매체 내 비중 · 성과 순위가 아닙니다</p>
        <ul className={styles.spendList}>{composition.slice(0, 5).map(item => <li key={item.name}>
          <button type="button" onClick={() => onOpenMedia(item.name)}><span><MediaLabel media={item.name}>{item.name}</MediaLabel></span><strong>{money(item.metrics.spend)}</strong></button>
          <div className={styles.spendTrack} aria-hidden="true"><span style={{ width: `${item.metrics.spend! / paidTotal * 100}%` }} /></div>
          <small>{(item.metrics.spend! / paidTotal * 100).toFixed(1)}%</small>
        </li>)}</ul>
        {composition.length > 5 && <p className={styles.footnote}>그 외 {composition.length - 5}개 매체 {money(composition.slice(5).reduce((sum, item) => sum + item.metrics.spend!, 0))}</p>}
      </section>}
      <section className={styles.section} aria-labelledby={`${id}-notes`}>
        <p className={styles.eyebrow}>보고서 운영 기록</p><h3 id={`${id}-notes`}>최근 운영 메모</h3>
        <p className={styles.support}>선택 기간의 보고일 기준 최신 2건 · 등록된 원문 발췌</p>
        {notes.length ? notes.map(item => {
          const text = item.notes.map(note => normalizeInsightText(note).trim()).filter(Boolean);
          return <details className={styles.memo} key={item.key}>
            <summary><span className={styles.memoDate}>보고 기준일 {item.reportDate}</span><span className={styles.memoPreview}>{shorten(text[0], 180)}</span><span className={styles.readMore}>메모 펼치기</span></summary>
            <p className={styles.meta}>메일 수신일 {mailDate(item.mailDate)} (한국 시간)</p>
            <p className={styles.source}>출처: {normalizeInsightText(item.mailSubject) || "등록된 보고 메일"}</p>
            {text.slice(0, 2).map((note, index) => <p className={styles.memoText} key={index}>{shorten(note, 650)}</p>)}
            <p className={styles.footnote}>원문 일부입니다. 보고 이후의 조치·해결 여부를 뜻하지 않습니다.</p>
          </details>;
        }) : <p className={styles.empty}>선택 기간에 등록된 운영 메모가 없습니다. 메모 부재는 운영 상태에 대한 판단이 아닙니다.</p>}
      </section>
    </div>
    <section className={styles.section} aria-labelledby={`${id}-media`}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>매체별 상세로 이동</p><h3 id={`${id}-media`}>매체별 성과</h3><p className={styles.support}>같은 지표를 억지로 비교하지 않고, 매체에 맞는 결과를 표시합니다.</p></div><button type="button" className={styles.textButton} onClick={onOpenPlan}>매체 계획 보기 →</button></div>
      <div className={styles.filterBar}><label className={styles.search}>매체 검색<input type="search" value={query} placeholder="매체명을 입력하세요" onChange={event => { setQuery(event.target.value); setExpanded(false); setPendingExpanded(false); }} /></label>
        <div className={styles.filters} role="group" aria-label="매체 유형 필터">{(["all", ...Object.keys(KINDS)] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value as ReportKind | "all"); setExpanded(false); setPendingExpanded(false); }}>{value === "all" ? "전체" : KINDS[value as ReportKind]}</button>)}</div>
      </div>
      <p className={styles.resultCount} aria-live="polite">성과 원본 {results.length}개 매체 · {expanded ? results.length : Math.min(7, results.length)}개 표시</p>
      <ul className={styles.mediaList}>{results.slice(0, expanded ? undefined : 7).map(item => {
        const primary = raw(item) ? item.metrics.impressions : item.kind === "video" ? item.metrics.views : item.metrics.clicks;
        const primaryLabel = raw(item) ? "원본 지표 · 노출수" : item.kind === "video" ? "조회수" : "클릭수";
        return <li key={item.name}><button type="button" className={styles.mediaRow} onClick={() => onOpenMedia(item.name)} aria-label={`${item.name} 성과 상세 보기`}>
          <span className={styles.mediaName}><strong><MediaLabel media={item.name} size="md">{item.name}</MediaLabel></strong><small>{KINDS[item.kind]} · 원본 {item.sourceCount}개</small></span>
          <span className={styles.rowValue}><small>보고된 집행액</small><strong>{money(period(item.metrics.spend))}</strong></span>
          <span className={styles.rowValue}><small>{primaryLabel}</small><strong>{number(period(primary))}</strong></span>
          <span className={styles.coverage}><span>보고 기준 {item.reportDate ?? "미제공"}</span><span>{item.dailyThrough?`일별 원본 ~ ${item.dailyThrough}`:item.creativeThrough?`소재 원본 ${item.creativeThrough} · 매체 누적 미제공`:"일별 원본 미제공"}</span></span><span className={styles.arrow} aria-hidden="true">→</span>
        </button></li>;
      })}</ul>
      {!results.length && <p className={styles.empty}>조건에 맞는 성과 원본이 없습니다.</p>}
      {results.length > 7 && <button type="button" className={styles.moreButton} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "7개만 보기" : `나머지 ${results.length - 7}개 매체 더 보기`}</button>}
      {pending.length > 0 && <details className={styles.pending}><summary>계획 등록 · 성과 원본 대기 <span>{pending.length}개 매체</span></summary><p className={styles.support}>계획만 제공된 매체입니다. 집행 여부나 성과를 판단하지 않습니다.</p>
        <ul>{pending.slice(0, pendingExpanded ? undefined : 7).map(item => <li key={item.name}><button type="button" onClick={() => onOpenMedia(item.name)}><span><MediaLabel media={item.name}>{item.name}</MediaLabel></span><small>{KINDS[item.kind]} · 계획 상세 →</small></button></li>)}</ul>
        {pending.length > 7 && <button type="button" className={styles.moreButton} aria-expanded={pendingExpanded} onClick={() => setPendingExpanded(!pendingExpanded)}>{pendingExpanded ? "7개만 보기" : `계획 매체 ${pending.length - 7}개 더 보기`}</button>}
      </details>}
    </section>
  </div>;
}

export function MediaReportKpis({ media, baselineComplete }: { media: MediaPerformanceReport; baselineComplete: boolean }) {
  const metrics = media.metrics;
  const visible = (key: keyof ReportMetrics) => finite(metrics[key]);
  const value = (key: keyof ReportMetrics) => baselineComplete ? metrics[key] : null;
  const kpis: Array<{ key: keyof ReportMetrics; label: string; format?: "money" | "percent" | "unit"; scope: string }> = [
    { key: "spend", label: "보고된 집행액", format: "money", scope: "비용 제공분 · 서비스·참고 비용 제외" },
  ];
  if (raw(media)) {
    if (visible("impressions")) kpis.push({ key: "impressions", label: "원본 지표 · 노출수", scope: "원본 표기값 · 순도달·실제 시청 인원 아님" });
    if (visible("views")) kpis.push({ key: "views", label: "원본 지표 · 조회수", scope: "원본 표기값 · 실제 시청 인원 아님" });
  } else if (media.kind === "video") {
    if (visible("views")) kpis.push({ key: "views", label: "조회수", scope: "조회 지표가 제공된 원본 범위" });
    if (visible("cpv")) kpis.push({ key: "cpv", label: "조회당 비용 (CPV)", format: "unit", scope: "비용·조회가 함께 있는 유료 원본 기준" });
    if (visible("impressions")) kpis.push({ key: "impressions", label: "노출수", scope: "노출 지표가 제공된 원본 범위" });
  } else {
    if (visible("impressions")) kpis.push({ key: "impressions", label: "노출수", scope: "노출 지표가 제공된 원본 범위" });
    if (visible("clicks")) kpis.push({ key: "clicks", label: "클릭수", scope: "클릭 지표가 제공된 원본 범위" });
    if (visible("ctr")) kpis.push({ key: "ctr", label: "클릭률 (CTR)", format: "percent", scope: "클릭·노출이 함께 있는 원본 기준" });
    if (visible("cpc")) kpis.push({ key: "cpc", label: "클릭당 비용 (CPC)", format: "unit", scope: "비용·클릭이 함께 있는 유료 원본 기준" });
    if (visible("conversions")) kpis.push({ key: "conversions", label: "전환수", scope: "원본 정의 기준 · 매체 간 단순 비교 불가" });
  }
  return <section className={styles.report} aria-label={`${media.name} 성과 요약`}>
    {!baselineComplete && <p className={styles.notice}>기간 기준 원본이 충분하지 않아 누적 합계와 효율을 표시하지 않습니다. 원본의 일별 값과 구분해 확인하세요.</p>}
    <dl className={styles.mediaKpis}>{kpis.map(kpi => <Kpi key={kpi.key} label={kpi.label} value={kpi.format === "money" ? money(value(kpi.key)) : kpi.format === "unit" ? unitCost(value(kpi.key)) : kpi.format === "percent" ? percent(value(kpi.key)) : number(value(kpi.key))} scope={kpi.scope} />)}</dl>
    <p className={styles.footnote}>보고 기준일 {media.reportDate ?? "미제공"} · 일별 원본 ~ {media.dailyThrough ?? "미제공"} · 원본 {media.sourceCount}개. ‘—’는 미제공 또는 산출 불가입니다.</p>
  </section>;
}

// dailyRows have already been source-deduplicated by reporting-data. Preserve
// distinct placements even when their metric values happen to be identical.
export function buildReportDailySeries(media: MediaPerformanceReport, startDate: string, endDate: string) {
  const groups = new Map<string, typeof media.dailyRows>();
  for (const row of media.dailyRows) {
    const timestamp = Date.parse(row.date + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== row.date || row.date < startDate || row.date > endDate) continue;
    const group = groups.get(row.date) ?? []; group.push(row); groups.set(row.date, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
    const total = (key: Metric) => {
      const values = rows.filter(row => key !== "spend" || !isPerformanceReferenceRow(row)).map(row => row[key]).filter(finite);
      const sum = values.reduce((a, b) => a + b, 0);
      return values.length && finite(sum) ? sum : null;
    };
    return { date, timestamp: Date.parse(date + "T00:00:00Z"), impressions: total("impressions"), clicks: total("clicks"), views: total("views"), spend: total("spend") };
  });
}
type DailyPoint = ReturnType<typeof buildReportDailySeries>[number];
const dailyFormat = (value: number | null | undefined, metric: Metric) => !finite(value) ? "미제공" : metric === "spend" ? money(value) : number(value);
const metricAllowed = (media: MediaPerformanceReport, metric: Metric) => !raw(media) || ["impressions", "views", "spend"].includes(metric);

export function PerformanceReportTrend({ media, startDate, endDate }: { media: MediaPerformanceReport; startDate: string; endDate: string }) {
  return <DailyMetricExplorer mediaOptions={[media]} startDate={startDate} endDate={endDate} />;
}

// Reuse the exact chart series; never synthesize a missing value or combine media.
export function buildReportDailyTable(items: { media: MediaPerformanceReport; series: DailyPoint[] }[], startDate: string, endDate: string) {
  const first = Date.parse(startDate + "T00:00:00Z"), last = Date.parse(endDate + "T00:00:00Z");
  const valid = Number.isFinite(first) && Number.isFinite(last) && first <= last && new Date(first).toISOString().slice(0, 10) === startDate && new Date(last).toISOString().slice(0, 10) === endDate;
  const days = valid ? Math.round((last - first) / 86400000) + 1 : 0;
  const calendarComplete = valid && days <= 366;
  const dates = !valid ? [] : calendarComplete ? Array.from({ length: days }, (_, index) => new Date(first + index * 86400000).toISOString().slice(0, 10)) : [...new Set(items.flatMap(item => item.series.map(point => point.date)))].filter(date => date >= startDate && date <= endDate).sort();
  const lookups = items.map(item => ({ media: item.media, points: new Map(item.series.map(point => [point.date, point])) }));
  return { calendarComplete, groups: dates.reverse().map(date => ({ date, rows: lookups.map(item => ({ media: item.media, point: item.points.get(date) ?? null })) })) };
}

export function DailyMetricTable({ groups, metrics, date }: { groups: ReturnType<typeof buildReportDailyTable>["groups"]; metrics: Metric[]; date: string }) {
  const hasRaw = groups.some(group => group.rows.some(row => raw(row.media)));
  return <div className={styles.dailyTableScroll} role="region" aria-label="일별 통합표 스크롤 영역" tabIndex={0}>
    <table className={styles.dailyTable} data-daily-table aria-label="일별 지표 통합표">
      <caption>날짜별 · 매체별 제공 지표를 한 표에서 비교합니다. 최신 날짜순 · 매체 간 합산 없음</caption>
      <thead><tr><th scope="col">날짜</th><th scope="col">매체</th>{metrics.map(metric => <th scope="col" key={metric}>{metric === "impressions" ? hasRaw ? "노출수 / 원본값" : "노출수" : metric === "clicks" ? "클릭수" : metric === "spend" ? "집행액 (원)" : hasRaw ? "조회수 / 원본값" : "조회수"}</th>)}</tr></thead>
      {groups.map(group => <tbody key={group.date} data-selected-date={group.date === date ? "true" : undefined}>{group.rows.map(({media, point}, index) => <tr key={media.name} data-daily-table-date={group.date} data-daily-table-media={media.name}>
        {index === 0 && <th scope="rowgroup" rowSpan={group.rows.length} className={styles.dailyDate}><time dateTime={group.date}>{group.date}</time>{group.date === date && <small>비교일</small>}</th>}
        <th scope="row" className={styles.dailyMedia}><MediaLabel media={media.name}>{media.name}</MediaLabel>{raw(media) && <small>원본 지표 · 접촉 인원 아님</small>}</th>
        {metrics.map(metric => { const allowed = metricAllowed(media, metric), value = allowed ? point?.[metric] : null;
          const missing = !allowed ? "해당 없음" : !point ? "원본 없음" : "미제공";
          return <td key={metric} data-daily-table-metric={metric} className={!finite(value) ? styles.dailyMissing : value === 0 ? styles.dailyZero : undefined} title={raw(media) && (metric === "impressions" || metric === "views") ? "원본 표기 단위이며 디지털 노출·실제 접촉 인원과 동일하지 않습니다." : undefined}>{finite(value) ? dailyFormat(value, metric) : missing}</td>;
        })}
      </tr>)}</tbody>)}
    </table>
  </div>;
}

function DailyMetricExplorer({ mediaOptions, startDate, endDate }: { mediaOptions: MediaPerformanceReport[]; startDate: string; endDate: string }) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [selectedNames, setSelectedNames] = useState<string[]>([mediaOptions[0]?.name].filter(Boolean));
  const [selectedMetrics, setSelectedMetrics] = useState<Metric[] | null>(null);
  const [activeDate, setActiveDate] = useState("");
  const [onlyDate, setOnlyDate] = useState(false);
  const [graphMediaName, setGraphMediaName] = useState("");
  const all = useMemo(() => mediaOptions.map(media => ({ media, series: buildReportDailySeries(media, startDate, endDate) })), [mediaOptions, startDate, endDate]);
  const names = selectedNames.filter(name => all.some(item => item.media.name === name));
  const selected = all.filter(item => (names.length ? names : [all[0]?.media.name]).includes(item.media.name));
  const graphItem = selected.find(item => item.media.name === graphMediaName) ?? selected[0];
  const available = DAILY_METRICS.filter(metric => selected.some(({media, series}) => metricAllowed(media, metric) && series.some(point => finite(point[metric]))));
  const metrics = (selectedMetrics ?? available.slice(0, 3)).filter(metric => available.includes(metric));
  const dates = [...new Set(selected.flatMap(item => item.series.map(point => point.date)))].sort();
  const dailyTable = buildReportDailyTable(selected, startDate, endDate);
  const dateChoices = dailyTable.groups.map(group => group.date).reverse();
  const date = dateChoices.includes(activeDate) ? activeDate : dates.at(-1) ?? dateChoices.at(-1) ?? "";
  const minTime = Date.parse(startDate + "T00:00:00Z"), maxTime = Date.parse(endDate + "T00:00:00Z");
  const toggleMetric = (metric: Metric) => setSelectedMetrics(metrics.includes(metric) ? metrics.filter(key => key !== metric) : [...metrics, metric].slice(0, 4));
  return <div className={styles.trend} data-daily-multi-metrics>
    <p className={styles.meta}>{startDate} ~ {endDate} · 매체 최대 3개 · 지표 최대 4개 · 선택 매체의 여러 지표를 한 그래프에 표시</p>
    {mediaOptions.length > 1 && <fieldset className={styles.metricChoices}><legend>비교 매체 (최대 3개)</legend>
      <label className={styles.mediaSearch}>매체 찾기<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="매체명 검색" /></label>
      <div className={styles.choiceList}>{all.filter(({media}) => media.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(({media}) => {
        const checked = selected.some(item => item.media.name === media.name);
        return <label key={media.name}><input type="checkbox" checked={checked} disabled={checked ? selected.length === 1 : selected.length >= 3} onChange={() => setSelectedNames(checked ? selected.map(item => item.media.name).filter(name => name !== media.name) : [...selected.map(item => item.media.name), media.name])} /><MediaLabel media={media.name}>{media.name}</MediaLabel></label>;
      })}</div>
      {!all.some(({media}) => media.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p className={styles.meta}>검색한 매체가 없습니다. 기존 선택은 유지됩니다.</p>}
    </fieldset>}
    <fieldset className={styles.metricChoices}><legend>일별 지표 (최대 4개)</legend><div className={styles.choiceList}>{DAILY_METRICS.map(metric => {
      const provided = available.includes(metric), checked = metrics.includes(metric);
      return <label key={metric}><input type="checkbox" checked={checked} disabled={!provided || (!checked && metrics.length >= 4)} onChange={() => toggleMetric(metric)} />{metric === "impressions" ? "노출수" : metric === "clicks" ? "클릭수" : metric === "spend" ? "집행액" : "조회수"}{!provided && <small>미제공</small>}</label>;
    })}</div></fieldset>
    {dateChoices.length > 0 && <div className={styles.sharedDate}><label htmlFor={id + "-date"}>공통 비교일</label><select id={id + "-date"} value={date} onChange={event => setActiveDate(event.target.value)}>{dateChoices.map(value => <option key={value} value={value}>{value}</option>)}</select><span className={styles.meta}>같은 날짜의 모든 지표를 함께 확인하세요.</span></div>}
    <p className={styles.dateStatus} aria-live="polite">{date && date + " · "}{selected.map(item => item.media.name).join(" / ")} · {metrics.length}개 지표 선택</p>
    {metrics.length > 0 && graphItem && <>
      {selected.length > 1 && <div className={styles.graphMediaChoice}><label htmlFor={id+"-graph-media"}>그래프 매체</label><select id={id+"-graph-media"} value={graphItem.media.name} onChange={event=>setGraphMediaName(event.target.value)}>{selected.map(item=><option key={item.media.name} value={item.media.name}>{item.media.name}</option>)}</select><span>한 그래프에는 이 매체의 지표를 표시합니다. 매체 간 수치 비교는 아래 표에서 확인하세요.</span></div>}
      <DailyCombinedChart media={graphItem.media} series={graphItem.series} metrics={metrics} dates={dateChoices} date={date} minTime={minTime} maxTime={maxTime} onDate={setActiveDate} />
      <details className={styles.dailyGraphDisclosure} data-daily-table-disclosure><summary>일별 수치 표 펼치기</summary>
        <label className={styles.onlyDate}><input type="checkbox" checked={onlyDate} onChange={event=>setOnlyDate(event.target.checked)} />선택일만 보기</label>
        <DailyMetricTable groups={onlyDate?dailyTable.groups.filter(group=>group.date===date):dailyTable.groups} metrics={metrics} date={date} />
        <p className={styles.tableHint}>‘미제공’은 지표 누락, ‘원본 없음’은 해당 날짜 자료 없음입니다. 실제 0은 0으로 표시하며, 다른 매체를 합산하지 않습니다. 방송·옥외 원본값은 디지털 노출과 직접 비교하지 않습니다.{!dailyTable.calendarComplete && " 1년 초과 기간은 원본이 있는 날짜만 표시합니다."}</p>
      </details>
    </>}
    {!metrics.length && <p className={styles.empty}>{available.length ? "함께 볼 일별 지표를 선택하세요." : "선택 기간에 표시할 수 있는 일별 원본 지표가 없습니다. 누적·계획 수치로 대체하지 않습니다."}</p>}
    <p className={styles.footnote}>일별 원본의 제공 범위는 누적 성과 카드와 다를 수 있습니다. 일별 원본 제공분만 표시합니다. 표의 값은 제공 지면만 집계한 수치이며 일부 지면은 미제공일 수 있습니다. 미제공 날짜·값은 0이 아니며 그래프에서는 선을 연결하지 않습니다. 실제 0은 ‘0’으로 표시합니다. 집행액은 서비스·참고 비용을 제외합니다. 각 지표의 축 범위가 달라 선 높이를 지표 간 규모로 비교할 수 없습니다. 방송·옥외의 원본 지표는 실제 접촉 인원·순도달을 뜻하지 않습니다.</p>
  </div>;
}

const COMBINED_COLORS: Record<Metric, string> = { impressions: "#365cce", clicks: "#087f8c", spend: "#a65d0b", views: "#6941c6" };
const COMBINED_DASHES: Record<Metric, string | undefined> = { impressions: undefined, clicks: "7 4", spend: "2 4", views: "10 4 2 4" };
const COMBINED_AXES: Record<Metric, { x: number; side: "left" | "right" }> = { impressions: { x: 156, side: "left" }, clicks: { x: 76, side: "left" }, spend: { x: 812, side: "right" }, views: { x: 892, side: "right" } };
const axisNumber = (value: number) => Math.abs(value) >= 1e15 ? value.toExponential(1) : new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

// One media per plot: raw broadcast/OOH units never share a digital metric axis.
// This projection only reads the existing source-deduplicated daily series.
export function buildCombinedDailyChart(media: MediaPerformanceReport, series: DailyPoint[], metrics: Metric[], minTime: number, maxTime: number) {
  const ordered = series.filter(point => finite(point.timestamp) && point.timestamp >= minTime && point.timestamp <= maxTime).slice().sort((a,b) => a.timestamp - b.timestamp);
  const xAt = (timestamp: number) => maxTime > minTime ? 180 + Math.max(0, Math.min(1, (timestamp - minTime) / (maxTime - minTime))) * 600 : 480;
  const axes = DAILY_METRICS.filter(metric => metrics.includes(metric)).map(metric => {
    const allowed = metricAllowed(media, metric);
    const values = allowed ? ordered.map(point => point[metric]).filter(finite) : [];
    const minimum = Math.min(0, ...values), high = Math.max(0, ...values), maximum = high === minimum ? 1 : high;
    // Divide first so extreme finite inputs cannot overflow max-min or coordinates.
    const scale = Math.max(Math.abs(minimum), Math.abs(maximum), 1);
    const yAt = (value: number) => 322 - (value / scale - minimum / scale) / (maximum / scale - minimum / scale) * 264;
    const paths: string[] = [], points: { date: string; timestamp: number; value: number; x: number; y: number }[] = [];
    let path = "", previous: number | null = null;
    if (allowed) for (const point of ordered) {
      const value = point[metric];
      if (!finite(value)) { if(path) paths.push(path); path=""; previous=null; continue; }
      if (previous !== null && point.timestamp - previous !== 86400000) { if(path) paths.push(path); path=""; }
      const x=xAt(point.timestamp),y=yAt(value);
      path += (path ? " L" : "M") + x + "," + y; previous=point.timestamp;
      points.push({ date:point.date, timestamp:point.timestamp, value, x, y });
    }
    if(path) paths.push(path);
    const label = raw(media) && metric === "views" ? "원본 지표 · 조회수" : labelFor(media,metric);
    return { metric, label, color:COMBINED_COLORS[metric], dash:COMBINED_DASHES[metric], ...COMBINED_AXES[metric], minimum, maximum, allowed, provided:values.length>0, paths, points, yAt };
  });
  return { axes, xAt };
}

export function DailyCombinedChart({ media, series, metrics, dates, date, minTime, maxTime, onDate }: { media:MediaPerformanceReport; series:DailyPoint[]; metrics:Metric[]; dates:string[]; date:string; minTime:number; maxTime:number; onDate:(date:string)=>void }) {
  const chartId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const model = buildCombinedDailyChart(media,series,metrics,minTime,maxTime);
  const selected = series.find(point=>point.date===date);
  const read = (metric:Metric) => metricAllowed(media,metric) ? dailyFormat(selected?.[metric],metric) : "해당 없음";
  const dayLabel = (day:string) => { const point=series.find(item=>item.date===day); return day+" · "+model.axes.map(axis=>axis.label+" "+(axis.allowed?dailyFormat(point?.[axis.metric],axis.metric):"해당 없음")).join(" · "); };
  const axisTitle = (metric:Metric) => metric==="impressions" ? raw(media)?"원본 노출":"노출수" : metric==="clicks"?"클릭수":metric==="spend"?"집행액 (원)":raw(media)?"원본 조회":"조회수";
  return <section className={styles.combinedCard} data-daily-combined-chart data-combined-media={media.name} aria-label={media.name+" 일별 통합 그래프"}>
    <header className={styles.combinedHeading}><h4><MediaLabel media={media.name}>{media.name}</MediaLabel> · 여러 지표를 한 그래프에서</h4><p>색상·선 모양별 지표 · 각각의 원래 단위와 독립 축</p></header>
    {raw(media) && <p className={styles.notice}>매체 원본의 표기 단위입니다. 디지털 노출·실제 접촉 인원과 동일하지 않습니다.</p>}
    <div className={styles.combinedScroll} role="region" aria-label="통합 그래프 스크롤 영역" tabIndex={0}>
      <svg className={styles.combinedPlot} data-combined-plot viewBox="0 0 960 400" role="group" aria-label={media.name+" 일별 다중 지표 통합 그래프"}>
        <defs><clipPath id={"combined-"+chartId}><rect x="180" y="54" width="600" height="272" /></clipPath></defs>
        {[0,.25,.5,.75,1].map(tick=><line key={tick} x1="180" x2="780" y1={58+tick*264} y2={58+tick*264} className={styles.gridLine} />)}
        {model.axes.map(axis=><g key={axis.metric} data-combined-axis={axis.metric} data-axis-min={axis.minimum} data-axis-max={axis.maximum}>
          <text x={axis.x} y="24" textAnchor={axis.side==="left"?"end":"start"} fill={axis.color} fontWeight="600">{axisTitle(axis.metric)}</text>
          {axis.provided ? <><line x1={axis.x} x2={axis.x} y1="58" y2="322" stroke={axis.color} opacity=".45" />{[0,.5,1].map(tick=>{const value=axis.minimum*(1-tick)+axis.maximum*tick,y=axis.yAt(value);return <g key={tick}><line x1={axis.x-3} x2={axis.x+3} y1={y} y2={y} stroke={axis.color}/><text x={axis.x+(axis.side==="left"?-7:7)} y={y+4} textAnchor={axis.side==="left"?"end":"start"} fill={axis.color}>{axisNumber(value)}</text></g>;})}</> : <text x={axis.x} y="52" textAnchor={axis.side==="left"?"end":"start"} fill={axis.color}>{axis.allowed?"미제공":"해당 없음"}</text>}
        </g>)}
        <g clipPath={"url(#combined-"+chartId+")"} pointerEvents="none">
          {model.axes.map(axis=><g key={axis.metric}>{axis.paths.map((d,index)=><path key={index} data-combined-line={axis.metric} d={d} fill="none" stroke={axis.color} strokeWidth="2.5" strokeDasharray={axis.dash} />)}{axis.points.map(point=><circle key={point.date} data-combined-point={axis.metric} data-date={point.date} cx={point.x} cy={point.y} r={date===point.date?4.5:2.5} fill={axis.color}><title>{point.date+" · "+axis.label+" "+dailyFormat(point.value,axis.metric)}</title></circle>)}</g>)}
          {date && <line x1={model.xAt(Date.parse(date+"T00:00:00Z"))} x2={model.xAt(Date.parse(date+"T00:00:00Z"))} y1="54" y2="326" className={styles.dateGuide} />}
        </g>
        {!model.axes.some(axis=>axis.provided) && <text x="480" y="188" textAnchor="middle" className={styles.combinedEmpty}>선택한 매체의 일별 지표가 미제공입니다.</text>}
        {dates.map((day,index)=>{const x=model.xAt(Date.parse(day+"T00:00:00Z")),previous=index?model.xAt(Date.parse(dates[index-1]+"T00:00:00Z")):180,next=index<dates.length-1?model.xAt(Date.parse(dates[index+1]+"T00:00:00Z")):780,left=index?(previous+x)/2:180,right=index<dates.length-1?(next+x)/2:780;return <rect key={day} data-combined-day={day} x={left} y="54" width={Math.max(1,right-left)} height="272" fill="transparent" role="button" tabIndex={date===day?0:-1} aria-label={dayLabel(day)} aria-pressed={date===day} className={styles.combinedDay} onMouseEnter={()=>onDate(day)} onFocus={()=>onDate(day)} onClick={()=>onDate(day)} onKeyDown={event=>{
          if(event.key==="Enter"||event.key===" "){event.preventDefault();onDate(day);}
          if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){event.preventDefault();const target=event.key==="Home"?0:event.key==="End"?dates.length-1:Math.max(0,Math.min(dates.length-1,index+(event.key==="ArrowLeft"?-1:1)));event.currentTarget.ownerSVGElement?.querySelectorAll<SVGRectElement>('[data-combined-day]')[target]?.focus();}
        }}><title>{dayLabel(day)}</title></rect>;})}
        {[...new Set([0,Math.floor((dates.length-1)/2),dates.length-1])].filter(index=>index>=0&&dates[index]).map(index=><text key={index} x={model.xAt(Date.parse(dates[index]+"T00:00:00Z"))} y="352" textAnchor="middle">{dates[index].slice(5).replace("-","/")}</text>)}
        <text x="480" y="382" textAnchor="middle">날짜에 마우스를 올리거나 터치 · 키보드 ← →로 모든 지표 함께 확인</text>
      </svg>
    </div>
    <p className={styles.combinedDate}>{date || "일별 원본 없음"} · {selected?"같은 날짜의 지표":"해당 날짜 원본 없음"}</p>
    <dl className={styles.combinedReadouts} aria-live="polite">{model.axes.map(axis=><div key={axis.metric} data-combined-readout={axis.metric}><dt><i aria-hidden="true" style={{borderColor:axis.color,borderTopStyle:axis.dash?"dashed":"solid"}}/>{axis.label}</dt><dd><strong>{read(axis.metric)}</strong></dd><small>{axis.provided?"독립 축 "+axisNumber(axis.minimum)+" ~ "+axisNumber(axis.maximum)+(axis.metric==="spend"?"원":"") : axis.allowed?"일별 원본 미제공":"이 매체에 적용하지 않는 지표"}</small></div>)}</dl>
    <p className={styles.tableHint}>각 선은 색상에 맞는 독립 축을 사용합니다. 선의 높이로 지표 간 규모를 비교하지 마세요. 원본 값은 위에 그대로 표시하며, 미제공·날짜 공백은 연결하거나 0으로 채우지 않습니다.</p>
  </section>;
}
