# WhatsApp Backend (Render)

Standalone WhatsApp (whatsapp-web.js) backend for the Union CRM.

## Linked project

This service is the WhatsApp backend for the CRM at:
`C:\Users\Administrator\Desktop\projects\custom-crm`

The CRM frontend calls this service through `NEXT_PUBLIC_WHATSAPP_API_URL` (see `lib/whatsapp-api.ts` in the CRM).

## Shared config (must match the CRM)

- `JWT_SECRET` — identical to the CRM's, so Bearer tokens verify.
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — same Supabase project.
- `ENABLE_WHATSAPP=true`, `WHATSAPP_SESSION_PATH=/app/.wwebjs_auth` (persistent disk).

## Deploy

Push this folder to its own repo and connect to Render (Docker). Health check: `/api/whatsapp/health`.

## Local dev

```
npm install
npm run dev   # port 3001
```

Set `NEXT_PUBLIC_WHATSAPP_API_URL=http://localhost:3001` in the CRM's `.env.local`.
