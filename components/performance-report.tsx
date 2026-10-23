"use client";

import { useId, useMemo, useState } from "react";
import type { PublishedInsight } from "@/lib/daily-report-store";
import type { buildPerformanceReport, MediaPerformanceReport, ReportKind, ReportMetrics } from "@/lib/performance-report";
import { buildPerformanceChanges } from "@/lib/performance-brief";
import { inferMediaMentions, normalizeInsightText } from "@/lib/media-normalization";
import styles from "./performance-report.module.css";

type Report = ReturnType<typeof buildPerformanceReport>;
type Metric = "impressions" | "clicks" | "views";
const KINDS: Record<ReportKind, string> = { digital: "디지털", video: "동영상·OTT", broadcast: "방송", ooh: "옥외·공간", other: "기타" };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const number = (value: number | null | undefined) => finite(value) ? Math.round(value).toLocaleString("ko-KR") : "—";
const money = (value: number | null | undefined) => finite(value) ? `${value !== 0 && Math.abs(value) < 1 ? value.toLocaleString("ko-KR", { maximumFractionDigits: 6 }) : number(value)}원` : "—";
const unitCost = (value: number | null | undefined) => !finite(value) ? "—" : `${value!==0&&Math.abs(value)<0.000001?value.toExponential(2):value.toLocaleString("ko-KR",value!==0&&Math.abs(value)<0.01?{maximumSignificantDigits:3}:{maximumFractionDigits:2})}원`;
const percent = (value: number | null | undefined) => finite(value) ? `${value.toFixed(2)}%` : "—";
const raw = (media: MediaPerformanceReport) => media.kind === "ooh" || media.kind === "broadcast" || media.kind === "other";
const labelFor = (media: MediaPerformanceReport, key: Metric) => key === "impressions" ? raw(media) ? "원본 지표 · 노출수" : "노출수" : key === "views" ? "조회수" : "클릭수";
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
  const [trendSearch, setTrendSearch] = useState("");
  const [trendName, setTrendName] = useState("");
  const evidence = report.media.filter(item => item.rows.length || item.dailyRows.length || item.creativeRows?.length);
  const matches = (item: MediaPerformanceReport) => (kind === "all" || kind === item.kind) && item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const results = evidence.filter(matches);
  const pending = report.media.filter(item => planOnly(item) && matches(item));
  const trendOptions = evidence.filter(item => item.dailyRows.length && item.name.toLocaleLowerCase().includes(trendSearch.trim().toLocaleLowerCase()));
  const trendMedia = trendOptions.find(item => item.name === trendName) ?? trendOptions[0];
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
        <span className={styles.attentionLabel}>최근 일별 변화 · {change.media}</span><strong>{change.percent > 0 ? "+" : ""}{change.percent.toFixed(1)}% <small>{change.metric === "views" ? "원본 조회" : "클릭"}</small></strong>
        <span>{change.previousDate.slice(5)} {number(change.previous)} → {change.date.slice(5)} {number(change.current)}</span><small>같은 지면·지표의 전일 비교 · 효율 판단 아님</small>
      </button>)}
      {sourceFindings.map(({item,note}) => {const media=inferMediaMentions(note).find(name=>report.media.some(m=>m.name===name));return <div key={item.key+note} className={styles.findingCard}>
        <span className={styles.attentionLabel}>보고 당시 원본 대조 메모</span><strong>{item.reportDate}</strong><p>{shorten(normalizeInsightText(note),120)}</p>{media&&<button type="button" onClick={()=>onOpenMedia(media)}>{media} 근거 확인 →</button>}<small>현재 해결 여부는 별도 기록 전까지 판단하지 않습니다.</small>
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
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>일별 추이</p><h3 id={`${id}-trend`}>하나의 매체, 일별 흐름</h3></div></div>
      <div className={styles.controls}>
        <label>매체 찾기<input type="search" placeholder="매체명 검색" value={trendSearch} onChange={event => setTrendSearch(event.target.value)} /></label>
        <label>추이 매체<select value={trendMedia?.name ?? ""} onChange={event => setTrendName(event.target.value)} disabled={!trendOptions.length}>
          {!trendOptions.length && <option value="">일별 원본 없음</option>}{trendOptions.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select></label>
      </div>
      {trendMedia ? <details className={styles.trendDisclosure} open key={trendMedia.name}><summary>{trendMedia.name} 일별 추이</summary><PerformanceReportTrend media={trendMedia} startDate={startDate} endDate={endDate} /></details>
        : <p className={styles.empty}>{trendSearch ? "검색한 매체의 일별 원본이 없습니다." : "선택 기간에 제공된 일별 성과 원본이 없습니다. 누적 성과와 계획 수치로 추이를 만들지 않습니다."}</p>}
    </section>
    <div className={composition.length ? styles.contextGrid : styles.contextSingle}>
      {composition.length > 0 && <section className={styles.section} aria-labelledby={`${id}-spend`}>
        <p className={styles.eyebrow}>집행 구성</p><h3 id={`${id}-spend`}>집행액 분포</h3>
        <p className={styles.support}>비용 제공 매체 내 비중 · 성과 순위가 아닙니다</p>
        <ul className={styles.spendList}>{composition.slice(0, 5).map(item => <li key={item.name}>
          <button type="button" onClick={() => onOpenMedia(item.name)}><span>{item.name}</span><strong>{money(item.metrics.spend)}</strong></button>
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
          <span className={styles.mediaName}><strong>{item.name}</strong><small>{KINDS[item.kind]} · 원본 {item.sourceCount}개</small></span>
          <span className={styles.rowValue}><small>보고된 집행액</small><strong>{money(period(item.metrics.spend))}</strong></span>
          <span className={styles.rowValue}><small>{primaryLabel}</small><strong>{number(period(primary))}</strong></span>
          <span className={styles.coverage}><span>보고 기준 {item.reportDate ?? "미제공"}</span><span>{item.dailyThrough?`일별 원본 ~ ${item.dailyThrough}`:item.creativeThrough?`소재 원본 ${item.creativeThrough} · 매체 누적 미제공`:"일별 원본 미제공"}</span></span><span className={styles.arrow} aria-hidden="true">→</span>
        </button></li>;
      })}</ul>
      {!results.length && <p className={styles.empty}>조건에 맞는 성과 원본이 없습니다.</p>}
      {results.length > 7 && <button type="button" className={styles.moreButton} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "7개만 보기" : `나머지 ${results.length - 7}개 매체 더 보기`}</button>}
      {pending.length > 0 && <details className={styles.pending}><summary>계획 등록 · 성과 원본 대기 <span>{pending.length}개 매체</span></summary><p className={styles.support}>계획만 제공된 매체입니다. 집행 여부나 성과를 판단하지 않습니다.</p>
        <ul>{pending.slice(0, pendingExpanded ? undefined : 7).map(item => <li key={item.name}><button type="button" onClick={() => onOpenMedia(item.name)}><span>{item.name}</span><small>{KINDS[item.kind]} · 계획 상세 →</small></button></li>)}</ul>
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

// Daily facts stay separate from cumulative metrics. Missing dates and missing
// metrics interrupt the path; no synthetic rows or zero-filled dates are made.
export function PerformanceReportTrend({ media, startDate, endDate }: { media: MediaPerformanceReport; startDate: string; endDate: string }) {
  const [selectedMetric, setSelectedMetric] = useState<Metric>(media.kind === "video" ? "views" : "impressions");
  const [activeDate, setActiveDate] = useState("");
  const series = useMemo(() => {
    const groups = new Map<string, typeof media.dailyRows>();
    for (const row of media.dailyRows) {
      const timestamp = Date.parse(`${row.date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== row.date || row.date < startDate || row.date > endDate) continue;
      const group = groups.get(row.date) ?? []; group.push(row); groups.set(row.date, group);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
      const total = (key: Metric) => { const values = rows.map(row => row[key]).filter(finite); return values.length ? values.reduce((a, b) => a + b, 0) : null; };
      return { date, timestamp: Date.parse(`${date}T00:00:00Z`), impressions: total("impressions"), clicks: total("clicks"), views: total("views") };
    });
  }, [media.dailyRows, startDate, endDate]);
  const allowed: Metric[] = raw(media) ? ["impressions", "views"] : media.kind === "video" ? ["views", "impressions", "clicks"] : ["impressions", "clicks", "views"];
  const options = allowed.filter(key => series.some(point => finite(point[key])));
  const metric = options.includes(selectedMetric) ? selectedMetric : options[0];
  const points = metric ? series.filter(point => finite(point[metric])) : [];
  const selected = points.find(point => point.date === activeDate) ?? points.at(-1);
  const maximum = Math.max(1, ...points.map(point => point[metric!]!)) * 1.1;
  const minTime = series[0]?.timestamp ?? 0, maxTime = series.at(-1)?.timestamp ?? 0;
  const x = (timestamp: number) => maxTime === minTime ? 420 : 72 + (timestamp - minTime) / (maxTime - minTime) * 696;
  const y = (value: number) => 192 - value / maximum * 160;
  const paths: string[] = []; let segment = "", previous = 0;
  for (const point of series) {
    const value = metric ? point[metric] : null;
    if (!finite(value)) { if (segment) paths.push(segment); segment = ""; previous = 0; continue; }
    if (previous && point.timestamp - previous !== 86400000) { if (segment) paths.push(segment); segment = ""; }
    segment += `${segment ? " L" : "M"}${x(point.timestamp)},${y(value)}`; previous = point.timestamp;
  }
  if (segment) paths.push(segment);
  const metricLabel = metric ? labelFor(media, metric) : "일별 지표";
  return <div className={styles.trend}>
    <div className={styles.trendHeading}><div><h4>{media.name} · {metricLabel}</h4><p className={styles.meta}>{startDate} ~ {endDate}</p></div>
      {options.length > 0 && <label>일별 지표<select value={metric} onChange={event => { setSelectedMetric(event.target.value as Metric); setActiveDate(""); }}>{options.map(key => <option key={key} value={key}>{labelFor(media, key)}</option>)}</select></label>}
    </div>
    {points.length ? <>
      <p className={styles.chartReadout} aria-live="polite">{selected?.date} <strong>{number(selected?.[metric!])}</strong> <span>{metricLabel}</span></p>
      <svg className={styles.chart} viewBox="0 0 800 238" role="group" aria-label={`${media.name} 일별 ${metricLabel}. 각 점을 선택해 날짜별 값을 확인하세요.`}>
        {[0, 0.5, 1].map(tick => <g key={tick}><line x1="72" x2="768" y1={y(maximum * tick)} y2={y(maximum * tick)} className={styles.gridLine} /><text x="62" y={y(maximum * tick) + 4} textAnchor="end">{new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(maximum * tick)}</text></g>)}
        {paths.map((d, index) => <path key={index} d={d} className={styles.chartLine} />)}
        {points.map((point, index) => <g key={point.date}>
          <circle cx={x(point.timestamp)} cy={y(point[metric!]!)} r={selected?.date === point.date ? 5 : 3} className={styles.chartDot} aria-hidden="true" />
          <circle cx={x(point.timestamp)} cy={y(point[metric!]!)} r="12" className={styles.chartTarget} tabIndex={0} role="button" aria-label={`${point.date} ${metricLabel} ${number(point[metric!])}`} onFocus={() => setActiveDate(point.date)} onMouseEnter={() => setActiveDate(point.date)} onClick={() => setActiveDate(point.date)} onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveDate(point.date); }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const next = event.currentTarget.parentElement?.parentElement?.querySelectorAll<SVGCircleElement>('[role="button"]')[Math.max(0, Math.min(points.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)))]; next?.focus(); }
          }}><title>{`${point.date} · ${metricLabel} ${number(point[metric!])}`}</title></circle>
        </g>)}
        {[...new Set([series[0], series[Math.floor((series.length - 1) / 2)], series.at(-1)])].filter(Boolean).map(point => <text key={point!.date} x={x(point!.timestamp)} y="224" textAnchor="middle">{point!.date.slice(5).replace("-", "/")}</text>)}
      </svg>
      <p className={styles.footnote}>점을 선택하거나 Tab·방향키로 일별 값을 확인하세요. 일자가 빠지거나 지표가 없으면 선을 연결하지 않습니다.</p>
    </> : <p className={styles.empty}>선택 기간에 표시할 수 있는 일별 원본 지표가 없습니다. 누적·계획 수치로 대체하지 않습니다.</p>}
    <p className={styles.footnote}>일별 원본의 제공 범위는 누적 성과 카드와 다를 수 있습니다. 미제공 날짜·값은 0이 아닙니다.{raw(media) && " 원본 노출·조회 표기값이며 실제 접촉 인원이나 순도달을 뜻하지 않습니다."}</p>
  </div>;
}
