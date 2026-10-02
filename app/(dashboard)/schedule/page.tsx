"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LayoutCanvas, LayoutPanel } from "@/components/layout-canvas";
import { MediaMixEditor } from "@/components/media-mix-editor";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, publishedPlacementProofsFor, type PublishedDataset } from "@/lib/daily-report-store";
import { formatKrw, mediaPlansFromDatasets } from "@/lib/reporting-data";
import { canonicalMedia } from "@/lib/media-normalization";
import { mediaHierarchy, mediaPath } from "@/lib/media-hierarchy";
import { MediaPlanLinks } from "@/components/media-plan-links";
import { CreativeUrlPreview } from "@/components/creative-url-preview";
import type { PlacementProof } from "@/lib/placement-proof";
import { monthBounds, planOnDate, planOverlapsMonth, productKey, scheduleProduct } from "@/lib/schedule-data";
import styles from "./schedule.module.css";

export default function SchedulePage() {
  const {advertiser,month,session} = useWorkspace();
  return <Schedule key={`${session?.user.email}:${advertiser}:${month}`} />;
}
function Schedule() {
  const { advertiser, month, setMonth, session } = useWorkspace();
  const [datasets,setDatasets] = useState<PublishedDataset[]>([]);
  const [proofs,setProofs] = useState<PlacementProof[]>([]);
  const [hidden,setHidden] = useState<string[]>([]), [filterReady,setFilterReady] = useState(false);
  const [query,setQuery] = useState(""), [selectedId,setSelectedId] = useState(""), [selectedDate,setSelectedDate] = useState(month+"-01");
  const preferenceKey = `media-report-calendar:${session?.user.email}:${advertiser}:${month}`;
  useEffect(() => { const load=()=>{setDatasets(publishedDatasetsFor(advertiser,month));setProofs(publishedPlacementProofsFor(advertiser,month));}; load(); window.addEventListener("media-report-daily-updated",load);
    return ()=>window.removeEventListener("media-report-daily-updated",load); },[advertiser,month]);
  useEffect(()=>{try { const parsed=JSON.parse(localStorage.getItem(preferenceKey)||"[]"); if(Array.isArray(parsed))setHidden(parsed.filter(item=>typeof item==="string")); }catch{} setFilterReady(true);},[preferenceKey]);
  useEffect(()=>{if(filterReady)try{localStorage.setItem(preferenceKey,JSON.stringify(hidden));}catch{}},[hidden,filterReady,preferenceKey]);
  const plans=useMemo(()=>mediaPlansFromDatasets(datasets).filter(plan=>planOverlapsMonth(plan,month)).map((plan,index)=>({...plan,id:String(index),media:canonicalMedia(plan.platform),adProduct:scheduleProduct(plan),productKey:productKey(plan)})),[datasets,month]);
  const groups=useMemo(()=>{
    const map=new Map<string,Map<string,Map<string,typeof plans>>>();
    for(const plan of plans){ const hierarchy=mediaHierarchy(plan), category=hierarchy.isTv?'TV':plan.media, subcategory=hierarchy.subcategory;
      const sections=map.get(category)||new Map<string,Map<string,typeof plans>>(), products=sections.get(subcategory)||new Map<string,typeof plans>();
      const rows=products.get(plan.productKey)||[];rows.push(plan);products.set(plan.productKey,rows);sections.set(subcategory,products);map.set(category,sections); }
    return [...map].map(([category,sections])=>({category,sections:[...sections].map(([subcategory,products])=>({subcategory,products:[...products].map(([key,rows])=>({key,label:rows[0].adProduct,media:rows[0].media,rows}))}))}));
  },[plans]);
  const visible=plans.filter(plan=>!hidden.includes(plan.productKey) && `${mediaPath(plan)} ${plan.adProduct} ${plan.placement} ${plan.creativeName||""}`.toLowerCase().includes(query.toLowerCase()));
  const selected=visible.find(plan=>plan.id===selectedId);
  const linkedProofs=selected ? proofs.filter(proof=>canonicalMedia(proof.media)===selected.media && [selected.product, selected.placement, selected.adProduct].includes(proof.placement) && Boolean(proof.creativeName && selected.creativeName && proof.creativeName===selected.creativeName)) : [];
  const dayPlans=visible.filter(plan=>planOnDate(plan,selectedDate));
  const unscheduled=visible.filter(plan=>!plan.periodStart || !plan.periodEnd);
  const bounds=monthBounds(month), cellCount=Math.ceil((bounds.offset+bounds.days)/7)*7;
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  function toggle(key:string){setHidden(current=>current.includes(key)?current.filter(item=>item!==key):[...current,key]);}
  function shiftMonth(amount:number){const [year,m]=month.split("-").map(Number);setMonth(new Date(Date.UTC(year,m-1+amount,1)).toISOString().slice(0,7));}
  function choose(id:string,date?:string){setSelectedId(id);if(date)setSelectedDate(date);}
  const card=(plan:typeof plans[number])=><button type="button" key={plan.id} className={`${styles.planCard} ${selected?.id===plan.id?styles.planActive:""}`} onClick={()=>choose(plan.id)}><strong>{mediaPath(plan)} › {plan.adProduct}</strong><span>{plan.creativeName||"소재명 미입력"}</span><small>{plan.periodStart && plan.periodEnd?`${plan.periodStart} ~ ${plan.periodEnd}`:"일정 미입력"} · {plan.operationStatus||"집행상태 미입력"}</small></button>;
  return <>
    <div className="page-head refined-head"><div><div className="eyebrow">Schedule</div><h1 className="page-title">{advertiser} 운영 캘린더</h1><p className="page-desc">TV는 지상파·케이블 → 방송사·상품 → 소재로, 디지털은 매체 → 상품 → 소재로 일정을 확인합니다. 상품 표시를 ON/OFF해 필요한 일정만 보세요.</p></div><div className="page-meta"><span className="view-pill">{month}</span></div></div>
    <LayoutCanvas page="schedule">
      <LayoutPanel id="schedule:media-mix" title="월 미디어믹스"><MediaMixEditor /></LayoutPanel>
      <LayoutPanel id="schedule:calendar" title="운영 캘린더"><section className={styles.section}>
        <div className={styles.toolbar}><div><h2>{month.replace("-","년 ")}월</h2><p>{groups.length}개 상위 분류 · {new Set(plans.map(plan=>plan.productKey)).size}개 상품 · {plans.length}개 운영안</p></div><div className={styles.nav}><button type="button" className="btn" onClick={()=>shiftMonth(-1)} aria-label="이전 월">←</button><button type="button" className="btn" onClick={()=>setMonth(today.slice(0,7))}>이번 달</button><button type="button" className="btn" onClick={()=>shiftMonth(1)} aria-label="다음 월">→</button></div></div>
        <div className={styles.filters}><label>매체·상품·소재 검색<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="네이버, GFA, 소재명" /></label><div className={styles.nav}><button type="button" className="btn" onClick={()=>setHidden([])}>전체 ON</button><button type="button" className="btn" onClick={()=>setHidden([...new Set(plans.map(plan=>plan.productKey))])}>전체 OFF</button></div></div>
        <p className={styles.help}>ON/OFF는 캘린더 표시 설정입니다. 실제 집행상태는 미디어믹스에서 수정하세요. 표시 설정은 계정·광고주·월별로 유지됩니다.</p>
        <div className={styles.workspace}>
          <aside className={styles.tree} aria-label="매체 상품 소재 분류">{!groups.length && <p>미디어믹스를 저장하면 분류가 표시됩니다.</p>}{groups.map(group=><details key={group.category} open><summary>{group.category}</summary>{group.sections.map(section=>{
            const products=section.products.map(product=><div className={styles.product} key={product.key}><div className={styles.productHead}><strong>{group.category==='TV'?`${product.media} · `:''}{product.label}</strong><button type="button" role="switch" aria-checked={!hidden.includes(product.key)} aria-label={`${product.media} ${product.label} 캘린더 표시`} className={hidden.includes(product.key)?styles.switchOff:styles.switchOn} onClick={()=>toggle(product.key)}>{hidden.includes(product.key)?"OFF":"ON"}</button></div><details><summary>소재 {product.rows.length}개</summary>{product.rows.map(plan=><button type="button" className={styles.leaf} key={plan.id} disabled={hidden.includes(product.key)} onClick={()=>choose(plan.id,plan.periodStart ? plan.periodStart<bounds.start?bounds.start:plan.periodStart : undefined)}>{plan.creativeName||"소재명 미입력"}<small>{plan.placement || plan.creativeType || "지면 미입력"}</small></button>)}</details></div>);
            return section.subcategory?<details key={section.subcategory} open className={styles.tvGroup}><summary>{section.subcategory}</summary>{products}</details>:<div key="products">{products}</div>;
          })}</details>)}</aside>
          <div className={styles.calendarArea}><div className={styles.calendarScroll}><div className={styles.calendar} aria-label={`${month} 월간 캘린더`}>
            <div className={styles.weekdays}>{["일","월","화","수","목","금","토"].map(day=><div key={day}>{day}</div>)}</div>
            <div className={styles.grid}>{Array.from({length:cellCount},(_,index)=>{const day=index-bounds.offset+1;if(day<1||day>bounds.days)return <div key={index} className={styles.outside}/>;
              const date=`${month}-${String(day).padStart(2,"0")}`, events=visible.filter(plan=>planOnDate(plan,date));
              return <div key={date} className={`${styles.day} ${date===today?styles.today:""} ${date===selectedDate?styles.selectedDay:""}`}><button className={styles.dateButton} type="button" aria-label={`${date} 일정 보기`} aria-pressed={date===selectedDate} onClick={()=>{setSelectedDate(date);setSelectedId("");}}>{day}<span>{events.length?`${events.length}건`:""}</span></button><div className={styles.events}>{events.slice(0,3).map(plan=><button type="button" key={plan.id} className={`${styles.event} ${plan.operationStatus==="중단"||plan.operationStatus==="종료"?styles.inactive:""}`} title={`${mediaPath(plan)} › ${plan.adProduct} › ${plan.creativeName||"소재명 미입력"}`} onClick={()=>choose(plan.id,date)}><strong>{mediaHierarchy(plan).isTv ? `TV · ${mediaHierarchy(plan).subcategory} · ` : ""}{plan.media} · {plan.adProduct}</strong><span>{plan.creativeName||"소재명 미입력"}</span></button>)}{events.length>3 && <button type="button" className={styles.more} onClick={()=>{setSelectedDate(date);setSelectedId("");}}>+{events.length-3}개 모두 보기</button>}</div></div>;
            })}</div>
          </div></div>{!plans.length && <p className={styles.empty}>선택한 월의 운영안이 없습니다. 위에서 미디어믹스를 업데이트해주세요.</p>}{plans.length>0 && !visible.length && <p className={styles.empty}>표시 중인 상품이 없습니다. ON 설정과 검색어를 확인해주세요.</p>}
          </div>
        </div>
      </section></LayoutPanel>
      <LayoutPanel id="schedule:day-details" title="일자별 상세"><section className={styles.section}><div className={styles.toolbar}><div><h2>{selectedDate} 운영 일정</h2><p>날짜를 누르면 해당 일자의 모든 소재와 상품을 확인할 수 있습니다.</p></div><span>{dayPlans.length}건</span></div><div className={styles.cardList}>{dayPlans.map(card)}</div>{!dayPlans.length && <p className={styles.empty}>표시할 일정이 없습니다.</p>}</section></LayoutPanel>
      {selected && <LayoutPanel id="schedule:selected-product" title="선택 소재 상세"><section className={styles.section}><div className={styles.toolbar}><div><h2>{mediaPath(selected)} › {selected.adProduct} › {selected.creativeName||"소재명 미입력"}</h2><p>운영안 원본: {selected.sourceSheet} {selected.sourceCell} · {selected.scenario}</p></div><span className="view-pill">{selected.operationStatus||"집행상태 미입력"}</span></div><dl className={styles.detail}>{[["분류",mediaPath(selected)],["집행기간",`${selected.periodStart||"미입력"} ~ ${selected.periodEnd||"미입력"}`],["진행 상태",selected.proposalStatus||"미입력"],["매체 유형",selected.category||"미입력"],["계획 예산",formatKrw(selected.budget)],["게재지면",selected.placement||"미입력"],["소재 유형",selected.creativeType||"미입력"],["기기",selected.device||"미입력"],["타겟팅",selected.target||"미입력"],["예상 노출",selected.expectedImpressions?.toLocaleString("ko-KR")??"미입력"],["예상 클릭",selected.expectedClicks?.toLocaleString("ko-KR")??"미입력"],["예상 조회",selected.expectedViews?.toLocaleString("ko-KR")??"미입력"],["예상 GRP",selected.expectedGrp?.toLocaleString("ko-KR")??"미입력"],["예상 CPRP",formatKrw(selected.expectedCprp??null)],["운영 참고",selected.sourceNotes||"미입력"]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><MediaPlanLinks key={`${advertiser}:${month}:${selected.rowId || selected.id}`} plan={selected} datasets={datasets} />{linkedProofs.map((proof,index)=><CreativeUrlPreview key={proof.key || index} url={proof.previewUrl} label="등록 지면 미리보기" />)}<Link className="btn" href="/creative">소재·게재지면 열기</Link></section></LayoutPanel>}
      {!!unscheduled.length && <LayoutPanel id="schedule:unscheduled" title="일정 미입력"><section className={styles.section}><h2>일정 미입력 · {unscheduled.length}건</h2><p className={styles.help}>기간을 입력하면 캘린더에 표시됩니다.</p><div className={styles.cardList}>{unscheduled.map(card)}</div></section></LayoutPanel>}
    </LayoutCanvas>
  </>;
}
