# MASTER SPEC — Media Report SaaS

## 1. Product goal
광고주와 AE가 하나의 사이트에서 월간 광고 운영현황, 성과, 소재/게재지면, 브리핑을 확인하는 통합 광고 모니터링 SaaS.

핵심 흐름은 `PLAN -> LIVE -> PERFORMANCE -> PROOF -> INSIGHT`.

## 2. MVP input
1. Daily Monitoring Excel
2. Media Mix
3. Placement Report

초기에는 파일 업로드를 Connector로 사용하고, 향후 Google/Meta/Naver/Kakao API Connector로 교체한다.

## 3. Core navigation
- Overview
- Performance
- Creative & Placement
- Reports
- Data Update (AE only)

## 4. Measurement classes
### Performance
Spend, Impression, Click, CTR, Conversion, CPA, ROAS 등 직접 성과 지표 제공.

### Delivery
Spend, Impression/Reach, Video View, VTR 등 노출/전달 지표 제공.
예: Netflix, TVING, Addressable TV 등 실제 제공 리포트 기준 분류.

### Live Only
성과지표가 없는 OOH/TV/버스/엘리베이터 등. Media Mix + Placement Report로 집행 기간과 게재 증빙을 관리.

매체명 자체가 아니라 실제 확보 가능한 데이터 수준으로 등급을 정한다.

## 5. Creative & Placement
- 원본 출고 소재보다 실제 게재지면 Preview를 Primary로 사용
- 실제 라이브 캡처가 있으면 우선 사용
- 없으면 표준 Placement Mockup 사용
- 소재 상세: 게재지면 -> 원본 소재 -> 성과 -> 랜딩 URL -> UTM -> 게재보고서

## 6. Landing & UTM
소재별 Original Landing / Tracking URL / Live URL 관리.
UTM Builder 기본 필드: source, medium, campaign, content, term.

## 7. Briefing
초기: AE 작성/수정 후 Publish.
향후: 데이터 + 과거 AE 인사이트 기반 AI Draft -> AE Review -> Publish.

## 8. Client vs AE
### Client View
성과, 소재, 게재지면, LIVE 상태, 집행기간, 랜딩, 공개 브리핑.

### AE Only
대행수수료, NET 단가, 마진/리베이트, 내부 메모, 정산 정보, 매체 내부 협의, 데이터 업로드/매핑/Publish.

공개 여부가 애매한 항목은 자동 공개하지 않고 확인 대상으로 둔다.

## 9. Daily update pipeline
`RAW -> NORMALIZED -> REVIEW -> PUBLISHED`

- RAW: 원본 파일 보존
- NORMALIZED: 공통 Schema 변환
- REVIEW: 신규/수정/중복/매칭 오류 Preview
- PUBLISHED: AE 승인 후 Client View 반영

## 10. MVP completion scenario
AE가 한 광고주의 Media Mix, Daily Monitoring, Placement Report를 업로드한다. 시스템이 매체/일자/KPI를 표준화하고, 매칭 이슈만 AE가 수정한다. Overview, Performance, Creative & Placement에서 운영 현황을 확인하고 Briefing을 작성한 뒤 Publish한다. 광고주는 동일 사이트의 Client View에서 성과, LIVE 소재, 게재지면, 브리핑을 확인한다.

## 11. Post-MVP
- AI Briefing
- UTM/URL QA 고도화
- 이상 감지
- 종료/게재 누락 알림
- API Connector
- 자동 이메일/공유
