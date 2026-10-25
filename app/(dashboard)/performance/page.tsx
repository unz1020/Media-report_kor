"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, publishedSnapshotsFor, publishedInsightsFor, publishedPlacementProofsFor, type PublishedDataset, type PublishedInsight } from "@/lib/daily-report-store";
import { mediaPlansFromDatasets, creativePerformanceFromDatasets, dailyPerformanceFromDatasets, periodRowsFromSnapshots, rowsFromDatasets, type ReportingRow } from "@/lib/reporting-data";
import { canonicalMedia, inferMediaMentions } from "@/lib/media-normalization";
import { buildPerformanceReport, isPerformanceReferenceRow, type MediaPerformanceReport } from "@/lib/performance-report";
import type { MediaPlanFact } from "@/lib/daily-report-parser";
import { PerformanceReportOverview, MediaReportKpis, PerformanceReportTrend } from "@/components/performance-report";
import { PerformanceSourcePanels } from "@/components/performance-source-panels";
import { MediaPlanPerformance } from "@/components/media-plan-performance";
import { PerformanceCharts } from "@/components/performance-charts";
import { comparisonMetrics, placementMetricKey } from "@/lib/performance-visuals";
import { LayoutCanvas, LayoutPanel } from "@/components/layout-canvas";
import { InsightEntry } from "@/components/daily-insight-history";
import { buildCreativeRotationReport, type CreativeRotationGroup } from "@/lib/creative-rotation";
import { breakdownRowsFromDatasets } from "@/lib/showroom-breakdown";
import type { PlacementProof } from "@/lib/placement-proof";
import { CreativeRotationPanel } from "@/components/creative-rotation-panel";
import { CreativeLinkEditor } from "@/components/creative-link-editor";
import { ProofImageLightbox, type ProofLightboxImage } from "@/components/proof-image-lightbox";
import styles from "./performance.module.css";

type Screen="summary"|"detail"|"source"|"plan"|"rotation";
type Mode="placement"|"creative";
type Preset="core"|"cost"|"video"|"all";
const monthStart=(month:string)=>`${month}-01`;
function monthEnd(month:string){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
function value(value:number|null|undefined,unit=""){if(typeof value!=='number'||!Number.isFinite(value))return '—';if(unit==='원'&&value!==0&&Math.abs(value)<0.01)return `${Math.abs(value)<0.000001?value.toExponential(2):value.toLocaleString('ko-KR',{maximumSignificantDigits:3})}원`;return `${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:unit==='원'||unit==='%'?2:0}).format(value)}${unit}`;}
function viewTop(){window.scrollTo({top:0,behavior:'auto'});}
function DetailTable({item,preset,complete}:{item:MediaPerformanceReport;preset:Preset;complete:boolean}){
  const offline=item.kind==='ooh'||item.kind==='broadcast';
  const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
  const has=(key:keyof ReportingRow)=>item.rows.some(row=>valid(row[key]));
  type Column={key:string;label:string;unit?:string;read:(row:ReportingRow)=>number|null|undefined;total:number|null|undefined};
  const cpc=(r:ReportingRow)=>isPerformanceReferenceRow(r)?null:valid(r.spend)&&valid(r.clicks)&&r.clicks>0?r.spend/r.clicks:null;
  const cpm=(r:ReportingRow)=>isPerformanceReferenceRow(r)?null:valid(r.spend)&&r.impressions>0?r.spend/r.impressions*1000:null;
  const cpv=(r:ReportingRow)=>isPerformanceReferenceRow(r)?null:valid(r.spend)&&valid(r.views)&&r.views>0?r.spend/r.views:null;
  const available:Column[]=[
    {key:'spend',label:'집행액',unit:'원',read:(r:ReportingRow)=>isPerformanceReferenceRow(r)?null:r.spend,total:item.metrics.spend},
    {key:'impressions',label:offline?'원본 Impression':'노출',read:(r:ReportingRow)=>r.impressions,total:item.metrics.impressions},
    {key:'clicks',label:'클릭',read:(r:ReportingRow)=>r.clicks,total:item.metrics.clicks},
    {key:'ctr',label:'CTR',unit:'%',read:(r:ReportingRow)=>valid(r.clicks)&&r.impressions>0?r.clicks/r.impressions*100:null,total:item.metrics.ctr},
    {key:'views',label:'원본 조회',read:(r:ReportingRow)=>r.views,total:item.metrics.views},
    {key:'vtr',label:'원본 VTR',unit:'%',read:(r:ReportingRow)=>r.vtr,total:null},
    {key:'conversions',label:'원본 전환',read:(r:ReportingRow)=>r.conversions,total:item.metrics.conversions},
    {key:'cpc',label:'CPC',unit:'원',read:cpc,total:item.metrics.cpc},
    {key:'cpm',label:'CPM',unit:'원',read:cpm,total:item.metrics.cpm},
    {key:'cpv',label:'CPV',unit:'원',read:cpv,total:item.metrics.cpv},
  ].filter(col=>!offline||!['clicks','ctr','cpc','cpm','cpv','vtr'].includes(col.key));
  const keys=preset==='cost'?['spend','cpc','cpm','cpv']:preset==='video'?['impressions','views','vtr','cpv']:preset==='all'?available.map(c=>c.key):offline?['spend','impressions']:item.kind==='video'?['impressions','views','vtr','clicks']:['impressions','clicks','ctr','cpc'];
  const columns=available.filter(col=>keys.includes(col.key)&&(col.key==='impressions'||col.read&&item.rows.some(r=>valid(col.read(r)))));
  const [sort,setSort]=useState<string>('');
  const active=columns.find(c=>c.key===sort);
  const rows=active?[...item.rows].sort((a,b)=>(active.read(b)??-Infinity)-(active.read(a)??-Infinity)):item.rows;
  return <section className={styles.tableSection} aria-label={`${item.name} 지면 요약`}><div className={styles.sectionTitle}><h2>광고 지면별 성과</h2><span>{item.rows.length}개 지면 · 열 제목을 눌러 정렬</span></div>
    <div className={styles.tableScroll} tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">광고 지면</th>{columns.map(col=><th scope="col" key={col.key} aria-sort={active?.key===col.key?'descending':'none'}><button type="button" onClick={()=>setSort(col.key)}>{col.label}{active?.key===col.key?' ↓':''}</button></th>)}</tr></thead><tbody>
      {rows.map((row,index)=><tr key={`${row.sourceFile}:${row.sourceSheet}:${row.placement}:${index}`}><th scope="row">{row.placement}<small>{row.reportDate} 보고 기준{isPerformanceReferenceRow(row)?" · 참고 비용은 유료 집행액 제외":""}</small></th>{columns.map(col=><td key={col.key}>{complete?value(col.read(row),col.unit):'—'}</td>)}</tr>)}
      {!!rows.length&&<tr className={styles.totalRow}><th scope="row">선택 기간 합계</th>{columns.map(col=><td key={col.key}>{complete?value(col.total,col.unit):'—'}</td>)}</tr>}
    </tbody></table></div><p className={styles.helper}>이 표의 비율·단가는 선택 기간의 분자·분모가 모두 있는 행으로 계산합니다. 원본 제공 단가는 일별·원본에서 확인합니다. 합계 CTR·단가는 해당 지표가 함께 제공된 범위만 사용하므로 단순 평균과 다를 수 있습니다. —는 미제공 또는 집계 보류입니다.</p>
    {!columns.length&&<p className={styles.emptyInline}>이 지면에는 선택한 지표 묶음이 제공되지 않았습니다. 다른 지표 묶음을 선택해 주세요.</p>}
  </section>;
}
export default function PerformancePage(){
  const {advertiser,month,canEdit,dataSyncState,dataSyncError,sessionLoading,reloadData}=useWorkspace();
  const [datasets,setDatasets]=useState<PublishedDataset[]>([]),[snapshots,setSnapshots]=useState<PublishedDataset[]>([]),[insights,setInsights]=useState<PublishedInsight[]>([]),[mediaPlans,setMediaPlans]=useState<MediaPlanFact[]>([]);
  const [proofs,setProofs]=useState<PlacementProof[]>([]);
  const [linkEditor,setLinkEditor]=useState<{proof:PlacementProof;group:CreativeRotationGroup}|null>(null);
  const [rotationGroupId,setRotationGroupId]=useState('');
  const [lightboxImage,setLightboxImage]=useState<ProofLightboxImage|null>(null);
  const [loadedScope,setLoadedScope]=useState('');
  const [startDate,setStartDate]=useState(monthStart(month)),[endDate,setEndDate]=useState(monthEnd(month)),[creativeDate,setCreativeDate]=useState(monthEnd(month));
  const [selectedMedia,setSelectedMedia]=useState('전체 매체'),[screen,setScreen]=useState<Screen>('summary'),[viewMode,setViewMode]=useState<Mode>('placement'),[metricPreset,setMetricPreset]=useState<Preset>('core');
  const datesInitialized=useRef(false),scope=`${advertiser}:${month}`;
  useEffect(()=>{datesInitialized.current=false;setStartDate(monthStart(month));setEndDate(monthEnd(month));setCreativeDate(monthEnd(month));setSelectedMedia('전체 매체');setScreen('summary');setViewMode('placement');setMetricPreset('core');setLinkEditor(null);setLightboxImage(null);setRotationGroupId('');},[advertiser,month]);
  useEffect(()=>{
    const load=()=>{const all=publishedDatasetsFor(advertiser,month);const usable=all.filter(item=>item.bundle.placements.length||item.bundle.dailyPerformance?.length||item.bundle.creativeDailyPerformance?.length);const history=publishedSnapshotsFor(advertiser,month).filter(item=>item.bundle.placements.length||item.bundle.dailyPerformance?.length||item.bundle.creativeDailyPerformance?.length);setDatasets(usable);setSnapshots(history);setProofs(publishedPlacementProofsFor(advertiser,month));setInsights(publishedInsightsFor(advertiser,month));setMediaPlans(mediaPlansFromDatasets(all));setLoadedScope(`${advertiser}:${month}`);const latest=history.map(d=>d.bundle.reportDate).filter(Boolean).sort().at(-1)||usable.map(d=>d.bundle.reportDate).filter(Boolean).sort().at(-1);if(latest&&!datesInitialized.current){setEndDate(latest);setCreativeDate(latest);datesInitialized.current=true;}};
    load();window.addEventListener('media-report-daily-updated',load);window.addEventListener('storage',load);return()=>{window.removeEventListener('media-report-daily-updated',load);window.removeEventListener('storage',load);};
  },[advertiser,month]);
  useEffect(()=>{const query=new URLSearchParams(window.location.search);if(query.get('view')==='rotation'){setScreen('rotation');setRotationGroupId(query.get('group')||'');}},[advertiser,month]);
  const latestDataDate=useMemo(()=>snapshots.map(d=>d.bundle.reportDate).filter(Boolean).sort().at(-1)||datasets.map(d=>d.bundle.reportDate).filter(Boolean).sort().at(-1)||monthEnd(month),[snapshots,datasets,month]);
  const period=useMemo(()=>snapshots.length?periodRowsFromSnapshots(snapshots,startDate,endDate):{rows:rowsFromDatasets(datasets),baselineComplete:startDate.endsWith('-01')},[snapshots,datasets,startDate,endDate]);
  const placementRows=useMemo(()=>period.rows.map(row=>({...row,media:canonicalMedia(row.platform)})),[period.rows]);
  const allCreativeRows=useMemo(()=>[...new Set(datasets.flatMap(item=>item.bundle.creativeDailyPerformance||[]).map(row=>row.date))].flatMap(date=>creativePerformanceFromDatasets(datasets,date)).map(row=>({...row,media:canonicalMedia(row.platform)})),[datasets]);
  const creativeRows=useMemo(()=>allCreativeRows.filter(row=>row.date===creativeDate),[allCreativeRows,creativeDate]);
  const dailyRows=useMemo(()=>dailyPerformanceFromDatasets(datasets,startDate,endDate),[datasets,startDate,endDate]);
  const rotationPlacementRows=useMemo(()=>[...rowsFromDatasets(datasets),...breakdownRowsFromDatasets(datasets)],[datasets]);
  const rotationReport=useMemo(()=>buildCreativeRotationReport({advertiser,month,datasets:snapshots.length?snapshots:datasets,proofs,plans:mediaPlans,placementRows:rotationPlacementRows,startDate,endDate}),[advertiser,month,snapshots,datasets,proofs,mediaPlans,rotationPlacementRows,startDate,endDate]);
  const periodInsights=useMemo(()=>insights.filter(i=>i.reportDate>=startDate&&i.reportDate<=endDate),[insights,startDate,endDate]);
  const report=useMemo(()=>buildPerformanceReport({rows:placementRows,dailyRows,creativeRows:allCreativeRows,plans:mediaPlans,startDate,endDate,baselineComplete:period.baselineComplete}),[placementRows,dailyRows,allCreativeRows,mediaPlans,startDate,endDate,period.baselineComplete]);
  const creativeInventory=useMemo(()=>buildPerformanceReport({rows:[],dailyRows:[],creativeRows:allCreativeRows,plans:[],startDate:monthStart(month),endDate:monthEnd(month),baselineComplete:false}).media,[allCreativeRows,month]);
  const mediaNames=useMemo(()=>Array.from(new Set([...report.media.map(m=>m.name),...creativeInventory.map(m=>m.name)])).sort((a,b)=>a.localeCompare(b,'ko')),[report.media,creativeInventory]);
  const chosen=selectedMedia==='전체 매체'?(report.media.find(m=>m.rows.length)||report.media[0]):report.media.find(m=>m.name===selectedMedia)||creativeInventory.find(m=>m.name===selectedMedia);
  useEffect(()=>{if(selectedMedia!=='전체 매체'&&!mediaNames.includes(selectedMedia))setSelectedMedia('전체 매체');},[selectedMedia,mediaNames]);
  const activeMedia=chosen?.name||selectedMedia;
  const placementGroups=useMemo(()=>chosen&&(chosen.rows.length||chosen.dailyRows.length)?[{media:chosen.name,rows:chosen.rows}]:[],[chosen]);
  const creativeGroups=useMemo(()=>{const rows=creativeRows.filter(r=>r.media===activeMedia);return rows.length?[{media:activeMedia,rows}]:[];},[creativeRows,activeMedia]);
  const scopedDaily=chosen?.dailyRows||[];
  const comparisons=useMemo(()=>viewMode==='placement'?comparisonMetrics(placementGroups.flatMap(g=>g.rows),placementMetricKey,r=>`${r.placement} (${canonicalMedia(r.platform)})`):comparisonMetrics(creativeGroups.flatMap(g=>g.rows),r=>`${placementMetricKey(r)}::${r.creative}`,r=>`${r.creative} · ${r.placement}`),[viewMode,placementGroups,creativeGroups]);
  const relevantInsights=(media:string)=>periodInsights.filter(i=>i.notes.some(note=>inferMediaMentions(note).includes(media)));
  function chooseMedia(name:string){setSelectedMedia(name);const item=report.media.find(m=>m.name===name)||creativeInventory.find(m=>m.name===name);const creativeOnly=!!item?.creativeRows?.length&&!item.rows.length&&!item.dailyRows.length;setViewMode(creativeOnly?'creative':'placement');if(creativeOnly&&item?.creativeThrough)setCreativeDate(item.creativeThrough);setMetricPreset('core');}
  function chooseMode(mode:Mode){if(mode==='creative'&&viewMode!=='creative'&&chosen?.creativeThrough)setCreativeDate(chosen.creativeThrough);setViewMode(mode);}
  function openMedia(name:string){chooseMedia(name);setScreen('detail');viewTop();}
  function go(next:Screen){if(next!=='summary'&&next!=='plan'&&next!=='rotation'&&chosen)setSelectedMedia(chosen.name);setScreen(next);const url=new URL(window.location.href);if(next==='rotation')url.searchParams.set('view','rotation');else{url.searchParams.delete('view');url.searchParams.delete('group');}window.history.replaceState(null,'',url);viewTop();}
  function preset(kind:string){const day=(n:number)=>`${month}-${String(n).padStart(2,'0')}`;if(kind==='month'){setStartDate(monthStart(month));setEndDate(latestDataDate);}else{const from=kind==='early'?day(1):kind==='middle'?day(11):day(21);const to=kind==='early'?day(10):kind==='middle'?day(20):latestDataDate;if(from>latestDataDate)return;setStartDate(from);setEndDate(to>latestDataDate?latestDataDate:to);}}
  const creativeMode=(screen==='detail'||screen==='source')&&viewMode==='creative';
  const scopeReady=loadedScope===scope;
  const hasData=!!(datasets.length||mediaPlans.length||proofs.length);
  const bootLoading=!scopeReady||sessionLoading||(!hasData&&(dataSyncState==='idle'||dataSyncState==='loading'));
  function setPeriodStart(date:string){if(!date)return;const bounded=date<monthStart(month)?monthStart(month):date>latestDataDate?latestDataDate:date;setStartDate(bounded);if(bounded>endDate)setEndDate(bounded);}
  function setPeriodEnd(date:string){if(!date)return;const bounded=date<monthStart(month)?monthStart(month):date>latestDataDate?latestDataDate:date;setEndDate(bounded);if(bounded<startDate)setStartDate(bounded);}
  return <div className={styles.reportShell}>
    {linkEditor&&canEdit&&<CreativeLinkEditor key={`${advertiser}:${month}:${linkEditor.proof.importId}`} {...linkEditor} onClose={()=>setLinkEditor(null)}/>}
    {lightboxImage&&<ProofImageLightbox image={lightboxImage} onClose={()=>setLightboxImage(null)}/>}
    <div className="page-head refined-head"><div><div className="eyebrow">성과 리포트</div><h1 className="page-title">{advertiser} 성과 보고</h1><p className="page-desc">전체 성과와 확인할 내용을 먼저 읽고, 매체를 선택해 상세 지표와 근거를 확인하세요.</p></div></div>
    <details className={styles.periodControls}><summary><span>조회 기간</span><strong>{creativeMode?`소재 ${creativeDate}`:`${startDate} ~ ${endDate}`}</strong><small aria-live="polite">{dataSyncState==='loading'?'자료 갱신 중':'변경'}</small></summary><section className={styles.reportToolbar} aria-label="성과 리포트 조회 조건"><div className={styles.dateFields}><label>{creativeMode?'소재 기준일':'조회 기간'}</label>{!(creativeMode)&&<><input type="date" aria-label="성과 조회 시작일" value={startDate} min={monthStart(month)} max={endDate} onChange={e=>setPeriodStart(e.target.value)}/><span>~</span></>}<input type="date" aria-label="성과 조회 종료일" value={creativeMode?creativeDate:endDate} min={creativeMode?monthStart(month):startDate} max={latestDataDate} onChange={e=>{if(e.target.value){if(creativeMode)setCreativeDate(e.target.value);else setPeriodEnd(e.target.value);}}}/><button type="button" onClick={()=>creativeMode?setCreativeDate(latestDataDate):preset('month')}>{creativeMode?'최신 기준일':'월 누적'}</button>{!creativeMode&&<select aria-label="기간 바로가기" value="" onChange={e=>preset(e.target.value)}><option value="" disabled>기간 바로가기</option><option value="early">1~10일</option><option value="middle" disabled={latestDataDate<`${month}-11`}>11~20일</option><option value="late" disabled={latestDataDate<`${month}-21`}>21일~최신</option></select>}</div><span className={styles.syncLabel} aria-live="polite">{dataSyncState==='loading'?'자료 갱신 중':dataSyncState==='error'?'자료 동기화 확인 필요':datasets.length?`연결된 성과 자료 ${datasets.length}건`:'실적 자료 연결 대기'}</span></section></details>
    {dataSyncState==='error'&&<div className={styles.syncError} role="alert"><strong>최신 자료를 불러오지 못했습니다.</strong><span>{hasData?'아래 내용은 마지막으로 불러온 자료입니다. ':''}{dataSyncError||'동기화 상태를 확인해 주세요.'}</span><button type="button" onClick={()=>void reloadData()}>다시 불러오기</button></div>}
    <nav className={styles.reportNav} aria-label="성과 리포트 화면">{([['summary','요약 리포트'],['detail','매체 상세'],['rotation','소재 비교'],['source','일별·원본'],['plan','운영안 비교']] as const).map(([key,label])=><button type="button" key={key} aria-current={screen===key?'page':undefined} onClick={()=>go(key)}>{label}</button>)}</nav>
    {bootLoading?<section className={styles.loading} role="status"><h2>성과 자료를 불러오고 있습니다.</h2><p>동기화 중의 빈 화면을 실적 0이나 데이터 없음으로 처리하지 않습니다.</p><div/><div/></section>:!hasData&&dataSyncState==='error'?<section className={styles.empty}><h2>성과 자료를 확인하지 못했습니다.</h2><p>불러오기 실패는 데이터 없음이나 성과 0을 뜻하지 않습니다. 위의 다시 불러오기로 재시도해 주세요.</p></section>:!hasData?<section className={styles.empty}><h2>아직 반영된 성과 데이터가 없습니다.</h2><p>{advertiser}의 {month} 자료가 연결되면 요약과 매체 상세가 표시됩니다.</p></section>:<>
      {!period.baselineComplete&&<aside className={styles.sourceWarning} role="status"><strong>이 기간의 정확한 합계를 확인할 기준선이 부족합니다.</strong><p>일부 매체는 시작일 직전 누적 자료가 없어 기간 합계를 보류했습니다. 월 누적 또는 원본 자료를 확인해 주세요.</p></aside>}
      {screen==='summary'&&<PerformanceReportOverview report={report} insights={periodInsights} startDate={startDate} endDate={endDate} onOpenMedia={openMedia} onOpenPlan={()=>go('plan')}/>}
      {screen==='rotation'&&<CreativeRotationPanel key={`${advertiser}:${month}`} report={rotationReport} groupId={rotationGroupId||undefined} onOpenImage={setLightboxImage} onEditLink={canEdit?(proof,group)=>setLinkEditor({proof,group}):undefined}/>}
      {(screen==='detail'||screen==='source')&&<>
        <header className={styles.mediaHeader}><div><button type="button" className={styles.back} onClick={()=>go('summary')}>전체 요약으로</button><h2>{chosen?.name||'매체 선택'}</h2><p>{chosen?.reportDate?`매체 보고 기준 ${chosen.reportDate}`:'실적 자료 미연결'}{viewMode==='creative'?(chosen?.creativeThrough?` · 최근 소재 원본 ${chosen.creativeThrough}`:''):(chosen?.dailyThrough?` · 일별 원본 ${chosen.dailyThrough}까지`:'')}</p></div><label>매체<select aria-label="상세 매체 선택" value={activeMedia==='전체 매체'?'':activeMedia} onChange={e=>chooseMedia(e.target.value)}>{mediaNames.map(name=><option key={name} value={name}>{name}</option>)}</select></label></header>
        <div className={styles.detailNavigation} role="group" aria-label="성과 구분"><button type="button" aria-pressed={viewMode==='placement'} onClick={()=>chooseMode('placement')}>광고 지면</button><button type="button" aria-pressed={viewMode==='creative'} onClick={()=>chooseMode('creative')}>소재별</button>{screen==='detail'&&<button type="button" onClick={()=>go('source')}>일별·원본 확인</button>}{screen==='source'&&<button type="button" onClick={()=>go('detail')}>핵심 지표로</button>}</div>
        {chosen&&screen==='detail'&&<>
          {viewMode==='placement'?<><MediaReportKpis media={chosen} baselineComplete={report.baselineComplete}/>{chosen.rows.length||chosen.dailyRows.length?<><PerformanceReportTrend key={chosen.name} media={chosen} startDate={startDate} endDate={endDate}/>{chosen.rows.length?<><div className={styles.metricControls} role="group" aria-label="상세 지표 묶음"><span>표시할 지표</span>{([['core','핵심'],['cost','비용'],['video','영상'],['all','전체']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={metricPreset===key} onClick={()=>setMetricPreset(key)}>{label}</button>)}</div><DetailTable key={chosen.name} item={chosen} preset={metricPreset} complete={report.baselineComplete}/></>:<p className={styles.helper}>매체 누적 원장은 미제공이며, 위 일별 원본을 별도로 확인합니다. 누적 성과 0을 뜻하지 않습니다.</p>}</>:<section className={styles.empty}><h3>{chosen.creativeRows?.length?'소재별 원본만 제공된 매체입니다.':'운영안은 연결돼 있지만 실적 자료는 아직 없습니다.'}</h3><p>{chosen.creativeRows?.length?'소재별에서 기준일 원본을 확인하세요. 매체 누적 성과로 합산하지 않습니다.':'집행 여부나 성과 0을 뜻하지 않습니다. 운영안과 실제 성과를 분리해 확인합니다.'}</p>{chosen.creativeRows?.length?<button type="button" onClick={()=>chooseMode('creative')}>소재 원본 보기</button>:<button type="button" onClick={()=>go('plan')}>운영안 비교 보기</button>}</section>}</>:<><p className={styles.helper}>{creativeDate} 하루 소재별 성과입니다. 기간 합계와 섞지 않습니다.</p><PerformanceSourcePanels advertiser={advertiser} month={month} startDate={startDate} endDate={creativeDate} viewMode="creative" baselineComplete={period.baselineComplete} placementGroups={[]} creativeGroups={creativeGroups} dailyRows={[]} relevantInsights={relevantInsights}/></>}
          {viewMode==='placement'&&relevantInsights(chosen.name).length>0&&<details className={styles.notes}><summary>원본 운영 메모 · {relevantInsights(chosen.name).length}건</summary><p>아래 내용은 자료에 기록된 메모입니다. 현재 조치 완료나 독립적인 실게재 확인을 뜻하지 않습니다.</p>{relevantInsights(chosen.name).map(item=><InsightEntry key={item.key} item={item} displayNotes={item.notes.filter(note=>inferMediaMentions(note).includes(chosen.name))}/>)}</details>}
        </>}
        {screen==='source'&&<>{chosen&&!chosen.rows.length&&!chosen.dailyRows.length&&!creativeGroups.length&&<p className={styles.emptyInline}>이 매체의 실적 원장 자료가 아직 연결되지 않았습니다. 계획을 실제 성과 0으로 처리하지 않습니다.</p>}<p className={styles.helper}>검산과 출처 확인을 위한 원본 보기입니다. 아래 일별 표·원본 메모·편집 기능은 선택한 매체에만 적용됩니다.</p><details className={styles.analysisCharts}><summary>분석 그래프 열기</summary><PerformanceCharts comparison={comparisons} dailyRows={scopedDaily} startDate={startDate} endDate={creativeMode?creativeDate:endDate} mode={viewMode}/></details><PerformanceSourcePanels advertiser={advertiser} month={month} startDate={startDate} endDate={creativeMode?creativeDate:endDate} viewMode={viewMode} baselineComplete={period.baselineComplete} placementGroups={placementGroups} creativeGroups={creativeGroups} dailyRows={dailyRows} relevantInsights={relevantInsights}/></>}
      </>}
      {screen==='plan'&&<section className={styles.planView}><div className={styles.sectionTitle}><div><button type="button" className={styles.back} onClick={()=>go('summary')}>전체 요약으로</button><h2>운영안과 실제 성과 비교</h2></div></div><p className={styles.helper}>월 운영안 전체와 선택 기간 실적의 범위가 다를 수 있습니다. 예상 성과를 보장값으로 보거나 월 예산을 날짜 비율로 임의 배분하지 않습니다.</p>{mediaPlans.length?<LayoutCanvas page="performance"><LayoutPanel id="performance:media-plan-comparison" title="미디어믹스 예상 실제 비교"><MediaPlanPerformance plans={mediaPlans} actual={period.baselineComplete?placementRows:[]} selectedMedia="전체 매체" period={`${startDate} ~ ${endDate}`}/></LayoutPanel></LayoutCanvas>:<p className={styles.emptyInline}>선택한 월의 운영안이 아직 연결되지 않았습니다.</p>}</section>}
    </>}
  </div>;
}
