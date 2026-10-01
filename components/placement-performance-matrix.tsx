import { Fragment } from "react";
import type { DailyPerformanceRow, ReportingRow } from "@/lib/reporting-data";
import { comparisonMetrics, displayMetric, metricSummary, placementMetricKey, type ComparisonMetric } from "@/lib/performance-visuals";
import styles from "./performance-visuals.module.css";

export function PlacementPerformanceMatrix({ media, rows, dailyRows }: { media: string; rows: ReportingRow[]; dailyRows: DailyPerformanceRow[] }) {
  const columns=comparisonMetrics(rows,placementMetricKey,row=>row.placement);
  const columnKeys = new Set(columns.map(column => column.key));
  const dates=[...new Set(dailyRows.filter(row=>columnKeys.has(placementMetricKey(row))).map(row=>row.date))].sort();
  const values=new Map<string,DailyPerformanceRow[]>();
  for(const row of dailyRows){const key=`${row.date}::${placementMetricKey(row)}`;const list=values.get(key)||[];list.push(row);values.set(key,list);}
  return <MetricsMatrix columns={columns} caption={`${media} 지면별 성과`} summaryLabel="선택 기간 합계" dates={dates} cell={(date,column)=>{const items=values.get(`${date}::${column.key}`);return items?.length?metricSummary(items):null;}} />;
}
export function MetricsMatrix({ columns, caption, summaryLabel, dates = [], cell, emptyNote = "일별 데이터가 없는 지면은 제공된 합계만 표시합니다." }: {
  emptyNote?: string; columns: ComparisonMetric[]; caption: string; summaryLabel: string; dates?: string[];
  cell?: (date: string, column: ComparisonMetric) => ReturnType<typeof metricSummary> | null;
}) {
  const metrics=["impressions","clicks","ctr"] as const;
  return <div className={styles.matrixWrap} tabIndex={0} role="region" aria-label={caption}>
    <table className={styles.matrix} data-performance-matrix>
      <caption>{caption}<span>파랑: 토요일 · 빨강: 일요일 · —: 데이터 미제공</span></caption>
      <thead><tr><th rowSpan={2} scope="col" className={styles.dateCell}>일자</th>{columns.map(column=><th key={column.key} colSpan={3} scope="colgroup" className={styles.placementHead}>{column.label}</th>)}</tr>
        <tr>{columns.map(column=><Fragment key={column.key}>{["Impression","Clicks","CTR"].map(label=><th key={label} scope="col">{label}</th>)}</Fragment>)}</tr></thead>
      <tbody><tr className={styles.matrixTotal} data-matrix-total><th scope="row" className={styles.dateCell}>{summaryLabel}</th>{columns.map(column=><Fragment key={column.key}>{metrics.map(metric=><td key={metric}>{displayMetric(column.metrics[metric],metric)}</td>)}</Fragment>)}</tr>
        {dates.map(date=>{const weekday=new Date(date+"T00:00:00Z").getUTCDay();return <tr key={date} data-matrix-date={date} className={weekday===6?styles.saturday:weekday===0?styles.sunday:undefined}><th scope="row" className={styles.dateCell}>{date.slice(5).replace("-","/")}{weekday===6?" (토)":weekday===0?" (일)":""}</th>{columns.map(column=>{const data=cell?.(date,column);return <Fragment key={column.key}>{metrics.map(metric=><td key={metric}>{displayMetric(data?.[metric],metric)}</td>)}</Fragment>;})}</tr>;})}
      </tbody>
    </table>
    {!dates.length && <p className={styles.matrixNote}>{emptyNote}</p>}
  </div>;
}
