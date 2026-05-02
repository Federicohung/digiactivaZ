# Task: composio-integration — Composio Integration Agent

## Summary
Integrated Facebook & Instagram messaging into DigiActiva CRM via Composio SDK.

## Files Created
1. **`src/lib/composio.ts`** — Composio client library with singleton instance, session management, OAuth, message fetch/send, webhook verification, and DB helpers
2. **`src/app/api/composio/connect/route.ts`** — POST endpoint to initiate OAuth flow for Facebook/Instagram
3. **`src/app/api/composio/status/route.ts`** — GET endpoint to check connection status
4. **`src/app/api/composio/messages/route.ts`** — GET endpoint to fetch and sync messages from Composio
5. **`src/app/api/composio/webhook/route.ts`** — POST/GET endpoints for real-time webhook handling
6. **`src/app/api/composio/send/route.ts`** — POST endpoint to send messages via Composio

## Files Modified
1. **`prisma/schema.prisma`** — Added ComposioConnection model
2. **`.env`** — Added COMPOSIO_API_KEY and COMPOSIO_WEBHOOK_SECRET
3. **`src/app/api/inbox/conversations/[id]/send/route.ts`** — Added Composio routing for messenger/instagram channels
4. **`worklog.md`** — Updated with integration details

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/composio/connect | Initiate OAuth flow (body: { toolkit: 'facebook' \| 'instagram' }) |
| GET | /api/composio/status?toolkit=facebook | Check connection status |
| GET | /api/composio/messages?channel=messenger&limit=20 | Fetch & sync messages |
| POST | /api/composio/webhook | Receive real-time webhooks from Composio |
| POST | /api/composio/send | Send message via Composio (body: { conversationId, content, channel }) |

## Key Design Decisions
- Uses `Composio({ provider: new VercelProvider() })` for Vercel AI SDK compatibility
- Composite userId format `ws_{workspaceId}_user_{userId}` ensures per-workspace session isolation
- Webhook handler allows unverified webhooks during initial setup for easier testing
- Inbox send route auto-detects Composio provider and routes accordingly
- ComposioConnection model with `@@unique([workspaceId, toolkit])` prevents duplicate connections

## Commits
- `8451ed6` — feat: integrate Composio for Facebook & Instagram messaging
- `e1b7eb9` — docs: update worklog with Composio integration details

## Next Steps
- Set COMPOSIO_API_KEY and COMPOSIO_WEBHOOK_SECRET in Vercel environment variables
- Register webhook URL (https://digiactiva-z.vercel.app/api/composio/webhook) in Composio dashboard
- Run `prisma db push` on Vercel (auto via build script) to create ComposioConnection table
- Configure Facebook/Instagram apps in Composio dashboard
- Test OAuth flow with /api/composio/connect endpoint
