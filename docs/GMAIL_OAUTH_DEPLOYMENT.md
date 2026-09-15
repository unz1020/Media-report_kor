# Gmail OAuth deployment

Production deployment uses Vercel environment variables for the Gmail read-only OAuth flow.

Required variables:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GMAIL_TOKEN_SECRET`

After changing these variables in Vercel, trigger a fresh production deployment so the runtime picks them up.
