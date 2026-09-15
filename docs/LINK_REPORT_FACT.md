# Link Report Fact

Some daily reports do not include an Excel attachment. Instead, the official daily mail contains a private report URL (for example Looker Studio) and an explicit numerical summary.

Source priority:
1. API / Excel Fact
2. Link Report Fact (official report URL + explicit metrics contained in the report mail)
3. Mail Insight (interpretation / commentary only)

Rules:
- Never scrape or infer hidden values from a private Looker Studio page.
- A Link Report Fact is created only from numerical values explicitly written in the official daily report mail.
- Store the original report URL together with the Fact for manual double-checking.
- Missing metrics remain null / `데이터 없음`; never coerce missing values to zero.
- When DV360 Bid Manager API integration is available, API data supersedes Link Report Fact for the same reporting period/source.
