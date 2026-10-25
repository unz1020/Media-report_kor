"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useWorkspace } from "./workspace-context";
import { hydratePublishedDailyState } from "@/lib/daily-report-store";
import type { CreativeRotationGroup } from "@/lib/creative-rotation";
import type { PlacementProof, CreativePerformanceLink } from "@/lib/placement-proof";
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
    const operation = operationStatus ? { status: operationStatus, asOf: operationDate, ...(operationNote.trim() ? { note: operationNote.trim() } : {}) } : null;
    const scope = { advertiser, month, importId: proof.importId, updatedAt: proof.publishedAt };
    const current = () => mounted.current && live.current.advertiser === scope.advertiser && live.current.month === scope.month && live.current.importId === scope.importId && live.current.updatedAt === scope.updatedAt && live.current.canEdit;
    const controller = new AbortController(); request.current = controller; pending.current = true;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/reporting/store", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ action: "save_creative_link", input: { advertiser, month, importId: proof.importId, expectedUpdatedAt: proof.publishedAt, performanceLink: selectedLink || null, operation } }),
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
        <div className={styles.operationFields}>
          <label htmlFor={id + "-operation"}>보고용 운영상태<select id={id + "-operation"} value={operationStatus} onChange={event => { setOperationStatus(event.target.value as typeof operationStatus); setConfirmed(false); }}><option value="">미입력 · 보고용 상태 없음</option>{(["예정", "집행 중", "중단", "종료"] as const).map(status => <option key={status} value={status}>{status}</option>)}</select></label>
          <label htmlFor={id + "-operation-date"}>운영보고 기준일<input id={id + "-operation-date"} type="date" value={operationDate} required={Boolean(operationStatus)} disabled={!operationStatus} onChange={event => { setOperationDate(event.target.value); setConfirmed(false); }} /></label>
          <label htmlFor={id + "-operation-note"}>운영보고 메모 (선택)<textarea id={id + "-operation-note"} maxLength={500} rows={2} disabled={!operationStatus} value={operationNote} onChange={event => { setOperationNote(event.target.value); setConfirmed(false); }} /></label>
        </div>
        <p className={styles.warning}>이 설정은 보고용 정보만 수정하며 실제 광고를 시작하거나 중단하지 않습니다. 상태는 날짜나 0 성과로 추정하지 않습니다. 미입력으로 저장하면 기존 보고용 운영상태를 해제합니다.</p>
        <h3 className={styles.subheading}>연결할 성과 원본 선택</h3>
        <label className={styles.choice}><input type="radio" name={`${id}-source`} value="" checked={selectedKey === ""} onChange={() => { setSelectedKey(""); setConfirmed(false); }} /><span><strong>수동 연결 해제</strong><small>수동 연결을 해제해도 등록 소재명과 원본명이 정확히 일치하면 이름 기준 연결이 적용될 수 있습니다.</small></span></label>
        {selectedKey && !selected && <p className={styles.warning}>현재 연결의 원본행은 이 지면의 조회 자료에 없습니다. 운영정보만 저장하면 기존 연결은 그대로 유지합니다. 연결을 바꾸려면 조회된 후보를 선택하거나 수동 연결을 해제해주세요. 현재 연결: {proof.performanceLink?.creative} · {proof.performanceLink?.sourceFamily}</p>}
        {!candidates.length && <p className={styles.muted}>이 지면에 선택할 성과 원본명이 없습니다. 다른 지면의 소재는 후보로 가져오지 않습니다.</p>}
        <div className={styles.choices}>{candidates.map(candidate => <label key={candidate.key} className={styles.choice}><input type="radio" name={`${id}-source`} value={candidate.key} checked={selectedKey === candidate.key} onChange={() => { setSelectedKey(candidate.key); setConfirmed(false); }} /><span><strong>{candidate.tuple.creative}</strong><small>{candidate.tuple.platform} · {candidate.tuple.placement}</small><small>성과 제공일 {candidate.dates.join(", ")}</small><small>보고서 기준일 {candidate.reports.join(", ")} · 원본 {candidate.files.join(", ")}</small><code>원본 계열 {candidate.tuple.sourceFamily}</code></span></label>)}</div>
        <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>보고용 운영정보를 확인했습니다. {selectedKey ? "성과 연결을 새로 선택했다면 원본과 증빙을 대조하여 동일 소재임을 확인했습니다." : "수동 연결 해제와 정확한 이름 기준 연결의 차이를 확인했습니다."} 실제 광고 송출 설정은 변경되지 않습니다.</span></label>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {saved && <p role="status">연결이 저장됐습니다.</p>}
      <div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={onClose}>취소</button><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={blocked || !confirmed || Boolean(selectedKey && !selectedLink)}>{busy ? "저장 중…" : "운영정보·성과 연결 저장"}</button></div>
    </form>
  </section>;
}
