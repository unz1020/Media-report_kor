# Real report findings · 2026-09-15

Source: Jacomo Daily mail bodies + attached workbooks received on 2026-09-15.

## Information architecture found in real work
- Mail body: report period, media list, operating history, yesterday/current cumulative commentary, target-vs-result commentary, creative/product notes.
- Workbook Summary/Overall: advertiser, period, budget, spend, KPI, media/product-level performance.
- Product sheets: daily performance and creative-level performance.
- Media Mix sheets: category, media, device, ad product, creative type, period, targeting, budget, expected impressions/clicks and expected unit costs.

## Canonical hierarchy
Advertiser → Media → Ad Product → Placement/Creative → KPI / Daily trend / Insight.

## Observed canonical media / products
- 네이버 → 네이버 메인 / 커뮤니케이션 애드 / NDA
- 카카오 → 비즈보드 / 디스플레이 / 동영상 / 검색광고
- 당근 → 네이티브 피드 광고
- 키즈노트 → 메인배너 / 이벤트배너(서비스)
- 틱톡 → 도달 · Feed 영상
- 애드부스트스크린 → DOOH 커스텀 패키지 / 서비스 지면
- 호갱노노 → 스플래시 / 메인 팝업 / 종료 팝업 / 커뮤니티 스토리 피드 / 네이티브 피드형 / 디스커버리 배너
- 직방 → 스플래시 / 메인 팝업 / 종료 팝업 / 디스커버리 배너

## Naming conflicts confirmed
- 당근마켓 / 당근 = 당근
- 애드부스트 / 애드부스트 스크린 / 애드부스트스크린 / 애드부스터 = 애드부스트스크린
- 네이버GFA / 네이버 GFA = 네이버
- 카카오 모먼트 / 카카오모먼트 / 카카오 키워드 = 카카오 (product distinguishes Moment products vs Search)

## UI consequences
1. Source file/sheet moves to traceability footer/detail, not primary grouping.
2. Performance gets Media tabs and Product filter/grouping.
3. Overview media table uses canonical media names.
4. Media Mix uses the same canonical media/product naming as performance.
5. Mail insights are displayed in a dedicated operating-insight panel and normalized before display.
