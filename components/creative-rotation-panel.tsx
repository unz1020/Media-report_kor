"use client";

import { useId, useState } from "react";
import { MediaLabel } from './media-label';
import { creativeRotationCsv, type CreativeRotationReport, type CreativeRotationGroup, type CreativeRotationEntry, type CreativeRotationMetrics } from "@/lib/creative-rotation";
import type { PlacementProof } from "@/lib/placement-proof";
import { creativeImageUrl } from "@/lib/creative-image";
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
/** A comparison row never chooses among distinct registered images or conflicting identities. */
function uniqueCreativeImage(entry: CreativeRotationEntry): PlacementProof | undefined {
  if (entry.identityConflict) return undefined;
  const images = entry.proofs.filter(proof => creativeImageUrl(proof));
  const keys = new Set(images.map(proof => creativeImageUrl(proof)));
  return keys.size === 1 ? images[0] : undefined;
}
function CreativeImage({ proof, onOpenImage, thumbnail = false }: { proof: PlacementProof; onOpenImage?: CreativeRotationPanelProps["onOpenImage"]; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = creativeImageUrl(proof);
  if (!src || failed) return <span className={styles.imageMissing}>{failed ? "소재 이미지 불러오기 실패" : "소재 이미지 미등록"}</span>;
  const image = <img src={src} alt={`${proof.creativeName || "소재명 미입력"} · 사용자 등록 소재 이미지 · 게재 증빙 아님`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  if (thumbnail) return <span className={styles.thumbnail}>{image}</span>;
  return onOpenImage ? <button type="button" className={styles.imageButton} aria-label={`${proof.creativeName || "소재"} 등록 소재 이미지 확대`} onClick={() => onOpenImage({ src, title: proof.creativeImageFilename || proof.creativeName || "사용자 등록 소재", description: "사용자 등록 소재 이미지 · 게재 증빙 아님 · 성과 연결을 뜻하지 않습니다." })}>{image}<span>등록 소재 이미지 확대 · 게재 증빙 아님</span></button> : <div className={styles.imageButton}>{image}<span>사용자 등록 소재 이미지 · 게재 증빙 아님</span></div>;
}
function EntryImage({ entry }: { entry: CreativeRotationEntry }) {
  const proof = uniqueCreativeImage(entry);
  if (proof) return <CreativeImage key={creativeImageUrl(proof)} proof={proof} thumbnail />;
  const hasImage = entry.proofs.some(proof => creativeImageUrl(proof));
  return <span className={styles.imageMissing}>{hasImage ? "이미지 확인 필요 · 상세 선택" : "소재 이미지 미등록"}</span>;
}
/** A chart thumbnail is shown only when the image-bearing proof itself owns every selected explicit link. */
function ChartEntryImage({ entry }: { entry: CreativeRotationEntry }) {
  const rows = entry.rows.filter(row => row.selected && !row.conflict);
  const eligible = entry.proofs.filter(proof => proof.performanceLink && creativeImageUrl(proof) && rows.every(owner => {
    const link = proof.performanceLink!;
    return link.sourceFamily === owner.sourceFamily && normalize(link.platform) === normalize(owner.row.platform) && normalize(link.placement) === normalize(owner.row.placement) && normalize(link.creative) === normalize(owner.row.creative);
  }));
  const keys = new Set(eligible.map(proof => creativeImageUrl(proof)));
  return rows.length && keys.size === 1 ? <CreativeImage proof={eligible[0]} thumbnail /> : <span className={styles.imageMissing}>연결 확인된 이미지 없음</span>;
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
  return <section className={styles.entrySection}><h4>{title} <span>{entries.length}개</span></h4>{!entries.length ? <p className={styles.empty}>해당 자료가 없습니다.</p> : <div className={styles.tableScroll} role="region" aria-label={`${title} 비교표, 가로 스크롤 가능`} tabIndex={0}><table><caption className={styles.srOnly}>{title} · 제공일 기준 합계</caption><thead><tr><th scope="col">소재명</th><th scope="col">등록 소재 이미지</th><th scope="col">AE 최신 운영보고</th><th scope="col">노출</th><th scope="col">클릭</th><th scope="col">CTR</th><th scope="col">보고된 성과일</th><th scope="col">최근 성과일</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} className={selectedId === entry.id ? styles.selectedRow : undefined}><th scope="row"><button type="button" className={styles.entryButton} aria-label={`${entry.name || "소재명 미입력"}${entry.materialIdentity ? ` (${entry.materialIdentity.assetId} · ${entry.materialIdentity.version})` : ""} 성과 상세 선택`} aria-pressed={selectedId === entry.id} onClick={() => onSelect(entry)}>{entry.name || "소재명 미입력"}</button>{entry.materialIdentity ? <small className={styles.materialBadge}>{entry.materialIdentity.assetId} · {entry.materialIdentity.version}<br/>{entry.materialIdentity.displayName}</small> : entry.proofs.length > 0 ? <small className={styles.identityPending}>ID·버전 미등록</small> : null}{entry.identityConflict && <small className={styles.warningText}>식별정보 상충 · 원본 대조 필요</small>}{entry.conflictDates.length > 0 && <small className={styles.warningText}>충돌 {entry.conflictDates.length}일 제외</small>}</th><td><EntryImage entry={entry} /></td><td>{latestOperationText(entry)}</td><td>{amount(entry.metrics.impressions)}</td><td>{amount(entry.metrics.clicks)}</td><td>{amount(entry.metrics.ctr, "%")}</td><td>{entry.reportedDates.length}일</td><td>{date(entry.lastPerformanceDate)}</td></tr>)}</tbody></table></div>}</section>;
}
export function CreativeRotationPanel({ report, groupId, compact = false, selectedCreativeName, onOpenImage, onSelectProof, onEditLink }: CreativeRotationPanelProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [chartMetric, setChartMetric] = useState<"impressions" | "clicks">("impressions");
  const [onlyRolling, setOnlyRolling] = useState(true);
  const [chosenGroupId, setChosenGroupId] = useState("");
  const [selection, setSelection] = useState<{ groupId: string; entryId: string; externalName?: string } | null>(null);
  const [proofSelection, setProofSelection] = useState<{ entryId: string; index: number; externalName?: string } | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const filtered = report.groups.filter(group => (!onlyRolling || rolling(group) || group.id === groupId) && normalize(`${group.media} ${group.placement} ${[...group.creatives,...group.unlinkedPerformance].map(entry => [entry.name, entry.materialIdentity?.assetId, entry.materialIdentity?.version, entry.materialIdentity?.displayName, entry.materialIdentity?.reportedFilename].filter(Boolean).join(" ")).join(" ")}`).includes(normalize(query))).sort((a, b) => {
    const score = (group: CreativeRotationGroup) => [...group.creatives, ...group.unlinkedPerformance].some(hasMetrics) ? 2 : group.creatives.length ? 1 : 0;
    return score(b) - score(a);
  });
  const targetGroup = groupId ? report.groups.find(item => item.id === groupId) : undefined;
  const group = compact && groupId ? targetGroup : chosenGroupId ? report.groups.find(item => item.id === chosenGroupId) : groupId ? targetGroup : filtered[0];
  const missingTarget = Boolean(groupId && !targetGroup && !chosenGroupId);
  const selectable = group && !filtered.some(item => item.id === group.id) ? [group, ...filtered] : filtered;
  const entries = group ? [...group.creatives, ...group.unlinkedPerformance] : [];
  const explicit = selection && selection.groupId === group?.id && selection.externalName === selectedCreativeName ? entries.find(entry => entry.id === selection.entryId) : undefined;
  const externalMatches = selectedCreativeName ? entries.filter(entry => [entry.name, ...entry.proofs.map(item => item.creativeName || "")].some(name => normalize(name) === normalize(selectedCreativeName))) : [];
  const ambiguousExternal = !explicit && externalMatches.length > 1;
  const missingExternal = Boolean(selectedCreativeName && !explicit && !externalMatches.length);
  const selected = ambiguousExternal || missingExternal ? undefined : explicit || externalMatches[0] || group?.creatives.find(hasMetrics) || group?.creatives[0] || group?.unlinkedPerformance[0];
  const proofs = selected ? [...selected.proofs].sort((a, b) => b.reportDate.localeCompare(a.reportDate)) : [];
  const aliasProofIndex = selectedCreativeName ? proofs.findIndex(item => normalize(item.creativeName || "") === normalize(selectedCreativeName)) : -1;
  const proofIndex = proofSelection && proofSelection.entryId === selected?.id && proofSelection.externalName === selectedCreativeName ? proofSelection.index : Math.max(0, aliasProofIndex);
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
    {!compact && <div className={styles.filters}><label htmlFor={`${id}-search`}>매체·지면 검색<input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="매체·지면·소재ID·파일명" /></label><label htmlFor={`${id}-group`}>비교할 매체·지면<select id={`${id}-group`} aria-label="비교할 매체·지면" value={group?.id || ""} onChange={event => { setChosenGroupId(event.target.value); setSelection(null); setProofSelection(null); }}>{!group && <option value="">{missingTarget ? "선택한 지면 자료 없음" : "조건에 맞는 지면 없음"}</option>}{selectable.map(item => <option key={item.id} value={item.id}>{item.media} · {item.placement}</option>)}</select></label><label className={styles.checkbox}><input type="checkbox" checked={onlyRolling} onChange={event => setOnlyRolling(event.target.checked)} />복수 소재 자료가 있는 지면만 <small>등록명 2개 이상 또는 성과 소재 2개 이상</small></label></div>}
    {downloadError && <p role="alert">{downloadError}</p>}
    {!group ? <p className={styles.empty}>{compact ? "이 지면의 소재 자료가 없습니다." : missingTarget ? "선택한 지면을 현재 광고주·월 자료에서 찾을 수 없습니다. 다른 지면을 직접 선택해주세요." : "조건에 맞는 지면이 없습니다. 검색어나 복수 소재 필터를 바꿔주세요."}</p> : <>
      <div className={styles.inventory}><h3><MediaLabel media={group.media} placement={group.placement} size="md"/> <span>· {group.placement}</span></h3><p>등록 소재명 {group.creatives.length}개 · 미연결 성과 원본명 {group.unlinkedPerformance.length}개 · 소재명 없는 증빙 {group.unnamedProofs.length}건</p></div>
      {group.unlinkedPerformance.length > 0 && <div className={styles.notice}><strong>성과 원본명 연결 확인 필요</strong><p>등록 소재명과 성과 원본명을 별도로 표시합니다. A/B 표기나 유사한 이름만으로 같은 소재라고 판단하지 않습니다.</p></div>}
      {group.ambiguousScope && <p className={styles.warningText}>지면 또는 소재 연결 범위가 모호합니다. 원본을 확인하기 전에는 자료를 합치지 않습니다.</p>}
      {group.creatives.some(entry => entry.proofs.length > 0 && !entry.materialIdentity) && <p className={styles.identityPending}>소재ID·버전 미등록 항목은 원본명으로 표시합니다. 새 ID를 임의 발급하거나 A/B를 자동 대응하지 않습니다. 상세의 ‘운영정보·성과 연결’에서 확인 후 등록할 수 있습니다.</p>}
      {missingExternal && <p className={styles.warningText}>선택한 원본 소재명을 현재 지면에서 찾지 못했습니다. 다른 소재의 상세로 대신 표시하지 않습니다. 비교표에서 직접 선택해주세요.</p>}
      {ambiguousExternal && <p className={styles.warningText}>같은 원본명이 여러 소재 또는 버전에 있습니다. ID·버전을 확인하고 비교표에서 직접 선택해주세요.</p>}
      <section className={styles.visualComparison} aria-label="확인된 소재 성과 도표"><h4>연결 확인된 소재 성과</h4><p>AE가 성과 원본을 직접 연결한 소재만 표시합니다. 등록 이미지는 게재 증빙이 아닙니다. 소재별 제공일과 집행 범위가 다를 수 있어 효율 순위가 아닙니다.</p><div role="group" aria-label="소재 도표 지표 선택">{([['impressions','노출'],['clicks','클릭']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={chartMetric===key} onClick={()=>setChartMetric(key)}>{label}</button>)}</div>{(()=>{const eligible=group.creatives.filter(entry=>{const selected=entry.rows.filter(r=>r.selected&&!r.conflict);return !group.ambiguousScope&&!entry.identityConflict&&!entry.conflictDates.length&&selected.length>0&&selected.every(r=>r.mapping==='explicit_link');});const available=eligible.filter(entry=>typeof entry.metrics[chartMetric]==='number'&&Number.isFinite(entry.metrics[chartMetric])&&entry.metrics[chartMetric]!>=0);const max=Math.max(0,...available.map(entry=>entry.metrics[chartMetric] as number));return available.length?<ul>{available.map(entry=>{const value=entry.metrics[chartMetric] as number;const selected=entry.rows.filter(r=>r.selected&&!r.conflict);const dates=[...new Set(selected.map(r=>r.row.date))].sort();return <li key={entry.id}><button className={styles.visualEntry} type="button" onClick={()=>select(entry)}><ChartEntryImage entry={entry}/><span><strong>{entry.name||'소재명 미입력'}</strong><small>{dates.length}일 제공 · {date(dates[0])} ~ {date(dates.at(-1))}</small></span><b>{amount(value)}</b></button><div className={styles.visualTrack} aria-hidden="true"><i style={{width:max>0?(value/max*100)+'%':'0%'}} /></div></li>;})}</ul>:<p>직접 연결된 소재의 {chartMetric==='impressions'?'노출':'클릭'} 자료가 없습니다. 미연결·미제공은 0으로 표시하지 않습니다.</p>;})()}</section>
      <EntryTable entries={group.creatives} title="등록 소재" selectedId={selected?.id} onSelect={select} />
      {group.unlinkedPerformance.length > 0 && <EntryTable entries={group.unlinkedPerformance} title="미연결 성과 원본명" selectedId={selected?.id} onSelect={select} />}
      {selected?.materialIdentity && <dl className={styles.materialIdentity}><div><dt>소재ID · 버전</dt><dd>{selected.materialIdentity.assetId} · {selected.materialIdentity.version}</dd></div><div><dt>소재 관리명</dt><dd>{selected.materialIdentity.displayName}</dd></div><div><dt>보고된 소재 파일명</dt><dd>{selected.materialIdentity.reportedFilename || "미등록"}</dd></div><div><dt>소재 규격</dt><dd>{selected.materialIdentity.format || "미등록"}</dd></div></dl>}
      {selected?.identityConflict && <p className={styles.warningText}>같은 식별자의 정의가 서로 다르거나 식별정보 형식이 유효하지 않아 성과 연결을 보류했습니다. AE가 원본 소재와 버전을 확인해야 합니다.</p>}
      {selected && <section className={styles.detail} aria-label="선택 소재 상세"><header className={styles.detailHeader}><h3>{selected.name || "소재명 미입력"}</h3><span>{group.creatives.includes(selected) ? "등록 소재" : "성과 원본명 · 미연결"}</span></header>
        <div className={styles.detailGrid}><div>
          {proofs.length > 1 && <label className={styles.proofSelect}>증빙 자료 선택<select aria-label="증빙 자료 선택" value={Math.max(0, proofs.indexOf(proof))} onChange={event => { const index = Number(event.target.value); setProofSelection({ entryId: selected.id, index, externalName: onSelectProof ? proofs[index]?.creativeName : selectedCreativeName }); onSelectProof?.(proofs[index]); }}>{proofs.map((item, index) => <option key={index} value={index}>{date(item.reportDate)} · {item.status} · {item.sourceFile}</option>)}</select></label>}
          {proof ? <><div className={styles.creativeReference}><strong>등록 소재 이미지</strong><p>사용자 등록 소재 · 게재 증빙 아님</p><CreativeImage key={`${selected.id}:${creativeImageUrl(proof)}`} proof={proof} onOpenImage={onOpenImage} /></div><div className={styles.evidenceHeading}>게재 증빙</div><OriginalImage key={`${selected.id}:${proof.importId || proof.messageId}:${proof.reportDate}:${proof.manualImagePath || ""}`} proof={proof} onOpenImage={onOpenImage} /><dl className={styles.sourceDates}><div><dt>선택 증빙 원본 소재명</dt><dd>{proof.creativeName || "미입력"}</dd></div><div><dt>선택 증빙의 AE 보고용 운영상태</dt><dd>{proof.operation?.status || "미입력"}</dd></div>{proof.operation && <><div><dt>운영보고 기준일</dt><dd>{date(proof.operation.asOf)}</dd></div>{proof.operation.note && <div><dt>운영보고 메모</dt><dd>{proof.operation.note}</dd></div>}</>}<div><dt>증빙 자료상 상태</dt><dd>{proof.status}</dd></div><div><dt>자료상 확인일</dt><dd>{date(proof.verificationDate)}</dd></div><div><dt>증빙 보고서 기준일</dt><dd>{date(proof.reportDate)}</dd></div></dl>{onEditLink && <button type="button" className={styles.secondaryButton} disabled={!proof.importId || !proof.publishedAt || !proof.creativeName} onClick={() => onEditLink(proof, group)}>운영정보·성과 연결</button>}</> : <p className={styles.empty}>이 소재명에 연결된 게재 증빙이 없습니다.</p>}
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
