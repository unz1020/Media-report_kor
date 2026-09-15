# DV360 / Netflix Data Studio Import

## Source of truth
- Data Studio report URL is stored only as a browser-side source link. Do not hard-code client report URLs in the public repository.
- PDF export is parsed locally by the application and only extracted Fact metrics are published.
- Do not use mock or inferred values.

## Supported PDF structure
Current Jacomo report pattern:
- Display & Video 360 monthly CPC campaign page
- Netflix monthly programmatic-deal campaign page
- each campaign page contains monthly KPI summary, creative table, and daily performance table
- raw-data page may be paginated/truncated (e.g. 1-100 / 4698), so raw PDF table must not be treated as a complete granular source.

## Import rules
1. Detect the workspace month and only import pages for that month by default.
2. Publish one dataset per campaign/source using a stable sourceId.
3. Campaign summary is the cumulative Fact used in source-level Performance.
4. Daily table rows are stored in `dailyPerformance` and used for exact date-range reporting when available.
5. Keep the Data Studio URL as `sourceUrl` so users can open the original report from Performance.
6. Any mismatch between headline total and the sum of daily rows must be surfaced as QA, never silently normalized.

## Automation path
MVP: Data Studio URL + PDF upload.
Next: scheduled PDF delivery to Gmail and automatic attachment import.
Long term: DV360 / Bid Manager API as direct source when account/API permissions are available.
