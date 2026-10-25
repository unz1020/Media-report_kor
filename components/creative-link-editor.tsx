"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useWorkspace } from "./workspace-context";
import { hydratePublishedDailyState } from "@/lib/daily-report-store";
import type { CreativeRotationGroup } from "@/lib/creative-rotation";
import type { PlacementProof, CreativePerformanceLink } from "@/lib/placement-proof";
import { normalizeCreativeMaterialIdentity, readCreativeMaterialIdentity, suggestedCreativeFilename } from "@/lib/creative-material";
import styles from "./creative-link-editor.module.css";

export type CreativeLinkEditorProps = { proof: PlacementProof; group: CreativeRotationGroup; onClose: () => void };
const tupleKey = (link: CreativePerformanceLink) => JSON.stringify([link.sourceFamily, link.platform, link.placement, link.creative]);
/** Draft-only AE form. Only report-only operation metadata and source pointers are submitted. */
export function CreativeLinkEditor({ proof, group, onClose }: CreativeLinkEditorProps) {
  const { advertiser, month, canEdit, dataSyncState } = useWorkspace();
  const id = useId();
  const editorRoot = useRef<HTMLElement>(null);
  useEffect(() => {
    editorRoot.current?.scrollIntoView({ block: "start", behavior: "auto" });
    editorRoot.current?.focus({ preventScroll: true });
  }, []);
  const initialScope = useRef({ advertiser, month, importId: proof.importId, updatedAt: proof.publishedAt });
  const live = useRef({ advertiser, month, canEdit, importId: proof.importId, updatedAt: proof.publishedAt });
  live.current = { advertiser, month, canEdit, importId: proof.importId, updatedAt: proof.publishedAt };
  const mounted = useRef(false);
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => () => { request.current?.abort(); }, [advertiser, month, proof.importId, proof.publishedAt]);
  const candidates = useMemo(() => {
    const choices = new Map<string, { tuple: CreativePerformanceLink; dates: Set<string>; reports: Set<string>; files: Set<string> }>();
    // Only wrappers from this exact inventory. No account-wide aliases or inferred A/B mappings.
    for (const entry of [...group.creatives, ...group.unlinkedPerformance]) for (const owner of entry.rows) {
      const row = owner.row;
      if (!owner.sourceFamily || !row.platform || !row.placement || !row.creative.trim()) continue;
      const tuple = { sourceFamily: owner.sourceFamily, platform: row.platform, placement: row.placement, creative: row.creative };
      const key = tupleKey(tuple);
      const choice = choices.get(key) || { tuple, dates: new Set<string>(), reports: new Set<string>(), files: new Set<string>() };
      choice.dates.add(row.date); choice.reports.add(owner.reportDate); choice.files.add(owner.sourceFile); choices.set(key, choice);
    }
    return [...choices.entries()].map(([key, choice]) => ({ key, ...choice, dates: [...choice.dates].sort(), reports: [...choice.reports].sort(), files: [...choice.files] }));
  }, [group]);
  const [selectedKey, setSelectedKey] = useState(() => proof.performanceLink ? tupleKey(proof.performanceLink) : "");
  const [operationStatus, setOperationStatus] = useState<NonNullable<PlacementProof["operation"]>["status"] | "">(proof.operation?.status || "");
  const [operationDate, setOperationDate] = useState(proof.operation?.asOf || "");
  const [operationNote, setOperationNote] = useState(proof.operation?.note || "");
  const originalMaterial = readCreativeMaterialIdentity(proof.materialIdentity);
  const [materialMode, setMaterialMode] = useState<"preserve" | "edit" | "clear">("preserve");
  const [assetId, setAssetId] = useState(originalMaterial?.assetId || "");
  const [assetVersion, setAssetVersion] = useState(originalMaterial?.version || "v01");
  const [assetName, setAssetName] = useState(originalMaterial?.displayName || proof.creativeName || "");
  const [assetFormat, setAssetFormat] = useState(originalMaterial?.format || "");
  const [assetFilename, setAssetFilename] = useState(originalMaterial?.reportedFilename || "");
  let materialPreview = "";
  if (materialMode === "edit") {
    try { const material = normalizeCreativeMaterialIdentity({ assetId, version: assetVersion, displayName: assetName,
      ...(assetFormat.trim() ? { format: assetFormat } : {}), ...(assetFilename.trim() ? { reportedFilename: assetFilename } : {}) });
      if (material) materialPreview = suggestedCreativeFilename(advertiser, material) || "";
    } catch { /* An incomplete draft never becomes a stored identity or source match. */ }
  }
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const selected = candidates.find(candidate => candidate.key === selectedKey);
  const preservedLink = proof.performanceLink && selectedKey === tupleKey(proof.performanceLink) ? proof.performanceLink : null;
  const selectedLink = selected?.tuple || preservedLink;
  const changedScope = initialScope.current.advertiser !== advertiser || initialScope.current.month !== month || initialScope.current.importId !== proof.importId || initialScope.current.updatedAt !== proof.publishedAt;
  const eligibleProof = Boolean(proof.importId && proof.publishedAt && proof.creativeName?.trim()) && proof.advertiser === advertiser && proof.month === month;
  const blocked = !canEdit || dataSyncState !== "ready" || changedScope || !eligibleProof || busy || saved;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || pending.current || !confirmed || (selectedKey && !selectedLink)) return;
    if (operationStatus && (!/^\d{4}-\d{2}-\d{2}$/.test(operationDate) || !Number.isFinite(Date.parse(operationDate + "T00:00:00Z")) || new Date(operationDate + "T00:00:00Z").toISOString().slice(0, 10) !== operationDate)) {
      setError("보고용 운영상태의 운영보고 기준일을 확인해주세요."); return;
    }
    let materialChange = {};
    try {
      if (materialMode === "edit") materialChange = { materialIdentity: normalizeCreativeMaterialIdentity({ assetId, version: assetVersion, displayName: assetName,
        ...(assetFormat.trim() ? { format: assetFormat } : {}), ...(assetFilename.trim() ? { reportedFilename: assetFilename } : {}) }) };
      else if (materialMode === "clear") materialChange = { materialIdentity: null };
    } catch { setError("소재ID·버전·관리명을 확인해주세요. 파일명은 경로 없이 입력하고 제어문자는 사용할 수 없습니다."); return; }
    const operation = operationStatus ? { status: operationStatus, asOf: operationDate, ...(operationNote.trim() ? { note: operationNote.trim() } : {}) } : null;
    const scope = { advertiser, month, importId: proof.importId, updatedAt: proof.publishedAt };
    const current = () => mounted.current && live.current.advertiser === scope.advertiser && live.current.month === scope.month && live.current.importId === scope.importId && live.current.updatedAt === scope.updatedAt && live.current.canEdit;
    const controller = new AbortController(); request.current = controller; pending.current = true;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/reporting/store", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ action: "save_creative_link", input: { advertiser, month, importId: proof.importId, expectedUpdatedAt: proof.publishedAt, performanceLink: selectedLink || null, operation, ...materialChange } }),
      });
      if (!current()) return;
      const payload = await response.json();
      if (!current()) return;
      if (response.status === 409) throw new Error("다른 사용자가 자료를 변경했습니다. 선택한 초안은 유지했습니다. 이 창을 닫고 최신 자료를 확인한 뒤 다시 연결해주세요.");
      if (!response.ok) throw new Error(payload.error || "연결을 저장하지 못했습니다.");
      setSaved(true);
      // The shared store guards in-flight hydration generations; never start it for an old scope.
      if (!current()) return;
      try { await hydratePublishedDailyState(advertiser, month); }
      catch { if (current()) setError("연결은 저장됐지만 최신 자료를 불러오지 못했습니다. 창을 닫고 자료를 새로고침해주세요."); return; }
      if (current()) onClose();
    } catch (cause) {
      if (current() && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "연결을 저장하지 못했습니다.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <section ref={editorRoot} tabIndex={-1} className={styles.panel} aria-labelledby={`${id}-title`}>
    <header className={styles.header}><div><h2 id={`${id}-title`}>운영정보·성과 연결</h2><p>{advertiser} · {month} · {group.media} · {group.placement}</p></div><button type="button" className={styles.button} disabled={busy} onClick={onClose}>닫기</button></header>
    <p className={styles.identity}>등록 소재명 <strong>{proof.creativeName || "미입력"}</strong><span>등록 소재명과 게재 증빙의 상태·확인일은 변경하지 않습니다.</span></p>
    <div className={styles.warning}><strong>AE의 원본 확인이 필요한 수동 연결입니다.</strong><p>소재 A/B, 이름의 순서·유사성만으로 동일 소재를 추정하지 마세요. 원본 보고서와 등록 증빙을 대조한 경우에만 연결해주세요.</p></div>
    {!canEdit && <p role="status">조회 권한에서는 연결을 저장할 수 없습니다.</p>}
    {!eligibleProof && <p role="status">현재 광고주·월의 저장된 증빙과 소재명, 최신 게시 정보가 있어야 연결할 수 있습니다.</p>}
    {changedScope && <p role="alert">광고주·월 또는 증빙 버전이 바뀌었습니다. 이 창을 닫고 현재 자료에서 다시 열어주세요.</p>}
    {dataSyncState !== "ready" && !busy && <p role="status">자료 동기화가 완료된 뒤 연결할 수 있습니다.</p>}
    <form onSubmit={submit}>
      <fieldset disabled={blocked}><legend>보고용 운영정보·성과 연결</legend>
        <section className={styles.materialSection} aria-label="소재 식별정보 관리">
          <h3 className={styles.subheading}>소재ID·버전·파일명</h3>
          <p className={styles.muted}>소재ID와 버전은 AE가 확인한 관리용 식별자입니다. 파일의 동일성을 검증한 해시가 아니며, 성과 자동 연결이나 실제 파일 이름 변경에 사용하지 않습니다.</p>
          {originalMaterial && <p className={styles.materialSummary}>현재 등록: <strong>{originalMaterial.assetId} · {originalMaterial.version}</strong> · {originalMaterial.displayName}{originalMaterial.reportedFilename ? <><br/>보고된 소재 파일명: {originalMaterial.reportedFilename}</> : null}</p>}
          {proof.materialIdentity && !originalMaterial && <p className={styles.warning}>기존 식별정보의 형식을 확인해야 합니다. 원본은 유지하며, 수정 모드에서 올바른 값을 다시 입력할 수 있습니다.</p>}
          <label className={styles.materialMode} htmlFor={id + "-material-mode"}>식별정보 관리<select id={id + "-material-mode"} aria-label="식별정보 관리" value={materialMode} onChange={event => { setMaterialMode(event.target.value as typeof materialMode); setConfirmed(false); }}><option value="preserve">기존 정보 유지 · 미등록이면 미등록 유지</option><option value="edit">식별정보 등록·수정</option><option value="clear">식별정보 해제 · 원본은 유지</option></select></label>
          {materialMode === "edit" && <div className={styles.materialFields}>
            <label>소재ID<input aria-label="소재ID" autoComplete="off" placeholder="예: CR001" value={assetId} maxLength={32} required onChange={event => { setAssetId(event.target.value); setConfirmed(false); }}/></label>
            <label>소재 버전<input aria-label="소재 버전" autoComplete="off" placeholder="예: v01" value={assetVersion} maxLength={5} required onChange={event => { setAssetVersion(event.target.value); setConfirmed(false); }}/></label>
            <label>소재 관리명<input aria-label="소재 관리명" value={assetName} maxLength={80} required onChange={event => { setAssetName(event.target.value); setConfirmed(false); }}/></label>
            <label>소재 규격 (선택)<input aria-label="소재 규격 (선택)" placeholder="예: 30초 또는 1080x1920" value={assetFormat} maxLength={60} onChange={event => { setAssetFormat(event.target.value); setConfirmed(false); }}/></label>
            <label className={styles.materialFilename}>확인한 소재 파일명 (보고용·선택)<input aria-label="확인한 소재 파일명 (보고용·선택)" placeholder="원본 소재 파일명만 입력 · 경로 제외" value={assetFilename} maxLength={180} onChange={event => { setAssetFilename(event.target.value); setConfirmed(false); }}/></label>
          </div>}
          {materialPreview && <div className={styles.filenamePreview}><span>권장 파일명 예시 · 실제 파일 미변경</span><code>{materialPreview}</code><small>확장자가 없으면 실제 소재 형식에 맞춰 지정해주세요. 같은 소재ID라도 버전이 다르면 별도로 관리합니다.</small></div>}
          {materialMode === "clear" && <p className={styles.warning}>관리용 식별정보만 해제합니다. 등록 소재명·원본 파일·운영보고·명시적 성과 원본 연결은 유지합니다. 해제 후 원본명이 정확히 일치하면 기존 이름 기준 연결이 다시 적용될 수 있습니다.</p>}
          {materialMode === "edit" && <p className={styles.warning}>식별정보 등록 후에는 이름 기준 자동 연결을 사용하지 않습니다. 기존에 이름만으로 연결됐다면 아래 성과 원본을 직접 선택하고 대조해야 합니다. ID나 파일명이 비슷해도 자동으로 합치지 않습니다.</p>}
          <p className={styles.muted}>증빙 원본 파일: {proof.sourceFile || "미제공"} · 증빙 보고서 파일명은 소재 파일명과 별개입니다.</p>
        </section>
        <div className={styles.operationFields}>
          <label htmlFor={id + "-operation"}>보고용 운영상태<select id={id + "-operation"} aria-label="보고용 운영상태" value={operationStatus} onChange={event => { setOperationStatus(event.target.value as typeof operationStatus); setConfirmed(false); }}><option value="">미입력 · 보고용 상태 없음</option>{(["예정", "집행 중", "중단", "종료"] as const).map(status => <option key={status} value={status}>{status}</option>)}</select></label>
          <label htmlFor={id + "-operation-date"}>운영보고 기준일<input id={id + "-operation-date"} aria-label="운영보고 기준일" type="date" value={operationDate} required={Boolean(operationStatus)} disabled={!operationStatus} onChange={event => { setOperationDate(event.target.value); setConfirmed(false); }} /></label>
          <label htmlFor={id + "-operation-note"}>운영보고 메모 (선택)<textarea id={id + "-operation-note"} aria-label="운영보고 메모 (선택)" maxLength={500} rows={2} disabled={!operationStatus} value={operationNote} onChange={event => { setOperationNote(event.target.value); setConfirmed(false); }} /></label>
        </div>
        <p className={styles.warning}>이 설정은 보고용 정보만 수정하며 실제 광고를 시작하거나 중단하지 않습니다. 상태는 날짜나 0 성과로 추정하지 않습니다. 미입력으로 저장하면 기존 보고용 운영상태를 해제합니다.</p>
        <h3 className={styles.subheading}>연결할 성과 원본 선택</h3>
        <label className={styles.choice}><input type="radio" name={`${id}-source`} value="" checked={selectedKey === ""} onChange={() => { setSelectedKey(""); setConfirmed(false); }} /><span><strong>수동 연결 해제</strong><small>수동 연결을 해제해도 등록 소재명과 원본명이 정확히 일치하면 이름 기준 연결이 적용될 수 있습니다.</small></span></label>
        {selectedKey && !selected && <p className={styles.warning}>현재 연결의 원본행은 이 지면의 조회 자료에 없습니다. 운영정보만 저장하면 기존 연결은 그대로 유지합니다. 연결을 바꾸려면 조회된 후보를 선택하거나 수동 연결을 해제해주세요. 현재 연결: {proof.performanceLink?.creative} · {proof.performanceLink?.sourceFamily}</p>}
        {!candidates.length && <p className={styles.muted}>이 지면에 선택할 성과 원본명이 없습니다. 다른 지면의 소재는 후보로 가져오지 않습니다.</p>}
        <div className={styles.choices}>{candidates.map(candidate => <label key={candidate.key} className={styles.choice}><input type="radio" name={`${id}-source`} value={candidate.key} checked={selectedKey === candidate.key} onChange={() => { setSelectedKey(candidate.key); setConfirmed(false); }} /><span><strong>{candidate.tuple.creative}</strong><small>{candidate.tuple.platform} · {candidate.tuple.placement}</small><small>성과 제공일 {candidate.dates.join(", ")}</small><small>보고서 기준일 {candidate.reports.join(", ")} · 원본 {candidate.files.join(", ")}</small><code>원본 계열 {candidate.tuple.sourceFamily}</code></span></label>)}</div>
        <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>소재 식별정보와 보고용 운영정보를 확인했습니다. {selectedKey ? "성과 연결을 새로 선택했다면 원본과 증빙을 대조하여 동일 소재임을 확인했습니다." : "수동 연결 해제와 정확한 이름 기준 연결의 차이를 확인했습니다."} 실제 광고 송출 설정은 변경되지 않습니다.</span></label>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {saved && <p role="status">연결이 저장됐습니다.</p>}
      <div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={onClose}>취소</button><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={blocked || !confirmed || Boolean(selectedKey && !selectedLink)}>{busy ? "저장 중…" : "운영정보·성과 연결 저장"}</button></div>
    </form>
  </section>;
}
