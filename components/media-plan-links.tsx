"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useWorkspace } from "./workspace-context";
import { hydratePublishedDailyState, type PublishedDataset } from "@/lib/daily-report-store";
import { latestMediaMix, mediaPlansFromDatasets } from "@/lib/reporting-data";
import type { MediaPlanFact } from "@/lib/daily-report-parser";
import type { WorkbookReview } from "@/lib/media-mix-operations";
import { normalizeMediaMix } from "@/supabase/functions/reporting-store/media-plan-input";
import { CreativeUrlPreview } from "./creative-url-preview";
import styles from "./creative-url-preview.module.css";
export function MediaPlanLinks({ plan, datasets }: { plan: MediaPlanFact; datasets: PublishedDataset[] }) {
  const { canEdit, dataSyncState } = useWorkspace();
  const [snapshot, setSnapshot] = useState<PublishedDataset[] | null>(null);
  return <div>
    <CreativeUrlPreview url={plan.previewUrl} label="매체 지면 미리보기" />
    <CreativeUrlPreview url={plan.creativeUrl} label="운영 소재" />
    {!plan.previewUrl && !plan.creativeUrl && <p>운영 소재 또는 매체 지면 미리보기 URL을 등록해주세요.</p>}
    {canEdit && !snapshot && <button type="button" className="btn" disabled={dataSyncState !== "ready"} onClick={() => setSnapshot(datasets)}>소재 URL {plan.previewUrl || plan.creativeUrl ? "수정" : "등록"}</button>}
    {snapshot && canEdit && <LinksEditor plan={plan} datasets={snapshot} onClose={() => setSnapshot(null)} />}
  </div>;
}
function LinksEditor({ plan, datasets, onClose }: { plan: MediaPlanFact; datasets: PublishedDataset[]; onClose: () => void }) {
  const { advertiser, month, canEdit, dataSyncState } = useWorkspace();
  const [previewUrl, setPreviewUrl] = useState(plan.previewUrl || ""), [creativeUrl, setCreativeUrl] = useState(plan.creativeUrl || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || busy || dataSyncState !== "ready") return;
    setError(""); setBusy(true);
    try {
      const saved = latestMediaMix(datasets);
      const rows = mediaPlansFromDatasets(datasets);
      const matches = rows.map((row, index) => ({ row, index })).filter(({ row }) => plan.rowId ? row.rowId === plan.rowId : (['platform', 'product', 'placement', 'creativeName', 'device', 'periodStart', 'periodEnd', 'sourceSheet'] as const).every(field => (row[field] || '') === (plan[field] || '')));
      if (matches.length !== 1) throw new Error("운영안을 하나로 구분할 수 없습니다. 미디어믹스에서 해당 행을 수정해주세요.");
      const index = matches[0].index;
      const bundle = saved?.bundle as (PublishedDataset['bundle'] & { originalSourceFile?: string; mediaMixSourceReview?: WorkbookReview }) | undefined;
      const input = normalizeMediaMix({ month, rows: rows.map((row, at) => ({ ...row, rowId: row.rowId || crypto.randomUUID(), ...(at === index ? { previewUrl, creativeUrl } : {}) })), expectedUpdatedAt: saved?.publishedAt || null, sourceFile: bundle?.originalSourceFile || "운영안 소재 URL 수정", sourceReview: bundle?.mediaMixSourceReview, changeMemo: `${plan.platform} · ${plan.creativeName || plan.product} 소재 URL 수정` });
      const response = await fetch("/api/reporting/store", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_media_mix", input: { ...input, advertiser } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "MEDIA_MIX_CHANGED" ? "다른 사용자가 운영안을 수정했습니다. 입력 내용을 보관하고 취소 후 다시 불러와주세요." : result.error || "URL 저장 실패");
      if (mounted.current) {
        await hydratePublishedDailyState(advertiser, month);
        if (mounted.current) onClose();
      }
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "URL 저장 실패"); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <form className={styles.form} aria-label="운영안 소재 URL 편집" onSubmit={save}>
    <label>매체 지면 미리보기 URL<input type="url" maxLength={4000} value={previewUrl} disabled={busy} onChange={e => setPreviewUrl(e.target.value)} placeholder="매체에서 제공한 지면 미리보기 링크" /></label>
    <label>운영 소재 URL<input type="url" maxLength={4000} value={creativeUrl} disabled={busy} onChange={e => setCreativeUrl(e.target.value)} placeholder="유튜브·틱톡 영상 또는 소재 원본 링크" /></label>
    <CreativeUrlPreview url={previewUrl} label="매체 지면 미리보기" /><CreativeUrlPreview url={creativeUrl} label="운영 소재" />
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}><button type="button" className="btn" disabled={busy} onClick={onClose}>취소</button><button type="submit" className="btn primary" disabled={busy || dataSyncState !== "ready"}>{busy ? "저장 중…" : "소재 URL 저장"}</button></div>
  </form>;
}
