# Daily ingest pilot test cases — 2026-09-15

Expected Jacomo batch behavior:
- 5 Gmail messages discovered for today's advertiser query.
- Mail-only DV360/Netflix message remains visible as Insight-only / Fact missing.
- Large Hogangnono/Zigbang XLSX is parsed server-side instead of proxied to the browser.
- NAVER GFA Summary is normalized from `실 노출` / `실클릭수` fields.
- Kakao Moment Summary is normalized; companion XLSB is detected and parsed through SheetJS/generic fallback when possible.
- Carrot/Kidsnote/TikTok/AdBoost Overall is normalized from grouped Actual columns.
- Any spreadsheet returning 0 placement facts is `구조 확인` and excluded from Fact publish.
