# Gmail Daily Report Pipeline

## 목적
Daily Monitoring Excel과 메일 본문을 하나의 `Daily Bundle`로 묶어 간단하고 정확하게 대시보드에 반영한다.

## Source of Truth
- **Fact Source**: Excel/CSV attachment
  - Spend, Impression, Click, CTR, Conversion, CPA, ROAS, Video metrics 등 수치
- **Insight Source**: Gmail body
  - 성과 요약, 주요 변동, 운영 이슈, 제안/Next Action
- 메일 본문의 수치는 DB의 성과값으로 직접 사용하지 않는다. Excel과의 QA/검산에만 사용한다.

## Daily Bundle Key
`advertiser_id + report_date`

추가 식별자:
- gmail_message_id
- gmail_thread_id
- attachment_hash
- attachment_filename
- imported_at
- version

동일 광고주/기준일의 수정본은 신규 누적이 아니라 최신 version으로 교체하고 변경 이력을 남긴다.

## Gmail Intake
1. 광고주별 Gmail 검색 규칙 실행
2. 최신 후보 메일 탐색
3. 본문 + 지원되는 Excel/CSV 첨부 확보
4. 제목/발송일/본문/첨부 메타데이터에서 광고주·기준일 추론
5. `Daily Bundle Preview` 생성
6. Excel Fact Parse
7. Mail Insight Parse
8. QA / Diff
9. AE Review
10. Publish

## Mail Body Cleaning
Insight 추출 전 다음 영역을 제거한다.
- 인사말
- 서명/연락처
- 이전 회신/전달 인용
- 면책문구
- 메일 헤더(From/Sent/To/Subject)

## Insight Schema
- summary: 오늘 성과 요약
- movements: 주요 증감/변동
- issues: 운영 이슈 또는 확인 필요
- actions: 제안/다음 액션
- raw_body: 정제 전/후 원문 참조

## QA Rules
- 본문에 언급된 수치와 Excel 값이 다르면 경고만 생성
- Excel 값 자동 수정 금지
- 기준일 불일치 경고
- 광고주 자동인식 confidence 낮으면 검수 필요
- 지원 첨부파일이 2개 이상이면 후보 선택/자동분류
- 수정본 감지 시 기존 report_date 데이터와 diff 표시
- 동일 attachment hash는 중복 import 차단

## MVP 단계
### Phase A — 현재
- ChatGPT 연결 Gmail로 실제 메일을 수동 테스트
- Excel + Mail Body 페어링 검증
- Dashboard Preview UI 검증

### Phase B — SaaS
- Google OAuth
- Gmail API read-only scope
- 광고주별 검색 규칙 저장
- '최신 리포트 불러오기' 실제 동작
- 첨부 다운로드 및 Parser 연결

### Phase C — 자동화
- 예약된 Inbox check 또는 Gmail push notification
- 새 Daily Report 후보 감지
- AE에게 Review 알림
- 자동 Publish는 하지 않으며 AE 승인 후 Client View에 반영

## Product Principle
`Excel = Fact`, `Mail = Insight`, `AE = Final Approval`
