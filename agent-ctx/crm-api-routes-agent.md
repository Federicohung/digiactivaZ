# CRM API Routes - Work Record

## Task: Create ALL CRM API routes for DigiActiva SaaS platform

## Files Created (15 route files)

### CRM Contacts
1. **`/src/app/api/crm/contacts/route.ts`** — POST (create) + GET (list with filters)
2. **`/src/app/api/crm/contacts/[id]/route.ts`** — GET (single) + PUT (update) + DELETE

### CRM Pipeline
3. **`/src/app/api/crm/pipeline/route.ts`** — GET (contacts grouped by etapa)
4. **`/src/app/api/crm/pipeline/move/[id]/route.ts`** — PUT (move contact between stages)

### CRM Timeline
5. **`/src/app/api/crm/timeline/route.ts`** — POST (add timeline event)
6. **`/src/app/api/crm/timeline/[contactId]/route.ts`** — GET (list events)

### CRM Metrics
7. **`/src/app/api/crm/metrics/route.ts`** — GET (dashboard metrics)

### CRM AI
8. **`/src/app/api/crm/ai/generate/route.ts`** — POST (email/whatsapp/summary/score generation)
9. **`/src/app/api/crm/ai/summary/[id]/route.ts`** — POST (generate AI summary for contact)
10. **`/src/app/api/crm/ai/priorities/route.ts`** — GET (AI-suggested daily priorities)

### CRM Settings
11. **`/src/app/api/crm/settings/route.ts`** — GET + PUT (workspace CRM settings)

### Workspaces
12. **`/src/app/api/workspaces/route.ts`** — GET (list) + POST (create, founder_admin only)
13. **`/src/app/api/workspaces/[id]/route.ts`** — GET (details) + PUT (update)
14. **`/src/app/api/workspaces/plans/route.ts`** — GET (public plans listing)

### CRM Agent Config
15. **`/src/app/api/crm/agent-config/route.ts`** — GET + PUT + POST (reset defaults)

## Key Implementation Details

- All routes use JWT Bearer token auth via `verifyToken` + `extractBearerToken`
- All CRM queries filtered by `workspaceId` from JWT `activeWorkspaceId`
- Proper HTTP status codes: 200, 201, 400, 401, 403, 404, 500
- Dynamic route params use `{ params }: { params: Promise<{ id: string }> }` with `const { id } = await params;`
- AI routes use `z-ai-web-dev-sdk` with `ZAI.create()` pattern
- AI logs stored in `AiLog` table
- Timeline events created for stage changes and AI summaries
- Default agent prompts for web_chat, whatsapp, voice channels
- Lint passes with 0 errors on new code
