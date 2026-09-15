"use client";

import { useMemo, useState } from "react";
import styles from "./schedule.module.css";

type Category = "프로모션" | "Digital" | "Video/OTT" | "OOH";
type PreviewType = "feed" | "video" | "ooh" | "promo";

type ScheduleEvent = {
  id: string;
  title: string;
  category: Category;
  start: number;
  end: number;
  detail: string;
  placement: string;
  preview: PreviewType;
};

const events: ScheduleEvent[] = [
  { id:"campaign", title:"40주년 캠페인", category:"프로모션", start:1, end:30, detail:"월간 메인 브랜드 캠페인 · 샘플 일정", placement:"브랜드 캠페인", preview:"promo" },
  { id:"meta", title:"Meta 정성편", category:"Digital", start:1, end:30, detail:"Instagram Feed / Reels", placement:"Instagram Feed · Reels", preview:"feed" },
  { id:"naver", title:"NAVER GFA", category:"Digital", start:3, end:30, detail:"Native Feed · 프리미엄 가죽 소재", placement:"NAVER GFA Native", preview:"feed" },
  { id:"google", title:"Google / DV360", category:"Video/OTT", start:1, end:30, detail:"YouTube / Video Reach", placement:"YouTube · DV360 Video", preview:"video" },
  { id:"tving", title:"TVING Pre-roll", category:"Video/OTT", start:5, end:25, detail:"CTV/OTT 정성편 30s", placement:"TVING Pre-roll", preview:"video" },
  { id:"focus", title:"Focus Media", category:"OOH", start:1, end:30, detail:"엘리베이터 TV · 서울/경기", placement:"엘리베이터 TV", preview:"ooh" },
  { id:"bus", title:"서울버스TV", category:"OOH", start:10, end:30, detail:"신규 CF 런칭 소재", placement:"서울버스TV", preview:"ooh" },
  { id:"promo", title:"CF 오픈 기념 프로모션", category:"프로모션", start:11, end:20, detail:"온라인 프로모션 · 샘플 일정", placement:"자코모 공식몰 기획전", preview:"promo" }
];

const promotions = events.filter((event) => event.category === "프로모션");

const categoryClass: Record<Category, string> = {
  "프로모션": styles.promo,
  "Digital": styles.digital,
  "Video/OTT": styles.video,
  "OOH": styles.ooh
};

function PlacementPreview({ event }: { event: ScheduleEvent }) {
  if (event.preview === "ooh") return <div className={`${styles.preview} ${styles.previewOoh}`}><span className={styles.previewBadge}>{event.placement}</span><div className={styles.elevator}><div className={styles.screen}><small>JACOMO</small><strong>40TH</strong><span>소파는 결국 자코모.</span></div></div></div>;
  if (event.preview === "video") return <div className={`${styles.preview} ${styles.previewVideo}`}><span className={styles.previewBadge}>{event.placement}</span><div className={styles.videoCanvas}><small>JACOMO 40TH</small><strong>소파는 결국 자코모.</strong><button type="button" aria-label="영상 재생">▶</button><div className={styles.videoBar}/></div></div>;
  if (event.preview === "feed") return <div className={`${styles.preview} ${styles.previewFeed}`}><span className={styles.previewBadge}>{event.placement}</span><div className={styles.phone}><div className={styles.phoneHead}>Sponsored</div><div className={styles.phoneCreative}><small>JACOMO</small><strong>40TH</strong><span>소파는 결국 자코모.</span></div><div className={styles.phoneLines}><i/><i/><i/></div></div></div>;
  return <div className={`${styles.preview} ${styles.previewPromo}`}><span className={styles.previewBadge}>{event.placement}</span><div className={styles.promoCanvas}><small>SEPTEMBER PROMOTION</small><strong>{event.title}</strong><span>{event.start}–{event.end} SEP</span></div></div>;
}

export default function SchedulePage() {
  const [active, setActive] = useState<Category | "전체">("전체");
  const [selectedDay, setSelectedDay] = useState(15);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent>(events[1]);
  const filtered = active === "전체" ? events : events.filter((event) => event.category === active);

  const days = useMemo(() => {
    const result: { day: number | null; events: ScheduleEvent[] }[] = [];
    for (let i = 0; i < 2; i++) result.push({ day: null, events: [] });
    for (let day = 1; day <= 30; day++) result.push({ day, events: filtered.filter((event) => day >= event.start && day <= event.end) });
    while (result.length % 7 !== 0) result.push({ day: null, events: [] });
    return result;
  }, [filtered]);

  const selectedEvents = filtered.filter((event) => selectedDay >= event.start && selectedDay <= event.end);

  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">Schedule</div>
          <h1 className="page-title">프로모션 · 광고 온에어</h1>
          <p className="page-desc">이번 달 주요 일정과 매체별 온에어 기간을 먼저 보고, 필요한 일정은 바로 게재지면까지 확인합니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">2026년 9월 · SAMPLE</span></div>
      </div>

      <section className={styles.monthSummary}>
        <div className={styles.summaryLead}><span>SEPTEMBER</span><strong>9월 운영 요약</strong><p>프로모션 2건 · LIVE 매체 6개 · 종료 예정 1건</p></div>
        <div className={styles.promoSummary}>
          {promotions.map((promo) => <button type="button" key={promo.id} className={styles.promoCard} onClick={() => setSelectedEvent(promo)}><span>{promo.start}–{promo.end} SEP</span><strong>{promo.title}</strong><small>{promo.detail}</small></button>)}
        </div>
        <div className={styles.summaryStats}><div><span>LIVE</span><strong>6</strong></div><div><span>소재</span><strong>24</strong></div><div><span>확인 필요</span><strong>2</strong></div></div>
      </section>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(["전체","프로모션","Digital","Video/OTT","OOH"] as const).map((item) => <button key={item} className={`${styles.filter} ${active === item ? styles.filterActive : ""}`} onClick={() => setActive(item)}>{item}</button>)}
        </div>
        <div className={styles.monthNav}><button className={styles.monthButton}>‹</button><strong className={styles.monthLabel}>2026.09</strong><button className={styles.monthButton}>›</button></div>
      </div>

      <section className={styles.timelineSection}>
        <div className={styles.sectionHead}><div><h2>매체별 온에어 타임라인</h2><p>캘린더보다 빠르게 전체 집행기간을 비교하고, 행을 클릭해 게재지면을 확인합니다.</p></div><span>SEP 01–30</span></div>
        <div className={styles.gantt}>
          <div className={styles.ganttHeader}><span>매체 / 일정</span><div className={styles.ganttDays}>{[1,5,10,15,20,25,30].map(day => <i key={day}>{day}</i>)}</div></div>
          {filtered.map((event) => {
            const left = ((event.start - 1) / 30) * 100;
            const width = ((event.end - event.start + 1) / 30) * 100;
            return <button type="button" key={event.id} className={`${styles.ganttRow} ${selectedEvent.id === event.id ? styles.ganttRowActive : ""}`} onClick={() => setSelectedEvent(event)}><div className={styles.ganttName}><span className={`${styles.categoryDot} ${categoryClass[event.category]}`}/><div><strong>{event.title}</strong><small>{event.placement}</small></div></div><div className={styles.ganttTrack}><span className={`${styles.ganttBar} ${categoryClass[event.category]}`} style={{left:`${left}%`,width:`${width}%`}}>{event.start}–{event.end}</span></div><span className={styles.viewPlacement}>지면 보기 →</span></button>;
          })}
        </div>
      </section>

      <div className={styles.mainGrid}>
        <section className={styles.calendarWrap}>
          <div className={styles.calendarTitle}><div><h2>월간 캘린더</h2><p>세부 일정 확인용 보조 뷰</p></div><span>{selectedDay}일 선택</span></div>
          <div className={styles.calendar}>
            <div className={styles.weekdays}>{["SUN","MON","TUE","WED","THU","FRI","SAT"].map((day) => <div key={day} className={styles.weekday}>{day}</div>)}</div>
            <div className={styles.grid}>
              {days.map((cell, index) => <button type="button" key={`${cell.day ?? "blank"}-${index}`} className={`${styles.day} ${cell.day ? "" : styles.dayOutside} ${cell.day === selectedDay ? styles.daySelected : ""} ${cell.day === 15 ? styles.dayToday : ""}`} onClick={() => cell.day && setSelectedDay(cell.day)} disabled={!cell.day}>
                <div className={`${styles.date} ${cell.day ? "" : styles.dateMuted}`}>{cell.day ?? ""}</div>
                <div className={styles.events}>{cell.events.slice(0,3).map((event) => <span key={event.id} className={`${styles.event} ${categoryClass[event.category]}`} onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); }} title={event.title}>{event.title}</span>)}{cell.events.length > 3 && <span className={`${styles.event} ${styles.more}`}>+{cell.events.length - 3}</span>}</div>
              </button>)}
            </div>
          </div>
        </section>

        <aside className={styles.placementPanel}>
          <div className={styles.placementHead}><div><span>{selectedEvent.category}</span><h2>{selectedEvent.title}</h2><p>{selectedEvent.detail}</p></div><span className={styles.liveBadge}>● LIVE</span></div>
          <PlacementPreview event={selectedEvent}/>
          <div className={styles.placementMeta}><div><span>집행기간</span><strong>09.{String(selectedEvent.start).padStart(2,"0")} – 09.{String(selectedEvent.end).padStart(2,"0")}</strong></div><div><span>게재지면</span><strong>{selectedEvent.placement}</strong></div><div><span>최근 게재 확인</span><strong>09.14</strong></div></div>
          <button type="button" className={styles.openCreative}>Creative & Placement에서 상세 보기 →</button>
          <div className={styles.dayList}><h3>9월 {selectedDay}일 진행 중</h3>{selectedEvents.map((event) => <button type="button" key={event.id} onClick={() => setSelectedEvent(event)}><span className={`${styles.categoryDot} ${categoryClass[event.category]}`}/><div><strong>{event.title}</strong><small>{event.placement}</small></div></button>)}</div>
        </aside>
      </div>
    </>
  );
}
