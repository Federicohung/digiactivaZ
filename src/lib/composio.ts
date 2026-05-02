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
let composioInstance: Composio | null = null;

export function getComposio(): Composio {
  if (!composioInstance) {
    composioInstance = new Composio({
      provider: new VercelProvider(),
      apiKey: process.env.COMPOSIO_API_KEY,
    });
  }
  return composioInstance;
}

// ─── Types ───

export type ComposioToolkit = 'facebook' | 'instagram';

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

  console.log(`[COMPOSIO_OAUTH] Initiating for ${toolkit}, userId=${composioUserId}`);

  // Use toolkits.authorize() — the v0.8.1 way to start OAuth
  const connectionRequest = await composio.toolkits.authorize(composioUserId, toolkit);

  const redirectUrl = connectionRequest.redirectUrl || '';
  const connectedAccountId = connectionRequest.id || '';

  console.log(`[COMPOSIO_OAUTH] Initiated for ${toolkit}, redirectUrl=${redirectUrl?.substring(0, 100)}..., connectedAccountId=${connectedAccountId}`);

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
  // First check our database — this is fast and works even if Composio API is slow
  const dbConnection = await db.composioConnection.findUnique({
    where: {
      workspaceId_toolkit: {
        workspaceId,
        toolkit,
      },
    },
  }).catch(() => null);

  try {
    const composio = getComposio();
    const composioUserId = getComposioUserId(workspaceId, userId);

    // Try listing accounts for this specific user first
    let items: Array<Record<string, unknown>> = [];
    try {
      const accountsResult = await composio.connectedAccounts.list({
        userIds: [composioUserId],
        toolkitSlugs: [toolkit],
        statuses: ['ACTIVE'],
      });
      items = (accountsResult as Record<string, unknown>)?.items as Array<Record<string, unknown>> || [];
    } catch (apiError) {
      console.warn('[COMPOSIO_STATUS_CHECK] API list failed for specific user:', (apiError as Error).message);
    }

    let activeAccount = items.find((a) => a.status === 'ACTIVE');

    // If no active accounts for this specific user, check ALL accounts for the toolkit
    // (in case the user connected from a different userId in Composio)
    if (!activeAccount) {
      try {
        const allAccountsResult = await composio.connectedAccounts.list({
          toolkitSlugs: [toolkit],
          statuses: ['ACTIVE'],
        });
        const allItems = (allAccountsResult as Record<string, unknown>)?.items as Array<Record<string, unknown>> || [];
        if (allItems.length > 0) {
          activeAccount = allItems[0];
        }
      } catch (fallbackError) {
        console.warn('[COMPOSIO_STATUS_CHECK] Fallback list also failed:', (fallbackError as Error).message);
      }
    }

    if (activeAccount) {
      const accountId = String(activeAccount.id || '');
      const metaObj = (activeAccount.meta || activeAccount.metadata || {}) as Record<string, unknown>;
      const accountName = String(
        activeAccount.wordId || activeAccount.alias || metaObj.name || ''
      );

      // Update our DB if needed
      if (!dbConnection?.connected || dbConnection.accountId !== accountId) {
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
            },
          });
          console.log(`[COMPOSIO_STATUS_CHECK] Updated DB: ${toolkit} connected, accountId=${accountId}`);
        } catch (dbErr) {
          console.warn('[COMPOSIO_STATUS_CHECK] Could not update DB:', dbErr);
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
      return {
        connected: true,
        toolkit,
        connectedAccountId: dbConnection.accountId || undefined,
        accountName: dbConnection.accountName || undefined,
      };
    }

    return { connected: false, toolkit };
  } catch (error) {
    console.error('[COMPOSIO_STATUS_CHECK_ERROR]', error);

    // Even on error, check DB as last resort
    if (dbConnection?.connected) {
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
} as const;

const INSTAGRAM_TOOLS = {
  LIST_CONVERSATIONS: 'INSTAGRAM_LIST_ALL_CONVERSATIONS',
  GET_CONVERSATION: 'INSTAGRAM_GET_CONVERSATION',
  LIST_MESSAGES: 'INSTAGRAM_LIST_ALL_MESSAGES',
  SEND_TEXT: 'INSTAGRAM_SEND_TEXT_MESSAGE',
  GET_PAGE_CONVERSATIONS: 'INSTAGRAM_GET_PAGE_CONVERSATIONS',
  GET_MESSENGER_PROFILE: 'INSTAGRAM_GET_MESSENGER_PROFILE',
} as const;

// ─── Tool Execution ───

/**
 * Execute a Composio tool using the v0.8.1 API.
 * Uses composio.tools.execute(slug, { connectedAccountId, ...params }).
 * Uses dangerouslySkipVersionCheck since we don't know the exact toolkit version at build time.
 */
export async function executeComposioTool(
  toolSlug: string,
  connectedAccountId: string,
  params: Record<string, unknown> = {}
) {
  const composio = getComposio();
  try {
    const result = await composio.tools.execute(toolSlug, {
      connectedAccountId,
      dangerouslySkipVersionCheck: true,
      arguments: Object.keys(params).length > 0 ? params : undefined,
    });
    return result;
  } catch (error) {
    console.error(`[COMPOSIO_TOOL_EXECUTE_ERROR] ${toolSlug}:`, error);
    throw error;
  }
}

// ─── Triggers ───

const TRIGGER_SLUGS: Record<ComposioToolkit, string[]> = {
  facebook: [],
  instagram: [],
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
  const results = [];

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
): boolean {
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
  channel: 'messenger' | 'instagram',
  limit: number = 20
) {
  const connectedAccountId = await getConnectedAccountId(workspaceId, userId, channel === 'messenger' ? 'facebook' : 'instagram');
  if (!connectedAccountId) {
    throw new Error(`No active ${channel} connection found`);
  }

  const toolSlug =
    channel === 'messenger'
      ? FACEBOOK_TOOLS.GET_CONVERSATIONS
      : INSTAGRAM_TOOLS.LIST_CONVERSATIONS;

  return executeComposioTool(toolSlug, connectedAccountId, { limit });
}

// ─── Message Sending ───

export async function sendComposioMessage(
  workspaceId: string,
  userId: string,
  channel: 'messenger' | 'instagram',
  recipientId: string,
  content: string
) {
  const connectedAccountId = await getConnectedAccountId(workspaceId, userId, channel === 'messenger' ? 'facebook' : 'instagram');
  if (!connectedAccountId) {
    throw new Error(`No active ${channel} connection found`);
  }

  const toolSlug =
    channel === 'messenger'
      ? FACEBOOK_TOOLS.SEND_MESSAGE
      : INSTAGRAM_TOOLS.SEND_TEXT;

  return executeComposioTool(toolSlug, connectedAccountId, {
    recipient_id: recipientId,
    message: content,
  });
}

// ─── Polling for New Messages ───

export async function pollNewMessages(
  workspaceId: string,
  userId: string,
  channel: 'messenger' | 'instagram'
): Promise<{ newMessages: number; newContacts: number }> {
  const toolkit: ComposioToolkit = channel === 'messenger' ? 'facebook' : 'instagram';
  const connectedAccountId = await getConnectedAccountId(workspaceId, userId, toolkit);

  if (!connectedAccountId) {
    console.warn(`[COMPOSIO_POLL] No active ${channel} connection for workspace ${workspaceId}`);
    return { newMessages: 0, newContacts: 0 };
  }

  let newMessages = 0;
  let newContacts = 0;

  try {
    if (channel === 'messenger') {
      // Step 1: List managed pages
      const pagesResult = await executeComposioTool(FACEBOOK_TOOLS.LIST_PAGES, connectedAccountId, {});
      const pages = pagesResult?.data?.data || [];

      // Save the first page name to the connection for display in the inbox
      if (pages.length > 0 && pages[0].name) {
        try {
          await upsertComposioConnection(workspaceId, userId, 'facebook', {
            connected: true,
            accountId: connectedAccountId,
            accountName: pages[0].name as string,
            metadata: {
              pageName: pages[0].name,
              pageId: pages[0].id,
              source: 'poll',
            },
          });
        } catch { /* silent */ }
      }

      for (const page of pages) {
        // Step 2: Get conversations for this page
        const convosResult = await executeComposioTool(FACEBOOK_TOOLS.GET_CONVERSATIONS, connectedAccountId, {
          page_id: page.id,
        });
        const conversations = convosResult?.data?.data || [];

        for (const convo of conversations.slice(0, 10)) {
          // Step 3: Get messages for this conversation
          const msgsResult = await executeComposioTool(FACEBOOK_TOOLS.GET_MESSAGES, connectedAccountId, {
            conversation_id: convo.id,
          });
          const messages = msgsResult?.data?.data || [];

          for (const msg of messages.slice(-5)) {
            const senderId = msg.from?.id || '';
            const senderName = msg.from?.name || 'Desconocido';
            const content = msg.message || '';

            if (!senderId || !content) continue;

            const existing = await db.message.findFirst({
              where: {
                workspaceId,
                metadata: { path: ['composioMessageId'], equals: msg.id },
              },
            });

            if (existing) continue;

            const contact = await findOrCreateContact(workspaceId, 'messenger', senderId, senderName);
            const conversation = await findOrCreateConversation(workspaceId, contact.id, 'messenger');

            await db.message.create({
              data: {
                workspaceId,
                contactId: contact.id,
                channel: 'messenger',
                direction: msg.from?.id === page.id ? 'outbound' : 'inbound',
                content,
                conversationId: conversation.id,
                metadata: {
                  composioMessageId: msg.id,
                  senderId,
                  senderName,
                  source: 'composio_poll',
                  pageId: page.id,
                  connectedAccountId,
                },
                status: 'delivered',
              },
            });

            await db.conversation.update({
              where: { id: conversation.id },
              data: {
                lastMessagePreview: content.substring(0, 100),
                lastMessageAt: new Date(msg.created_time || Date.now()),
                ...(msg.from?.id !== page.id ? { unreadCount: { increment: 1 } } : {}),
              },
            });

            newMessages++;
          }
        }
      }
    } else if (channel === 'instagram') {
      const convosResult = await executeComposioTool(INSTAGRAM_TOOLS.LIST_CONVERSATIONS, connectedAccountId, {});
      const conversations = convosResult?.data?.data || [];

      // Try to get the Instagram profile name for display in the inbox
      try {
        const profileResult = await executeComposioTool(INSTAGRAM_TOOLS.GET_MESSENGER_PROFILE, connectedAccountId, {});
        const profileName = profileResult?.data?.name || profileResult?.data?.data?.name;
        if (profileName) {
          await upsertComposioConnection(workspaceId, userId, 'instagram', {
            connected: true,
            accountId: connectedAccountId,
            accountName: profileName as string,
            metadata: {
              pageName: profileName,
              source: 'poll',
            },
          });
        }
      } catch { /* silent - profile fetch may fail */ }

      for (const convo of conversations.slice(0, 10)) {
        const msgsResult = await executeComposioTool(INSTAGRAM_TOOLS.LIST_MESSAGES, connectedAccountId, {
          conversation_id: convo.id,
        });
        const messages = msgsResult?.data?.data || [];

        for (const msg of messages.slice(-5)) {
          const senderId = msg.from?.id || '';
          const senderName = msg.from?.name || 'Desconocido';
          const content = msg.message || '';

          if (!senderId || !content) continue;

          const existing = await db.message.findFirst({
            where: {
              workspaceId,
              metadata: { path: ['composioMessageId'], equals: msg.id },
            },
          });

          if (existing) continue;

          const contact = await findOrCreateContact(workspaceId, 'instagram', senderId, senderName);
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
                composioMessageId: msg.id,
                senderId,
                senderName,
                source: 'composio_poll',
                conversationId: convo.id,
                connectedAccountId,
              },
              status: 'delivered',
            },
          });

          await db.conversation.update({
            where: { id: conversation.id },
            data: {
              lastMessagePreview: content.substring(0, 100),
              lastMessageAt: new Date(msg.created_time || Date.now()),
              unreadCount: { increment: 1 },
            },
          });

          newMessages++;
        }
      }
    }

    if (newMessages > 0) {
      console.log(`[COMPOSIO_POLL] Synced ${newMessages} new ${channel} messages for workspace ${workspaceId}`);
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
      metadata: data.metadata || {},
    },
    create: {
      workspaceId,
      userId,
      toolkit,
      connected: data.connected,
      accountId: data.accountId,
      accountName: data.accountName,
      metadata: data.metadata || {},
    },
  });
}

export async function findOrCreateContact(
  workspaceId: string,
  channel: 'messenger' | 'instagram',
  externalId: string,
  name: string
) {
  const existing = await db.contact.findFirst({
    where: {
      workspaceId,
      ...(channel === 'messenger'
        ? { messengerId: externalId }
        : { instagramId: externalId }),
    },
  });

  if (existing) return existing;

  return db.contact.create({
    data: {
      workspaceId,
      nombre: name || `Contacto ${channel}`,
      fuente: channel,
      ...(channel === 'messenger'
        ? { messengerId: externalId }
        : { instagramId: externalId }),
    },
  });
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

export function toolkitToChannel(toolkit: string): 'messenger' | 'instagram' | 'external' {
  if (toolkit === 'facebook') return 'messenger';
  if (toolkit === 'instagram') return 'instagram';
  return 'external';
}
