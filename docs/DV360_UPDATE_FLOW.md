# DV360 / Netflix update flow

The shared Looker Studio URL is the canonical source reference, not a scrape target.

## Automatic pilot flow
1. Looker Studio scheduled delivery sends the current report as a PDF to the connected Gmail account.
2. Media Report searches today's Gmail for advertiser PDF reports.
3. The server parses the PDF and validates that DV360/Netflix campaign sections exist for the selected workspace month.
4. Monthly summary values are Fact; daily rows support exact date-range reporting.
5. Truncated Raw Data PDF tables are excluded from aggregation.
6. AE reviews QA warnings and publishes the update.
7. Performance retains a link back to the canonical Looker Studio report.

## Future direct flow
Replace PDF delivery with Display & Video 360 / Bid Manager API reporting where account/API permissions allow it. The Looker URL remains the human-facing source reference.
