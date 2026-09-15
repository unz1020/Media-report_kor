import type { ReactNode } from "react";

export function PlatformMark({ platform, className }: { platform: string; className?: string }) {
  const short = platform === "Meta" ? "∞" : platform === "NAVER" ? "N" : platform === "DV360" ? "DV" : platform === "Kakao" ? "K" : platform === "TVING" ? "T" : platform === "Focus Media" ? "FM" : platform.slice(0, 2).toUpperCase();
  return <span className={`platform-mark ${className ?? ""}`} aria-hidden="true">{short}</span>;
}

export function ReportToolbar({ right }: { right?: ReactNode }) {
  return (
    <div className="report-toolbar">
      <div className="report-toolbar-left">
        <button className="toolbar-control toolbar-date"><span className="toolbar-icon">◷</span><span>2026.09.01–09.15</span><span className="toolbar-caret">⌄</span></button>
        <button className="toolbar-control"><span>비교</span><strong>직전 동기간</strong><span className="toolbar-caret">⌄</span></button>
        <button className="toolbar-control"><span className="toolbar-icon">≡</span><span>필터</span><span className="filter-count">3</span></button>
        <div className="filter-token-row" aria-label="활성 필터">
          <span className="filter-token">상태: LIVE <button aria-label="필터 제거">×</button></span>
          <span className="filter-token">광고주: 자코모 <button aria-label="필터 제거">×</button></span>
        </div>
      </div>
      <div className="report-toolbar-right">
        {right}
        <button className="toolbar-control compact"><span className="toolbar-icon">▦</span><span>열 설정</span></button>
        <button className="toolbar-control compact"><span className="toolbar-icon">⇩</span><span>내보내기</span></button>
      </div>
    </div>
  );
}

export function LevelTabs({ active = "매체" }: { active?: string }) {
  const tabs = ["매체", "캠페인", "광고그룹 / IO", "소재"];
  return (
    <div className="level-tabs" role="tablist" aria-label="성과 분석 단계">
      {tabs.map((tab) => <button key={tab} className={`level-tab ${tab === active ? "active" : ""}`} role="tab" aria-selected={tab === active}>{tab}</button>)}
    </div>
  );
}

export function PacingBar({ value }: { value: number | null }) {
  if (value === null) return <span className="muted-dash">-</span>;
  const tone = value >= 65 && value <= 82 ? "healthy" : value < 55 ? "risk" : "watch";
  return (
    <div className="pacing-cell">
      <div className="pacing-track"><div className={`pacing-fill ${tone}`} style={{ width: `${Math.min(value, 100)}%` }} /></div>
      <span>{value}%</span>
    </div>
  );
}
