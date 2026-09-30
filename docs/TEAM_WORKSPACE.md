# Team workspace

## Shared operating flow
1. Administrator opens **팀 관리**, registers a colleague's Google email, name, advertiser assignments, and editor/viewer access.
2. Administrator copies the dashboard link and shares it with that colleague. Registration does not send an email.
3. The colleague signs in with the registered Google account. Basic login asks for identity/email only.
4. Operators needing inbox collection connect their own Gmail with read-only access.
5. A Daily Report is collected by date and selected advertiser, reviewed, then published to the existing shared DB. Authorized colleagues read the same saved reports without access to the uploader's inbox.
6. Data refreshes on focus and every 60 seconds while visible; manual refresh is available.

## Permission boundary
- The existing Google-token verification + workspace_users + workspace_user_advertisers model is retained.
- Only active, verified Google identities registered in workspace_users may access report APIs.
- Existing admin accounts manage colleague access; newly registered colleagues are AE accounts and cannot promote themselves or manage other members.
- Advertiser owner/editor grants allow report publishing; viewer grants allow reading only.
- Revocation disables the account and is rechecked on every DB request. Saved reports remain.
- New service-only tables have RLS enabled and no client grants. manage_workspace_member is SECURITY INVOKER, executable only by service_role. The verified caller email is supplied only by the Edge Function.
- Google OAuth must permit the colleague's identity. In testing mode, add the email to Google test users. Existing production GOOGLE_REDIRECT_URI still points to the production callback; a preview requires its own permitted redirect URI to test actual OAuth.

## Preservation
The migration copies all existing report_imports to report_import_versions, then captures every insert/update. Each snapshot preserves parsed metadata, not original Excel/PDF bytes. No restore UI or raw-file backup is introduced. Existing facts and imports remain in place, and workspace_activity records the publisher of new reports/insights. Historical authors remain unknown rather than inferred.

## Deployment
- DB migration: supabase/migrations/20260930133636_team_collaboration.sql.
- Edge Functions: workspace-team and reporting-store; verify_jwt=false because handlers validate Google access tokens and enforce DB memberships directly.
- Existing placement-proof-image continues enforcing the same account/advertiser grants.
- Frontend changes are reviewed on feature/team-workspace, then merged into main per DEV_WORKFLOW.md.

## Verification
- Next.js production build and TypeScript checks.
- DB transaction tests: register viewer, deny non-admin changes, change to editor, revoke, capture import update. Tests roll back all changes.
- Existing import count remains 10; baseline history count is 10.
- Anonymous table access and authenticated RPC execution denied.
- Actual colleague OAuth and inbox collection require a registered Google account and configured OAuth deployment, and cannot be substituted by fixture UI tests.
