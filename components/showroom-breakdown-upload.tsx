"use client";

import { useRef, useState } from "react";
import type { PublishedDataset } from "@/lib/daily-report-store";
import { publishDailyBundles, publishedDatasetsFor } from "@/lib/daily-report-store";
import type { DailyBundlePreview } from "@/lib/daily-report-parser";
import { canonicalMedia } from "@/lib/media-normalization";
import { parseShowroomBreakdown, type ShowroomBreakdown } from "@/lib/showroom-breakdown";
import styles from "./showroom-breakdown-upload.module.css";

/** Optional, reviewed enrichment. Original totals, daily facts and media plans are never replaced. */
export function ShowroomBreakdownUpload({ advertiser, month, datasets, disabled }: { advertiser: string; month: string; datasets: PublishedDataset[]; disabled: boolean }) {
  const [draft, setDraft] = useState<{ breakdown: ShowroomBreakdown; baseline: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scope = useRef(advertiser + month); scope.current = advertiser + month;
  function aggregate(items: PublishedDataset[]) {
    return items.flatMap(dataset => dataset.bundle.placements.filter(row => canonicalMedia(row.platform) === "애드부스트스크린").map(row => ({ dataset, row })))
      .sort((a,b) => b.dataset.bundle.reportDate.localeCompare(a.dataset.bundle.reportDate))[0];
  }
  function signature(item: NonNullable<ReturnType<typeof aggregate>>) {return JSON.stringify([item.dataset.key,item.dataset.bundle.reportDate,item.row.spend,item.row.impressions]);}
  async function inspect(file?: File) {
    if (!file || disabled || busy) return;
    setError(""); setNotice(""); setDraft(null); setBusy(true); const currentScope=scope.current;
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 10*1024*1024) throw new Error("10MB 이하 XLSX 원본을 선택해주세요.");
      const base=aggregate(datasets);
      if (!base || base.row.spend == null) throw new Error("먼저 해당 월의 애드부스트 패키지 성과를 연결해주세요.");
      const breakdown=parseShowroomBreakdown(await file.arrayBuffer(),file.name,{month,reportDate:base.dataset.bundle.reportDate,expectedSpend:base.row.spend,expectedImpressions:base.row.impressions});
      if(scope.current===currentScope)setDraft({breakdown,baseline:signature(base)});
    } catch (err) {if(scope.current===currentScope)setError(err instanceof Error?err.message:"세부 성과를 읽지 못했습니다.");}
    finally {if(scope.current===currentScope)setBusy(false);}
  }
  async function save() {
    if(!draft || disabled || busy)return;
    const currentScope=scope.current;setBusy(true);setError("");
    try {
      const latest=aggregate(publishedDatasetsFor(advertiser,month));
      if(!latest || signature(latest)!==draft.baseline)throw new Error("패키지 성과가 변경됐습니다. 원본을 다시 선택해 검수해주세요.");
      const bundle: DailyBundlePreview & {sourceKind:string;sourceId:string;showroomBreakdown:ShowroomBreakdown}={
        advertiser,reportDate:draft.breakdown.reportDate,campaignStart:`${month}-01`,campaignEnd:latest.dataset.bundle.campaignEnd,sourceFile:`[지면별 성과] ${draft.breakdown.sourceFile}`,
        sourceKind:"showroom_breakdown",sourceId:`showroom-breakdown:${advertiser}:${month}`,showroomBreakdown:draft.breakdown,
        placements:[],dailyPerformance:[],creativeDailyPerformance:[],mediaPlan:[],parsedSheets:[],ignoredSheets:[],mailChecks:[],operationNotes:[],qa:{matchedMailMetrics:0,mismatchedMailMetrics:0,unmatchedMailMetrics:0,ignoredSheetCount:0},
      };
      const ok=await publishDailyBundles([{bundle,mailSubject:"지면별 성과 검수 연결",sourceType:"manual_excel"}]);
      if(!ok)throw new Error("세부 성과 저장을 완료하지 못했습니다. 동기화 상태를 확인해주세요.");
      if(scope.current===currentScope){setDraft(null);setNotice("세부 성과를 연결했습니다. 기존 패키지 합계·일별 실적·운영안은 변경하지 않았습니다.");}
    }catch(err){if(scope.current===currentScope)setError(err instanceof Error?err.message:"저장하지 못했습니다.");}
    finally{if(scope.current===currentScope)setBusy(false);}
  }
  return <details className={styles.upload}><summary>애드부스트 지면별 성과 연결 <span>원본 대조 · 합계 유지</span></summary><p>현재 패키지 합계와 동일 기준일의 XLSX에서 영화관·LED·서비스 지면을 읽습니다. 유료 비용과 서비스 포함 원본 Impression 합계가 일치할 때만 연결할 수 있습니다.</p><label className={styles.file}>성과 원본 선택<input type="file" aria-label="애드부스트 지면별 성과 원본" accept=".xlsx" disabled={disabled||busy} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";void inspect(file);}}/></label>{busy&&<p role="status">원본 대조·연결 중입니다.</p>}{error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}{draft&&<div className={styles.review}><h3>세부 성과 검수 · {draft.breakdown.reportDate} 기준</h3><div className={styles.table}><table><thead><tr><th>원본 지면</th><th>원본 비용</th><th>원본 Impression</th><th>유동인구</th></tr></thead><tbody>{draft.breakdown.rows.map(row=><tr key={row.placement}><td>{row.placement}</td><td>{row.spend==null?"미제공":Math.round(row.spend).toLocaleString("ko-KR")}</td><td>{row.impressions.toLocaleString("ko-KR")}</td><td>{row.footTraffic==null?"미제공":row.footTraffic.toLocaleString("ko-KR")}</td></tr>)}</tbody></table></div><p>패키지 유료 집행액 {Math.round(draft.breakdown.paidSpend).toLocaleString("ko-KR")}원 · 서비스 포함 원본 Impression {draft.breakdown.reportedCount.toLocaleString("ko-KR")} 대조 완료</p><p>저장하면 쇼룸 전용 세부 성과만 추가합니다. 대시보드 합계에 중복 가산하지 않으며, 원본 파일 자체는 업로드하지 않습니다.</p><div className={styles.actions}><button type="button" onClick={()=>setDraft(null)} disabled={busy}>취소</button><button type="button" onClick={()=>void save()} disabled={busy||disabled}>검수한 세부 성과 저장</button></div></div>}</details>;
}
