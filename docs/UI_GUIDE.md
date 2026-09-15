# UI GUIDE — Media Report SaaS

## Design principle
- 기능은 MVP여도 화면은 완성형 B2B SaaS처럼 보여야 한다.
- Adriel의 정돈된 KPI 카드, 채널 비교, 광고 단위 Drill-down을 레퍼런스로 삼는다.
- 그대로 복제하지 않고 Creative & Placement와 ATL 통합 모니터링을 중심으로 재해석한다.

## Visual language
- App background: cool light gray
- Primary surfaces: white
- Border: subtle 1px neutral
- Shadow: 최소 사용
- Radius: 10–14px
- Accent: interaction/selection에만 사용
- Channel colors: 로고·상태·차트에서 제한적으로 사용

## Layout
- Desktop max content width: fluid, sidebar + content
- 12-column content grid
- Page spacing: 24–32px
- Card gap: 16px
- Responsive: 320px 이상에서 overflow 없이 재배치

## Type scale
- 12: meta/label
- 14: secondary/body compact
- 16: body/navigation
- 20: card/section title
- 28: KPI
- 36: hero KPI only

## Core components
- AppShell
- SidebarNav
- ClientMonthSelector
- KPI Card
- Trend Card
- Media Performance Table
- Media Status Card
- Creative Card
- Placement Preview
- Filter Bar
- Drawer / Detail Panel
- Briefing Panel
- Update Review Summary

## States
- LIVE: positive
- Scheduled: neutral/info
- Review: warning
- Rejected/Error: critical
- Ended/Off: muted

## UX rules
- 한 화면에서 핵심 상태를 10초 안에 파악 가능해야 한다.
- 숫자보다 의미가 먼저 보이도록 레이블과 비교값을 제공한다.
- Client View에 내부정보가 노출되지 않도록 컴포넌트 단계에서 권한을 분리한다.
- 소재는 원본 파일보다 게재지면 Preview를 우선한다.
- 상세 정보는 페이지 이동을 최소화하고 Drawer/Panel을 우선 활용한다.
