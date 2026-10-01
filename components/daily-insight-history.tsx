"use client";

import { useState } from "react";
import type { PublishedInsight } from "@/lib/daily-report-store";
import { normalizeInsightText } from "@/lib/media-normalization";
import styles from "./daily-insight-history.module.css";

export function DailyInsightHistory({ insights }: { insights: PublishedInsight[] }) {
  const [selectedDate, setSelectedDate] = useState("");
  const dates = [...new Set(insights.map(item => item.reportDate))].sort().reverse();
  const activeDate = dates.includes(selectedDate) ? selectedDate : dates[0];
  const selected = insights.filter(item => item.reportDate === activeDate)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return <div className={styles.history}>
    {!dates.length ? <p className="empty-inline">반영된 데일리 인사이트가 없습니다.</p> : <>
      <div className={styles.dates} role="group" aria-label="인사이트 날짜 선택">
        {dates.map(date => <button type="button" key={date} aria-pressed={date === activeDate}
          className={date === activeDate ? styles.active : styles.date}
          onClick={() => setSelectedDate(date)}>{date}</button>)}
      </div>
      <div className={styles.detail} aria-live="polite">
        <h3>{activeDate} 인사이트</h3>
        {selected.map(item => <details className={styles.entry} key={item.key} open>
          <summary>{normalizeInsightText(item.mailSubject) || "데일리 운영 인사이트"}</summary>
          {item.mailDate && <p className={styles.meta}>메일 수신: {new Date(item.mailDate).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
          {item.notes.length ? item.notes.map((note, index) => <p key={index}>{normalizeInsightText(note)}</p>) : <p>등록된 상세 내용이 없습니다.</p>}
        </details>)}
      </div>
    </>}
  </div>;
}
