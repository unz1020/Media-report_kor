"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, publishedInsightsFor, publishedSnapshotsFor, type PublishedDataset, type PublishedInsight } from "@/lib/daily-report-store";
import { formatCount, formatKrw, formatRate, periodRowsFromSnapshots, rowsFromDatasets, summarizeRows, type ReportingRow } from "@/lib/reporting-data";

function monthStart(month: string) { return `${month}-01`; }
function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).toISOString().slice(0, 10);
}
function formatWonMetric(value: number | null | undefined) {
  return value === null || value === undefined ? "데이터 없음" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
}
function renderInsightNote(note: string) {
  const match = note.match(/^원본 리포트:\s*(https?:\/\/\S+)/i);
  if (!match) return <p>{note}</p>;
  return <p><a href={match[1]} target="_blank" rel="noreferrer" className="source-link">원본 리포트 열기 ↗</a></p>;
}

export default function PerformancePage() {
  const { advertiser, month } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [snapshots, setSnapshots] = useState<PublishedDataset[]>([]);
  const [insights, setInsights] = useState<PublishedInsight[]>([]);
  const [startDate, setStartDate] = useState(monthStart(month));
  const [endDate, setEndDate] = useState(monthEnd(month));
  const [media, setMedia] = useState("전체 매체");

  useEffect(() => {
    setStartDate(monthStart(month));
    setEndDate(monthEnd(month));
  }, [month]);

  useEffect(() => {
    const load = () => {
      const nextDatasets = publishedDatasetsFor(advertiser, month);
      const nextSnapshots = publishedSnapshotsFor(advertiser, month);
      const nextInsights = publishedInsightsFor(advertiser, month);
      setDatasets(nextDatasets);
      setSnapshots(nextSnapshots);
      setInsights(nextInsights);
      const latestDate = nextSnapshots.map((item) => item.bundle.reportDate).filter(Boolean).sort().at(-1)
        || nextDatasets.map((item) => item.bundle.reportDate).filter(Boolean).sort().at(-1);
      if (latestDate) setEndDate(latestDate);
    };
    load();
    window.addEventListener("media-report-daily-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("media-report-daily-updated", load);
      window.removeEventListener("storage", load);
    };
  }, [advertiser, month]);

  const period = useMemo(() => snapshots.length
    ? periodRowsFromSnapshots(snapshots, startDate, endDate)
    : { rows: rowsFromDatasets(datasets), baselineComplete: startDate.endsWith("-01") }, [snapshots, datasets, startDate, endDate]);
  const mediaOptions = useMemo(() => ["전체 매체", ...Array.from(new Set(period.rows.map((row) => row.platform).filter(Boolean))).sort()], [period.rows]);
  const rows = useMemo(() => media === "전체 매체" ? period.rows : period.rows.filter((row) => row.platform === media), [period.rows, media]);
  const summary = useMemo(() => summarizeRows(rows), [rows]);
  const periodInsights = useMemo(() => insights.filter((item) => item.reportDate >= startDate && item.reportDate <= endDate), [insights, startDate, endDate]);
  const grouped = useMemo(() => {
    const map = new Map<string, ReportingRow[]>();
    for (const row of rows) {
      const key = `${row.sourceFile}::${row.sourceSheet}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">Performance · SOURCE ONLY</div>
          <h1 className="page-title">{advertiser} 성과 보고</h1>
          <p className="page-desc">Excel · API · 공식 링크 리포트에 명시된 수치만 사용합니다. 없는 지표는 추정하지 않습니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">{month}</span></div>
      </div>

      <div className="report-toolbar performance-toolbar">
        <div className="toolbar-group">
          <label className="toolbar-label">기간</label>
          <input className="toolbar-control" type="date" value={startDate} min={monthStart(month)} max={monthEnd(month)} onChange={(event) => setStartDate(event.target.value)} />
          <span className="toolbar-label">–</span>
          <input className="toolbar-control" type="date" value={endDate} min={startDate} max={monthEnd(month)} onChange={(event) => setEndDate(event.target.value)} />
          <select className="toolbar-control" value={media} onChange={(event) => setMedia(event.target.value)}>{mediaOptions.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        <div className="toolbar-group right"><span className="view-pill">원본 {datasets.length}개 · Snapshot {snapshots.length}개</span></div>
      </div>

      {!period.baselineComplete && <div className="source-warning">선택한 시작일 직전 Snapshot이 없어 시작일 이전 누적분을 완전히 제외할 수 없습니다. 해당 날짜의 Daily 파일이 쌓이면 자동으로 정확한 기간 차감이 가능합니다.</div>}

      {!datasets.length ? <section className="card card-pad empty-state"><h2>아직 반영된 성과 데이터가 없습니다.</h2><p>{advertiser}의 Daily Monitoring 또는 공식 링크 리포트를 Data Update에서 검수 후 반영하면 이 화면이 실제 수치로 채워집니다.</p></section> : <>
        <section className="metric-strip performance-metrics">
          <article className="metric-card selected-metric"><span className="metric-kicker">집행액</span><strong>{formatKrw(summary.spend)}</strong><div><span>원 단위</span></div></article>
          <article className="metric-card"><span className="metric-kicker">노출</span><strong>{formatCount(summary.impressions)}</strong><div><span>회 단위</span></div></article>
          <article className="metric-card"><span className="metric-kicker">클릭</span><strong>{formatCount(summary.clicks)}</strong><div><span>원본에 있을 때만 합산</span></div></article>
          <article className="metric-card"><span className="metric-kicker">CTR</span><strong>{formatRate(summary.ctr)}</strong><div><span>원본/기간 기준</span></div></article>
          <article className="metric-card"><span className="metric-kicker">조회 / 전환</span><strong>{summary.views !== null ? formatCount(summary.views) : summary.conversions !== null ? formatCount(summary.conversions, "건") : "데이터 없음"}</strong><div><span>원본 지표 기준</span></div></article>
        </section>

        <section className="card section-space report-panel">
          <div className="report-panel-head table-title-row"><div><h2>원본 보고서 구조</h2><p>파일/링크 → 시트/요약 → 지면 순으로 원본과 대조하기 쉽게 표시합니다.</p></div></div>
          <div className="source-sheet-stack">{grouped.map(([groupKey, sourceRows]) => {
            const first = sourceRows[0];
            const hasSpend = sourceRows.some((row) => row.spend !== null && row.spend !== undefined);
            const hasClicks = sourceRows.some((row) => row.clicks !== null && row.clicks !== undefined);
            const hasViews = sourceRows.some((row) => row.views !== null && row.views !== undefined);
            const hasVtr = sourceRows.some((row) => row.vtr !== null && row.vtr !== undefined);
            const hasConversions = sourceRows.some((row) => row.conversions !== null && row.conversions !== undefined);
            const hasCpc = sourceRows.some((row) => row.cpc !== null && row.cpc !== undefined);
            const hasCpm = sourceRows.some((row) => row.cpm !== null && row.cpm !== undefined);
            const hasCpv = sourceRows.some((row) => row.cpv !== null && row.cpv !== undefined);
            return <article className="source-sheet-card" key={groupKey}>
              <div className="source-sheet-head"><div><strong>{first.sourceSheet}</strong><span>{first.sourceFile}</span></div><div>{first.sourceUrl && <a href={first.sourceUrl} target="_blank" rel="noreferrer" className="source-link">원본 리포트 ↗</a>}<span>기준일 {first.reportDate || "미확인"}</span></div></div>
              <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>지면</th>{hasSpend && <th>집행액</th>}<th>노출</th>{hasClicks && <th>클릭</th>}<th>CTR</th>{hasViews && <th>조회완료</th>}{hasVtr && <th>VTR</th>}{hasConversions && <th>전환</th>}{hasCpm && <th>CPM</th>}{hasCpc && <th>CPC</th>}{hasCpv && <th>CPV</th>}</tr></thead><tbody>{sourceRows.map((row, index) => <tr key={`${row.platform}-${row.placement}-${index}`}><td>{row.platform}</td><td><strong>{row.placement}</strong></td>{hasSpend && <td className="num-cell">{formatKrw(row.spend)}</td>}<td className="num-cell">{formatCount(row.impressions)}</td>{hasClicks && <td className="num-cell">{formatCount(row.clicks)}</td>}<td className="num-cell">{formatRate(row.ctr)}</td>{hasViews && <td className="num-cell">{formatCount(row.views)}</td>}{hasVtr && <td className="num-cell">{formatRate(row.vtr)}</td>}{hasConversions && <td className="num-cell">{formatCount(row.conversions, "건")}</td>}{hasCpm && <td className="num-cell">{formatWonMetric(row.cpm)}</td>}{hasCpc && <td className="num-cell">{formatWonMetric(row.cpc)}</td>}{hasCpv && <td className="num-cell">{formatWonMetric(row.cpv)}</td>}</tr>)}</tbody></table></div>
            </article>;
          })}</div>
        </section>

        <section className="card section-space report-panel">
          <div className="report-panel-head"><div><h2>기간 내 Daily Insight</h2><p>메일 본문의 전일 성과 해석과 원본 리포트 링크입니다. Fact 수치를 덮어쓰지 않습니다.</p></div><span className="view-pill">{periodInsights.length}건</span></div>
          <div className="insight-timeline">{periodInsights.length ? periodInsights.map((item) => <div key={item.key}><strong>{item.reportDate}</strong><div><b>{item.mailSubject}</b>{item.notes.length ? item.notes.map((note, index) => <span key={index}>{renderInsightNote(note)}</span>) : <p>추출된 운영 메모 없음</p>}</div></div>) : <div className="empty-inline">선택 기간에 Daily Insight가 없습니다.</div>}</div>
        </section>
      </>}
    </>
  );
}
