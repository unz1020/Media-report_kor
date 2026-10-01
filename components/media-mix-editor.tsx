"use client";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./workspace-context";
import { hydratePublishedDailyState, publishedDatasetsFor, type PublishedDataset } from "@/lib/daily-report-store";
import { latestMediaMix, mediaPlansFromDatasets, formatKrw } from "@/lib/reporting-data";
import type { MediaPlanFact } from "@/lib/daily-report-parser";
import { normalizeMediaMix } from "@/supabase/functions/reporting-store/media-plan-input";
import styles from "./media-mix-editor.module.css";

function emptyRow(): MediaPlanFact {
  return { platform: "", product: "", placement: "", creativeName: "", creativeType: "", device: "", periodStart: "", periodEnd: "",
    budget: null, expectedImpressions: null, expectedClicks: null, target: "", sourceSheet: "직접 입력", operationStatus: "예정" };
}
export function MediaMixEditor() {
  const { advertiser, month } = useWorkspace();
  return <Editor key={advertiser + month} />;
}
function Editor() {
  const { advertiser, month, canEdit, dataSyncState, refreshSession } = useWorkspace();
  const [datasets,setDatasets] = useState<PublishedDataset[]>([]);
  const [draft,setDraft] = useState<MediaPlanFact[] | null>(null);
  const [version,setVersion] = useState<string | null>(null);
  const [sourceFile,setSourceFile] = useState("직접 입력");
  const [busy,setBusy] = useState(false), [error,setError] = useState(""), [notice,setNotice] = useState("");
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; const load = () => setDatasets(publishedDatasetsFor(advertiser,month)); load();
    window.addEventListener("media-report-daily-updated",load);
    return () => { mounted.current = false; window.removeEventListener("media-report-daily-updated",load); };
  },[advertiser,month]);
  const saved = latestMediaMix(datasets), plans = mediaPlansFromDatasets(datasets);
  function begin() { setDraft(plans.length ? plans.map(row => ({...row})) : [emptyRow()]); setVersion(saved?.publishedAt || null); setSourceFile((saved?.bundle as { originalSourceFile?: string })?.originalSourceFile || "직접 입력"); setError(""); setNotice(""); }
  function patch(index: number, field: keyof MediaPlanFact, value: string) {
    const numeric = ["budget","expectedImpressions","expectedClicks"].includes(field);
    setDraft(current => current?.map((row,i) => i === index ? { ...row, [field]: numeric ? value === "" ? null : Number(value) : value } : row) ?? null);
  }
  async function importFile(file: File) {
    setBusy(true); setError("");
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("미디어믹스 파일은 8MB 이하로 올려주세요.");
      if (!/\.(xlsx|xls|xlsb|csv)$/i.test(file.name)) throw new Error("Excel 또는 CSV 파일을 선택해주세요.");
      const parser = await import("@/lib/media-mix-workbook");
      const rows = parser.parseMediaMixWorkbook(await file.arrayBuffer(),month);
      if (rows.length > 500) throw new Error("미디어믹스는 최대 500행까지 지원합니다.");
      if (!mounted.current) return;
      setDraft(rows); setSourceFile(file.name); setNotice(`${rows.length}행을 불러왔습니다. 광고주·월·기간·예산을 검수한 뒤 저장해주세요.`);
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "파일 분석 실패"); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function save() {
    if (!draft || !canEdit || busy) return;
    setError(""); setNotice("");
    let input;
    try { input = normalizeMediaMix({ month, rows: draft, expectedUpdatedAt: version, sourceFile }); }
    catch (error) { setError(error instanceof Error ? error.message : "입력값을 확인해주세요."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/reporting/store", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({action:"save_media_mix",input:{...input,advertiser}}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "MEDIA_MIX_CHANGED" ? "다른 사용자가 미디어믹스를 변경했습니다. 입력 내용을 보관하고 취소 후 다시 불러와주세요." : result.error || "미디어믹스 저장 실패");
      if (!mounted.current) return;
      setDraft(null); setNotice(`${month} 미디어믹스를 저장했습니다. 개요·일정·연결 대기 지면에 반영됩니다.`);
      try { await hydratePublishedDailyState(advertiser,month); await refreshSession(); }
      catch { if (mounted.current) setError("저장은 완료됐습니다. 새로고침해 반영 내용을 확인해주세요."); }
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "저장 실패"); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section className={`card card-pad ${styles.editor}`} aria-label="월 미디어믹스 업데이트">
    <div className={styles.head}><div><h2>{month} 미디어믹스</h2><p>{advertiser} · {plans.length}개 운영안 · 계획 예산 {formatKrw(plans.some(row=>row.budget != null) ? plans.reduce((sum,row)=>sum+(row.budget || 0),0) : null)}</p></div>
      {!draft && canEdit && <button type="button" className="btn primary" disabled={dataSyncState !== "ready"} onClick={begin}>미디어믹스 업데이트</button>}
    </div>
    <p>월별 Excel을 불러오거나 직접 입력하세요. 저장한 최신 운영안을 공유하며 이전 변경 이력은 보존합니다.</p>
    {saved && <small>마지막 반영: {new Date(saved.publishedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</small>}
    {draft && canEdit && <>
      <div className={styles.actions}><label className="btn">Excel 불러오기<input aria-label="미디어믹스 Excel" type="file" accept=".xlsx,.xls,.xlsb,.csv" disabled={busy} onChange={event=>{const file=event.target.files?.[0]; if(file) void importFile(file); event.target.value="";}} /></label>
        <button type="button" className="btn" disabled={busy} onClick={async()=>{try{(await import("@/lib/media-mix-workbook")).downloadMediaMixTemplate();}catch{setError("양식을 불러오지 못했습니다.");}}}>입력 양식 다운로드</button>
      </div>
      <p className={styles.context}>저장 대상: <strong>{advertiser} / {month}</strong> · {sourceFile} · {draft.length}행. 이 월의 전체 운영안을 교체합니다.</p>
      <div className={styles.rows}>{draft.map((row,index)=><article key={index} className={styles.row}>
        <div className={styles.rowHead}><strong>운영안 {index+1}</strong><button type="button" className="btn" disabled={busy} onClick={()=>setDraft(current=>current?.filter((_,i)=>i!==index) ?? null)}>행 삭제</button></div>
        <div className={styles.fields}>{([
          ["platform","매체 (대분류)","text"],["product","광고상품 (중분류)","text"],["creativeName","소재명 (소분류)","text"],["placement","게재지면","text"],
          ["periodStart","시작일","date"],["periodEnd","종료일","date"],["budget","계획 예산 (원)","number"],
        ] as const).map(([field,label,type])=><label key={field}>{label}<input aria-label={`${index+1}행 ${label}`} type={type} min={type==="number" ? 0 : undefined} value={row[field] ?? ""} disabled={busy} onChange={event=>patch(index,field,event.target.value)}/></label>)}
          <label>집행상태<select aria-label={`${index+1}행 집행상태`} value={row.operationStatus || "예정"} disabled={busy} onChange={event=>patch(index,"operationStatus",event.target.value)}>{["예정","집행 중","중단","종료"].map(status=><option key={status}>{status}</option>)}</select></label>
        </div>
        <details><summary>기기·소재 유형·타겟팅·계획 KPI</summary><div className={styles.fields}>{([
          ["device","기기","text"],["creativeType","소재 유형","text"],["target","타겟팅","text"],["expectedImpressions","예상 노출수","number"],["expectedClicks","예상 클릭수","number"],
        ] as const).map(([field,label,type])=><label key={field}>{label}<input type={type} min={type==="number" ? 0 : undefined} value={row[field] ?? ""} disabled={busy} onChange={event=>patch(index,field,event.target.value)}/></label>)}</div></details>
      </article>)}</div>
      <div className={styles.actions}><button type="button" className="btn" disabled={busy || draft.length>=500} onClick={()=>setDraft(current=>[...(current || []),emptyRow()])}>운영안 추가</button><button type="button" className="btn" disabled={busy} onClick={()=>{setDraft(null);setError("");setNotice("");setSourceFile("직접 입력");}}>취소</button><button type="button" className="btn primary" disabled={busy || dataSyncState!=="ready"} onClick={save}>{busy?"처리 중…":"미디어믹스 저장"}</button></div>
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
