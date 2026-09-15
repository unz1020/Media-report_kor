# Advertiser isolation

## Current pilot
- AE workspace may switch between approved advertiser namespaces.
- Every published dataset, snapshot and insight is keyed by advertiser.
- UI queries only the currently selected advertiser.
- Jacomo and Kyowon Wells must never be aggregated together.

## Security boundary
The current localStorage pilot is **logical separation, not a security boundary**. It is suitable only for the AE pilot on the same browser.

Before external client access:
1. Move datasets to Supabase/PostgreSQL.
2. Add `tenant_id` to every data table.
3. Add authenticated memberships: `user_id`, `tenant_id`, `role`.
4. Enforce Row Level Security so client users can select only their tenant.
5. Client UI has no advertiser selector. AE role can switch tenants.
6. Raw source files live in private object storage; signed URLs only.

This is required before sharing the product with Jacomo or Kyowon Wells client accounts.
