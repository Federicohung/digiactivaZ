// Composio Integration Layer for DigiActiva CRM
// Handles Facebook & Instagram messaging via Composio SDK v0.8.1
//
// SDK v0.8.1 API:
//   composio.toolkits.authorize(userId, toolkitSlug) → ConnectionRequest
//   composio.connectedAccounts.list({ userIds, toolkitSlugs, statuses }) → list
//   composio.tools.execute(slug, { connectedAccountId, ...params }) → result
//   composio.triggers.create(userId, slug, body?) → trigger
//   composio.triggers.listActive(query?) → list
//   composio.triggers.verifyWebhook(params) → result

import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { db } from '@/lib/db';

// ─── Singleton Composio Instance ───
let composioInstance: any = null;

export function getComposio(): any {
  if (!composioInstance) {
    composioInstance = new Composio({
      provider: new VercelProvider(),
      apiKey: process.env.COMPOSIO_API_KEY,
    });
  }
  return composioInstance;
}

// ─── Types ───

export type ComposioToolkit = 'facebook' | 'instagram' | 'whatsapp';

// ─── Composio User ID Helper ───
// Uses workspace + user combo for per-workspace isolation

export function getComposioUserId(workspaceId: string, userId: string): string {
  return `ws_${workspaceId}_user_${userId}`;
}

// ─── OAuth Connection ───

/**
 * Initiate OAuth flow for a toolkit (Facebook or Instagram).
 * Uses composio.toolkits.authorize() which returns a redirectUrl.
 * After the user authorizes, Composio reports the connection as ACTIVE.
 * Our status check polls Composio's API to detect the change.
 */
export async function initiateOAuth(
  workspaceId: string,
  userId: string,
  toolkit: ComposioToolkit
): Promise<{ redirectUrl: string; connectedAccountId: string }> {
  const composio = getComposio();
  const composioUserId = getComposioUserId(workspaceId, userId);

  console.log(`[COMPOSIO_OAUTH] Initiating for ${toolkit}, userId=${composioUserId}, apiKey=${process.env.COMPOSIO_API_KEY ? '(set)' : '(NOT SET)'}`);

  // Use toolkits.authorize() — the v0.8.1 way to start OAuth
  let connectionRequest;
  try {
    connectionRequest = await composio.toolkits.authorize(composioUserId, toolkit);
    console.log(`[COMPOSIO_OAUTH] Authorize response for ${toolkit}:`, JSON.stringify({
      id: connectionRequest.id,
      redirectUrl: connectionRequest.redirectUrl?.substring(0, 100),
      status: connectionRequest.status,
    }));
  } catch (authError) {
    console.error(`[COMPOSIO_OAUTH] Authorize failed for ${toolkit}:`, (authError as Error).message);
    console.error(`[COMPOSIO_OAUTH] Full error:`, authError);
    throw authError;
  }

  const redirectUrl = connectionRequest.redirectUrl || '';
  const connectedAccountId = connectionRequest.id || '';

  console.log(`[COMPOSIO_OAUTH] Initiated for ${toolkit}, redirectUrl=${redirectUrl?.substring(0, 100)}..., connectedAccountId=${connectedAccountId}`);

  if (!redirectUrl) {
    console.warn(`[COMPOSIO_OAUTH] WARNING: No redirectUrl returned for ${toolkit}. The OAuth flow may not work.`);
  }

  // Store the pending connection in our database so the callback can identify it
  try {
    await upsertComposioConnection(workspaceId, userId, toolkit, {
      connected: false,
      metadata: {
        connectedAccountId,
        composioUserId,
        status: 'pending',
        initiatedAt: new Date().toISOString(),
      },
    });
    console.log(`[COMPOSIO_OAUTH] Saved pending connection for ${toolkit}, accountId=${connectedAccountId}`);
  } catch (dbError) {
    console.warn('[COMPOSIO_OAUTH] Could not save pending connection to DB:', dbError);
  }

  return { redirectUrl, connectedAccountId };
}

/**
 * Check if a toolkit is connected for a given workspace/user.
 * First checks our database for a known connection, then verifies via Composio API.
 * Also checks if ANY active Composio connection exists for the toolkit
 * (in case the userId doesn't match exactly — happens when user connects
 * from a different Composio user ID or the callback wasn't received).
 */
export async function checkIntegrationStatus(
  workspaceId: string,
  userId: string,
  toolkit: ComposioToolkit
): Promise<{ connected: boolean; toolkit: string; connectedAccountId?: string; accountName?: string }> {
  console.log(`[COMPOSIO_STATUS_CHECK] Starting check for ${toolkit}, workspace=${workspaceId}, user=${userId}`);

  // First check our database — this is fast and works even if Composio API is slow
  const dbConnection = await db.composioConnection.findUnique({
    where: {
      workspaceId_toolkit: {
        workspaceId,
        toolkit,
      },
    },
  }).catch(() => null);

  console.log(`[COMPOSIO_STATUS_CHECK] DB connection found: ${!!dbConnection}, connected=${dbConnection?.connected}, accountId=${dbConnection?.accountId}`);

  try {
    const composio = getComposio();
    const composioUserId = getComposioUserId(workspaceId, userId);

    // Try listing accounts for this specific user first
    let items: Array<Record<string, unknown>> = [];
    try {
      console.log(`[COMPOSIO_STATUS_CHECK] Listing accounts for userId=${composioUserId}, toolkit=${toolkit}`);
      const accountsResult = await composio.connectedAccounts.list({
        userIds: [composioUserId],
        toolkitSlugs: [toolkit],
        statuses: ['ACTIVE'],
      });
      items = (accountsResult as Record<string, unknown>)?.items as Array<Record<string, unknown>> || [];
      console.log(`[COMPOSIO_STATUS_CHECK] Found ${items.length} accounts for specific user`);
    } catch (apiError) {
      console.warn('[COMPOSIO_STATUS_CHECK] API list failed for specific user:', (apiError as Error).message);
    }

    let activeAccount = items.find((a) => a.status === 'ACTIVE');

    // If no active accounts for this specific user, check ALL accounts for the toolkit
    // (in case the user connected from a different userId in Composio)
    if (!activeAccount) {
      try {
        console.log(`[COMPOSIO_STATUS_CHECK] No account for specific user, listing ALL active ${toolkit} accounts`);
        const allAccountsResult = await composio.connectedAccounts.list({
          toolkitSlugs: [toolkit],
          statuses: ['ACTIVE'],
        });
        const allItems = (allAccountsResult as Record<string, unknown>)?.items as Array<Record<string, unknown>> || [];
        console.log(`[COMPOSIO_STATUS_CHECK] Found ${allItems.length} total active ${toolkit} accounts`);
        if (allItems.length > 0) {
          activeAccount = allItems[0];
          console.log(`[COMPOSIO_STATUS_CHECK] Using first active account: id=${activeAccount.id}, status=${activeAccount.status}`);
        }
      } catch (fallbackError) {
        console.warn('[COMPOSIO_STATUS_CHECK] Fallback list also failed:', (fallbackError as Error).message);
      }
    }

    // For Facebook: also try listing ALL active accounts without any filter as a broader fallback
    if (!activeAccount && toolkit === 'facebook') {
      try {
        console.log(`[COMPOSIO_STATUS_CHECK] Facebook: attempting broadest fallback - listing ALL active accounts`);
        const broadResult = await composio.connectedAccounts.list({
          statuses: ['ACTIVE'],
        });
        const broadItems = (broadResult as Record<string, unknown>)?.items as Array<Record<string, unknown>> || [];
        const fbMatch = broadItems.find((a) => {
          const slug = String(a.toolkitSlug || a.toolkit_slug || a.integrationId || '');
          return slug.includes('facebook') || slug.includes('FACEBOOK');
        });
        if (fbMatch) {
          activeAccount = fbMatch;
          console.log(`[COMPOSIO_STATUS_CHECK] Facebook: found via broad fallback, id=${fbMatch.id}`);
        } else {
          console.log(`[COMPOSIO_STATUS_CHECK] Facebook: no match in ${broadItems.length} broad accounts`);
        }
      } catch (broadError) {
        console.warn('[COMPOSIO_STATUS_CHECK] Broad fallback failed:', (broadError as Error).message);
      }
    }

    if (activeAccount) {
      const accountId = String(activeAccount.id || '');
      const metaObj = (activeAccount.meta || activeAccount.metadata || {}) as Record<string, unknown>;
      let accountName = String(
        activeAccount.wordId || activeAccount.alias || metaObj.name || ''
      );

      console.log(`[COMPOSIO_STATUS_CHECK] Active account found: id=${accountId}, name=${accountName || '(empty)'}`);

      // For Facebook: try to immediately fetch the page name using LIST_MANAGED_PAGES
      // Try multiple approaches since the tool execution can fail silently
      if (toolkit === 'facebook' && accountId) {
        try {
          console.log(`[COMPOSIO_STATUS_CHECK] Facebook: fetching page name via FACEBOOK_LIST_MANAGED_PAGES, accountId=${accountId}`);

          // Approach 1: Direct tool execution with composioUserId
          let pagesResult = await executeComposioTool(FACEBOOK_TOOLS.LIST_PAGES, accountId, {}, composioUserId);
          let pages = extractDataArray(pagesResult, 'FB_STATUS_PAGES');

          // Approach 2: If no pages found, try without composioUserId (the account ID may be enough)
          if (pages.length === 0) {
            console.log(`[COMPOSIO_STATUS_CHECK] Facebook: no pages with composioUserId, trying without userId`);
            try {
              pagesResult = await executeComposioTool(FACEBOOK_TOOLS.LIST_PAGES, accountId, {});
              pages = extractDataArray(pagesResult, 'FB_STATUS_PAGES_NO_USER');
            } catch (fallbackErr) {
              console.warn(`[COMPOSIO_STATUS_CHECK] Facebook: fallback LIST_PAGES failed:`, (fallbackErr as Error).message);
            }
          }

          // Approach 3: If still no pages, try using the account ID directly from the activeAccount object
          if (pages.length === 0) {
            const directId = String(activeAccount.id || activeAccount.connectedAccountId || '');
            if (directId && directId !== accountId) {
              console.log(`[COMPOSIO_STATUS_CHECK] Facebook: trying with direct account ID ${directId}`);
              try {
                pagesResult = await executeComposioTool(FACEBOOK_TOOLS.LIST_PAGES, directId, {}, composioUserId);
                pages = extractDataArray(pagesResult, 'FB_STATUS_PAGES_DIRECT');
              } catch (directErr) {
                console.warn(`[COMPOSIO_STATUS_CHECK] Facebook: direct ID LIST_PAGES failed:`, (directErr as Error).message);
              }
            }
          }

          if (pages.length > 0) {
            const pageName = String(
              pages[0].name || pages[0].page_name || pages[0].username || ''
            );
            if (pageName) {
              accountName = pageName;
              console.log(`[COMPOSIO_STATUS_CHECK] Facebook: got page name = ${accountName} from ${pages.length} pages`);
            } else {
              console.log(`[COMPOSIO_STATUS_CHECK] Facebook: pages returned but no name field. Page keys: ${Object.keys(pages[0]).join(',')}`);
            }
          } else {
            console.log(`[COMPOSIO_STATUS_CHECK] Facebook: no pages returned from any approach`);
          }
        } catch (pageError) {
          console.warn(`[COMPOSIO_STATUS_CHECK] Facebook: could not fetch page name:`, (pageError as Error).message);
          // Log the full error for debugging
          console.warn(`[COMPOSIO_STATUS_CHECK] Facebook: page name error details:`, pageError);
        }
      }

      // For Instagram: try to get the profile name
      if (toolkit === 'instagram' && accountId && !accountName) {
        try {
          console.log(`[COMPOSIO_STATUS_CHECK] Instagram: fetching profile name`);
          const profileResult = await executeComposioTool(INSTAGRAM_TOOLS.GET_MESSENGER_PROFILE, accountId, {}, composioUserId);
          const profileName = profileResult?.data?.name || profileResult?.data?.data?.name;
          if (profileName) {
            accountName = String(profileName);
            console.log(`[COMPOSIO_STATUS_CHECK] Instagram: got profile name = ${accountName}`);
          }
        } catch (profileError) {
          console.warn(`[COMPOSIO_STATUS_CHECK] Instagram: could not fetch profile name:`, (profileError as Error).message);
        }
      }

      // Update our DB if needed (or if we got a new accountName from the API)
      if (!dbConnection?.connected || dbConnection.accountId !== accountId || (accountName && !dbConnection.accountName)) {
        try {
          await upsertComposioConnection(workspaceId, userId, toolkit, {
            connected: true,
            accountId,
            accountName: accountName || undefined,
            metadata: {
              ...(dbConnection?.metadata as Record<string, unknown> || {}),
              status: 'active',
              connectedAt: new Date().toISOString(),
              connectedAccountId: accountId,
              source: 'status_check',
              ...(accountName ? { pageName: accountName } : {}),
            },
          });
          console.log(`[COMPOSIO_STATUS_CHECK] Updated DB: ${toolkit} connected, accountId=${accountId}, name=${accountName}`);
        } catch (dbErr) {
          console.warn('[COMPOSIO_STATUS_CHECK] Could not update DB:', dbErr);
        }
      }

      // Fallback: if Composio API says connected but our DB doesn't, update DB
      if (dbConnection && !dbConnection.connected && activeAccount) {
        try {
          await upsertComposioConnection(workspaceId, userId, toolkit, {
            connected: true,
            accountId,
            accountName: accountName || undefined,
            metadata: {
              ...(dbConnection?.metadata as Record<string, unknown> || {}),
              status: 'active',
              connectedAt: new Date().toISOString(),
              connectedAccountId: accountId,
              source: 'status_check_fallback',
            },
          });
          console.log(`[COMPOSIO_STATUS_CHECK] Fallback DB update: ${toolkit} was not marked connected, now fixed`);
        } catch (dbErr) {
          console.warn('[COMPOSIO_STATUS_CHECK] Fallback DB update failed:', dbErr);
        }
      }

      return {
        connected: true,
        toolkit,
        connectedAccountId: accountId,
        accountName: accountName || undefined,
      };
    }

    // No active connection found via Composio API
    // Check our DB in case it was marked connected by the callback
    if (dbConnection?.connected) {
      console.log(`[COMPOSIO_STATUS_CHECK] No Composio API match, but DB says connected for ${toolkit}`);
      return {
        connected: true,
        toolkit,
        connectedAccountId: dbConnection.accountId || undefined,
        accountName: dbConnection.accountName || undefined,
      };
    }

    console.log(`[COMPOSIO_STATUS_CHECK] ${toolkit} is NOT connected`);
    return { connected: false, toolkit };
  } catch (error) {
    console.error('[COMPOSIO_STATUS_CHECK_ERROR]', error);

    // Even on error, check DB as last resort
    if (dbConnection?.connected) {
      console.log(`[COMPOSIO_STATUS_CHECK] Error but DB says connected for ${toolkit}`);
      return {
        connected: true,
        toolkit,
        connectedAccountId: dbConnection.accountId || undefined,
        accountName: dbConnection.accountName || undefined,
      };
    }

    return { connected: false, toolkit };
  }
}

/**
 * Get the connected account ID for a toolkit, needed for tool execution.
 */
export async function getConnectedAccountId(
  workspaceId: string,
  userId: string,
  toolkit: ComposioToolkit
): Promise<string | null> {
  try {
    const composio = getComposio();
    const composioUserId = getComposioUserId(workspaceId, userId);

    // First try to find an account for this specific user
    const accountsResult = await composio.connectedAccounts.list({
      userIds: [composioUserId],
      toolkitSlugs: [toolkit],
      statuses: ['ACTIVE'],
    });

    const items = (accountsResult as Record<string, unknown>)?.items as Array<Record<string, unknown>> || [];
    const activeAccount = items.find((a) => a.status === 'ACTIVE');

    if (activeAccount) {
      return String(activeAccount.id);
    }

    // Fallback: find any active account for this toolkit
    const allAccountsResult = await composio.connectedAccounts.list({
      toolkitSlugs: [toolkit],
      statuses: ['ACTIVE'],
    });

    const allItems = (allAccountsResult as Record<string, unknown>)?.items as Array<Record<string, unknown>> || [];
    if (allItems.length > 0) {
      return String(allItems[0].id);
    }

    return null;
  } catch (error) {
    console.error('[COMPOSIO_GET_ACCOUNT_ID_ERROR]', error);
    return null;
  }
}

// ─── Composio Tool Slugs ───

const FACEBOOK_TOOLS = {
  LIST_PAGES: 'FACEBOOK_LIST_MANAGED_PAGES',
  GET_CONVERSATIONS: 'FACEBOOK_GET_PAGE_CONVERSATIONS',
  GET_MESSAGES: 'FACEBOOK_GET_CONVERSATION_MESSAGES',
  GET_MESSAGE_DETAILS: 'FACEBOOK_GET_MESSAGE_DETAILS',
  SEND_MESSAGE: 'FACEBOOK_SEND_MESSAGE',
  SEND_MEDIA: 'FACEBOOK_SEND_MEDIA_MESSAGE',
  MARK_SEEN: 'FACEBOOK_MARK_MESSAGE_SEEN',
  GET_MESSENGER_PROFILE: 'FACEBOOK_GET_MESSENGER_PROFILE',
} as const;

const INSTAGRAM_TOOLS = {
  LIST_CONVERSATIONS: 'INSTAGRAM_LIST_ALL_CONVERSATIONS',
  GET_CONVERSATION: 'INSTAGRAM_GET_CONVERSATION',
  LIST_MESSAGES: 'INSTAGRAM_LIST_ALL_MESSAGES',
  SEND_TEXT: 'INSTAGRAM_SEND_TEXT_MESSAGE',
  GET_PAGE_CONVERSATIONS: 'INSTAGRAM_GET_PAGE_CONVERSATIONS',
  GET_MESSENGER_PROFILE: 'INSTAGRAM_GET_MESSENGER_PROFILE',
} as const;

const WHATSAPP_TOOLS = {
  SEND_MESSAGE: 'WHATSAPP_SEND_MESSAGE',
  SEND_REPLY: 'WHATSAPP_SEND_REPLY',
  SEND_MEDIA: 'WHATSAPP_SEND_MEDIA',
  SEND_TEMPLATE: 'WHATSAPP_SEND_TEMPLATE_MESSAGE',
  GET_BUSINESS_PROFILE: 'WHATSAPP_GET_BUSINESS_PROFILE',
  GET_PHONE_NUMBERS: 'WHATSAPP_GET_PHONE_NUMBERS',
  GET_MESSAGE_TEMPLATES: 'WHATSAPP_GET_MESSAGE_TEMPLATES',
  SEND_INTERACTIVE_BUTTONS: 'WHATSAPP_SEND_INTERACTIVE_BUTTONS',
  SEND_INTERACTIVE_LIST: 'WHATSAPP_SEND_INTERACTIVE_LIST',
} as const;

// ─── Tool Execution ───

/**
 * Execute a Composio tool using the v0.8.1 API.
 * Uses composio.tools.execute(slug, { connectedAccountId, userId, ...params }).
 * Uses dangerouslySkipVersionCheck since we don't know the exact toolkit version at build time.
 */
export async function executeComposioTool(
  toolSlug: string,
  connectedAccountId: string,
  params: Record<string, unknown> = {},
  composioUserId?: string
) {
  const composio = getComposio();
  try {
    const executeParams: Record<string, unknown> = {
      connectedAccountId,
      dangerouslySkipVersionCheck: true,
    };
    // Pass userId if available (required for connected account identification)
    if (composioUserId) {
      executeParams.userId = composioUserId;
    }
    // Always pass arguments (never text) to avoid "Only one of text or arguments" error
    if (Object.keys(params).length > 0) {
      executeParams.arguments = params;
    } else {
      executeParams.arguments = {};
    }
    const result = await composio.tools.execute(toolSlug, executeParams);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCause = error instanceof Error && error.cause ? String(error.cause) : '';
    console.error(`[COMPOSIO_TOOL_EXECUTE_ERROR] ${toolSlug}: ${errMsg}`, errCause);
    throw new Error(`Error executing ${toolSlug}: ${errMsg} ${errCause}`);
  }
}

// ─── Triggers ───

// NOTE: Composio does NOT have incoming message triggers for WhatsApp/Facebook/Instagram.
// Incoming messages are handled via polling (pollNewMessages) or direct Meta webhooks.
// The only available trigger is WhatsApp message status updates.
// See: https://request.composio.dev/boards/tools-triggers
const TRIGGER_SLUGS: Record<ComposioToolkit, string[]> = {
  facebook: [],
  instagram: [],
  whatsapp: ['WHATSAPP_MESSAGE_STATUS_UPDATED_TRIGGER'],
};

export async function listTriggerTypes(toolkit?: ComposioToolkit) {
  const composio = getComposio();
  try {
    const result = await composio.triggers.listTypes({
      toolkits: toolkit ? [toolkit] : undefined,
    });
    return result;
  } catch (error) {
    console.error('[COMPOSIO_LIST_TRIGGER_TYPES_ERROR]', error);
    throw error;
  }
}

export async function listActiveTriggers() {
  const composio = getComposio();
  try {
    const result = await composio.triggers.listActive();
    return result;
  } catch (error) {
    console.error('[COMPOSIO_LIST_ACTIVE_TRIGGERS_ERROR]', error);
    throw error;
  }
}

export async function createTrigger(
  composioUserId: string,
  triggerSlug: string
) {
  const composio = getComposio();
  try {
    const result = await composio.triggers.create(composioUserId, triggerSlug);
    console.log(`[COMPOSIO_TRIGGER_CREATED] ${triggerSlug} for ${composioUserId}:`, result.id);
    return result;
  } catch (error) {
    console.error(`[COMPOSIO_CREATE_TRIGGER_ERROR] ${triggerSlug}:`, error);
    throw error;
  }
}

export async function setupTriggersForToolkit(
  workspaceId: string,
  userId: string,
  toolkit: ComposioToolkit
) {
  const composioUserId = getComposioUserId(workspaceId, userId);
  const slugs = TRIGGER_SLUGS[toolkit];
  const results: Array<{ slug: string; success: boolean; triggerId?: string; error?: string }> = [];

  for (const slug of slugs) {
    try {
      const trigger = await createTrigger(composioUserId, slug);
      results.push({ slug, success: true, triggerId: trigger.id });
    } catch (error) {
      console.warn(`[COMPOSIO_TRIGGER_SETUP_WARN] Failed: ${slug}:`, error);
      results.push({ slug, success: false, error: String(error) });
    }
  }

  const successfulTriggers = results.filter(r => r.success);
  if (successfulTriggers.length > 0) {
    await upsertComposioConnection(workspaceId, userId, toolkit, {
      connected: true,
      metadata: {
        triggerIds: successfulTriggers.map(t => ({ slug: t.slug, triggerId: t.triggerId })),
        triggersSetupAt: new Date().toISOString(),
      },
    });
  }

  return results;
}

export async function disableTrigger(triggerId: string) {
  const composio = getComposio();
  return composio.triggers.disable(triggerId);
}

export async function enableTrigger(triggerId: string) {
  const composio = getComposio();
  return composio.triggers.enable(triggerId);
}

export async function deleteTrigger(triggerId: string) {
  const composio = getComposio();
  return composio.triggers.delete(triggerId);
}

// ─── Webhook Verification ───

export async function verifyComposioWebhook(params: {
  payload: string;
  signature: string;
  webhookId: string;
  webhookTimestamp: string;
}): Promise<{ valid: boolean; parsed?: Record<string, unknown> }> {
  const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[COMPOSIO_WEBHOOK_ERROR] No webhook secret configured');
    return { valid: false };
  }

  try {
    const composio = getComposio();
    const result = await composio.triggers.verifyWebhook({
      payload: params.payload,
      signature: params.signature,
      webhookId: params.webhookId,
      webhookTimestamp: params.webhookTimestamp,
      secret,
    });

    return {
      valid: true,
      parsed: result.payload as Record<string, unknown>,
    };
  } catch (error) {
    console.error('[COMPOSIO_WEBHOOK_VERIFY_ERROR]', error);
    return { valid: false };
  }
}

export async function verifyWebhookSignature(
  signature: string,
  body: string
): Promise<boolean> {
  const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
  if (!secret) return false;

  try {
    const crypto = await import('crypto');
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    return signature === expectedSig || signature === `sha256=${expectedSig}`;
  } catch {
    return false;
  }
}

// ─── Message Fetching ───

export async function fetchComposioMessages(
  workspaceId: string,
  userId: string,
  channel: 'messenger' | 'instagram' | 'whatsapp',
  limit: number = 20
) {
  if (channel === 'whatsapp') {
    const toolkit: ComposioToolkit = 'whatsapp';
    const connectedAccountId = await getConnectedAccountId(workspaceId, userId, toolkit);
    if (!connectedAccountId) throw new Error('No active whatsapp connection found');
    // WhatsApp doesn't have a "list conversations" endpoint like FB/IG
    // We rely on polling via webhook or direct message sync
    return [];
  }

  const connectedAccountId = await getConnectedAccountId(workspaceId, userId, channel === 'messenger' ? 'facebook' : 'instagram');
  if (!connectedAccountId) {
    throw new Error(`No active ${channel} connection found`);
  }

  const toolSlug =
    channel === 'messenger'
      ? FACEBOOK_TOOLS.GET_CONVERSATIONS
      : INSTAGRAM_TOOLS.LIST_CONVERSATIONS;

  const composioUserId = getComposioUserId(workspaceId, userId);
  return executeComposioTool(toolSlug, connectedAccountId, { limit }, composioUserId);
}

// ─── Message Sending ───

export async function sendComposioMessage(
  workspaceId: string,
  userId: string,
  channel: 'messenger' | 'instagram' | 'whatsapp',
  recipientId: string,
  content: string
) {
  if (channel === 'whatsapp') {
    const toolkit: ComposioToolkit = 'whatsapp';
    const connectedAccountId = await getConnectedAccountId(workspaceId, userId, toolkit);
    if (!connectedAccountId) throw new Error('No active whatsapp connection found');
    const composioUserId = getComposioUserId(workspaceId, userId);
    return executeComposioTool(WHATSAPP_TOOLS.SEND_MESSAGE, connectedAccountId, {
      messaging_product: 'whatsapp',
      to: recipientId,
      type: 'text',
      text: { body: content },
    }, composioUserId);
  }

  const connectedAccountId = await getConnectedAccountId(workspaceId, userId, channel === 'messenger' ? 'facebook' : 'instagram');
  if (!connectedAccountId) {
    throw new Error(`No active ${channel} connection found`);
  }

  const toolSlug =
    channel === 'messenger'
      ? FACEBOOK_TOOLS.SEND_MESSAGE
      : INSTAGRAM_TOOLS.SEND_TEXT;

  const composioUserId = getComposioUserId(workspaceId, userId);
  return executeComposioTool(toolSlug, connectedAccountId, {
    recipient_id: recipientId,
    message: content,
  }, composioUserId);
}

// ─── Composio Response Parser ───
// The Composio API can return data in various nested formats.
// This helper safely extracts the data array from any response structure.

function extractDataArray(result: unknown, logLabel: string): Record<string, unknown>[] {
  if (!result) return [];
  const r = result as Record<string, unknown>;

  // Try common paths: data.data, data, items, results, conversations, messages
  const paths = [
    () => (r.data as Record<string, unknown>)?.data,
    () => r.data,
    () => r.items,
    () => r.results,
    () => r.conversations,
    () => r.messages,
    () => r.data && Array.isArray(r.data) ? r.data : null,
  ];

  for (const getPath of paths) {
    try {
      const data = getPath();
      if (Array.isArray(data)) {
        console.log(`[COMPOSIO_PARSE] ${logLabel}: found array via path (len=${data.length}), sample keys: ${data.length > 0 ? Object.keys(data[0] || {}).join(',') : 'empty'}`);
        if (data.length > 0) {
          console.log(`[COMPOSIO_PARSE] ${logLabel}: first item sample:`, JSON.stringify(data[0]).substring(0, 300));
        }
        return data as Record<string, unknown>[];
      }
      // If data is an object with nested arrays, check common keys
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        for (const key of ['data', 'items', 'conversations', 'messages', 'results']) {
          if (Array.isArray((data as Record<string, unknown>)[key])) {
            const arr = (data as Record<string, unknown>)[key] as Record<string, unknown>[];
            console.log(`[COMPOSIO_PARSE] ${logLabel}: found nested array at .${key} (len=${arr.length})`);
            if (arr.length > 0) {
              console.log(`[COMPOSIO_PARSE] ${logLabel}: first item sample:`, JSON.stringify(arr[0]).substring(0, 300));
            }
            return arr;
          }
        }
      }
    } catch { /* continue */ }
  }

  console.log(`[COMPOSIO_PARSE] ${logLabel}: could not extract array from response. Keys: ${Object.keys(r).join(',')}`);
  console.log(`[COMPOSIO_PARSE] ${logLabel}: raw response sample:`, JSON.stringify(r).substring(0, 500));
  return [];
}

/**
 * Extract sender info from a message object.
 * Composio returns different formats for Facebook vs Instagram messages.
 * We try multiple paths to find the sender's ID and name.
 */
function extractSenderInfo(msg: Record<string, unknown>, channel: 'messenger' | 'instagram'): { senderId: string; senderName: string } {
  // Try various paths for sender info
  const from = msg.from as Record<string, unknown> | undefined;
  const sender = msg.sender as Record<string, unknown> | undefined;
  const senderId = msg.sender_id as string | undefined;
  const participantIds = msg.participant_ids as string[] | undefined;

  let id = '';
  let name = '';

  // Path 1: msg.from.id / msg.from.name (standard FB format)
  if (from?.id) { id = String(from.id); name = String(from.name || from.username || ''); }
  // Path 2: msg.sender.id / msg.sender.name
  if (!id && sender?.id) { id = String(sender.id); name = String(sender.name || sender.username || ''); }
  // Path 3: msg.sender_id / msg.sender_name
  if (!id && senderId) { id = String(senderId); name = String((msg as Record<string, unknown>).sender_name || (msg as Record<string, unknown>).sender_username || ''); }
  // Path 4: msg.user_id / msg.user_name
  if (!id && msg.user_id) { id = String(msg.user_id); name = String(msg.user_name || msg.username || ''); }
  // Path 5: msg.participant_ids (Instagram sometimes uses this)
  if (!id && participantIds && participantIds.length > 0) { id = String(participantIds[0]); }
  // Path 6: msg.from_id / msg.from_name
  if (!id && msg.from_id) { id = String(msg.from_id); name = String(msg.from_name || ''); }
  // Path 7: msg.participants (array of objects)
  if (!id) {
    const participants = msg.participants as Array<Record<string, unknown>> | undefined;
    if (participants && participants.length > 0) {
      // Pick the participant that is NOT the page
      const nonPageParticipant = participants.find(p => !p.is_page && !p.is_owner);
      const p = nonPageParticipant || participants[0];
      id = String(p.id || p.user_id || '');
      name = String(p.name || p.username || p.ig_username || '');
    }
  }

  // For Instagram: the conversation may contain the participant username
  if (channel === 'instagram' && !name && id) {
    // Try to get username from msg.snippet or other fields
    name = String(msg.snippet_sender || msg.ig_username || msg.username || '');
  }

  // Fallback name
  if (!name) {
    name = id ? `Contacto ${channel} ${id.substring(0, 8)}` : 'Desconocido';
  }

  console.log(`[COMPOSIO_PARSE] extractSenderInfo (${channel}): id=${id}, name=${name}, msgKeys=${Object.keys(msg).join(',')}`);
  return { senderId: id, senderName: name };
}

/**
 * Extract message content from various Composio response formats.
 */
function extractMessageContent(msg: Record<string, unknown>): string {
  const content =
    msg.message || msg.text || msg.content || msg.body ||
    msg.snippet || msg.message_text || msg.text_message ||
    (msg.attachments ? `[Archivo adjunto]` : '') ||
    '';
  return String(content);
}

/**
 * Extract message ID for deduplication.
 */
function extractMessageId(msg: Record<string, unknown>): string {
  return String(msg.id || msg.message_id || msg.mid || msg.uid || '');
}

// ─── Polling for New Messages ───

export async function pollNewMessages(
  workspaceId: string,
  userId: string,
  channel: 'messenger' | 'instagram' | 'whatsapp'
): Promise<{ newMessages: number; newContacts: number }> {
  const toolkit: ComposioToolkit = channel === 'messenger' ? 'facebook' : channel === 'whatsapp' ? 'whatsapp' : 'instagram';
  const connectedAccountId = await getConnectedAccountId(workspaceId, userId, toolkit);
  const composioUserId = getComposioUserId(workspaceId, userId);

  if (!connectedAccountId) {
    console.warn(`[COMPOSIO_POLL] No active ${channel} connection for workspace ${workspaceId}`);
    return { newMessages: 0, newContacts: 0 };
  }

  let newMessages = 0;
  let newContacts = 0;

  try {
    if (channel === 'messenger') {
      // Step 1: List managed pages
      console.log(`[COMPOSIO_POLL] Messenger: listing pages for account ${connectedAccountId}`);
      const pagesResult = await executeComposioTool(FACEBOOK_TOOLS.LIST_PAGES, connectedAccountId, {}, composioUserId);
      console.log(`[COMPOSIO_POLL] Messenger: pagesResult keys=${Object.keys(pagesResult || {}).join(',')}`);
      const pages = extractDataArray(pagesResult, 'FB_PAGES');

      // Save the first page name to the connection for display in the inbox
      if (pages.length > 0) {
        const pageName = String(
          pages[0].name || pages[0].page_name || pages[0].username || ''
        );
        const pageId = String(pages[0].id || pages[0].page_id || '');
        if (pageName) {
          try {
            await upsertComposioConnection(workspaceId, userId, 'facebook', {
              connected: true,
              accountId: connectedAccountId,
              accountName: pageName,
              metadata: {
                pageName,
                pageId,
                source: 'poll',
              },
            });
            console.log(`[COMPOSIO_POLL] Saved Facebook page name: ${pageName}`);
          } catch (e) { console.warn('[COMPOSIO_POLL] Could not save page name:', e); }
        } else {
          console.log(`[COMPOSIO_POLL] Facebook: pages returned but no name field. Page keys: ${Object.keys(pages[0]).join(',')}`);
        }
      } else {
        console.log(`[COMPOSIO_POLL] Facebook: no pages returned from LIST_PAGES`);
      }

      for (const page of pages) {
        const pageId = String(page.id || page.page_id || '');
        console.log(`[COMPOSIO_POLL] Messenger: getting conversations for page ${pageId}`);

        // Step 2: Get conversations for this page
        const convosResult = await executeComposioTool(FACEBOOK_TOOLS.GET_CONVERSATIONS, connectedAccountId, {
          page_id: pageId,
        }, composioUserId);
        const conversations = extractDataArray(convosResult, `FB_CONVOS_page${pageId}`);

        for (const convo of conversations.slice(0, 10)) {
          const convoId = String(convo.id || convo.conversation_id || '');
          console.log(`[COMPOSIO_POLL] Messenger: getting messages for convo ${convoId}`);

          // Step 3: Get messages for this conversation
          const msgsResult = await executeComposioTool(FACEBOOK_TOOLS.GET_MESSAGES, connectedAccountId, {
            conversation_id: convoId,
          }, composioUserId);
          const messages = extractDataArray(msgsResult, `FB_MSGS_convo${convoId}`);

          for (const msg of messages.slice(-5)) {
            const { senderId, senderName } = extractSenderInfo(msg, 'messenger');
            const content = extractMessageContent(msg);
            const msgId = extractMessageId(msg);

            if (!senderId || !content || !msgId) {
              console.log(`[COMPOSIO_POLL] Messenger: skipping msg (senderId=${senderId}, content=${content?.substring(0, 30)}, msgId=${msgId})`);
              continue;
            }

            const existing = await db.message.findFirst({
              where: {
                workspaceId,
                metadata: { path: ['composioMessageId'], equals: msgId },
              },
            });

            if (existing) continue;

            const contact = await findOrCreateContact(workspaceId, 'messenger', senderId, senderName, {
              connectedAccountId,
              composioUserId,
            });
            const conversation = await findOrCreateConversation(workspaceId, contact.id, 'messenger');

            await db.message.create({
              data: {
                workspaceId,
                contactId: contact.id,
                channel: 'messenger',
                direction: senderId === pageId ? 'outbound' : 'inbound',
                content,
                conversationId: conversation.id,
                metadata: {
                  composioMessageId: msgId,
                  senderId,
                  senderName,
                  source: 'composio_poll',
                  pageId,
                  connectedAccountId,
                },
                status: 'delivered',
              },
            });

            await db.conversation.update({
              where: { id: conversation.id },
              data: {
                lastMessagePreview: content.substring(0, 100),
                lastMessageAt: new Date((msg.created_time as string) || (msg.created_at as string) || Date.now()),
                ...(senderId !== pageId ? { unreadCount: { increment: 1 } } : {}),
              },
            });

            newMessages++;
          }
        }
      }
    } else if (channel === 'instagram') {
      console.log(`[COMPOSIO_POLL] Instagram: listing conversations for account ${connectedAccountId}`);
      const convosResult = await executeComposioTool(INSTAGRAM_TOOLS.LIST_CONVERSATIONS, connectedAccountId, {}, composioUserId);
      console.log(`[COMPOSIO_POLL] Instagram: convosResult keys=${Object.keys(convosResult || {}).join(',')}`);
      const conversations = extractDataArray(convosResult, 'IG_CONVOS');

      // Try to get the Instagram profile name for display in the inbox
      try {
        console.log(`[COMPOSIO_POLL] Instagram: fetching profile name`);
        const profileResult = await executeComposioTool(INSTAGRAM_TOOLS.GET_MESSENGER_PROFILE, connectedAccountId, {}, composioUserId);
        const profileData = profileResult as Record<string, unknown>;
        const profileName =
          (profileData?.data as Record<string, unknown>)?.name ||
          (profileData?.data as Record<string, unknown>)?.data && ((profileData.data as Record<string, unknown>).data as Record<string, unknown>)?.name ||
          profileData?.name ||
          '';
        if (profileName) {
          await upsertComposioConnection(workspaceId, userId, 'instagram', {
            connected: true,
            accountId: connectedAccountId,
            accountName: String(profileName),
            metadata: {
              pageName: String(profileName),
              source: 'poll',
            },
          });
          console.log(`[COMPOSIO_POLL] Saved Instagram profile name: ${profileName}`);
        }
      } catch (e) { console.warn('[COMPOSIO_POLL] Instagram profile fetch failed:', (e as Error).message); }

      for (const convo of conversations.slice(0, 10)) {
        const convoId = String(convo.id || convo.conversation_id || convo.thread_id || '');
        console.log(`[COMPOSIO_POLL] Instagram: getting messages for convo ${convoId}, keys=${Object.keys(convo).join(',')}`);

        // Log the conversation object to understand participant info
        console.log(`[COMPOSIO_POLL] Instagram: convo sample:`, JSON.stringify(convo).substring(0, 400));

        // Try to extract participant info from the conversation object itself
        // Instagram conversations often have participants at the conversation level
        const participantInfo: Record<string, { name: string; username: string }> = {};

        // Approach 1: Extract from participants array
        const participants = convo.participants as Array<Record<string, unknown>> | undefined;
        if (participants) {
          for (const p of participants) {
            const pid = String(p.id || p.igid || p.user_id || '');
            if (pid) {
              participantInfo[pid] = {
                name: String(p.name || p.username || p.ig_username || p.full_name || ''),
                username: String(p.username || p.ig_username || ''),
              };
            }
          }
          console.log(`[COMPOSIO_POLL] Instagram: extracted ${Object.keys(participantInfo).length} participants from convo`);
        }

        // Approach 2: Try to get more detailed participant info via INSTAGRAM_GET_CONVERSATION
        if (Object.keys(participantInfo).length === 0 || Object.values(participantInfo).every(p => !p.name)) {
          try {
            console.log(`[COMPOSIO_POLL] Instagram: fetching detailed conversation via INSTAGRAM_GET_CONVERSATION for ${convoId}`);
            const detailedConvoResult = await executeComposioTool(INSTAGRAM_TOOLS.GET_CONVERSATION, connectedAccountId, {
              conversation_id: convoId,
            }, composioUserId);
            const detailedConvo = detailedConvoResult as Record<string, unknown>;
            const detailedData = (detailedConvo?.data as Record<string, unknown>) || detailedConvo;
            const detailedParticipants = detailedData?.participants as Array<Record<string, unknown>> | undefined;

            if (detailedParticipants && detailedParticipants.length > 0) {
              for (const p of detailedParticipants) {
                const pid = String(p.id || p.igid || p.user_id || '');
                if (pid) {
                  const extractedName = String(p.name || p.username || p.ig_username || p.full_name || '');
                  const extractedUsername = String(p.username || p.ig_username || '');
                  // Only overwrite if we got a better name
                  if (extractedName && (!participantInfo[pid] || !participantInfo[pid].name)) {
                    participantInfo[pid] = { name: extractedName, username: extractedUsername };
                  }
                }
              }
              console.log(`[COMPOSIO_POLL] Instagram: after GET_CONVERSATION, have ${Object.keys(participantInfo).length} participants`);
            }
          } catch (convoErr) {
            console.warn(`[COMPOSIO_POLL] Instagram: GET_CONVERSATION failed for ${convoId}:`, (convoErr as Error).message);
          }
        }

        // Approach 3: Try extracting participant info from conversation-level fields like snippet, last_message sender
        const lastMessage = convo.last_message as Record<string, unknown> | undefined;
        if (lastMessage) {
          const lastSender = lastMessage.from as Record<string, unknown> | undefined;
          const lastSenderId = String(lastMessage.sender_id || lastSender?.id || lastMessage.from_id || '');
          const lastSenderName = String(lastSender?.name || lastSender?.username || lastMessage.sender_name || lastMessage.from_name || '');
          if (lastSenderId && lastSenderName && !participantInfo[lastSenderId]?.name) {
            participantInfo[lastSenderId] = { name: lastSenderName, username: lastSenderName };
          }
        }

        // Approach 4: Try extracting from conversation-level sender fields
        const convoSenderId = String(convo.sender_id || convo.from_id || convo.user_id || '');
        const convoSenderName = String(convo.sender_name || convo.from_name || convo.username || convo.ig_username || '');
        if (convoSenderId && convoSenderName && !participantInfo[convoSenderId]?.name) {
          participantInfo[convoSenderId] = { name: convoSenderName, username: convoSenderName };
        }

        console.log(`[COMPOSIO_POLL] Instagram: final participant info for convo ${convoId}: ${JSON.stringify(participantInfo)}`);

        const msgsResult = await executeComposioTool(INSTAGRAM_TOOLS.LIST_MESSAGES, connectedAccountId, {
          conversation_id: convoId,
        }, composioUserId);
        const messages = extractDataArray(msgsResult, `IG_MSGS_convo${convoId}`);

        for (const msg of messages.slice(-5)) {
          let { senderId, senderName } = extractSenderInfo(msg, 'instagram');

          // If sender name is generic, try to get it from the conversation participants
          if (senderName.startsWith('Contacto ') && participantInfo[senderId]) {
            senderName = participantInfo[senderId].name || participantInfo[senderId].username || senderName;
            console.log(`[COMPOSIO_POLL] Instagram: resolved sender name from participantInfo: "${senderName}" for senderId=${senderId}`);
          }

          const content = extractMessageContent(msg);
          const msgId = extractMessageId(msg);

          if (!senderId || !content || !msgId) {
            console.log(`[COMPOSIO_POLL] Instagram: skipping msg (senderId=${senderId}, content=${content?.substring(0, 30)}, msgId=${msgId})`);
            continue;
          }

          const existing = await db.message.findFirst({
            where: {
              workspaceId,
              metadata: { path: ['composioMessageId'], equals: msgId },
            },
          });

          if (existing) continue;

          const contact = await findOrCreateContact(workspaceId, 'instagram', senderId, senderName, {
            connectedAccountId,
            composioUserId,
          });
          const conversation = await findOrCreateConversation(workspaceId, contact.id, 'instagram');

          await db.message.create({
            data: {
              workspaceId,
              contactId: contact.id,
              channel: 'instagram',
              direction: 'inbound',
              content,
              conversationId: conversation.id,
              metadata: {
                composioMessageId: msgId,
                senderId,
                senderName,
                source: 'composio_poll',
                conversationId: convoId,
                connectedAccountId,
              },
              status: 'delivered',
            },
          });

          await db.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessagePreview: content.substring(0, 100),
              lastMessageAt: new Date((msg.created_time as string) || (msg.created_at as string) || (msg.timestamp as string) || Date.now()),
              unreadCount: { increment: 1 },
            },
          });

          newMessages++;
        }
      }
    } else if (channel === 'whatsapp') {
      console.log(`[COMPOSIO_POLL] WhatsApp: checking for account ${connectedAccountId}`);

      // Try to get the WhatsApp business profile name
      try {
        const profileResult = await executeComposioTool(WHATSAPP_TOOLS.GET_BUSINESS_PROFILE, connectedAccountId, {}, composioUserId);
        const profileData = profileResult as Record<string, unknown>;
        const nestedData = (profileData?.data as Record<string, unknown>) || {};
        const profileName = String(nestedData.name || nestedData.business_name || (nestedData.data as Record<string, unknown>)?.name || '');
        if (profileName && profileName !== 'null') {
          await upsertComposioConnection(workspaceId, userId, 'whatsapp', {
            connected: true,
            accountId: connectedAccountId,
            accountName: profileName,
            metadata: { pageName: profileName, source: 'poll' },
          });
          console.log(`[COMPOSIO_POLL] Saved WhatsApp profile name: ${profileName}`);
        }
      } catch (e) { console.warn('[COMPOSIO_POLL] WhatsApp profile fetch failed:', (e as Error).message); }

      // WhatsApp relies on webhooks for incoming messages, so polling returns 0
      // The webhook handler at /api/composio/webhook will process incoming WhatsApp messages
      console.log(`[COMPOSIO_POLL] WhatsApp: incoming messages are handled via webhooks, polling not supported`);
    }

    if (newMessages > 0) {
      console.log(`[COMPOSIO_POLL] Synced ${newMessages} new ${channel} messages for workspace ${workspaceId}`);
    } else {
      console.log(`[COMPOSIO_POLL] No new ${channel} messages for workspace ${workspaceId}`);
    }
  } catch (error) {
    console.error(`[COMPOSIO_POLL_ERROR] channel=${channel}:`, error);
    throw error;
  }

  return { newMessages, newContacts };
}

// ─── Database Helpers ───

export async function upsertComposioConnection(
  workspaceId: string,
  userId: string,
  toolkit: ComposioToolkit,
  data: {
    connected: boolean;
    accountId?: string;
    accountName?: string;
    metadata?: Record<string, unknown>;
  }
) {
  return db.composioConnection.upsert({
    where: {
      workspaceId_toolkit: {
        workspaceId,
        toolkit,
      },
    },
    update: {
      connected: data.connected,
      userId,
      accountId: data.accountId,
      accountName: data.accountName,
      metadata: data.metadata as any || {},
    },
    create: {
      workspaceId,
      userId,
      toolkit,
      connected: data.connected,
      accountId: data.accountId,
      accountName: data.accountName,
      metadata: data.metadata as any || {},
    },
  });
}

export async function findOrCreateContact(
  workspaceId: string,
  channel: 'messenger' | 'instagram' | 'whatsapp',
  externalId: string,
  name: string,
  profileOptions?: {
    connectedAccountId?: string;
    composioUserId?: string;
  }
) {
  const existing = await db.contact.findFirst({
    where: {
      workspaceId,
      ...(channel === 'messenger'
        ? { messengerId: externalId }
        : channel === 'whatsapp'
        ? { whatsappId: externalId }
        : { instagramId: externalId }),
    },
  });

  // Determine if the name is "generic" and needs profile enrichment
  const isGenericName = !name || name === 'Desconocido' || name.startsWith('Contacto ');

  if (existing) {
    // If the existing contact has a generic name, try to enrich it with a real profile name
    if (isGenericName && existing.nombre.startsWith('Contacto ') && profileOptions?.connectedAccountId && externalId) {
      const realName = await fetchProfileName(channel, externalId, profileOptions.connectedAccountId, profileOptions.composioUserId);
      if (realName && realName !== existing.nombre) {
        try {
          console.log(`[COMPOSIO_CONTACT] Updating ${channel} contact name from "${existing.nombre}" to "${realName}" (profile enrichment)`);
          return await db.contact.update({
            where: { id: existing.id },
            data: { nombre: realName },
          });
        } catch { /* silent */ }
      }
    }
    // Update name if we have a better one now (non-generic)
    if (name && !isGenericName && existing.nombre !== name) {
      try {
        return await db.contact.update({
          where: { id: existing.id },
          data: { nombre: name },
        });
      } catch { /* silent */ }
    }
    return existing;
  }

  // For new contacts: if name is generic, try to fetch real profile name before creating
  let resolvedName = name;
  if (isGenericName && profileOptions?.connectedAccountId && externalId) {
    const realName = await fetchProfileName(channel, externalId, profileOptions.connectedAccountId, profileOptions.composioUserId);
    if (realName) {
      resolvedName = realName;
      console.log(`[COMPOSIO_CONTACT] Resolved ${channel} contact name from "${name}" to "${realName}" via profile API`);
    }
  }

  console.log(`[COMPOSIO_CONTACT] Creating new ${channel} contact: name="${resolvedName}", externalId=${externalId}`);

  return db.contact.create({
    data: {
      workspaceId,
      nombre: resolvedName || `Contacto ${channel}`,
      fuente: channel,
      ...(channel === 'messenger'
        ? { messengerId: externalId }
        : channel === 'whatsapp'
        ? { whatsappId: externalId }
        : { instagramId: externalId }),
    },
  });
}

/**
 * Fetch a contact's real profile name from Instagram or Messenger API.
 * Uses INSTAGRAM_GET_MESSENGER_PROFILE for Instagram and FACEBOOK_GET_MESSENGER_PROFILE for Messenger.
 */
async function fetchProfileName(
  channel: 'messenger' | 'instagram' | 'whatsapp',
  senderId: string,
  connectedAccountId: string,
  composioUserId?: string
): Promise<string | null> {
  try {
    // WhatsApp doesn't have a per-contact profile fetch via this pattern
    if (channel === 'whatsapp') return null;

    const toolSlug = channel === 'instagram'
      ? INSTAGRAM_TOOLS.GET_MESSENGER_PROFILE
      : FACEBOOK_TOOLS.GET_MESSENGER_PROFILE;

    console.log(`[COMPOSIO_PROFILE] Fetching profile for ${channel} sender ${senderId} via ${toolSlug}`);
    const profileResult = await executeComposioTool(toolSlug, connectedAccountId, {
      recipient_id: senderId,
      user_id: senderId,
      psid: senderId,
    }, composioUserId);

    // Try to extract the name from various response formats
    const data = profileResult as Record<string, unknown>;
    const nestedData = data?.data as Record<string, unknown> | undefined;
    const deepNestedData = nestedData?.data as Record<string, unknown> | undefined;

    const profileName =
      nestedData?.name ||
      deepNestedData?.name ||
      nestedData?.first_name && `${nestedData.first_name} ${nestedData.last_name || ''}`.trim() ||
      deepNestedData?.first_name && `${deepNestedData.first_name} ${deepNestedData.last_name || ''}`.trim() ||
      data?.name ||
      nestedData?.username ||
      deepNestedData?.username ||
      null;

    if (profileName) {
      console.log(`[COMPOSIO_PROFILE] Got profile name for ${channel} sender ${senderId}: "${profileName}"`);
      return String(profileName);
    }

    console.log(`[COMPOSIO_PROFILE] No profile name found in response for ${channel} sender ${senderId}. Response keys: ${Object.keys(data).join(',')}`);
    return null;
  } catch (error) {
    console.warn(`[COMPOSIO_PROFILE] Failed to fetch ${channel} profile for sender ${senderId}:`, (error as Error).message);
    return null;
  }
}

export async function findOrCreateConversation(
  workspaceId: string,
  contactId: string,
  channel: 'messenger' | 'instagram'
) {
  const existing = await db.conversation.findFirst({
    where: {
      workspaceId,
      contactId,
      channel,
      provider: 'composio',
    },
  });

  if (existing) return existing;

  return db.conversation.create({
    data: {
      workspaceId,
      contactId,
      channel,
      provider: 'composio',
      status: 'open',
    },
  });
}

export function toolkitToChannel(toolkit: string): 'messenger' | 'instagram' | 'whatsapp' | 'external' {
  if (toolkit === 'facebook') return 'messenger';
  if (toolkit === 'instagram') return 'instagram';
  if (toolkit === 'whatsapp') return 'whatsapp';
  return 'external';
}
