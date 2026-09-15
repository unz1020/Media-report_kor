"use client";

import { useMemo, useState } from "react";
import styles from "./schedule.module.css";

type Category = "프로모션" | "Digital" | "Video/OTT" | "OOH";

type ScheduleEvent = {
  id: string;
  title: string;
  category: Category;
  start: number;
  end: number;
  detail: string;
};

const events: ScheduleEvent[] = [
  { id:"campaign", title:"40주년 캠페인", category:"프로모션", start:1, end:30, detail:"월간 메인 브랜드 캠페인 · 샘플 일정" },
  { id:"meta", title:"Meta 정성편", category:"Digital", start:1, end:30, detail:"Instagram Feed / Reels" },
  { id:"naver", title:"NAVER GFA", category:"Digital", start:3, end:30, detail:"Native Feed · 프리미엄 가죽 소재" },
  { id:"google", title:"Google / DV360", category:"Video/OTT", start:1, end:30, detail:"YouTube / Video Reach" },
  { id:"tving", title:"TVING Pre-roll", category:"Video/OTT", start:5, end:25, detail:"CTV/OTT 정성편 30s" },
  { id:"focus", title:"Focus Media", category:"OOH", start:1, end:30, detail:"엘리베이터 TV · 서울/경기" },
  { id:"bus", title:"서울버스TV", category:"OOH", start:10, end:30, detail:"신규 CF 런칭 소재" },
  { id:"promo", title:"온라인 프로모션", category:"프로모션", start:11, end:20, detail:"CF 오픈 기념 프로모션 · 샘플" }
];

const categoryClass: Record<Category, string> = {
  "프로모션": styles.promo,
  "Digital": styles.digital,
  "Video/OTT": styles.video,
  "OOH": styles.ooh
};

export default function SchedulePage() {
  const [active, setActive] = useState<Category | "전체">("전체");
  const [selectedDay, setSelectedDay] = useState(15);
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
          <h1 className="page-title">프로모션 · 광고 온에어 캘린더</h1>
          <p className="page-desc">Media Mix의 시작/종료일과 프로모션 일정을 한 달 기준으로 함께 봅니다. 현재 일정은 UI 검증용 샘플입니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">2026년 9월 · SAMPLE</span></div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(["전체","프로모션","Digital","Video/OTT","OOH"] as const).map((item) => <button key={item} className={`${styles.filter} ${active === item ? styles.filterActive : ""}`} onClick={() => setActive(item)}>{item}</button>)}
        </div>
        <div className={styles.monthNav}><button className={styles.monthButton}>‹</button><strong className={styles.monthLabel}>2026.09</strong><button className={styles.monthButton}>›</button></div>
      </div>

      <div className={styles.layout}>
        <section className={styles.calendar}>
          <div className={styles.weekdays}>{["SUN","MON","TUE","WED","THU","FRI","SAT"].map((day) => <div key={day} className={styles.weekday}>{day}</div>)}</div>
          <div className={styles.grid}>
            {days.map((cell, index) => <button type="button" key={`${cell.day ?? "blank"}-${index}`} className={`${styles.day} ${cell.day ? "" : styles.dayOutside} ${cell.day === 15 ? styles.dayToday : ""}`} onClick={() => cell.day && setSelectedDay(cell.day)} disabled={!cell.day}>
              <div className={`${styles.date} ${cell.day ? "" : styles.dateMuted}`}>{cell.day ?? ""}</div>
              <div className={styles.events}>{cell.events.slice(0,4).map((event) => <span key={event.id} className={`${styles.event} ${categoryClass[event.category]}`} title={event.title}>{event.title}</span>)}{cell.events.length > 4 && <span className={`${styles.event} ${styles.digital}`}>+{cell.events.length - 4} more</span>}</div>
            </button>)}
          </div>
        </section>

        <aside className={styles.side}>
          <section className={styles.panel}><h3>9월 운영 요약</h3><p>프로모션과 매체 온에어 기간을 함께 관리합니다.</p><div className={styles.statGrid}><div className={styles.stat}><span>LIVE 매체</span><strong>6</strong></div><div className={styles.stat}><span>프로모션</span><strong>2</strong></div><div className={styles.stat}><span>이번주 종료</span><strong>1</strong></div><div className={styles.stat}><span>확인 필요</span><strong>2</strong></div></div></section>
          <section className={styles.panel}><h3>9월 {selectedDay}일</h3><p>선택 날짜에 진행 중인 일정입니다.</p><div className={styles.timeline}>{selectedEvents.length ? selectedEvents.map((event) => <div key={event.id} className={styles.timelineItem}><span className={styles.timelineDate}>{event.start === event.end ? `${event.start}일` : `${event.start}-${event.end}`}</span><i className={styles.timelineDot}/><div className={styles.timelineCopy}><strong>{event.title}</strong><span>{event.detail}</span></div></div>) : <p>해당 날짜의 일정이 없습니다.</p>}</div></section>
          <section className={styles.panel}><h3>구분</h3><p>실서비스에서는 Media Mix와 프로모션 마스터에서 자동 생성됩니다.</p><div className={styles.legend}><span className={styles.promo}>프로모션</span><span className={styles.digital}>Digital</span><span className={styles.video}>Video/OTT</span><span className={styles.ooh}>OOH</span></div></section>
        </aside>
      </div>
    </>
  );
}
