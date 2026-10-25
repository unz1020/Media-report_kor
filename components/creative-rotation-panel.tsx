"use client";

import { useId, useState } from "react";
import { creativeRotationCsv, type CreativeRotationReport, type CreativeRotationGroup, type CreativeRotationEntry, type CreativeRotationMetrics } from "@/lib/creative-rotation";
import type { PlacementProof } from "@/lib/placement-proof";
import type { ProofLightboxImage } from "./proof-image-lightbox";
import styles from "./creative-rotation-panel.module.css";

export type CreativeRotationPanelProps = {
  report: CreativeRotationReport;
  groupId?: string;
  compact?: boolean;
  selectedCreativeName?: string;
  onOpenImage?: (image: ProofLightboxImage) => void;
  onSelectProof?: (proof: PlacementProof) => void;
  onEditLink?: (proof: PlacementProof, group: CreativeRotationGroup) => void;
};
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const hasMetrics = (entry: CreativeRotationEntry) => Object.values(entry.metrics).some(value => value !== null);
const rolling = (group: CreativeRotationGroup) => group.creatives.length > 1 || [...group.creatives, ...group.unlinkedPerformance].filter(hasMetrics).length > 1;
const amount = (value: number | null | undefined, unit = "") => value === null || value === undefined || !Number.isFinite(value) ? "미제공" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: unit === "%" ? 2 : 1 })}${unit}`;
const date = (value: string | null | undefined) => value || "미제공";
/** Same authenticated original-image routes used by the placement showroom. */
function proofImageUrl(proof: PlacementProof) {
  if (proof.manualImagePath) return `/api/reporting/proof-image?${new URLSearchParams({ advertiser: proof.advertiser, path: proof.manualImagePath })}`;
  const image = proof.attachments.find(file => file.kind === "image");
  return image ? `/api/gmail/attachment?${new URLSearchParams({ messageId: proof.messageId, attachmentId: image.attachmentId, filename: image.filename, mimeType: image.mimeType || "image/jpeg" })}` : "";
}
function OriginalImage({ proof, onOpenImage }: { proof: PlacementProof; onOpenImage?: CreativeRotationPanelProps["onOpenImage"] }) {
  const [failed, setFailed] = useState(false);
  const src = proofImageUrl(proof);
  if (!src || failed) return <p className={styles.empty}>증빙 이미지 {failed ? "불러오기 실패 · 원본 자료를 확인해주세요." : "미제공"}</p>;
  const image = <img src={src} alt={`${proof.creativeName || "소재명 미입력"} · 원본 게재 증빙`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  return onOpenImage ? <button type="button" className={styles.imageButton} aria-label={`${proof.creativeName || "소재"} 원본 증빙 확대`} onClick={() => onOpenImage({ src, title: `${proof.media} · ${proof.creativeName || "소재명 미입력"}`, description: `원본 증빙 · 자료상 상태 ${proof.status} · 자료상 확인일 ${date(proof.verificationDate)} · 보고서 기준일 ${date(proof.reportDate)}. 현재 송출 상태를 뜻하지 않습니다.` })}>{image}<span>원본 증빙 확대</span></button> : <div className={styles.imageButton}>{image}</div>;
}
function MetricDetails({ metrics }: { metrics: CreativeRotationMetrics }) {
  return <dl className={styles.metrics}>{([
    ["노출", metrics.impressions, ""], ["클릭", metrics.clicks, ""], ["CTR", metrics.ctr, "%"],
    ["조회", metrics.views, ""], ["전환", metrics.conversions, ""], ["유료 집행비용", metrics.spend, "원"],
    ["CPC", metrics.cpc, "원"], ["CPM", metrics.cpm, "원"], ["CPV", metrics.cpv, "원"],
  ] as const).map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{amount(value, unit)}</dd></div>)}</dl>;
}
function latestOperationText(entry: CreativeRotationEntry) {
  const reports = entry.proofs.flatMap(proof => proof.operation ? [proof.operation] : []);
  if (!reports.length) return "미입력";
  const latestDate = reports.map(report => report.asOf).sort().at(-1)!;
  const statuses = new Set(reports.filter(report => report.asOf === latestDate).map(report => report.status));
  return (statuses.size > 1 ? "상충 보고" : [...statuses][0]) + " · " + latestDate;
}
function EntryTable({ entries, title, selectedId, onSelect }: { entries: CreativeRotationEntry[]; title: string; selectedId?: string; onSelect: (entry: CreativeRotationEntry) => void }) {
  return <section className={styles.entrySection}><h4>{title} <span>{entries.length}개</span></h4>{!entries.length ? <p className={styles.empty}>해당 자료가 없습니다.</p> : <div className={styles.tableScroll} role="region" aria-label={`${title} 비교표, 가로 스크롤 가능`} tabIndex={0}><table><caption className={styles.srOnly}>{title} · 제공일 기준 합계</caption><thead><tr><th scope="col">소재명</th><th scope="col">AE 최신 운영보고</th><th scope="col">노출</th><th scope="col">클릭</th><th scope="col">CTR</th><th scope="col">보고된 성과일</th><th scope="col">최근 성과일</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} className={selectedId === entry.id ? styles.selectedRow : undefined}><th scope="row"><button type="button" className={styles.entryButton} aria-label={`${entry.name || "소재명 미입력"} 성과 상세 선택`} aria-pressed={selectedId === entry.id} onClick={() => onSelect(entry)}>{entry.name || "소재명 미입력"}</button>{entry.conflictDates.length > 0 && <small className={styles.warningText}>충돌 {entry.conflictDates.length}일 제외</small>}</th><td>{latestOperationText(entry)}</td><td>{amount(entry.metrics.impressions)}</td><td>{amount(entry.metrics.clicks)}</td><td>{amount(entry.metrics.ctr, "%")}</td><td>{entry.reportedDates.length}일</td><td>{date(entry.lastPerformanceDate)}</td></tr>)}</tbody></table></div>}</section>;
}
export function CreativeRotationPanel({ report, groupId, compact = false, selectedCreativeName, onOpenImage, onSelectProof, onEditLink }: CreativeRotationPanelProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [onlyRolling, setOnlyRolling] = useState(true);
  const [chosenGroupId, setChosenGroupId] = useState("");
  const [selection, setSelection] = useState<{ groupId: string; entryId: string; externalName?: string } | null>(null);
  const [proofSelection, setProofSelection] = useState<{ entryId: string; index: number } | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const filtered = report.groups.filter(group => (!onlyRolling || rolling(group) || group.id === groupId) && normalize(`${group.media} ${group.placement}`).includes(normalize(query))).sort((a, b) => {
    const score = (group: CreativeRotationGroup) => [...group.creatives, ...group.unlinkedPerformance].some(hasMetrics) ? 2 : group.creatives.length ? 1 : 0;
    return score(b) - score(a);
  });
  const targetGroup = groupId ? report.groups.find(item => item.id === groupId) : undefined;
  const group = compact && groupId ? targetGroup : chosenGroupId ? report.groups.find(item => item.id === chosenGroupId) : groupId ? targetGroup : filtered[0];
  const missingTarget = Boolean(groupId && !targetGroup && !chosenGroupId);
  const selectable = group && !filtered.some(item => item.id === group.id) ? [group, ...filtered] : filtered;
  const entries = group ? [...group.creatives, ...group.unlinkedPerformance] : [];
  const explicit = selection && selection.groupId === group?.id && selection.externalName === selectedCreativeName ? entries.find(entry => entry.id === selection.entryId) : undefined;
  const selected = explicit || (selectedCreativeName ? entries.find(entry => normalize(entry.name) === normalize(selectedCreativeName)) : undefined) || group?.creatives.find(hasMetrics) || group?.creatives[0] || group?.unlinkedPerformance[0];
  const proofs = selected ? [...selected.proofs].sort((a, b) => b.reportDate.localeCompare(a.reportDate)) : [];
  const proofIndex = proofSelection && proofSelection.entryId === selected?.id ? proofSelection.index : 0;
  const proof = proofs[proofIndex] || proofs[0];
  function select(entry: CreativeRotationEntry) {
    if (!group) return;
    setSelection({ groupId: group.id, entryId: entry.id, externalName: selectedCreativeName }); setProofSelection(null);
    const firstProof = [...entry.proofs].sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0];
    if (firstProof) onSelectProof?.(firstProof);
  }
  function download() {
    setDownloadError("");
    try {
      const csvReport = group ? { ...report, groups: [group] } : { ...report, groups: [] };
      const url = URL.createObjectURL(new Blob([creativeRotationCsv(csvReport)], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `creative-rotation-${report.startDate}-${report.endDate}.csv`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setDownloadError("CSV를 만들지 못했습니다. 다시 시도해주세요."); }
  }
  return <section className={`${styles.panel} ${compact ? styles.compactPanel : ""}`} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><div><h2 id={`${id}-title`}>소재별 운영·성과</h2><p>{report.startDate} ~ {report.endDate} · 성과 행 조회 범위</p></div><button type="button" className={styles.secondaryButton} disabled={!group} onClick={download}>선택 지면 CSV</button></header>
    <p className={styles.scopeNote}>증빙·계획·AE 운영정보는 등록 월의 자료입니다. 날짜 필터는 성과 행에만 적용하며, 증빙이 조회 기간에 실제 집행됐다는 뜻은 아닙니다.</p>
    {!compact && <div className={styles.filters}><label htmlFor={`${id}-search`}>매체·지면 검색<input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="매체 또는 게재지면" /></label><label htmlFor={`${id}-group`}>비교할 매체·지면<select id={`${id}-group`} value={group?.id || ""} onChange={event => { setChosenGroupId(event.target.value); setSelection(null); setProofSelection(null); }}>{!group && <option value="">{missingTarget ? "선택한 지면 자료 없음" : "조건에 맞는 지면 없음"}</option>}{selectable.map(item => <option key={item.id} value={item.id}>{item.media} · {item.placement}</option>)}</select></label><label className={styles.checkbox}><input type="checkbox" checked={onlyRolling} onChange={event => setOnlyRolling(event.target.checked)} />복수 소재 자료가 있는 지면만 <small>등록명 2개 이상 또는 성과 소재 2개 이상</small></label></div>}
    {downloadError && <p role="alert">{downloadError}</p>}
    {!group ? <p className={styles.empty}>{compact ? "이 지면의 소재 자료가 없습니다." : missingTarget ? "선택한 지면을 현재 광고주·월 자료에서 찾을 수 없습니다. 다른 지면을 직접 선택해주세요." : "조건에 맞는 지면이 없습니다. 검색어나 복수 소재 필터를 바꿔주세요."}</p> : <>
      <div className={styles.inventory}><h3>{group.media} <span>· {group.placement}</span></h3><p>등록 소재명 {group.creatives.length}개 · 미연결 성과 원본명 {group.unlinkedPerformance.length}개 · 소재명 없는 증빙 {group.unnamedProofs.length}건</p></div>
      {group.unlinkedPerformance.length > 0 && <div className={styles.notice}><strong>성과 원본명 연결 확인 필요</strong><p>등록 소재명과 성과 원본명을 별도로 표시합니다. A/B 표기나 유사한 이름만으로 같은 소재라고 판단하지 않습니다.</p></div>}
      {group.ambiguousScope && <p className={styles.warningText}>지면 또는 소재 연결 범위가 모호합니다. 원본을 확인하기 전에는 자료를 합치지 않습니다.</p>}
      <EntryTable entries={group.creatives} title="등록 소재" selectedId={selected?.id} onSelect={select} />
      {group.unlinkedPerformance.length > 0 && <EntryTable entries={group.unlinkedPerformance} title="미연결 성과 원본명" selectedId={selected?.id} onSelect={select} />}
      {selected && <section className={styles.detail} aria-label="선택 소재 상세"><header className={styles.detailHeader}><h3>{selected.name || "소재명 미입력"}</h3><span>{group.creatives.includes(selected) ? "등록 소재" : "성과 원본명 · 미연결"}</span></header>
        <div className={styles.detailGrid}><div>
          {proofs.length > 1 && <label className={styles.proofSelect}>증빙 자료 선택<select value={Math.max(0, proofs.indexOf(proof))} onChange={event => { const index = Number(event.target.value); setProofSelection({ entryId: selected.id, index }); onSelectProof?.(proofs[index]); }}>{proofs.map((item, index) => <option key={index} value={index}>{date(item.reportDate)} · {item.status} · {item.sourceFile}</option>)}</select></label>}
          {proof ? <><OriginalImage key={`${selected.id}:${proof.importId || proof.messageId}:${proof.reportDate}:${proof.manualImagePath || ""}`} proof={proof} onOpenImage={onOpenImage} /><dl className={styles.sourceDates}><div><dt>선택 증빙의 AE 보고용 운영상태</dt><dd>{proof.operation?.status || "미입력"}</dd></div>{proof.operation && <><div><dt>운영보고 기준일</dt><dd>{date(proof.operation.asOf)}</dd></div>{proof.operation.note && <div><dt>운영보고 메모</dt><dd>{proof.operation.note}</dd></div>}</>}<div><dt>증빙 자료상 상태</dt><dd>{proof.status}</dd></div><div><dt>자료상 확인일</dt><dd>{date(proof.verificationDate)}</dd></div><div><dt>증빙 보고서 기준일</dt><dd>{date(proof.reportDate)}</dd></div></dl>{onEditLink && <button type="button" className={styles.secondaryButton} disabled={!proof.importId || !proof.publishedAt || !proof.creativeName} onClick={() => onEditLink(proof, group)}>운영정보·성과 연결</button>}</> : <p className={styles.empty}>이 소재명에 연결된 게재 증빙이 없습니다.</p>}
        </div><div><dl className={styles.sourceDates}><div><dt>최근 보고된 성과일</dt><dd>{date(selected.lastPerformanceDate)}</dd></div><div><dt>성과 보고서 최신 기준일</dt><dd>{date(selected.lastReportDate)}</dd></div><div><dt>성과 자료 제공일</dt><dd>{selected.reportedDates.length}일 · {date(selected.firstPerformanceDate)} ~ {date(selected.lastPerformanceDate)}</dd></div></dl><MetricDetails metrics={selected.metrics} />
        {selected.conflictDates.length > 0 && <p className={styles.warningText}>충돌로 합계에서 제외한 날짜: {selected.conflictDates.join(", ")}</p>}
        {selected.plans.map((plan, index) => <p className={styles.plan} key={index}><strong>계획 원본상 상태: {plan.operationStatus || plan.proposalStatus || "미제공"}</strong><br />계획 기간 {date(plan.periodStart)} ~ {date(plan.periodEnd)} · 원본 시트 {plan.sourceSheet || "미제공"}</p>)}
        </div></div>
        <details className={styles.provenance}><summary>성과 제공일·원본 출처 {selected.rows.length}행</summary><p>보고된 성과일: {selected.reportedDates.length ? selected.reportedDates.join(", ") : "미제공"}</p><ul>{selected.rows.map((owner, index) => <li key={`${owner.datasetKey}:${owner.sourceIndex}:${index}`}><strong>{owner.row.date} · {owner.row.creative || "소재명 미입력"}</strong><span>{owner.sourceFile} · {owner.row.sourceSheet || "시트 미제공"} · 원본 행 인덱스 {owner.sourceIndex}</span><span>보고서 기준일 {owner.reportDate} · 게시 시각 {owner.publishedAt}</span><span>집계: {owner.conflict ? "충돌 · 제외" : owner.selected ? "반영" : "이전 자료 또는 중복 · 제외"} · 연결: {({ exact_name: "정확한 이름 일치", explicit_link: "AE 확인 연결", unlinked: "미연결", mapping_conflict: "연결 충돌" })[owner.mapping]}</span><code>{owner.datasetKey}</code></li>)}</ul>{selected.proofs.map((item, index) => <p key={index}>증빙 원본: {item.sourceFile} · 보고서 기준일 {date(item.reportDate)} · 게시 시각 {date(item.publishedAt)} · AE 운영보고: {item.operation ? `${item.operation.status} · 기준일 ${item.operation.asOf}${item.operation.note ? ` · 메모 ${item.operation.note}` : ""}` : "미입력"}</p>)}</details>
      </section>}
      {(group.unassignedPlans.length > 0 || group.unnamedProofs.length > 0 || group.placementMetrics.length > 0) && <details className={styles.provenance}><summary>소재에 배분하지 않은 지면 자료 · 계획 {group.unassignedPlans.length}건 / 증빙 {group.unnamedProofs.length}건 / 지면 성과 {group.placementMetrics.length}건</summary><p>소재명이 없는 계획과 지면 전체 성과는 개별 소재에 나누어 넣지 않습니다.</p>{group.unassignedPlans.map((plan, index) => <p key={index}>계획 원본상 상태: {plan.operationStatus || plan.proposalStatus || "미제공"} · {date(plan.periodStart)} ~ {date(plan.periodEnd)} · {plan.sourceSheet || "시트 미제공"}</p>)}{group.unnamedProofs.map((item, index) => <p key={index}>소재명 없는 증빙: {item.status} · 확인일 {date(item.verificationDate)} · 보고서 기준일 {date(item.reportDate)} · {item.sourceFile}</p>)}</details>}
      <footer className={styles.footnote}>수치는 제공된 날짜의 합계이며, 전체 조회 기간의 성과나 순도달이 아닙니다. CTR은 노출·클릭이 함께 제공된 행 기준입니다. 비용·CPC·CPM·CPV는 비용이 제공된 유료 행 기준이며, 서비스·참고 비용은 제외하고 원본은 보존합니다. 미제공은 0이 아닙니다. 집행량·타기팅·기간이 달라 단순 우열 비교는 어렵습니다. AE 운영상태는 보고용 정보이며 실제 광고 시작·중단 기능이 아닙니다. 날짜나 0만으로 집행 중·중단을 추정하지 않습니다.</footer>
    </>}
  </section>;
}
