"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { creativeImageUrl } from "@/lib/creative-image";
import { MediaLabel } from '@/components/media-label';
import { LayoutCanvas, LayoutPanel } from "@/components/layout-canvas";
import { useWorkspace } from "@/components/workspace-context";
import {
  publishedDatasetsFor,
  publishedPlacementProofsFor,
  publishedSnapshotsFor,
  type PublishedDataset,
} from "@/lib/daily-report-store";
import type { PlacementProof, PlacementProofAttachment } from "@/lib/placement-proof";
import { mediaPlansFromDatasets, rowsFromDatasets } from "@/lib/reporting-data";
import { buildCreativeRotationReport, type CreativeRotationGroup } from "@/lib/creative-rotation";
import { CreativeLinkEditor } from "@/components/creative-link-editor";
import { PlacementShowroom } from "@/components/placement-showroom";
import { ShowroomBreakdownUpload } from "@/components/showroom-breakdown-upload";
import { breakdownRowsFromDatasets } from "@/lib/showroom-breakdown";
import { canonicalMedia } from "@/lib/media-normalization";
import { PlacementSetupForm } from "@/components/placement-setup-form";
import { landingWithUtm, safeHttpUrl } from "@/lib/placement-urls";
import styles from "./creative.module.css";
import { CreativeUrlPreview } from "@/components/creative-url-preview";
import { MediaPlanLinks } from "@/components/media-plan-links";
import { PROOF_IMAGE_ACCEPT } from "@/lib/proof-image-input";
import { CreativeMarker, CreativeLegend, creativeStyle } from "@/components/creative-marker";
import { mediaHierarchy, mediaPath } from "@/lib/media-hierarchy";
import { ProofImageLightbox, type ProofLightboxImage } from "@/components/proof-image-lightbox";

function displayUrl(value = "") {
  try { return safeHttpUrl(value); } catch { return ""; }
}
function finalLanding(proof: PlacementProof) {
  try { return landingWithUtm(proof.landingUrl || "", proof.utm || {}); } catch { return ""; }
}

type ProofRecord = PlacementProof & { proofId?: string; creativeName?: string };

function PlacementCreativeSwitcher({ proofs, placement, renderProof }: { proofs: ProofRecord[]; placement: string; renderProof: (proof: ProofRecord) => ReactNode }) {
  const [selectedId, setSelectedId] = useState("");
  const keys = proofs.map((proof, index) => `${proof.importId || proof.messageId || 'proof'}:${proof.proofId || proof.key || proof.creativeName || ''}:${index}`);
  const foundIndex = keys.indexOf(selectedId);
  const selectedIndex = foundIndex < 0 ? 0 : foundIndex;
  if (!proofs.length) return null;
  const selectIndex = (index: number) => setSelectedId(keys[index]);
  return <>
    {proofs.length > 1 && <div className={styles.creativeSwitcher} aria-label={`${placement} 소재 전환`}>
      <button type="button" className="btn" disabled={selectedIndex === 0} onClick={() => selectIndex(selectedIndex - 1)}>이전 소재</button>
      <label>소재 선택<select aria-label={`${placement} 소재 선택`} value={keys[selectedIndex]} onChange={event => setSelectedId(event.target.value)}>
        {proofs.map((proof, index) => <option key={keys[index]} value={keys[index]}>{proof.creativeName || `소재명 미입력 ${index + 1}`}</option>)}
      </select></label>
      <span aria-live="polite">{selectedIndex + 1} / {proofs.length}</span>
      <button type="button" className="btn" disabled={selectedIndex === proofs.length - 1} onClick={() => selectIndex(selectedIndex + 1)}>다음 소재</button>
    </div>}
    <div className={styles.proofGrid}>{renderProof(proofs[selectedIndex])}</div>
  </>;
}

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
  const [editor, setEditor] = useState<{ proof?: ProofRecord; imageOnly?: boolean; initialFile?: File; selectionId?: string; initial?: { media?: string; placement?: string; creativeName?: string; periodStart?: string; periodEnd?: string } } | null>(null);
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [snapshots, setSnapshots] = useState<PublishedDataset[]>([]);
  const [loadedScope,setLoadedScope]=useState("");
  const [linkEditor, setLinkEditor] = useState<{proof:PlacementProof;group:CreativeRotationGroup}|null>(null);
  const [selectedMedia, setSelectedMedia] = useState("전체");
  const [imageEntry, setImageEntry] = useState(false);
  const [imageTarget, setImageTarget] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [lightboxImage, setLightboxImage] = useState<ProofLightboxImage | null>(null);

  useEffect(() => {
    const load = () => {
      setDatasets(publishedDatasetsFor(advertiser, month));
      setSnapshots(publishedSnapshotsFor(advertiser, month));
      setLoadedScope(`${advertiser}:${month}`);
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
    setImageEntry(false); setImageTarget("");
    setSelectedMedia("전체");
    setEditor(null); setUploadError(""); setLightboxImage(null); setLinkEditor(null);
  }, [advertiser, month]);

  const plans = useMemo(() => mediaPlansFromDatasets(datasets), [datasets]);
  const showroomRows = useMemo(() => [...rowsFromDatasets(datasets), ...breakdownRowsFromDatasets(datasets)], [datasets]);
  const rotationEnd = useMemo(()=>datasets.map(d=>d.bundle.reportDate).filter(date=>date.startsWith(month)).sort().at(-1)||`${month}-01`,[datasets,month]);
  const rotationReport = useMemo(()=>buildCreativeRotationReport({advertiser,month,datasets:snapshots.length?snapshots:datasets,proofs,plans,placementRows:showroomRows,startDate:`${month}-01`,endDate:rotationEnd}),[advertiser,month,snapshots,datasets,proofs,plans,showroomRows,rotationEnd]);
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

  function proofCard(proof: ProofRecord) {
    const proofKey = proof.key || proof.proofId || `${proof.messageId}-${proof.placement}-${proof.creativeName || "default"}`;
    const image = proof.attachments.find((item) => item.kind === "image");
    const reports = proof.attachments.filter((item) => item.kind === "report");
    const visualUrl = creativeImageUrl(proof) || manualImageUrl(proof) || (image ? attachmentUrl(proof, image) : "");
    const uploading = false;
    const landing = finalLanding(proof);
    const preview = displayUrl(proof.previewUrl);

    return <article className={styles.proofCard} style={creativeStyle(proof.creativeName)} key={proofKey}>
      <div className={styles.visual} tabIndex={canEdit?0:undefined} aria-label={`${proof.creativeName || proof.placement} 이미지 드롭 또는 붙여넣기`} onDragOver={event=>{if(canEdit)event.preventDefault();}} onDrop={event=>{event.preventDefault();if(!canEdit || dataSyncState==='loading')return;const file=event.dataTransfer.files[0];if(event.dataTransfer.files.length!==1){setUploadError("한 번에 한 파일을 넣어주세요.");return;}if(file)setEditor({proof,imageOnly:true,initialFile:file,selectionId:crypto.randomUUID()});}} onPaste={event=>{if(!canEdit || dataSyncState==='loading')return;const images=[...event.clipboardData.items].filter(item=>item.kind==='file' && item.type.startsWith('image/'));if(images.length>1){event.preventDefault();setUploadError('한 번에 한 파일을 넣어주세요.');return;}const file=images[0]?.getAsFile();if(file){event.preventDefault();setEditor({proof,imageOnly:true,initialFile:file,selectionId:crypto.randomUUID()});}}}>
        {visualUrl
          ? <button type="button" className={styles.imageOpenButton}
              aria-label={`${proof.media} ${proof.placement}${proof.creativeName ? ` ${proof.creativeName}` : ""} 이미지 크게 보기`}
              onClick={() => setLightboxImage({ src: visualUrl, title: [proof.media, proof.placement, proof.creativeName].filter(Boolean).join(" · "), description: `${proof.creativeImagePath ? "사용자 등록 소재 · 게재 증빙 아님" : proof.status}${proof.verificationDate ? ` · ${proof.verificationDate} 확인` : ""}` })}>
              <img src={visualUrl} alt={`${proof.placement}${proof.creativeName ? ` ${proof.creativeName}` : ""} ${proof.creativeImagePath ? "사용자 등록 소재 · 게재 증빙 아님" : "게재 확인 이미지"}`} />
              <span className={styles.imageOpenHint}>크게 보기</span>
            </button>
          : <div className={styles.visualFallback}>이미지·PDF·PPTX를 놓거나 클릭 후 이미지를 붙여넣으세요.</div>}
        <span className={styles.visualBadge}>{proof.creativeImagePath ? "사용자 등록 소재 · 게재 증빙 아님" : proof.status}</span>
        {canEdit && <label className={styles.replaceImageButton}>
          <input
            type="file"
            accept={PROOF_IMAGE_ACCEPT}
            disabled={uploading || dataSyncState === "loading"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if(file)setEditor({proof,imageOnly:true,initialFile:file,selectionId:crypto.randomUUID()});
              event.currentTarget.value = "";
            }}
          />
          {uploading ? "업로드 중…" : proof.creativeImagePath ? "소재 이미지 변경" : "소재 이미지 넣기"}
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
          {(manualImageUrl(proof) || image) && <button type="button" className="btn" onClick={() => setLightboxImage({src: manualImageUrl(proof) || attachmentUrl(proof, image!), title: "게재 증빙 원본", description: "기존 원본 자료 · 사용자 등록 소재와 별도"})}>기존 게재 증빙 보기</button>}
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
        <p className="page-desc">공간·채널·앱에서 광고 지면을 탐색하고, 소재·게재 증빙·연결된 성과를 함께 확인합니다.</p>
      </div>
      <div className="page-meta">{canEdit && <button type="button" className="btn primary" onClick={() => {setImageEntry(true);setEditor(null);setImageTarget("");}}>소재 이미지 넣기</button>}<span className="view-pill">{month}</span>{canEdit && <button type="button" className="btn primary" disabled={dataSyncState === "loading"} onClick={() => setEditor({})}>지면 수동 등록</button>}</div>
    </div>


    {imageEntry && canEdit && <section className={styles.imageEntry} aria-label="소재 이미지 등록 대상 선택"><h2>소재 이미지 넣기</h2><p>기존 매체·지면·소재를 직접 선택하거나 새 지면을 등록하세요. 이름이나 이미지로 원본·성과를 자동 매칭하지 않습니다.</p><label>기존 매체 / 지면 / 소재<select value={imageTarget} onChange={event=>{const value=event.target.value;setImageTarget(value);setEditor(value ? {proof:proofs[Number(value)-1],imageOnly:true,selectionId:crypto.randomUUID()} : null);}}><option value="">등록 대상을 선택하세요</option>{proofs.map((proof,index)=><option key={proof.importId || index} value={index+1}>{proof.media} / {proof.placement} / {proof.creativeName || "소재명 미입력"}</option>)}</select></label><button type="button" className="btn" onClick={()=>{setImageTarget("");setEditor({});}}>새 지면 등록 후 이미지 넣기</button><button type="button" className="btn" onClick={()=>{setImageEntry(false);setEditor(null);}}>닫기</button></section>}
    {editor && canEdit && <PlacementSetupForm key={advertiser + month + (editor.proof?.importId || "new") + (editor.initial?.media || "") + (editor.initial?.placement || "") + (editor.initial?.creativeName || "") + (editor.selectionId || "")} {...editor} onClose={() => {setEditor(null);setImageTarget("");}} />}
    {linkEditor && canEdit && <CreativeLinkEditor key={`${advertiser}:${month}:${linkEditor.proof.importId}`} {...linkEditor} onClose={()=>setLinkEditor(null)}/> }
    {uploadError && <div className={styles.uploadError} role="alert">{uploadError}</div>}
<PlacementShowroom key={`${advertiser}:${month}`} proofs={proofs} plans={plans} rows={showroomRows} creativeReport={dataSyncState==="ready"&&loadedScope===`${advertiser}:${month}`?rotationReport:undefined} onEditCreative={canEdit?(proof,group)=>setLinkEditor({proof,group}):undefined} onOpenImage={setLightboxImage} onAddImage={canEdit ? (proof,initialFile)=>setEditor({proof,imageOnly:true,initialFile,selectionId:crypto.randomUUID()}) : undefined} />
    {canEdit && <ShowroomBreakdownUpload key={`breakdown:${advertiser}:${month}`} advertiser={advertiser} month={month} datasets={datasets} disabled={dataSyncState === "loading" || dataSyncState === "saving"} />}
    <details className={styles.management} open><summary><span>관리·원본 자료</span><small>운영안 URL · 등록 지면 · 자료 연결 · 수동 세팅</small></summary>
<LayoutCanvas page="creative">
    {plans.length > 0 && <LayoutPanel id="creative:plan-urls" title="운영안 소재 URL"><section className="card card-pad"><div className="report-panel-head"><div><h2>운영안 소재 URL</h2><p>운영안별 매체 지면 미리보기와 소재 원본 링크를 등록하고 확인합니다. 일정 화면과 함께 반영됩니다.</p></div></div>
      <div className={styles.planUrlFilters} aria-label="운영안 URL 매체 필터">{['전체',...new Set(plans.map(plan=>mediaHierarchy(plan).isTv?'TV':canonicalMedia(plan.platform)))].map(media=><button type="button" className="btn" key={media} aria-pressed={selectedMedia===media} onClick={()=>setSelectedMedia(media)}>{media==="전체"?media:<MediaLabel media={media}/>}</button>)}</div>
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
            <strong><MediaLabel media={item.media}/></strong>
            <span>{item.placementKeys.size}개 지면{item.creativeCount ? ` · ${item.creativeCount}개 소재` : ""}</span>
          </button>)}
        </div>
      </div>


      <div className={styles.mediaGroups}>
        {groupedProofs.map((group) => {
          const groupCreativeCount = group.placements.reduce((sum, placement) => sum + placement.proofs.filter((proof) => Boolean(proof.creativeName?.trim())).length, 0);
          return <section className={styles.mediaGroup} key={group.media}>
            <div className={styles.mediaGroupHead}>
              <div><span>매체</span><h3><MediaLabel media={group.media} size="md"/></h3></div>
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
                  <PlacementCreativeSwitcher key={`${advertiser}:${month}:${group.media}:${placementGroup.placement}`} placement={placementGroup.placement} proofs={placementGroup.proofs} renderProof={proofCard} />
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
      {visiblePlans.length ? <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>상품/지면</th><th>기간</th><th>소재명</th><th>소재 유형</th><th>게재 확인</th><th>이미지</th><th>랜딩 URL</th><th>UTM</th>{canEdit && <th>수동 세팅</th>}</tr></thead><tbody>{visiblePlans.map((plan,index)=><tr key={`${plan.platform}-${plan.product}-${index}`}><td><strong><MediaLabel media={plan.platform}/></strong></td><td>{plan.product || plan.placement}</td><td>{plan.periodStart || "-"} – {plan.periodEnd || "-"}</td><td>{plan.creativeName || "미입력"}</td><td>{plan.creativeType || "-"}</td><td><span className="badge review">연결 대기</span></td><td onDragOver={event=>{if(canEdit)event.preventDefault();}} onDrop={event=>{event.preventDefault();if(!canEdit || dataSyncState==='loading')return;const file=event.dataTransfer.files[0];if(event.dataTransfer.files.length!==1){setUploadError('한 번에 한 파일을 넣어주세요.');return;}if(file)setEditor({initialFile:file,selectionId:crypto.randomUUID(),initial:{media:plan.platform,placement:plan.placement || plan.product,creativeName:plan.creativeName || '',periodStart:plan.periodStart || '',periodEnd:plan.periodEnd || ''}});}}>{canEdit ? <label className="btn">이미지 등록<input type="file" aria-label={`${plan.platform} ${plan.product || plan.placement} 이미지 등록`} accept={PROOF_IMAGE_ACCEPT} disabled={dataSyncState === "loading"} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;
        setUploadError("");
        setEditor({ initialFile: file, selectionId: crypto.randomUUID(), initial: { media: plan.platform, placement: plan.placement || plan.product, creativeName: plan.creativeName || "", periodStart: plan.periodStart || "", periodEnd: plan.periodEnd || "" } });
      }} style={{ display: "block", maxWidth: 200, marginTop: 6 }} /></label> : "미등록"}</td><td>미입력</td><td>미입력</td>{canEdit && <td><button type="button" className="btn" disabled={dataSyncState === "loading"} onClick={() => setEditor({ initial: { media: plan.platform, placement: plan.placement || plan.product, creativeName: plan.creativeName || "", periodStart: plan.periodStart || "", periodEnd: plan.periodEnd || "" } })}>세팅 추가</button></td>}</tr>)}</tbody></table></div> : <div className="card-pad empty-inline">{selectedMedia === "전체" ? "운영안 지면 데이터가 아직 연결되지 않았습니다." : `${selectedMedia}의 연결 대기 지면이 없습니다.`}</div>}
    </section></LayoutPanel>
  </LayoutCanvas>
    </details>
  {lightboxImage && <ProofImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />}
</>;
}
