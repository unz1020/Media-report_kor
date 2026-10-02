"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutCanvas, LayoutPanel } from "@/components/layout-canvas";
import { useWorkspace } from "@/components/workspace-context";
import {
  hydratePublishedDailyState,
  publishedDatasetsFor,
  publishedPlacementProofsFor,
  type PublishedDataset,
} from "@/lib/daily-report-store";
import type { PlacementProof, PlacementProofAttachment } from "@/lib/placement-proof";
import { mediaPlansFromDatasets } from "@/lib/reporting-data";
import { canonicalMedia } from "@/lib/media-normalization";
import { PlacementSetupForm } from "@/components/placement-setup-form";
import { landingWithUtm, safeHttpUrl } from "@/lib/placement-urls";
import styles from "./creative.module.css";
import { CreativeUrlPreview } from "@/components/creative-url-preview";
import { MediaPlanLinks } from "@/components/media-plan-links";
import { PROOF_IMAGE_ACCEPT } from "@/lib/proof-image-input";
import { CreativeMarker, CreativeLegend, creativeStyle } from "@/components/creative-marker";
import { mediaHierarchy, mediaPath } from "@/lib/media-hierarchy";

function displayUrl(value = "") {
  try { return safeHttpUrl(value); } catch { return ""; }
}
function finalLanding(proof: PlacementProof) {
  try { return landingWithUtm(proof.landingUrl || "", proof.utm || {}); } catch { return ""; }
}

type ProofRecord = PlacementProof & { proofId?: string; creativeName?: string };

function attachmentUrl(proof: PlacementProof, file: PlacementProofAttachment, download = false) {
  const params = new URLSearchParams({
    messageId: proof.messageId,
    attachmentId: file.attachmentId,
    filename: file.filename,
    mimeType: file.mimeType || "application/octet-stream",
  });
  if (download) params.set("download", "1");
  return `/api/gmail/attachment?${params.toString()}`;
}

function manualImageUrl(proof: PlacementProof) {
  if (!proof.manualImagePath) return "";
  const params = new URLSearchParams({ advertiser: proof.advertiser, path: proof.manualImagePath });
  return `/api/reporting/proof-image?${params.toString()}`;
}

function formatWon(value: number | null) {
  return value === null ? "-" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export default function CreativePage() {
  const { advertiser, month, canEdit, dataSyncState } = useWorkspace();
  const scope = useRef(advertiser + month);
  scope.current = advertiser + month;
  const [editor, setEditor] = useState<{ proof?: ProofRecord; initialFile?: File; selectionId?: string; initial?: { media?: string; placement?: string; creativeName?: string; periodStart?: string; periodEnd?: string } } | null>(null);
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [selectedMedia, setSelectedMedia] = useState("전체");
  const [uploadingKey, setUploadingKey] = useState("");
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    const load = () => {
      setDatasets(publishedDatasetsFor(advertiser, month));
      setProofs(publishedPlacementProofsFor(advertiser, month) as ProofRecord[]);
    };
    load();
    window.addEventListener("media-report-daily-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("media-report-daily-updated", load);
      window.removeEventListener("storage", load);
    };
  }, [advertiser, month]);

  useEffect(() => {
    setSelectedMedia("전체");
    setEditor(null); setUploadError("");
  }, [advertiser, month]);

  const plans = useMemo(() => mediaPlansFromDatasets(datasets), [datasets]);
  const placementCount = useMemo(() => new Set(proofs.map((proof) => `${proof.media}::${proof.placement}`)).size, [proofs]);
  const creativeCount = useMemo(() => proofs.filter((proof) => Boolean(proof.creativeName?.trim())).length, [proofs]);

  const mediaStats = useMemo(() => {
    const stats = new Map<string, { media: string; placementKeys: Set<string>; creativeCount: number; proofCount: number }>();
    for (const proof of proofs) {
      const media = proof.media || "미확인";
      const current = stats.get(media) || { media, placementKeys: new Set<string>(), creativeCount: 0, proofCount: 0 };
      current.placementKeys.add(proof.placement || "미확인");
      if (proof.creativeName?.trim()) current.creativeCount += 1;
      current.proofCount += 1;
      stats.set(media, current);
    }
    return Array.from(stats.values()).sort((a, b) => a.media.localeCompare(b.media, "ko"));
  }, [proofs]);

  useEffect(() => {
    if (selectedMedia !== "전체" && !mediaStats.some((item) => item.media === selectedMedia) && !plans.some(plan => (mediaHierarchy(plan).isTv ? "TV" : canonicalMedia(plan.platform)) === selectedMedia || plan.platform === selectedMedia)) {
      setSelectedMedia("전체");
    }
  }, [mediaStats, plans, selectedMedia]);

  const visibleProofs = useMemo(
    () => selectedMedia === "전체" ? proofs : proofs.filter((proof) => proof.media === selectedMedia),
    [proofs, selectedMedia],
  );

  const groupedProofs = useMemo(() => {
    const byMedia = new Map<string, Map<string, ProofRecord[]>>();
    for (const proof of visibleProofs) {
      const media = proof.media || "미확인";
      const placement = proof.placement || "미확인";
      const placementMap = byMedia.get(media) || new Map<string, ProofRecord[]>();
      const rows = placementMap.get(placement) || [];
      rows.push(proof);
      placementMap.set(placement, rows);
      byMedia.set(media, placementMap);
    }
    return Array.from(byMedia.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ko"))
      .map(([media, placementMap]) => ({
        media,
        placements: Array.from(placementMap.entries())
          .sort(([a], [b]) => a.localeCompare(b, "ko"))
          .map(([placement, rows]) => ({
            placement,
            proofs: rows.sort((a, b) => (a.creativeName || "").localeCompare(b.creativeName || "", "ko")),
          })),
      }));
  }, [visibleProofs]);

  const visiblePlans = useMemo(
    () => plans.filter(plan => (selectedMedia === "전체" || plan.platform === selectedMedia) && !proofs.some(proof => canonicalMedia(proof.media) === canonicalMedia(plan.platform) && proof.placement === (plan.placement || plan.product) && (!plan.creativeName || proof.creativeName === plan.creativeName))),
    [plans, proofs, selectedMedia],
  );

  async function replaceProofImage(proof: ProofRecord, file?: File) {
    if (!file || !canEdit) return;
    const uploadScope = advertiser + month;
    const key = proof.key || proof.proofId || `${proof.messageId}-${proof.placement}-${proof.creativeName || "default"}`;
    setUploadingKey(key);
    setUploadError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("advertiser", proof.advertiser);
      form.set("reportDate", proof.reportDate);
      form.set("sourceFile", proof.sourceFile);
      if (proof.importId) form.set("importId", proof.importId);
      if (proof.publishedAt) form.set("expectedUpdatedAt", proof.publishedAt);
      const response = await fetch("/api/reporting/proof-image", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "이미지 교체에 실패했습니다.");
      if (scope.current === uploadScope) await hydratePublishedDailyState(advertiser, month);
    } catch (error) {
      if (scope.current === uploadScope) setUploadError(error instanceof Error ? error.message : "이미지 교체에 실패했습니다.");
    } finally {
      if (scope.current === uploadScope) setUploadingKey("");
    }
  }

  function proofCard(proof: ProofRecord) {
    const proofKey = proof.key || proof.proofId || `${proof.messageId}-${proof.placement}-${proof.creativeName || "default"}`;
    const image = proof.attachments.find((item) => item.kind === "image");
    const reports = proof.attachments.filter((item) => item.kind === "report");
    const visualUrl = manualImageUrl(proof) || (image ? attachmentUrl(proof, image) : "");
    const uploading = uploadingKey === proofKey;
    const landing = finalLanding(proof);
    const preview = displayUrl(proof.previewUrl);

    return <article className={styles.proofCard} style={creativeStyle(proof.creativeName)} key={proofKey}>
      <div className={styles.visual} tabIndex={canEdit?0:undefined} aria-label={`${proof.creativeName || proof.placement} 이미지 드롭 또는 붙여넣기`} onDragOver={event=>{if(canEdit)event.preventDefault();}} onDrop={event=>{event.preventDefault();if(!canEdit || dataSyncState==='loading')return;const file=event.dataTransfer.files[0];if(file)setEditor({proof,initialFile:file,selectionId:crypto.randomUUID()});}} onPaste={event=>{if(!canEdit || dataSyncState==='loading')return;const file=[...event.clipboardData.items].find(item=>item.kind==='file' && item.type.startsWith('image/'))?.getAsFile();if(file){event.preventDefault();setEditor({proof,initialFile:file,selectionId:crypto.randomUUID()});}}}>
        {visualUrl
          ? <img src={visualUrl} alt={`${proof.placement}${proof.creativeName ? ` ${proof.creativeName}` : ""} 게재 확인 이미지`} />
          : <div className={styles.visualFallback}>이미지·PDF·PPTX를 놓거나 클릭 후 이미지를 붙여넣으세요.</div>}
        <span className={styles.visualBadge}>{proof.status}</span>
        {canEdit && <label className={styles.replaceImageButton}>
          <input
            type="file"
            accept={PROOF_IMAGE_ACCEPT}
            disabled={uploading || dataSyncState === "loading"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if(file && (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size>4*1024*1024))setEditor({proof,initialFile:file,selectionId:crypto.randomUUID()});else void replaceProofImage(proof, file);
              event.currentTarget.value = "";
            }}
          />
          {uploading ? "업로드 중…" : proof.manualImagePath ? "이미지 다시 교체" : "이미지 등록"}
        </label>}
      </div>
      <div className={styles.proofBody}>
        <span className={styles.proofEyebrow}>{proof.status === "게재 확인" ? `${proof.verificationDate || proof.reportDate} 확인` : proof.status} · {proof.serviceType}</span>
        <div className={styles.proofTitle}>
          <h3>{proof.creativeName && <CreativeMarker name={proof.creativeName} />}{proof.creativeName || proof.placement}</h3>
          {proof.creativeName
            ? <span className={styles.creativeBadge}>운영 소재</span>
            : <span className={styles.serviceBadge}>{proof.serviceType}</span>}
        </div>
        <div className={styles.metaGrid}>
          {proof.creativeName && <div><span>게재 지면</span><strong>{proof.placement}</strong></div>}
          <div><span>노출 기간</span><strong>{proof.periodStart || "-"} ~ {proof.periodEnd || "-"}</strong></div>
          <div><span>매체 위치</span><strong>{proof.location || "-"}</strong></div>
          <div><span>방영 시간</span><strong>{proof.airingTime || "-"}</strong></div>
          <div><span>1일 편성</span><strong>{proof.dailyFrequency ? `${proof.dailyFrequency.toLocaleString("ko-KR")}회` : "-"}</strong></div>
          <div><span>소재 길이</span><strong>{proof.durationSec ? `${proof.durationSec}초` : "-"}</strong></div>
          <div><span>캠페인 내용</span><strong>{proof.campaignName || "-"}</strong></div>
        </div>
        {proof.budgetReference !== null && <div className={styles.reference}><strong>연계 집행 기준 {formatWon(proof.budgetReference)}</strong> · 서비스 노출 지면 자체의 별도 집행액으로 계산하지 않습니다.</div>}
        {preview && <CreativeUrlPreview url={preview} label="운영 소재" />}
        {(landing || preview) && <div className={styles.landingLinks}>
          {preview && <a href={preview} target="_blank" rel="noopener noreferrer">매체 미리보기 열기 ↗</a>}
          {landing && <><strong>랜딩 URL · UTM</strong><a href={landing} target="_blank" rel="noopener noreferrer">{landing}</a></>}
        </div>}
        {canEdit && <div className={styles.editActions}><button type="button" className="btn" disabled={uploading || dataSyncState === "loading"} onClick={() => setEditor({ proof })}>지면 · 랜딩 · UTM 수정</button></div>}
        <div className={styles.fileLinks}>
          {reports.map((file) => <a key={file.attachmentId} href={attachmentUrl(proof, file, true)}>{file.filename.replace(/^JBR_자코모_/, "")} ↓</a>)}
        </div>
      </div>
    </article>;
  }

  return <>
    <div className="page-head refined-head">
      <div>
        <div className="eyebrow">소재 · 게재지면</div>
        <h1 className="page-title">{advertiser} 소재 · 게재지면</h1>
        <p className="page-desc">디지털 지면은 미리보기로 사전 세팅하고, 집행 후 게재 확인 자료와 함께 관리합니다.</p>
      </div>
      <div className="page-meta"><span className="view-pill">{month}</span>{canEdit && <button type="button" className="btn primary" disabled={dataSyncState === "loading"} onClick={() => setEditor({})}>지면 수동 등록</button>}</div>
    </div>


    {editor && canEdit && <PlacementSetupForm key={advertiser + month + (editor.proof?.importId || "new") + (editor.initial?.media || "") + (editor.initial?.placement || "") + (editor.initial?.creativeName || "") + (editor.selectionId || "")} {...editor} onClose={() => setEditor(null)} />}
    {uploadError && <div className={styles.uploadError} role="alert">{uploadError}</div>}
<LayoutCanvas page="creative">
    {plans.length > 0 && <LayoutPanel id="creative:plan-urls" title="운영안 소재 URL"><section className="card card-pad"><div className="report-panel-head"><div><h2>운영안 소재 URL</h2><p>운영안별 매체 지면 미리보기와 소재 원본 링크를 등록하고 확인합니다. 일정 화면과 함께 반영됩니다.</p></div></div>
      <div className={styles.planUrlFilters} aria-label="운영안 URL 매체 필터">{['전체',...new Set(plans.map(plan=>mediaHierarchy(plan).isTv?'TV':canonicalMedia(plan.platform)))].map(media=><button type="button" className="btn" key={media} aria-pressed={selectedMedia===media} onClick={()=>setSelectedMedia(media)}>{media}</button>)}</div>
      <CreativeLegend names={plans.map(plan=>plan.creativeName)} /><div className={styles.planUrlGrid}>{plans.filter(plan=>selectedMedia==='전체' || (mediaHierarchy(plan).isTv?'TV':canonicalMedia(plan.platform))===selectedMedia || plan.platform===selectedMedia).map((plan,index)=><article className={styles.planUrlCard} style={creativeStyle(plan.creativeName)} key={`${advertiser}:${month}:${plan.rowId || index}`}><small>{mediaPath(plan)} › {plan.product}</small><h3><CreativeMarker name={plan.creativeName} />{plan.creativeName || plan.placement || '소재명 미입력'}</h3><p>{plan.periodStart || '일정 미입력'} ~ {plan.periodEnd || '일정 미입력'}</p><MediaPlanLinks plan={plan} datasets={datasets} /></article>)}</div>
    </section></LayoutPanel>}
    {!proofs.length && <LayoutPanel id="creative:등록된 지면이 없습니다.:3" title="등록된 지면이 없습니다."><section className="card card-pad empty-state"><h2>등록된 지면이 없습니다.</h2><p>지면 수동 등록에서 보고서 없이도 미리보기 이미지와 랜딩 URL·UTM을 먼저 세팅할 수 있습니다.</p></section></LayoutPanel>}

    {proofs.length > 0 && <LayoutPanel id="creative:등록 지면 · 소재:4" title="등록 지면 · 소재"><section className={styles.proofSection}>
      <div className={styles.sectionHead}>
        <div><h2>등록 지면 · 소재</h2><p>매체 → 게재 지면 → 소재 순서로 확인할 수 있습니다. 같은 지면의 여러 소재는 한 지면 아래에서 묶어 보여줍니다.</p></div>
        <span className={styles.countBadge}>{placementCount}개 지면{creativeCount ? ` · ${creativeCount}개 소재 구분` : ""}</span>
      </div>

      <div className={styles.mediaFilterPanel}>
        <div className={styles.mediaFilterCopy}>
          <strong>매체별 보기</strong>
          <span>매체를 누르면 해당 매체에 등록된 지면과 소재만 표시됩니다.</span>
        </div>
        <div className={styles.mediaTabs}>
          <button type="button" className={selectedMedia === "전체" ? styles.mediaTabActive : styles.mediaTab} onClick={() => setSelectedMedia("전체")}>
            <strong>전체</strong><span>{placementCount}개 지면</span>
          </button>
          {mediaStats.map((item) => <button
            type="button"
            key={item.media}
            className={selectedMedia === item.media ? styles.mediaTabActive : styles.mediaTab}
            onClick={() => setSelectedMedia(item.media)}
          >
            <strong>{item.media}</strong>
            <span>{item.placementKeys.size}개 지면{item.creativeCount ? ` · ${item.creativeCount}개 소재` : ""}</span>
          </button>)}
        </div>
      </div>


      <div className={styles.mediaGroups}>
        {groupedProofs.map((group) => {
          const groupCreativeCount = group.placements.reduce((sum, placement) => sum + placement.proofs.filter((proof) => Boolean(proof.creativeName?.trim())).length, 0);
          return <section className={styles.mediaGroup} key={group.media}>
            <div className={styles.mediaGroupHead}>
              <div><span>매체</span><h3>{group.media}</h3></div>
              <div className={styles.mediaGroupStats}>
                <span>{group.placements.length}개 지면</span>
                {groupCreativeCount > 0 && <span>{groupCreativeCount}개 소재</span>}
              </div>
            </div>

            <div className={styles.placementGroups}>
              {group.placements.map((placementGroup) => {
                const namedCreatives = placementGroup.proofs.filter((proof) => Boolean(proof.creativeName?.trim()));
                return <section className={styles.placementGroup} key={`${group.media}-${placementGroup.placement}`}>
                  <div className={styles.placementGroupHead}>
                    <div><span>게재 지면</span><h4>{placementGroup.placement}</h4></div>
                    <div className={styles.placementGroupStats}>
                      <span>{placementGroup.proofs.length}건 등록</span>
                      {namedCreatives.length > 0 && <strong>{namedCreatives.length}개 소재 운영</strong>}
                    </div>
                  </div>
                  {namedCreatives.length > 0 && <div className={styles.creativeQuickList}>
                    {namedCreatives.map((proof) => <span key={proof.proofId || proof.key || `${proof.messageId}-${proof.creativeName}`} style={creativeStyle(proof.creativeName)}><CreativeMarker name={proof.creativeName} />{proof.creativeName}</span>)}
                  </div>}
                  <div className={styles.proofGrid}>{placementGroup.proofs.map(proofCard)}</div>
                </section>;
              })}
            </div>
          </section>;
        })}
      </div>
    </section></LayoutPanel>}

    <LayoutPanel id="creative:자료 연결 방식:5" title="자료 연결 방식"><section className={`card card-pad ${styles.infoCard}`}>
      <div className="report-panel-head"><div><h2>자료 연결 방식</h2><p>한 보고서에 지면이 여러 개면 지면을 추가하고, 같은 디지털 지면에 여러 소재가 운영되면 소재별 항목을 추가합니다. 소재 · 게재지면 화면에서는 매체를 먼저 선택한 뒤 지면별 소재를 묶어서 확인합니다.</p></div></div>
    </section></LayoutPanel>

    <LayoutPanel id="creative:운영안 기준 연결 대기 지면:6" title="운영안 기준 연결 대기 지면"><section className="card section-space report-panel">
      <div className="report-panel-head"><div><h2>운영안 기준 연결 대기 지면</h2><p>{selectedMedia === "전체" ? "운영안에서 확인됐지만 아직 별도 게재 보고 자료가 연결되지 않은 상품을 관리합니다. 이미지 등록에 이미지·PDF·PPTX를 넣거나, 세팅 추가에서 화면을 붙여넣고 저장하세요." : `${selectedMedia} 운영안에서 아직 게재 보고 자료가 연결되지 않은 상품입니다.`}</p></div><span className="view-pill">{visiblePlans.length}개</span></div>
      {visiblePlans.length ? <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>상품/지면</th><th>기간</th><th>소재명</th><th>소재 유형</th><th>게재 확인</th><th>이미지</th><th>랜딩 URL</th><th>UTM</th>{canEdit && <th>수동 세팅</th>}</tr></thead><tbody>{visiblePlans.map((plan,index)=><tr key={`${plan.platform}-${plan.product}-${index}`}><td><strong>{plan.platform}</strong></td><td>{plan.product || plan.placement}</td><td>{plan.periodStart || "-"} – {plan.periodEnd || "-"}</td><td>{plan.creativeName || "미입력"}</td><td>{plan.creativeType || "-"}</td><td><span className="badge review">연결 대기</span></td><td onDragOver={event=>{if(canEdit)event.preventDefault();}} onDrop={event=>{event.preventDefault();if(!canEdit || dataSyncState==='loading')return;const file=event.dataTransfer.files[0];if(file)setEditor({initialFile:file,selectionId:crypto.randomUUID(),initial:{media:plan.platform,placement:plan.placement || plan.product,creativeName:plan.creativeName || '',periodStart:plan.periodStart || '',periodEnd:plan.periodEnd || ''}});}}>{canEdit ? <label className="btn">이미지 등록<input type="file" aria-label={`${plan.platform} ${plan.product || plan.placement} 이미지 등록`} accept={PROOF_IMAGE_ACCEPT} disabled={dataSyncState === "loading"} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;
        setUploadError("");
        setEditor({ initialFile: file, selectionId: crypto.randomUUID(), initial: { media: plan.platform, placement: plan.placement || plan.product, creativeName: plan.creativeName || "", periodStart: plan.periodStart || "", periodEnd: plan.periodEnd || "" } });
      }} style={{ display: "block", maxWidth: 200, marginTop: 6 }} /></label> : "미등록"}</td><td>미입력</td><td>미입력</td>{canEdit && <td><button type="button" className="btn" disabled={dataSyncState === "loading"} onClick={() => setEditor({ initial: { media: plan.platform, placement: plan.placement || plan.product, creativeName: plan.creativeName || "", periodStart: plan.periodStart || "", periodEnd: plan.periodEnd || "" } })}>세팅 추가</button></td>}</tr>)}</tbody></table></div> : <div className="card-pad empty-inline">{selectedMedia === "전체" ? "운영안 지면 데이터가 아직 연결되지 않았습니다." : `${selectedMedia}의 연결 대기 지면이 없습니다.`}</div>}
    </section></LayoutPanel>
  </LayoutCanvas>
</>;
}
