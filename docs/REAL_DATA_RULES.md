# Real Data Rules

Effective from 2026-09-15 onward.

1. No arbitrary/mock performance numbers may be rendered in production dashboards.
2. Excel/linked report files are the source of truth for quantitative facts.
3. Email body text is Daily Insight only and is never used to overwrite Excel facts.
4. Each advertiser is a separate tenant namespace. AE workspace can switch tenants; client access must be locked to a single tenant once auth/RLS is connected.
5. Metrics keep their source units: spend KRW (원), impressions/clicks/views/conversions count (회/건), rates percent (%), CPM/CPC/CPV KRW (원).
6. Reports must support date range or snapshot-date selection based on available source history. Never fabricate comparison-period values.
7. Media plan / operation plan fields may only be populated from uploaded/connected source documents.
8. Missing source data is shown as `데이터 없음` / `미수집`, not estimated.
9. Dashboard updates require QA review and explicit publish; successful publish must show a visible confirmation toast.
10. Data should be double-checkable back to source file and sheet.
