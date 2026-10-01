"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { hydratePublishedDailyState } from "@/lib/daily-report-store";
import type { PlacementProof } from "@/lib/placement-proof";
import { landingWithUtm, safeHttpUrl, UTM_KEYS } from "@/lib/placement-urls";
import styles from "./placement-setup-form.module.css";

type SavedProof = PlacementProof & { importId: string };
export function PlacementSetupForm({ proof, initial, onClose }: {
  proof?: PlacementProof;
  initial?: { media?: string; placement?: string; periodStart?: string; periodEnd?: string };
  onClose: () => void;
}) {
  const { advertiser, month, canEdit, dataSyncState } = useWorkspace();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [clientId] = useState(() => crypto.randomUUID());
  const [media, setMedia] = useState(proof?.media || initial?.media || "");
  const [placement, setPlacement] = useState(proof?.placement || initial?.placement || "");
  const [creativeName, setCreativeName] = useState(proof?.creativeName || "");
  const [campaignName, setCampaignName] = useState(proof?.campaignName || "");
  const [periodStart, setPeriodStart] = useState(proof?.periodStart || initial?.periodStart || "");
  const [periodEnd, setPeriodEnd] = useState(proof?.periodEnd || initial?.periodEnd || "");
  const [status, setStatus] = useState<PlacementProof["status"]>(proof?.status || "사전 세팅");
  const [verificationDate, setVerificationDate] = useState(proof?.verificationDate || "");
  const [previewUrl, setPreviewUrl] = useState(proof?.previewUrl || "");
  const [landingUrl, setLandingUrl] = useState(proof?.landingUrl || "");
  const [utm, setUtm] = useState<Record<string, string>>(proof?.utm || {});
  const [file, setFile] = useState<File>();
  const [filePreview, setFilePreview] = useState("");
  const [saved, setSaved] = useState<PlacementProof | undefined>(proof);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!file) { setFilePreview(""); return; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const finalUrl = useMemo(() => {
    try { return { value: landingWithUtm(landingUrl, utm), error: "" }; }
    catch (error) { return { value: "", error: error instanceof Error ? error.message : "URL을 확인해주세요." }; }
  }, [landingUrl, utm]);
  const currentImage = saved?.manualImagePath
    ? "/api/reporting/proof-image?" + new URLSearchParams({ advertiser, path: saved.manualImagePath }).toString() : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving || dataSyncState === "loading") return;
    setError(""); setNotice(""); setSaving(true);
    let metadataSaved = false;
    try {
      if (finalUrl.error) throw new Error(finalUrl.error);
      safeHttpUrl(previewUrl);
      if (periodStart && periodEnd && periodStart > periodEnd) throw new Error("운영 종료일을 확인해주세요.");
      if (status === "게재 확인" && !verificationDate) throw new Error("게재 확인일을 입력해주세요.");
      if (file && (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 4 * 1024 * 1024)) {
        throw new Error("PNG, JPG, WEBP 이미지를 4MB 이하로 선택해주세요.");
      }
      const response = await fetch("/api/reporting/store", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_manual_proof", input: {
          advertiser, month, clientId, importId: saved?.importId, expectedUpdatedAt: saved?.publishedAt,
          media, placement, creativeName, campaignName, periodStart, periodEnd, status,
          verificationDate, previewUrl, landingUrl, utm,
        } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error === "PLACEMENT_CHANGED"
        ? "다른 사용자가 수정했습니다. 닫고 새로고침한 뒤 다시 수정해주세요." : payload.error || "저장에 실패했습니다.");
      const next = payload.proof as SavedProof;
      setSaved(next);
      metadataSaved = true;
      if (file) {
        const form = new FormData();
        form.set("file", file); form.set("advertiser", advertiser);
        form.set("reportDate", next.reportDate); form.set("sourceFile", next.sourceFile);
        form.set("importId", next.importId); form.set("expectedUpdatedAt", next.publishedAt || "");
        const imageResponse = await fetch("/api/reporting/proof-image", { method: "POST", body: form });
        const imagePayload = await imageResponse.json();
        if (!imageResponse.ok) throw new Error(imagePayload.error || "이미지 업로드에 실패했습니다.");
        setSaved({ ...next, manualImagePath: imagePayload.path, publishedAt: imagePayload.updatedAt });
        setFile(undefined);
      }
      if (mounted.current) { await hydratePublishedDailyState(advertiser, month); onClose(); }
    } catch (error) {
      setError(error instanceof Error ? error.message : "저장에 실패했습니다.");
      if (metadataSaved && mounted.current) {
        setNotice("지면 정보는 저장됐습니다. 이미지나 동기화 오류를 확인하고 다시 저장해주세요.");
        try { await hydratePublishedDailyState(advertiser, month); } catch { /* 오류 메시지를 유지합니다. */ }
      }
    } finally { setSaving(false); }
  }

  return <section className={styles.panel} aria-label="지면 수동 세팅">
    <div className={styles.head}><div><h2>{proof ? "지면 세팅 수정" : "지면 수동 등록"}</h2><p>{advertiser} · {month} · 미리보기로 먼저 세팅하고, 집행 후 게재 확인 상태로 변경하세요.</p></div><button className="btn" type="button" disabled={saving} onClick={onClose}>닫기</button></div>
    <form onSubmit={submit}>
      <fieldset disabled={saving || !canEdit}>
        <div className={styles.grid}>
          <label>매체<input required maxLength={120} value={media} placeholder="예: 네이버 GFA" onChange={e => setMedia(e.target.value)} /></label>
          <label>상품 / 게재지면<input required maxLength={200} value={placement} placeholder="예: 모바일 피드" onChange={e => setPlacement(e.target.value)} /></label>
          <label>소재명<input maxLength={200} value={creativeName} onChange={e => setCreativeName(e.target.value)} /></label>
          <label>캠페인명<input maxLength={200} value={campaignName} onChange={e => setCampaignName(e.target.value)} /></label>
          <label>운영 시작일<input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></label>
          <label>운영 종료일<input type="date" min={periodStart || undefined} value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></label>
          <label>세팅 상태<select value={status} onChange={e => setStatus(e.target.value as PlacementProof["status"])}><option>사전 세팅</option><option>확인 필요</option><option>게재 확인</option></select></label>
          <label>게재 확인일<input type="date" required={status === "게재 확인"} value={verificationDate} onChange={e => setVerificationDate(e.target.value)} /></label>
          <label className={styles.wide}>매체 미리보기 URL<input type="url" maxLength={4000} value={previewUrl} placeholder="https://" onChange={e => setPreviewUrl(e.target.value)} /></label>
          <label className={styles.wide}>랜딩 URL<input type="url" maxLength={4000} value={landingUrl} placeholder="기존 UTM이 포함된 전체 URL도 입력할 수 있습니다." onChange={e => setLandingUrl(e.target.value)} /></label>
          {UTM_KEYS.map(key => <label key={key}>{key}<input maxLength={500} value={utm[key] || ""} onChange={e => setUtm(current => ({ ...current, [key]: e.target.value }))} /></label>)}
          <label className={styles.wide}>미리보기 / 게재 이미지<input type="file" aria-label="미리보기 / 게재 이미지" accept="image/png,image/jpeg,image/webp" onChange={e => { setFile(e.target.files?.[0]); setError(""); }} /><small>PNG, JPG, WEBP · 최대 4MB</small></label>
        </div>
        {(filePreview || currentImage) && <img className={styles.image} src={filePreview || currentImage} alt="등록할 지면 이미지 미리보기" />}
        {finalUrl.error && <p className={styles.error}>{finalUrl.error}</p>}
        {finalUrl.value && <div className={styles.url}><strong>최종 랜딩 URL</strong><a href={finalUrl.value} target="_blank" rel="noopener noreferrer">{finalUrl.value}</a><small>기존 쿼리와 앵커를 유지하고 입력한 UTM을 적용합니다.</small></div>}
        {notice && <p role="status">{notice}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}><button className="btn" type="button" onClick={onClose}>취소</button><button className="btn primary" type="submit" disabled={Boolean(finalUrl.error) || dataSyncState === "loading"}>{saving ? "저장 중…" : "지면 저장"}</button></div>
      </fieldset>
    </form>
  </section>;
}
