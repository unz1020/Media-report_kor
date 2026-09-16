"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import {
  hydratePublishedDailyState,
  publishedDatasetsFor,
  publishedPlacementProofsFor,
  type PublishedDataset,
} from "@/lib/daily-report-store";
import type { PlacementProof, PlacementProofAttachment } from "@/lib/placement-proof";
import { mediaPlansFromDatasets } from "@/lib/reporting-data";
import styles from "./creative.module.css";

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
  const { advertiser, month } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
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

  const plans = useMemo(() => mediaPlansFromDatasets(datasets), [datasets]);
  const placementCount = useMemo(() => new Set(proofs.map((proof) => `${proof.media}::${proof.placement}`)).size, [proofs]);
  const creativeCount = useMemo(() => proofs.filter((proof) => Boolean(proof.creativeName?.trim())).length, [proofs]);

  async function replaceProofImage(proof: ProofRecord, file?: File) {
    if (!file) return;
    const key = proof.key || proof.proofId || `${proof.messageId}-${proof.placement}-${proof.creativeName || "default"}`;
    setUploadingKey(key);
    setUploadError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("advertiser", proof.advertiser);
      form.set("reportDate", proof.reportDate);
      form.set("sourceFile", proof.sourceFile);
      const response = await fetch("/api/reporting/proof-image", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "이미지 교체에 실패했습니다.");
      await hydratePublishedDailyState(advertiser, month);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "이미지 교체에 실패했습니다.");
    } finally {
      setUploadingKey("");
    }
  }

  return <>
    <div className="page-head refined-head">
      <div>
        <div className="eyebrow">소재 · 게재지면</div>
        <h1 className="page-title">{advertiser} 게재 확인</h1>
        <p className="page-desc">게재 지면 단위로 확인하고, 디지털 매체에서 같은 지면에 여러 소재가 운영되면 소재명을 별도로 구분해 관리합니다.</p>
      </div>
      <div className="page-meta"><span className="view-pill">{month}</span></div>
    </div>

    {proofs.length > 0 && <section className={styles.proofSection}>
      <div className={styles.sectionHead}>
        <div><h2>게재 확인 완료</h2><p>같은 지면이어도 소재가 다르면 별도 카드로 구분됩니다. 각 카드의 왼쪽 이미지는 개별 교체할 수 있습니다.</p></div>
        <span className={styles.countBadge}>{placementCount}개 지면{creativeCount ? ` · ${creativeCount}개 소재 구분` : ""}</span>
      </div>
      {uploadError && <div className={styles.uploadError}>{uploadError}</div>}
      <div className={styles.proofGrid}>
        {proofs.map((proof) => {
          const proofKey = proof.key || proof.proofId || `${proof.messageId}-${proof.placement}-${proof.creativeName || "default"}`;
          const image = proof.attachments.find((item) => item.kind === "image");
          const reports = proof.attachments.filter((item) => item.kind === "report");
          const visualUrl = manualImageUrl(proof) || (image ? attachmentUrl(proof, image) : "");
          const uploading = uploadingKey === proofKey;
          return <article className={styles.proofCard} key={proofKey}>
            <div className={styles.visual}>
              {visualUrl
                ? <img src={visualUrl} alt={`${proof.placement}${proof.creativeName ? ` ${proof.creativeName}` : ""} 게재 확인 이미지`} />
                : <div className={styles.visualFallback}>게재 사진을 등록해주세요.</div>}
              <span className={styles.visualBadge}>{proof.status}</span>
              <label className={styles.replaceImageButton}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    void replaceProofImage(proof, file);
                    event.currentTarget.value = "";
                  }}
                />
                {uploading ? "업로드 중…" : proof.manualImagePath ? "게재 사진 다시 교체" : "게재 사진 교체"}
              </label>
            </div>
            <div className={styles.proofBody}>
              <span className={styles.proofEyebrow}>{proof.media} · {proof.verificationDate} 확인</span>
              <div className={styles.proofTitle}>
                <h3>{proof.placement}</h3>
                <span className={styles.serviceBadge}>{proof.serviceType}</span>
                {proof.creativeName && <span className={styles.creativeBadge}>소재 · {proof.creativeName}</span>}
              </div>
              <div className={styles.metaGrid}>
                <div><span>노출 기간</span><strong>{proof.periodStart || "-"} ~ {proof.periodEnd || "-"}</strong></div>
                <div><span>매체 위치</span><strong>{proof.location || "-"}</strong></div>
                <div><span>방영 시간</span><strong>{proof.airingTime || "-"}</strong></div>
                <div><span>1일 편성</span><strong>{proof.dailyFrequency ? `${proof.dailyFrequency.toLocaleString("ko-KR")}회` : "-"}</strong></div>
                <div><span>소재 길이</span><strong>{proof.durationSec ? `${proof.durationSec}초` : "-"}</strong></div>
                <div><span>캠페인 내용</span><strong>{proof.campaignName || "-"}</strong></div>
                {proof.creativeName && <div><span>운영 소재</span><strong>{proof.creativeName}</strong></div>}
              </div>
              {proof.budgetReference !== null && <div className={styles.reference}><strong>연계 집행 기준 {formatWon(proof.budgetReference)}</strong> · 서비스 노출 지면 자체의 별도 집행액으로 계산하지 않습니다.</div>}
              <div className={styles.fileLinks}>
                {reports.map((file) => <a key={file.attachmentId} href={attachmentUrl(proof, file, true)}>{file.filename.replace(/^JBR_자코모_/, "")} ↓</a>)}
              </div>
            </div>
          </article>;
        })}
      </div>
    </section>}

    <section className={`card card-pad ${styles.infoCard}`}>
      <div className="report-panel-head"><div><h2>자료 연결 방식</h2><p>한 보고서에 지면이 여러 개면 데이터 업데이트에서 지면을 추가하고, 같은 디지털 지면에 여러 소재가 운영되면 소재별 항목을 추가합니다. 각 항목은 게재 사진도 개별 관리됩니다.</p></div></div>
    </section>

    <section className="card section-space report-panel">
      <div className="report-panel-head"><div><h2>운영안 기준 연결 대기 지면</h2><p>운영안에서 확인됐지만 아직 별도 게재 보고 자료가 연결되지 않은 상품을 관리합니다.</p></div><span className="view-pill">{plans.length}개</span></div>
      {plans.length ? <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>상품/지면</th><th>기간</th><th>소재 유형</th><th>게재 확인</th><th>랜딩 URL</th><th>UTM</th></tr></thead><tbody>{plans.map((plan,index)=><tr key={`${plan.platform}-${plan.product}-${index}`}><td><strong>{plan.platform}</strong></td><td>{plan.product || plan.placement}</td><td>{plan.periodStart || "-"} – {plan.periodEnd || "-"}</td><td>{plan.creativeType || "-"}</td><td><span className="badge review">연결 대기</span></td><td>데이터 없음</td><td>데이터 없음</td></tr>)}</tbody></table></div> : <div className="card-pad empty-inline">운영안 지면 데이터가 아직 연결되지 않았습니다.</div>}
    </section>
  </>;
}
