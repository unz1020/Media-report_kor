# Media Report SaaS

광고주와 AE가 한 공간에서 월간 광고 운영현황, 성과, 소재/게재지면, 브리핑을 확인하는 통합 광고 모니터링 SaaS입니다.

## Product principle
- MVP 기능 범위는 작게 시작하되 UI는 완성형 SaaS 수준을 목표로 합니다.
- Adriel의 정돈된 광고 대시보드 UX를 레퍼런스로 삼되, Creative & Placement와 ATL 통합 모니터링을 차별점으로 둡니다.
- 초기 데이터 입력은 Excel/Media Mix/Placement Report이며, 향후 API Connector로 교체 가능한 구조를 유지합니다.

## MVP navigation
1. Overview
2. Performance
3. Creative & Placement
4. Reports
5. Data Update (AE only)

## Data flow
`RAW -> NORMALIZED -> REVIEW -> PUBLISHED`

현재 저장소에는 실제 광고주 자료나 비밀키를 커밋하지 않습니다.
