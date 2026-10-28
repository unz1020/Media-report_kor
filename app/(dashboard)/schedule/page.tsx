"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LayoutCanvas, LayoutPanel } from "@/components/layout-canvas";
import { MediaMixEditor } from "@/components/media-mix-editor";
import { useWorkspace } from "@/components/workspace-context";
import { useCalendarSources } from "@/components/use-calendar-sources";
import { MediaLabel } from "@/components/media-label";
import { PlacementSetupForm } from "@/components/placement-setup-form";
import { readCreativeMaterialIdentity } from "@/lib/creative-material";
import { buildCreativeCalendar, calendarOnDate as planOnDate } from "@/lib/creative-calendar";
import { formatKrw, mediaPlansFromDatasets } from "@/lib/reporting-data";
import { canonicalMedia } from "@/lib/media-normalization";
import { mediaHierarchy, mediaPath } from "@/lib/media-hierarchy";
import { MediaPlanLinks } from "@/components/media-plan-links";
import { CreativeUrlPreview } from "@/components/creative-url-preview";
import { CreativeMarker, CreativeLegend, creativeStyle } from "@/components/creative-marker";
import type { PlacementProof } from "@/lib/placement-proof";
import { monthBounds, productKey, scheduleProduct } from "@/lib/schedule-data";
import styles from "./schedule.module.css";

export default function SchedulePage() {
  const {advertiser,month,session} = useWorkspace();
  return <Schedule key={`${session?.user.email}:${advertiser}:${month}`} />;
}
function Schedule() {
  const { advertiser, month, setMonth, session, canEdit, dataSyncState } = useWorkspace();
  const { datasets, proofs, failedMonths, readAt, refresh } = useCalendarSources();
  const [hiddenMedia,setHiddenMedia] = useState<string[]>([]);
  const [includePlans,setIncludePlans] = useState(false), [view,setView] = useState<"period"|"month">("period");
  const [editingProof,setEditingProof] = useState<PlacementProof|null>(null);
  const [hidden,setHidden] = useState<string[]>([]), [filterReady,setFilterReady] = useState(false);
  const [query,setQuery] = useState(""), [selectedId,setSelectedId] = useState(""), [selectedDate,setSelectedDate] = useState(month+"-01");
  const preferenceKey = `media-report-calendar:${session?.user.email}:${advertiser}:${month}`;
  const mediaPreferenceKey = `media-report-calendar-media:${session?.user.email}:${advertiser}`;
  useEffect(()=>{try { const parsed=JSON.parse(localStorage.getItem(preferenceKey)||"[]"); if(Array.isArray(parsed))setHidden(parsed.filter(item=>typeof item==="string"));
    const media=JSON.parse(localStorage.getItem(mediaPreferenceKey)||"[]");if(Array.isArray(media))setHiddenMedia(media.filter(item=>typeof item==="string"));
    setView(localStorage.getItem(preferenceKey+":view")==="month"?"month":"period");setIncludePlans(localStorage.getItem(preferenceKey+":plans")==="true");
  }catch{} setFilterReady(true);},[preferenceKey,mediaPreferenceKey]);
  useEffect(()=>{if(filterReady)try{localStorage.setItem(preferenceKey,JSON.stringify(hidden));localStorage.setItem(mediaPreferenceKey,JSON.stringify(hiddenMedia));localStorage.setItem(preferenceKey+":view",view);localStorage.setItem(preferenceKey+":plans",String(includePlans));}catch{}},[hidden,hiddenMedia,view,includePlans,filterReady,preferenceKey,mediaPreferenceKey]);
  const plans=useMemo(()=>buildCreativeCalendar(mediaPlansFromDatasets(datasets),proofs,month,includePlans).map(plan=>({...plan,media:canonicalMedia(plan.platform),adProduct:scheduleProduct(plan),productKey:productKey(plan)})),[datasets,proofs,month,includePlans]);
  const mediaGroups=useMemo(()=>[...new Set(plans.map(p=>p.media))].map(media=>({media,keys:[...new Set(plans.filter(p=>p.media===media).map(p=>p.productKey))]})),[plans]);
  const groups=useMemo(()=>{
    const map=new Map<string,Map<string,Map<string,typeof plans>>>();
    for(const plan of plans){ const hierarchy=mediaHierarchy(plan), category=hierarchy.isTv?'TV':plan.media, subcategory=hierarchy.subcategory;
      const sections=map.get(category)||new Map<string,Map<string,typeof plans>>(), products=sections.get(subcategory)||new Map<string,typeof plans>();
      const rows=products.get(plan.productKey)||[];rows.push(plan);products.set(plan.productKey,rows);sections.set(subcategory,products);map.set(category,sections); }
    return [...map].map(([category,sections])=>({category,sections:[...sections].map(([subcategory,products])=>({subcategory,products:[...products].map(([key,rows])=>({key,label:rows[0].adProduct,media:rows[0].media,rows}))}))}));
  },[plans]);
  const visible=plans.filter(plan=>!hiddenMedia.includes(plan.media) && !hidden.includes(plan.productKey) && `${mediaPath(plan)} ${plan.adProduct} ${plan.placement} ${plan.creativeName||""}`.toLowerCase().includes(query.toLowerCase()));
  const selected=visible.find(plan=>plan.id===selectedId);
  const linkedProofs=selected?.sourceProof ? [selected.sourceProof] : [];
  const dayPlans=visible.filter(plan=>planOnDate(plan,selectedDate));
  const unscheduled=visible.filter(plan=>plan.dateIssue!==null);
  const dated=visible.filter(plan=>plan.dateIssue===null);
  const editingCurrent=editingProof && proofs.find(p=>p.key===editingProof.key);
  const editorStale=!!editingProof && (!editingCurrent || editingCurrent.publishedAt!==editingProof.publishedAt);
  const bounds=monthBounds(month), cellCount=Math.ceil((bounds.offset+bounds.days)/7)*7;
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  function toggle(key:string){setHidden(current=>current.includes(key)?current.filter(item=>item!==key):[...current,key]);}
  const tvProducts=new Map(plans.filter(p=>mediaHierarchy(p).isTv).map(p=>[p.productKey,p.media]));
  const tvOnCount=[...tvProducts].filter(([key,media])=>!hidden.includes(key)&&!hiddenMedia.includes(media)).length;
  function toggleTV(){const tvMedia=[...new Set(tvProducts.values())];if(tvOnCount)setHiddenMedia(current=>[...new Set([...current,...tvMedia])]);else{setHiddenMedia(current=>current.filter(media=>!tvMedia.includes(media)));setHidden(current=>current.filter(key=>!tvProducts.has(key)));}}
  function toggleMedia(media:string){setHiddenMedia(current=>current.includes(media)?current.filter(item=>item!==media):[...current,media]);}
  function shiftMonth(amount:number){const [year,m]=month.split("-").map(Number);setMonth(new Date(Date.UTC(year,m-1+amount,1)).toISOString().slice(0,7));}
  function choose(id:string,date?:string){setSelectedId(id);if(date)setSelectedDate(date);}
  const card=(plan:typeof plans[number])=><button type="button" key={plan.id} className={`${styles.planCard} ${selected?.id===plan.id?styles.planActive:""}`} style={creativeStyle(plan.creativeName)} onClick={()=>choose(plan.id)}><strong>{mediaPath(plan)} › {plan.adProduct}</strong><span><CreativeMarker name={plan.creativeName} />{plan.creativeName||"소재명 미입력"}</span><small>{plan.periodStart||"시작 미지정"} ~ {plan.periodEnd||"종료 미지정"} · {plan.sourceLabel}{plan.dateIssue&&plan.dateIssue!=="missing"?" · 날짜 확인 필요":""} · {plan.operationStatus?`보고 상태 ${plan.operationStatus}`:"운영보고 미입력"}</small></button>;
  // Display grouping only: each record retains its own identity, source, dates and status.
  function groupedRows(rows: typeof plans, renderRow: (row: typeof plans[number]) => ReactNode, period = false) {
    const categories = new Map<string, Map<string, typeof plans>>();
    for (const row of rows) {
      const products = categories.get(row.media) || new Map<string, typeof plans>();
      const items = products.get(row.productKey) || [];
      items.push(row); products.set(row.productKey, items); categories.set(row.media, products);
    }
    return <div className={period ? styles.periodGroups : styles.recordGroups}>{[...categories].map(([media, products]) => {
      const count = [...products.values()].reduce((total, items) => total + items.length, 0);
      return <details className={styles.recordCategory} key={media} open={query.trim() ? true : undefined}>
        <summary><strong>{media}</strong><span>{products.size}개 상품 · {count}건</span></summary>
        <div className={styles.categoryProducts}>{[...products].map(([key, items]) =>
          <details className={styles.recordProduct} key={key} open={query.trim() ? true : undefined}>
            <summary><strong>{items[0].adProduct || "상품 미확인"}</strong><span>{items.length}건</span></summary>
            <div className={period ? styles.periodRows : styles.cardList}>{items.map(renderRow)}</div>
          </details>)}</div>
      </details>;
    })}</div>;
  }
  return <>
    <div className="page-head refined-head"><div><div className="eyebrow">Schedule</div><h1 className="page-title">{advertiser} 소재 집행 캘린더</h1><p className="page-desc">소재별 등록 운영기간을 기간표와 월간 달력으로 확인합니다. 매체 ON/OFF는 화면 표시만 바꾸며 실제 광고를 시작하거나 중단하지 않습니다.</p></div><div className="page-meta"><span className="view-pill">{month}</span></div></div>
    <LayoutCanvas page="schedule">
      <LayoutPanel id="schedule:calendar" title="운영 캘린더"><section className={styles.section}>
        <div className={styles.toolbar}><div><h2>{month.replace("-","년 ")}월</h2><p>{groups.length}개 상위 분류 · {new Set(plans.map(plan=>plan.productKey)).size}개 상품 · {plans.filter(p=>p.origin==="registered").length}개 등록 자료 · {plans.filter(p=>p.origin==="plan").length}개 운영안</p></div><div className={styles.nav}><button type="button" className="btn" onClick={()=>shiftMonth(-1)} aria-label="이전 월">←</button><button type="button" className="btn" onClick={()=>setMonth(today.slice(0,7))}>이번 달</button><button type="button" className="btn" onClick={()=>shiftMonth(1)} aria-label="다음 월">→</button></div></div>
        <div className={styles.viewTools}><div role="group" aria-label="캘린더 보기"><button type="button" className="btn" aria-pressed={view==="period"} onClick={()=>setView("period")}>소재별 기간표</button><button type="button" className="btn" aria-pressed={view==="month"} onClick={()=>setView("month")}>월간 달력</button></div><label><input type="checkbox" checked={includePlans} onChange={e=>setIncludePlans(e.target.checked)}/> 운영안 포함 · 확정 집행 아님</label><button type="button" className="btn" disabled={dataSyncState==="loading"} onClick={refresh}>최신 자료 새로고침</button></div><p className={styles.help}>등록 자료상 기간과 운영안은 별도 표시합니다. 등록 이미지·기간만으로 실제 집행 중이라고 판단하지 않습니다. 자료 읽음 {readAt || "대기"} · 원본 변경·동기화 시 다시 계산합니다.</p>{failedMonths.length>0 && <p role="alert" className={styles.sourceWarning}>등록월 {failedMonths.join(", ")} 자료를 읽지 못했습니다. 이전에 읽은 자료는 유지하지만 월 경계 소재 조회가 불완전할 수 있습니다. 새로고침해 주세요.</p>}<div className={styles.filters}><label>매체·상품·소재 검색<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="네이버, GFA, 소재명" /></label><div className={styles.nav}><button type="button" className="btn" onClick={()=>{setHidden([]);setHiddenMedia([]);}}>전체 ON</button><button type="button" className="btn" onClick={()=>setHiddenMedia([...new Set(plans.map(plan=>plan.media))])}>전체 OFF</button></div></div>
        <p className={styles.help}>매체 표시 설정은 계정·광고주별로, 상품·보기 선택은 월별로 저장됩니다. OFF한 매체는 새 소재가 등록돼도 숨겨집니다. 표시 {visible.length} / 전체 {plans.length}건.</p>
        <div className={styles.categoryControls} aria-label="매체별 캘린더 표시">{tvProducts.size>0&&<div className={styles.categoryControl}><div><strong>TV 전체</strong><small>{tvOnCount}/{tvProducts.size}개 상품 표시</small></div><button type="button" role="switch" aria-checked={tvOnCount>0} aria-label="TV 전체 캘린더 표시" className={tvOnCount?styles.switchOn:styles.switchOff} onClick={toggleTV}>{!tvOnCount?"OFF":tvOnCount===tvProducts.size?"ON":"일부 ON"}</button></div>}{mediaGroups.filter(group=>group.media!=="TV"||!tvProducts.size).map(group=>{const on=!hiddenMedia.includes(group.media);return <div className={styles.categoryControl} key={group.media}><div><strong><MediaLabel media={group.media}/></strong><small>{on?group.keys.filter(key=>!hidden.includes(key)).length:0}/{group.keys.length}개 상품 표시</small></div><button type="button" role="switch" aria-checked={on} aria-label={`${group.media} 전체 캘린더 표시`} className={on?styles.switchOn:styles.switchOff} onClick={()=>toggleMedia(group.media)}>{on?'ON':'OFF'}</button></div>;})}</div>
        <details className={styles.legendGroup}><summary>소재 이름별 색상 구분 보기</summary><CreativeLegend names={visible.map(plan=>plan.creativeName)} /></details>
        <div className={styles.workspace} style={view==="period"?{gridTemplateColumns:"minmax(0,1fr)"}:undefined}>
          <details className={styles.productFilter} open={view==="month"}><summary>상품별 세부 표시 선택</summary><aside className={styles.tree} aria-label="매체 상품 소재 분류">{!groups.length && <p>미디어믹스를 저장하면 분류가 표시됩니다.</p>}{groups.map(group=><details key={group.category} open><summary>{group.category}</summary>{group.sections.map(section=>{
            const products=section.products.map(product=><div className={styles.product} key={product.key}><div className={styles.productHead}><strong>{group.category==='TV'?`${product.media} · `:''}{product.label}</strong><button type="button" role="switch" aria-checked={!hiddenMedia.includes(product.media)&&!hidden.includes(product.key)} disabled={hiddenMedia.includes(product.media)} aria-label={`${product.media} ${product.label} 캘린더 표시`} className={hiddenMedia.includes(product.media)||hidden.includes(product.key)?styles.switchOff:styles.switchOn} onClick={()=>toggle(product.key)}>{hiddenMedia.includes(product.media)||hidden.includes(product.key)?"OFF":"ON"}</button></div><details><summary>소재 {product.rows.length}개</summary>{product.rows.map(plan=><button type="button" className={styles.leaf} style={creativeStyle(plan.creativeName)} key={plan.id} disabled={hiddenMedia.includes(product.media)||hidden.includes(product.key)} onClick={()=>choose(plan.id,plan.dateIssue===null ? plan.periodStart<bounds.start?bounds.start:plan.periodStart : undefined)}><CreativeMarker name={plan.creativeName} />{plan.creativeName||"소재명 미입력"}<small>{plan.placement || plan.creativeType || "지면 미입력"}</small></button>)}</details></div>);
            return section.subcategory?<details key={section.subcategory} open className={styles.tvGroup}><summary>{section.subcategory}</summary>{products}</details>:<div key="products">{products}</div>;
          })}</details>)}</aside></details>
          <div className={styles.calendarArea}>{view==="period"?<div className={styles.periodScroll} role="region" aria-label="소재별 운영기간표"><div className={styles.periodTable}><div className={styles.periodHeader}><strong>소재 · 원본 기간</strong><div className={styles.periodTrack} style={{gridTemplateColumns:`repeat(${bounds.days},minmax(23px,1fr))`}}>{Array.from({length:bounds.days},(_,i)=><span key={i}>{i+1}</span>)}</div></div>{groupedRows(dated,plan=>{const first=plan.periodStart<bounds.start?1:Number(plan.periodStart.slice(8)),last=plan.periodEnd>bounds.end?bounds.days:Number(plan.periodEnd.slice(8));const identity=readCreativeMaterialIdentity(plan.sourceProof?.materialIdentity);return <button type="button" className={`${styles.periodRow} ${selected?.id===plan.id?styles.periodSelected:""}`} key={plan.id} style={creativeStyle(plan.creativeName)} aria-label={`${plan.media} ${plan.creativeName||"소재명 미입력"} 기간 상세`} onClick={()=>choose(plan.id,`${month}-${String(first).padStart(2,"0")}`)}><div className={styles.periodName}><strong>{plan.creativeName||"소재명 미입력 · 지면자료"}</strong><small><MediaLabel media={plan.media}/> · {plan.placement}</small>{identity&&<small>{identity.assetId} · {identity.version}</small>}<small>{plan.periodStart} ~ {plan.periodEnd}</small><span className={plan.origin==="plan"?styles.planBadge:styles.registeredBadge}>{plan.sourceLabel}</span>{plan.operationStatus&&<small>보고 상태: {plan.operationStatus} · {plan.sourceAsOf}</small>}</div><div className={styles.periodTrack} style={{gridTemplateColumns:`repeat(${bounds.days},minmax(23px,1fr))`,backgroundSize:`${100/bounds.days}% 100%`}}><span className={`${styles.periodBar} ${plan.origin==="plan"?styles.proposalBar:""} ${plan.operationStatus==="중단"||plan.operationStatus==="종료"?styles.inactive:""}`} style={{gridColumn:`${first} / ${last+1}`}} title={`${plan.sourceLabel}: ${plan.periodStart} ~ ${plan.periodEnd}`} /></div></button>;},true)}{!dated.length&&<p className={styles.empty}>표시할 유효한 소재 기간이 없습니다. 아래의 기간 미지정·확인 필요 자료와 표시 필터를 확인하세요.</p>}</div></div>:<div className={styles.calendarScroll}><div className={styles.calendar} aria-label={`${month} 월간 캘린더`}>
            <div className={styles.weekdays}>{["일","월","화","수","목","금","토"].map(day=><div key={day}>{day}</div>)}</div>
            <div className={styles.grid}>{Array.from({length:cellCount},(_,index)=>{const day=index-bounds.offset+1;if(day<1||day>bounds.days)return <div key={index} className={styles.outside}/>;
              const date=`${month}-${String(day).padStart(2,"0")}`, events=visible.filter(plan=>planOnDate(plan,date));
              return <div key={date} className={`${styles.day} ${date===today?styles.today:""} ${date===selectedDate?styles.selectedDay:""}`}><button className={styles.dateButton} type="button" aria-label={`${date} 일정 보기`} aria-pressed={date===selectedDate} onClick={()=>{setSelectedDate(date);setSelectedId("");}}>{day}<span>{events.length?`${events.length}건`:""}</span></button><div className={styles.events}>{events.slice(0,3).map(plan=><button type="button" key={plan.id} style={creativeStyle(plan.creativeName)} className={`${styles.event} ${plan.operationStatus==="중단"||plan.operationStatus==="종료"?styles.inactive:""}`} title={`${plan.sourceLabel} · ${mediaPath(plan)} › ${plan.adProduct} › ${plan.creativeName||"소재명 미입력"}`} onClick={()=>choose(plan.id,date)}><strong>{mediaHierarchy(plan).isTv ? `TV · ${mediaHierarchy(plan).subcategory} · ` : ""}{plan.media} · {plan.adProduct}</strong><span><CreativeMarker name={plan.creativeName} />{plan.creativeName||"소재명 미입력"}</span><small className={plan.origin==="plan"?styles.planBadge:styles.registeredBadge}>{plan.origin==="plan"?"운영안":"등록 기간"}</small></button>)}{events.length>3 && <button type="button" className={styles.more} onClick={()=>{setSelectedDate(date);setSelectedId("");}}>+{events.length-3}개 모두 보기</button>}</div></div>;
            })}</div>
          </div></div>}{!plans.length && <p className={styles.empty}>선택한 월에 표시할 등록 소재가 없습니다. 운영안을 포함하거나 소재·게재지면에서 기간을 등록해주세요.</p>}{plans.length>0 && !visible.length && <p className={styles.empty}>표시 중인 상품이 없습니다. ON 설정과 검색어를 확인해주세요.</p>}
          </div>
        </div>
      </section></LayoutPanel>
      <LayoutPanel id="schedule:day-details" title="일자별 상세"><section className={styles.section}><div className={styles.toolbar}><div><h2>{selectedDate} 운영 일정</h2><p>날짜를 누르면 해당 일자의 모든 소재와 상품을 확인할 수 있습니다.</p></div><span>{dayPlans.length}건</span></div>{groupedRows(dayPlans,card)}{!dayPlans.length && <p className={styles.empty}>표시할 일정이 없습니다.</p>}</section></LayoutPanel>
      {selected && <LayoutPanel id="schedule:selected-product" title="선택 소재 상세"><section className={styles.section}><div className={styles.toolbar}><div><h2><CreativeMarker name={selected.creativeName} />{mediaPath(selected)} › {selected.adProduct} › {selected.creativeName||"소재명 미입력"}</h2><p>{selected.sourceLabel} · 원본: {selected.sourceSheet} {selected.sourceCell} · 자료/운영보고 기준 {selected.sourceAsOf||"미제공"}</p></div><span className="view-pill">{selected.operationStatus||"집행상태 미입력"}</span></div><dl className={styles.detail}>{[["원본 매체명",selected.platform],["분류",mediaPath(selected)],["자료상 운영기간",`${selected.periodStart||"시작 미지정"} ~ ${selected.periodEnd||"종료 미지정"}`],["진행 상태",selected.proposalStatus||"미입력"],["매체 유형",selected.category||"미입력"],["계획 예산",formatKrw(selected.budget)],["게재지면",selected.placement||"미입력"],["소재 유형",selected.creativeType||"미입력"],["기기",selected.device||"미입력"],["타겟팅",selected.target||"미입력"],["예상 노출",selected.expectedImpressions?.toLocaleString("ko-KR")??"미입력"],["예상 클릭",selected.expectedClicks?.toLocaleString("ko-KR")??"미입력"],["예상 조회",selected.expectedViews?.toLocaleString("ko-KR")??"미입력"],["예상 GRP",selected.expectedGrp?.toLocaleString("ko-KR")??"미입력"],["예상 CPRP",formatKrw(selected.expectedCprp??null)],["운영 참고",selected.sourceNotes||"미입력"]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{selected.origin==="plan"&&<MediaPlanLinks key={`${advertiser}:${month}:${selected.rowId || selected.id}`} plan={selected} datasets={datasets} />}{selected.sourceProof&&<div className={styles.sourceDetails}><p>{selected.sourceProof.status} · 원본 등록월 {selected.sourceProof.month}. 등록 자료의 기간이며 실시간 송출 확인이 아닙니다.</p>{selected.sourceProof.month===month ? <button type="button" className="btn" disabled={!canEdit||dataSyncState!=="ready"} onClick={()=>setEditingProof(selected.sourceProof!)}>이 소재 운영기간 수정</button> : <button type="button" className="btn" onClick={()=>setMonth(selected.sourceProof!.month)}>원본 등록월 {selected.sourceProof.month} 보기</button>}</div>}{linkedProofs.map((proof,index)=><CreativeUrlPreview key={proof.key || index} url={proof.previewUrl} label="등록 지면 미리보기" />)}<Link className="btn" href="/creative">소재·게재지면 열기</Link></section></LayoutPanel>}
      {editingProof&&<LayoutPanel id="schedule:period-editor" title="소재 운영기간 수정"><section className={styles.section}>{editorStale&&<p role="alert">원본 자료가 갱신됐습니다. 기존 입력을 덮어쓰지 않았습니다. 닫고 최신 자료를 다시 선택해주세요.</p>}<button type="button" className="btn" onClick={()=>setEditingProof(null)}>기간 편집 닫기</button><fieldset className={styles.editorFieldset} disabled={editorStale||dataSyncState!=="ready"}><PlacementSetupForm key={`${editingProof.key}:${editingProof.publishedAt}`} proof={editingProof} onClose={()=>setEditingProof(null)}/></fieldset></section></LayoutPanel>}
      {!!unscheduled.length && <LayoutPanel id="schedule:unscheduled" title="기간 미지정·확인 필요"><section className={styles.section}><h2>기간 미지정·확인 필요 · {unscheduled.length}건</h2><p className={styles.help}>시작일·종료일을 추정하지 않습니다. 일부 날짜만 있거나 날짜가 잘못된 자료는 기간 막대에 표시하지 않습니다. 카드를 선택해 원본을 확인하고 기간을 수정하세요.</p>{groupedRows(unscheduled,card)}</section></LayoutPanel>}
      <LayoutPanel id="schedule:media-mix" title="월 미디어믹스"><MediaMixEditor /></LayoutPanel>
    </LayoutCanvas>
  </>;
}
