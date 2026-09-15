# DATA MODEL — Draft

## Core entities

### clients
- id
- name
- brand_name
- owner_ae
- status
- default_kpis

### periods
- id
- client_id
- year
- month
- status

### media_plans
- id
- client_id
- period_id
- version
- source_file_id
- published_at

### media_plan_items
- id
- media_plan_id
- channel
- media_product
- measurement_class
- budget
- start_date
- end_date
- region
- placement

### campaigns
- id
- client_id
- normalized_name
- channel
- measurement_class
- start_date
- end_date
- live_status

### source_mappings
- id
- client_id
- source_type
- source_value
- normalized_entity_type
- normalized_entity_id
- confidence
- reviewed_by

### performance_daily
- id
- client_id
- campaign_id
- creative_id
- report_date
- spend
- impressions
- reach
- clicks
- conversions
- revenue
- video_views
- raw_payload
- imported_at
- source_file_id

### creatives
- id
- client_id
- campaign_id
- name
- type
- status
- start_date
- end_date
- original_asset_url
- placement_preview_url
- original_landing_url
- tracking_url
- live_url

### utm_configs
- id
- creative_id
- source
- medium
- campaign
- content
- term

### placements
- id
- creative_id
- channel
- media_product
- region
- start_date
- end_date
- status
- last_verified_at

### placement_evidence
- id
- placement_id
- captured_at
- evidence_type
- file_url
- note

### briefings
- id
- client_id
- period_id
- briefing_date
- title
- body
- status
- published_at
- author_id

### source_files
- id
- client_id
- file_type
- original_name
- storage_url
- checksum
- imported_at
- version
- parse_status

### publish_batches
- id
- client_id
- created_at
- reviewed_at
- published_at
- status
- summary

## Measurement classes
- PERFORMANCE
- DELIVERY
- LIVE_ONLY

## Live statuses
- SCHEDULED
- LIVE_PENDING_VERIFICATION
- LIVE_VERIFIED
- PAUSED
- ENDED
- NEEDS_REVIEW
- REJECTED

## Data update principle
원본을 삭제/덮어쓰기보다 Source File과 Import 시점을 보존한다. 과거 성과값이 플랫폼 후처리로 변경되는 경우 최신값을 Published View에 반영하되 변경 이력을 추적할 수 있어야 한다.
