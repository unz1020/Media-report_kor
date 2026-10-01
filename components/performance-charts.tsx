"use client";
import { useMemo, useState } from "react";
import { dailyMetricSeries, displayMetric, type ComparisonMetric, type MetricFact, type MetricKey } from "@/lib/performance-visuals";
import styles from "./performance-visuals.module.css";
const LABELS:Record<MetricKey,string>={impressions:"노출",clicks:"클릭",ctr:"CTR",spend:"집행액"};
function shortValue(value:number,metric:MetricKey){return metric==="ctr"?`${value.toFixed(2)}%`:new Intl.NumberFormat("ko-KR",{notation:"compact",maximumFractionDigits:1}).format(value);}
export function PerformanceCharts({ comparison, dailyRows, startDate, endDate, mode }: {
  comparison: ComparisonMetric[]; dailyRows: Array<MetricFact & {date:string}>; startDate:string; endDate:string; mode:"placement"|"creative";
}) {
  const [selectedMetric,setSelectedMetric]=useState<MetricKey>("impressions");
  const [activeDate,setActiveDate]=useState("");
  const options=(Object.keys(LABELS) as MetricKey[]).filter(key=>key!=="spend"||comparison.some(item=>item.metrics.spend!==null));
  const metric=options.includes(selectedMetric)?selectedMetric:"impressions";
  const series=useMemo(()=>dailyMetricSeries(dailyRows,startDate,endDate),[dailyRows,startDate,endDate]);
  const known=series.filter(point=>point.metrics?.[metric]!=null);
  const highest=Math.max(0,...known.map(point=>point.metrics![metric]!));
  const maximum=highest>0?highest*1.1:1;
  const x=(index:number)=>70+(series.length<=1?345:index/(series.length-1)*690);
  const y=(value:number)=>214-value/maximum*176;
  const paths:string[]=[];let segment="";
  series.forEach((point,index)=>{const value=point.metrics?.[metric];if(value==null){if(segment)paths.push(segment);segment="";}else segment+=`${segment?" L":"M"}${x(index)},${y(value)}`;});if(segment)paths.push(segment);
  const selected=known.find(point=>point.date===activeDate)||known.at(-1);
  const bars=[...comparison].sort((a,b)=>(b.metrics[metric]??-1)-(a.metrics[metric]??-1));
  const barHighest=Math.max(0,...bars.map(item=>item.metrics[metric]??0));
  const barMax=barHighest>0?barHighest:1;
  return <section className={styles.charts} aria-label="성과 그래프">
    <div className={styles.chartHead}><div><h2>성과 그래프</h2><p>{mode === "creative" ? `${endDate} · 소재별 하루 성과` : `${startDate} ~ ${endDate} · 선택한 매체 기준`}</p></div><label>그래프 지표<select aria-label="그래프 지표" value={metric} onChange={event=>{setSelectedMetric(event.target.value as MetricKey);setActiveDate("");}}>{options.map(key=><option key={key} value={key}>{LABELS[key]}</option>)}</select></label></div>
    <div className={mode==="placement"?styles.chartGrid:styles.singleChart}>
      {mode==="placement" && <article className={styles.chartCard}><div className={styles.chartTitle}><h3>일별 {LABELS[metric]} 추이</h3><span aria-live="polite">{selected?`${selected.date.slice(5)} · ${displayMetric(selected.metrics?.[metric],metric)}`:"일별 데이터 없음"}</span></div>
        {known.length?<><div className={styles.lineWrap}><svg viewBox="0 0 800 260" role="group" aria-label={`일별 ${LABELS[metric]} 추이 그래프`}>
          {[0,1,2,3,4].map(tick=>{const value=maximum*tick/4;return <g key={tick}><line x1="70" x2="760" y1={y(value)} y2={y(value)} stroke="#eaecf0"/><text x="61" y={y(value)+4} textAnchor="end" fill="#667085" fontSize="11">{shortValue(value,metric)}</text></g>;})}
          {paths.map((path,index)=><path key={index} d={path} fill="none" stroke="#6172f3" strokeWidth="2.5"/>)}
          {series.map((point,index)=>point.metrics?.[metric]==null?null:<circle key={point.date} cx={x(index)} cy={y(point.metrics[metric]!)} r={selected?.date===point.date?5:3.5} fill="#6172f3" tabIndex={0} role="button" aria-label={`${point.date} ${LABELS[metric]} ${displayMetric(point.metrics[metric],metric)}`} onFocus={()=>setActiveDate(point.date)} onMouseEnter={()=>setActiveDate(point.date)} onClick={()=>setActiveDate(point.date)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setActiveDate(point.date);}}}><title>{point.date}: {displayMetric(point.metrics[metric],metric)}</title></circle>)}
          {[...new Set([0,Math.floor((series.length-1)/2),series.length-1])].filter(index=>index>=0).map(index=><text key={index} x={x(index)} y="244" textAnchor="middle" fill="#667085" fontSize="11">{series[index]?.date.slice(5).replace("-","/")}</text>)}
        </svg></div><p className={styles.chartNote}>점에 마우스를 올리거나 선택하면 해당 일자의 수치를 확인할 수 있습니다. 미제공 날짜는 선을 연결하지 않습니다.</p></>:<p className={styles.chartEmpty}>선택한 기간에 {LABELS[metric]} 일별 데이터가 없습니다. 원본의 누적 성과는 지면별 비교 그래프에서 확인하세요.</p>}
      </article>}
      <article className={styles.chartCard}><div className={styles.chartTitle}><h3>{mode==="placement"?"지면":"소재"}별 {LABELS[metric]} 비교</h3><span>{comparison.length}개 {mode==="placement"?"지면":"소재"}</span></div><div className={styles.bars} aria-label={`${mode==="placement"?"지면":"소재"}별 ${LABELS[metric]} 비교`}>
        {bars.map(item=><div className={styles.barRow} key={item.key}><div className={styles.barLabel}><span>{item.label}</span><strong>{displayMetric(item.metrics[metric],metric)}</strong></div><div className={styles.barTrack}><div className={styles.barFill} style={{width:`${item.metrics[metric]==null?0:item.metrics[metric]!/barMax*100}%`}}/></div></div>)}
        {!bars.length && <p className={styles.chartEmpty}>표시할 성과가 없습니다.</p>}
      </div></article>
    </div><p className={styles.chartNote}>CTR = 클릭수 ÷ 클릭 지표가 제공된 지면의 노출수 × 100. 일별 그래프는 일별 원본, 비교 그래프는 {mode === "creative" ? "선택 기준일의 소재 성과" : "선택 기간의 성과표"} 기준입니다.</p>
  </section>;
}
