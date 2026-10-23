"use client";
import { Fragment } from "react";
import { LayoutCanvas, LayoutPanel, LayoutGroup } from "@/components/layout-canvas";
import { InsightEntry } from "@/components/daily-insight-history";
import { MetricsMatrix } from "@/components/placement-performance-matrix";
import { comparisonMetrics, placementMetricKey } from "@/lib/performance-visuals";
import { canonicalMedia, inferMediaMentions } from "@/lib/media-normalization";
import { type ReportingRow, type DailyPerformanceRow, type CreativeDailyRow } from "@/lib/reporting-data";
import { isPerformanceReferenceRow } from "@/lib/performance-report";
import type { PublishedInsight } from "@/lib/daily-report-store";
import styles from "./performance-source-panels.module.css";
import matrixStyles from "./performance-visuals.module.css";
function formatBareCount(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : Math.round(value).toLocaleString("ko-KR");
}
function formatWon(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}
function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${value.toFixed(2)}%`;
}
function formatAchievement(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${Math.round(value)}%`;
}
function formatGuaranteed(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return value || "-";
  return Math.round(Number(normalized)).toLocaleString("ko-KR");
}
function guaranteedNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function dateForDay(month: string, day: number) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

type UiRow = ReportingRow;
type UiCreativeRow = CreativeDailyRow;
type ViewMode = "placement" | "creative";

type MetricPresence = {
  achievement: boolean;
  guaranteed: boolean;
  spend: boolean;
  clicks: boolean;
  views: boolean;
  vtr: boolean;
  conversions: boolean;
  cpc: boolean;
  cpm: boolean;
  cpv: boolean;
};

function metricPresence(media: string, rows: UiRow[]): MetricPresence {
  const isDooh = media === "애드부스트스크린";
  return {
    achievement: rows.some((row) => row.achievement !== null && row.achievement !== undefined),
    guaranteed: rows.some((row) => Boolean(row.guaranteed && row.guaranteed !== "-")),
    spend: rows.some((row) => row.spend !== null && row.spend !== undefined),
    clicks: !isDooh && rows.some((row) => row.clicks !== null && row.clicks !== undefined),
    views: rows.some((row) => row.views !== null && row.views !== undefined),
    vtr: rows.some((row) => row.vtr !== null && row.vtr !== undefined),
    conversions: rows.some((row) => row.conversions !== null && row.conversions !== undefined),
    cpc: rows.some((row) => row.cpc !== null && row.cpc !== undefined),
    cpm: rows.some((row) => row.cpm !== null && row.cpm !== undefined),
    cpv: rows.some((row) => row.cpv !== null && row.cpv !== undefined),
  };
}

function dailyPresence(media: string, rows: DailyPerformanceRow[]) {
  const isDooh = media === "애드부스트스크린";
  return {
    spend: rows.some((row) => row.spend !== null && row.spend !== undefined),
    clicks: !isDooh && rows.some((row) => row.clicks !== null && row.clicks !== undefined),
    views: rows.some((row) => row.views !== null && row.views !== undefined),
    vtr: rows.some((row) => row.vtr !== null && row.vtr !== undefined),
    cpc: rows.some((row) => row.cpc !== null && row.cpc !== undefined),
    cpm: rows.some((row) => row.cpm !== null && row.cpm !== undefined),
    cpv: rows.some((row) => row.cpv !== null && row.cpv !== undefined),
  };
}

type SourceMetricKey = "spend" | "impressions" | "clicks" | "views" | "conversions";
type SourceMetrics = Partial<Pick<UiRow, SourceMetricKey>>;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function sourceSum(rows: SourceMetrics[], key: SourceMetricKey) {
  const values = rows.map(row => row[key]).filter(finite);
  const sum = values.reduce((total, value) => total + value, 0);
  return values.length && finite(sum) ? sum : null;
}

// Each aggregate rate uses only rows supplying both finite operands. A supplied
// row rate is still shown verbatim in the original-value tables below.
function sourceRate(rows: SourceMetrics[], numerator: SourceMetricKey, denominator: SourceMetricKey, scale = 1) {
  const paired = rows.filter(row => finite(row[numerator]) && finite(row[denominator]));
  const top = sourceSum(paired, numerator), bottom = sourceSum(paired, denominator);
  const rate = top !== null && bottom !== null && bottom > 0 ? top / bottom * scale : null;
  return finite(rate) ? rate : null;
}

function renderTotal(media: string, rows: UiRow[], presence: MetricPresence) {
  const paid = rows.filter(row => !isPerformanceReferenceRow(row));
  const summary = {
    spend: sourceSum(paid, "spend"),
    impressions: sourceSum(rows, "impressions"),
    clicks: sourceSum(rows, "clicks"),
    ctr: sourceRate(rows, "clicks", "impressions", 100),
    views: sourceSum(rows, "views"),
    conversions: sourceSum(rows, "conversions"),
  };
  const guaranteedValues = rows.map((row) => guaranteedNumber(row.guaranteed)).filter((value): value is number => value !== null);
  const guaranteedSum = guaranteedValues.reduce((sum, value) => sum + value, 0);
  const guaranteed = guaranteedValues.length && finite(guaranteedSum) ? guaranteedSum : null;
  const achievement = guaranteed !== null && guaranteed > 0 && summary.impressions !== null ? summary.impressions / guaranteed * 100 : null;
  const cpm = presence.cpm ? sourceRate(paid, "spend", "impressions", 1000) : null;
  const cpc = presence.cpc ? sourceRate(paid, "spend", "clicks") : null;
  const cpv = presence.cpv ? sourceRate(paid, "spend", "views") : null;
  const vtr = presence.vtr ? sourceRate(rows, "views", "impressions", 100) : null;
  return { media, summary, guaranteed, achievement, cpm, cpc, cpv, vtr };
}

/** Daily-only facts never become fabricated cumulative rows. The source matrix
 * uses the same finite paired populations as the detailed aggregate below. */
function SourcePlacementMatrix({ media, rows, dailyRows, summaryLabel }: { media: string; rows: UiRow[]; dailyRows: DailyPerformanceRow[]; summaryLabel: string }) {
  const columns = new Map<string, string>();
  for (const row of rows.length ? rows : dailyRows) columns.set(placementMetricKey(row), row.placement);
  const dates = [...new Set(dailyRows.filter(row => columns.has(placementMetricKey(row))).map(row => row.date))].sort();
  const cells = (items: SourceMetrics[]) => <><td>{formatBareCount(sourceSum(items, "impressions"))}</td><td>{formatBareCount(sourceSum(items, "clicks"))}</td><td>{formatRate(sourceRate(items, "clicks", "impressions", 100))}</td></>;
  return <div className={matrixStyles.matrixWrap} tabIndex={0} role="region" aria-label={`${media} 지면별 성과`}>
    <table className={matrixStyles.matrix} data-performance-matrix>
      <caption>{media} 지면별 성과<span>{rows.length ? "주말은 날짜에 표시 · -: 데이터 미제공" : "일별 성과 제공 · 누적 성과 미제공 · -: 데이터 미제공"}</span></caption>
      <thead><tr><th rowSpan={2} scope="col" className={matrixStyles.dateCell}>일자</th>{[...columns].map(([key, label]) => <th key={key} colSpan={3} scope="colgroup" className={matrixStyles.placementHead}>{label}</th>)}</tr>
        <tr>{[...columns.keys()].map(key => <Fragment key={key}>{["Impression", "Clicks", "CTR"].map(label => <th key={label} scope="col">{label}</th>)}</Fragment>)}</tr></thead>
      <tbody>{rows.length > 0 && <tr className={matrixStyles.matrixTotal} data-matrix-total><th scope="row" className={matrixStyles.dateCell}>{summaryLabel}</th>{[...columns.keys()].map(key => <Fragment key={key}>{cells(rows.filter(row => placementMetricKey(row) === key))}</Fragment>)}</tr>}
        {dates.map(date => {
          const weekday = new Date(date + "T00:00:00Z").getUTCDay();
          return <tr key={date} data-matrix-date={date} data-weekday={weekday} className={weekday === 6 ? matrixStyles.saturday : weekday === 0 ? matrixStyles.sunday : undefined}><th scope="row" className={matrixStyles.dateCell}>{date.slice(5).replace("-", "/")}{weekday === 6 ? " (토)" : weekday === 0 ? " (일)" : ""}</th>{[...columns.keys()].map(key => <Fragment key={key}>{cells(dailyRows.filter(row => row.date === date && placementMetricKey(row) === key))}</Fragment>)}</tr>;
        })}
      </tbody>
    </table>
    {!dates.length && <p className={matrixStyles.matrixNote}>일별 데이터가 없는 지면은 제공된 합계만 표시합니다.</p>}
  </div>;
}

type Props={advertiser:string;month:string;startDate:string;endDate:string;viewMode:"placement"|"creative";baselineComplete:boolean;placementGroups:Array<{media:string;rows:ReportingRow[]}>;creativeGroups:Array<{media:string;rows:CreativeDailyRow[]}>;dailyRows:DailyPerformanceRow[];relevantInsights:(media:string)=>PublishedInsight[]};

/** Original numerical/source controls retained behind an explicit raw-data view. */
export function PerformanceSourcePanels({advertiser,month,startDate,endDate,viewMode,baselineComplete,placementGroups,creativeGroups,dailyRows,relevantInsights}:Props){return <LayoutCanvas page="performance">        {viewMode === "placement" ? <LayoutGroup>
          {placementGroups.map((group) => {
            const presence = metricPresence(group.media, group.rows);
            const total = renderTotal(group.media, group.rows, presence);
            const mediaDaily = dailyRows.filter((row) => canonicalMedia(row.platform) === group.media);
            const dailyMetrics = dailyPresence(group.media, mediaDaily);
            const mediaInsights = relevantInsights(group.media);

            return <LayoutPanel key={group.media} id={`performance-media:${group.media}:${viewMode}`} title={`${group.media} 성과`}><article key={group.media} className={styles.summaryCard}>
              <header className={styles.summaryHeader}>
                <div><span>매체</span><h2>{group.media}</h2></div>
                <div className={styles.summaryMeta}><span>성과 기간 {startDate} ~ {endDate}</span><span>{group.rows.length ? `${group.rows.length}개 광고 지면` : mediaDaily.length ? "일별 성과 제공 · 누적 성과 미제공" : "누적 성과 미제공"}</span></div>
              </header>

              {group.rows.length || mediaDaily.length ? <SourcePlacementMatrix media={group.media} rows={group.rows} dailyRows={mediaDaily} summaryLabel={baselineComplete ? "선택 기간 합계" : "원본값 참고 · 기간 합계 아님"} /> : <p>연결된 원본 성과가 없습니다.</p>}
              {group.rows.length > 0 && <details className={styles.detailBlock}>
                <summary>원본 금액·보장 노출·상세 지표 보기</summary>
              <div className={styles.summaryTableWrap}>
                <table className={styles.summaryTable}>
                  <thead><tr>
                    <th>매체</th><th>광고 지면</th>
                    {presence.achievement && <th>달성률</th>}
                    {presence.guaranteed && <th>보장노출수</th>}
                    {presence.spend && <th>원본 금액</th>}
                    <th>노출</th>
                    {presence.clicks && <th>클릭</th>}
                    <th>CTR(%)</th>
                    {presence.views && <th>조회수</th>}
                    {presence.vtr && <th>VTR(%)</th>}
                    {presence.conversions && <th>전환</th>}
                    {presence.cpm && <th>CPM</th>}
                    {presence.cpc && <th>CPC</th>}
                    {presence.cpv && <th>CPV</th>}
                  </tr></thead>
                  <tbody>
                    {group.rows.map((row, index) => <tr key={`${row.sourceFile}-${row.sourceSheet}-${row.placement}-${index}`}>
                      {index === 0 && <td rowSpan={group.rows.length} className={styles.mediaCell}>{group.media}</td>}
                      <td className={styles.placementCell}>{row.placement}</td>
                      {presence.achievement && <td className={styles.numCell}>{formatAchievement(row.achievement)}</td>}
                      {presence.guaranteed && <td className={styles.numCell}>{formatGuaranteed(row.guaranteed)}</td>}
                      {presence.spend && <td className={styles.numCell}>{formatWon(row.spend)}{isPerformanceReferenceRow(row) && <small> · 원본 참고 금액</small>}</td>}
                      <td className={styles.numCell}>{formatBareCount(row.impressions)}</td>
                      {presence.clicks && <td className={styles.numCell}>{formatBareCount(row.clicks)}</td>}
                      <td className={styles.numCell}>{formatRate(row.ctr)}</td>
                      {presence.views && <td className={styles.numCell}>{formatBareCount(row.views)}</td>}
                      {presence.vtr && <td className={styles.numCell}>{formatRate(row.vtr)}</td>}
                      {presence.conversions && <td className={styles.numCell}>{formatBareCount(row.conversions)}</td>}
                      {presence.cpm && <td className={styles.numCell}>{formatWon(row.cpm)}</td>}
                      {presence.cpc && <td className={styles.numCell}>{formatWon(row.cpc)}</td>}
                      {presence.cpv && <td className={styles.numCell}>{formatWon(row.cpv)}</td>}
                    </tr>)}
                    <tr className={styles.totalRow}>
                      <td colSpan={2}>{baselineComplete ? "합계" : "원본값 참고 · 기간 합계 아님"}</td>
                      {presence.achievement && <td className={styles.numCell}>{formatAchievement(total.achievement)}</td>}
                      {presence.guaranteed && <td className={styles.numCell}>{total.guaranteed === null ? "-" : formatBareCount(total.guaranteed)}</td>}
                      {presence.spend && <td className={styles.numCell}>{formatWon(total.summary.spend)}<small> · 유료 집행액</small></td>}
                      <td className={styles.numCell}>{formatBareCount(total.summary.impressions)}</td>
                      {presence.clicks && <td className={styles.numCell}>{formatBareCount(total.summary.clicks)}</td>}
                      <td className={styles.numCell}>{formatRate(total.summary.ctr)}</td>
                      {presence.views && <td className={styles.numCell}>{formatBareCount(total.summary.views)}</td>}
                      {presence.vtr && <td className={styles.numCell}>{formatRate(total.vtr)}</td>}
                      {presence.conversions && <td className={styles.numCell}>{formatBareCount(total.summary.conversions)}</td>}
                      {presence.cpm && <td className={styles.numCell}>{formatWon(total.cpm)}</td>}
                      {presence.cpc && <td className={styles.numCell}>{formatWon(total.cpc)}</td>}
                      {presence.cpv && <td className={styles.numCell}>{formatWon(total.cpv)}</td>}
                    </tr>
                  </tbody>
                </table>
              </div>

              </details>}

              {mediaInsights.length > 0 && <div className={styles.insightPanel}>
                <div className={styles.insightTitle}><strong>데일리 인사이트</strong><span>메일 성과 요약</span></div>
                <div className={styles.insightList}>{mediaInsights.map((item) => <InsightEntry key={advertiser + month + item.key} item={item} displayNotes={item.notes.filter(note => inferMediaMentions(note).includes(group.media))} />)}</div>
              </div>}

              <div className={styles.detailBar}>
                <details className={styles.detailBlock}>
                  <summary>일별 성과 데이터 보기</summary>
                  {mediaDaily.length ? <div className={styles.dailyTableWrap}><table className={styles.dailyTable}><thead><tr><th>일자</th><th>광고 지면</th>{dailyMetrics.spend && <th>원본 금액</th>}<th>노출</th>{dailyMetrics.clicks && <th>클릭</th>}<th>CTR</th>{dailyMetrics.views && <th>조회</th>}{dailyMetrics.vtr && <th>VTR</th>}{dailyMetrics.cpm && <th>CPM</th>}{dailyMetrics.cpc && <th>CPC</th>}{dailyMetrics.cpv && <th>CPV</th>}</tr></thead><tbody>{mediaDaily.map((row, index) => <tr key={`${row.date}-${row.platform}-${row.placement}-${index}`}><td>{row.date}</td><td>{row.placement}</td>{dailyMetrics.spend && <td className={styles.numCell}>{formatWon(row.spend)}{isPerformanceReferenceRow(row) && <small> · 원본 참고 금액</small>}</td>}<td className={styles.numCell}>{formatBareCount(row.impressions)}</td>{dailyMetrics.clicks && <td className={styles.numCell}>{formatBareCount(row.clicks)}</td>}<td className={styles.numCell}>{formatRate(row.ctr)}</td>{dailyMetrics.views && <td className={styles.numCell}>{formatBareCount(row.views)}</td>}{dailyMetrics.vtr && <td className={styles.numCell}>{formatRate(row.vtr)}</td>}{dailyMetrics.cpm && <td className={styles.numCell}>{formatWon(row.cpm)}</td>}{dailyMetrics.cpc && <td className={styles.numCell}>{formatWon(row.cpc)}</td>}{dailyMetrics.cpv && <td className={styles.numCell}>{formatWon(row.cpv)}</td>}</tr>)}</tbody></table></div> : <div className={styles.detailEmpty}>이 매체의 일별 성과 데이터가 아직 연결되지 않았습니다. 현재는 누적 스냅샷이 쌓이는 구간부터 기간 차감 조회가 가능합니다.</div>}
                </details>
              </div>
            </article></LayoutPanel>;
          })}
        </LayoutGroup> : creativeGroups.length ? <LayoutGroup>
          {creativeGroups.map((group) => {
            const columns = comparisonMetrics(group.rows, row => `${placementMetricKey(row)}::${row.creative}`, row => `${row.creative} · ${row.placement}`);
            const mediaInsights = relevantInsights(group.media);
            return <LayoutPanel key={group.media} id={`performance-media:${group.media}:${viewMode}`} title={`${group.media} 성과`}><article key={group.media} className={styles.summaryCard}>
              <header className={styles.summaryHeader}>
                <div><span>매체</span><h2>{group.media}</h2></div>
                <div className={styles.summaryMeta}><span>기준일 1일 성과 · {endDate}</span><span>{group.rows.length}개 소재</span></div>
              </header>
              <MetricsMatrix columns={columns} caption={`${group.media} 소재별 성과`} summaryLabel={`${endDate} 성과`} emptyNote="선택한 기준일의 소재별 하루 성과입니다." />
              {mediaInsights.length > 0 && <div className={styles.insightPanel}>
                <div className={styles.insightTitle}><strong>데일리 인사이트</strong><span>{endDate} 기준 · 메일 성과 요약</span></div>
                <div className={styles.insightList}>{mediaInsights.map((item) => <InsightEntry key={advertiser + month + item.key} item={item} displayNotes={item.notes.filter(note => inferMediaMentions(note).includes(group.media))} />)}</div>
              </div>}
            </article></LayoutPanel>;
          })}
        </LayoutGroup> : <LayoutPanel id="performance:소재별 성과가 없습니다.:8" title="소재별 성과가 없습니다."><section className="card card-pad empty-state"><h2>{endDate} 소재별 성과가 없습니다.</h2><p>선택한 날짜에 제공된 소재별 원본이 없습니다. 다른 날짜를 선택하거나 해당 날짜의 자료를 연결하세요. 자료 미제공은 성과 0을 뜻하지 않습니다.</p></section></LayoutPanel>}
</LayoutCanvas>;}
