# Daily ingestion known formats

Pilot advertiser: 자코모

Supported Daily sources currently being normalized:
- Agency Total template: 호갱노노 / 직방 (`*_Total_*`, A.Imps / A.Clicks / CTR)
- Summary Media Report template: NAVER GFA / Kakao Moment (`Summary`, 실 노출 / 실클릭수 / CTR)
- Multi-media Overall template: 당근 / 키즈노트 / TikTok / AdBoost (`Overall`, two-row Actual headers)
- XLSB attachments: detected and parsed server-side through SheetJS when a compatible summary table is present

Gmail batch rules:
- Fetch every matching message received today (KST), including mail-only messages with no spreadsheet attachment.
- Spreadsheet attachment types: xlsx, xls, xlsb.
- Large files are parsed server-side; browser receives normalized JSON only.
- Mail-only messages are surfaced as `Fact 첨부 없음` and must never silently disappear.
- A parsed file with zero Fact placements is `구조 확인 필요`, not `준비`.
