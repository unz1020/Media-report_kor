# Daily Ingest v0.2

- Gmail batch search starts from advertiser keyword and adds today's KST bounds automatically.
- Mail-only Daily messages are visible and saved as Insight-only records.
- Spreadsheet attachments supported: xlsx, xls, xlsb.
- Gmail spreadsheet binaries are parsed server-side and returned as normalized JSON.
- Known parsers: agency Total/A.Imps, NAVER/Kakao Summary Media Report, multi-media Overall.
- Parsed spreadsheets with zero placement facts are not publishable and display `구조 확인`.
- The browser publishes only normalized Fact bundles plus mail-only Insight records.
