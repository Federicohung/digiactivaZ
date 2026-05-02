// Composio Integration Layer for DigiActiva CRM
// Handles Facebook & Instagram messaging via Composio SDK
// Includes Triggers for real-time message delivery

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

// ─── Session Management ───

/**
 * Create a Composio session for a user.
 * Uses the workspace + user combo as the Composio userId for isolation.
 */
export async function createComposioSession(workspaceId: string, userId: string) {
  const composio = getComposio();
  // Composite key ensures per-workspace isolation
  const composioUserId = `ws_${workspaceId}_user_${userId}`;
  const session = await composio.create(composioUserId, {
    manageConnections: true,
  });
  return { session, composioUserId };
}

/**
 * Get or create a Composio session using a stored session ID.
 */
export async function getOrCreateSession(workspaceId: string, userId: string) {
  const composio = getComposio();
  const composioUserId = `ws_${workspaceId}_user_${userId}`;
  const session = await composio.create(composioUserId, {
    manageConnections: true,
  });
  return { session, composioUserId };
}

// ─── OAuth Connection ───

export type ComposioToolkit = 'facebook' | 'instagram';

/**
 * Initiate OAuth flow for a toolkit (Facebook or Instagram).
 * Returns the redirect URL the user must visit to authenticate.
 */
export async function initiateOAuth(
  workspaceId: string,
  userId: string,
  toolkit: ComposioToolkit
): Promise<{ redirectUrl: string; connectedAccountId: string }> {
  const { session } = await createComposioSession(workspaceId, userId);

  // Encode workspace/user info in state so the callback knows who this is for
  const stateParam = encodeURIComponent(JSON.stringify({ workspaceId, userId }));
  const callbackUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://digiactiva-z.vercel.app'}/api/composio/callback?state=${stateParam}`;

  const connectionRequest = await session.authorize(toolkit, {
    callbackUrl,
  });

  const redirectUrl = connectionRequest.redirectUrl || '';
  const connectedAccountId = connectionRequest.connectedAccountId || '';

  return { redirectUrl, connectedAccountId };
}

/**
 * Check if a toolkit is connected for a given workspace.
 */
export async function checkIntegrationStatus(
  workspaceId: string,
  userId: string,
  toolkit: ComposioToolkit
): Promise<{ connected: boolean; toolkit: string }> {
  try {
    const { session } = await createComposioSession(workspaceId, userId);
    const toolkitsResult = await session.toolkits({ filter: [toolkit] });

    const items = toolkitsResult.items || [];
    const tk = items.find((t) => t.slug === toolkit);

    const connected = tk?.connection?.isActive ?? false;
    return { connected, toolkit };
  } catch (error) {
    console.error('[COMPOSIO_STATUS_CHECK_ERROR]', error);
    return { connected: false, toolkit };
  }
}

// ─── Composio Tool Slugs (discovered via COMPOSIO_SEARCH_TOOLS) ───

// Facebook Messenger tools
const FACEBOOK_TOOLS = {
  LIST_PAGES: 'FACEBOOK_LIST_MANAGED_PAGES',
  GET_CONVERSATIONS: 'FACEBOOK_GET_PAGE_CONVERSATIONS',
  GET_MESSAGES: 'FACEBOOK_GET_CONVERSATION_MESSAGES',
  GET_MESSAGE_DETAILS: 'FACEBOOK_GET_MESSAGE_DETAILS',
  SEND_MESSAGE: 'FACEBOOK_SEND_MESSAGE',
  SEND_MEDIA: 'FACEBOOK_SEND_MEDIA_MESSAGE',
  MARK_SEEN: 'FACEBOOK_MARK_MESSAGE_SEEN',
} as const;

// Instagram DM tools
const INSTAGRAM_TOOLS = {
  LIST_CONVERSATIONS: 'INSTAGRAM_LIST_ALL_CONVERSATIONS',
  GET_CONVERSATION: 'INSTAGRAM_GET_CONVERSATION',
  LIST_MESSAGES: 'INSTAGRAM_LIST_ALL_MESSAGES',
  SEND_TEXT: 'INSTAGRAM_SEND_TEXT_MESSAGE',
  GET_PAGE_CONVERSATIONS: 'INSTAGRAM_GET_PAGE_CONVERSATIONS',
  GET_MESSENGER_PROFILE: 'INSTAGRAM_GET_MESSENGER_PROFILE',
} as const;

// ─── Triggers ───
// NOTE: As of May 2026, Facebook and Instagram do NOT have native
// Composio triggers. We use polling via the tools above instead.
// If Composio adds trigger support later, we can activate them here.
const TRIGGER_SLUGS: Record<ComposioToolkit, string[]> = {
  facebook: [], // No native triggers yet
  instagram: [], // No native triggers yet
};

/**
 * List available trigger types for a toolkit.
 * Useful for discovering what trigger slugs are available.
 */
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

/**
 * List all active trigger instances for a user/workspace.
 */
export async function listActiveTriggers(composioUserId: string) {
  const composio = getComposio();
  try {
    const result = await composio.triggers.listActive({
      connectedAccountIds: undefined,
    });
    return result;
  } catch (error) {
    console.error('[COMPOSIO_LIST_ACTIVE_TRIGGERS_ERROR]', error);
    throw error;
  }
}

/**
 * Create a trigger instance for a toolkit.
 * This tells Composio to start listening for events (e.g. new messages)
 * and forward them to our webhook endpoint.
 *
 * @param composioUserId - The Composio user ID (ws_{workspaceId}_user_{userId})
 * @param toolkit - facebook or instagram
 * @param triggerSlug - The trigger type slug (e.g. FACEBOOK_MESSENGER_MESSAGE_RECEIVED)
 */
export async function createTrigger(
  composioUserId: string,
  toolkit: ComposioToolkit,
  triggerSlug: string
) {
  const composio = getComposio();
  try {
    const result = await composio.triggers.create(composioUserId, triggerSlug, {
      triggerConfig: {},
    });
    console.log(`[COMPOSIO_TRIGGER_CREATED] ${triggerSlug} for ${composioUserId}:`, result.id);
    return result;
  } catch (error) {
    console.error(`[COMPOSIO_CREATE_TRIGGER_ERROR] ${triggerSlug}:`, error);
    throw error;
  }
}

/**
 * Setup all triggers for a toolkit after OAuth connection is complete.
 * Creates trigger instances for message events on Facebook/Instagram.
 */
export async function setupTriggersForToolkit(
  workspaceId: string,
  userId: string,
  toolkit: ComposioToolkit
) {
  const composioUserId = `ws_${workspaceId}_user_${userId}`;
  const slugs = TRIGGER_SLUGS[toolkit];
  const results = [];

  for (const slug of slugs) {
    try {
      const trigger = await createTrigger(composioUserId, toolkit, slug);
      results.push({ slug, success: true, triggerId: trigger.id });
    } catch (error) {
      // Some trigger slugs may not exist for a given toolkit; log but don't fail
      console.warn(`[COMPOSIO_TRIGGER_SETUP_WARN] Failed to create trigger ${slug}:`, error);
      results.push({ slug, success: false, error: String(error) });
    }
  }

  // Store trigger IDs in our ComposioConnection record
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

/**
 * Disable a trigger instance by ID.
 */
export async function disableTrigger(triggerId: string) {
  const composio = getComposio();
  try {
    return await composio.triggers.disable(triggerId);
  } catch (error) {
    console.error('[COMPOSIO_DISABLE_TRIGGER_ERROR]', error);
    throw error;
  }
}

/**
 * Enable a trigger instance by ID.
 */
export async function enableTrigger(triggerId: string) {
  const composio = getComposio();
  try {
    return await composio.triggers.enable(triggerId);
  } catch (error) {
    console.error('[COMPOSIO_ENABLE_TRIGGER_ERROR]', error);
    throw error;
  }
}

/**
 * Delete a trigger instance by ID.
 */
export async function deleteTrigger(triggerId: string) {
  const composio = getComposio();
  try {
    return await composio.triggers.delete(triggerId);
  } catch (error) {
    console.error('[COMPOSIO_DELETE_TRIGGER_ERROR]', error);
    throw error;
  }
}

// ─── Webhook Verification (SDK-based) ───

/**
 * Verify an incoming webhook from Composio using the SDK's built-in verification.
 * This validates the HMAC-SHA256 signature using the standard Composio format:
 * signature = HMAC-SHA256(webhookId.webhookTimestamp.payload, secret)
 */
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

/**
 * Legacy webhook signature verification for backwards compatibility.
 * Uses raw HMAC-SHA256.
 */
export async function verifyWebhookSignature(
  signature: string,
  body: string
): boolean {
  const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[COMPOSIO_WEBHOOK_ERROR] No webhook secret configured');
    return false;
  }

  try {
    const crypto = await import('crypto');
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    return signature === expectedSig || signature === `sha256=${expectedSig}`;
  } catch (error) {
    console.error('[COMPOSIO_WEBHOOK_VERIFY_ERROR]', error);
    return false;
  }
}

// ─── Message Fetching ───

/**
 * Fetch recent messages from Facebook Messenger or Instagram DMs via Composio.
 */
export async function fetchComposioMessages(
  workspaceId: string,
  userId: string,
  channel: 'messenger' | 'instagram',
  limit: number = 20,
  cursor?: string
) {
  const { session } = await createComposioSession(workspaceId, userId);

  const listMessagesTool =
    channel === 'messenger'
      ? FACEBOOK_TOOLS.GET_CONVERSATIONS
      : INSTAGRAM_TOOLS.LIST_CONVERSATIONS;

  try {
    const result = await session.execute(listMessagesTool, {
      limit,
      ...(cursor ? { after: cursor } : {}),
    });

    return result;
  } catch (error) {
    console.error('[COMPOSIO_FETCH_MESSAGES_ERROR]', error);
    throw error;
  }
}

// ─── Message Sending ───

/**
 * Send a message via Composio to Facebook Messenger or Instagram.
 */
export async function sendComposioMessage(
  workspaceId: string,
  userId: string,
  channel: 'messenger' | 'instagram',
  recipientId: string,
  content: string
) {
  const { session } = await createComposioSession(workspaceId, userId);

  const sendTool =
    channel === 'messenger'
      ? FACEBOOK_TOOLS.SEND_MESSAGE
      : INSTAGRAM_TOOLS.SEND_TEXT;

  try {
    const result = await session.execute(sendTool, {
      recipient_id: recipientId,
      message: content,
    });
    return result;
  } catch (error) {
    console.error('[COMPOSIO_SEND_MESSAGE_ERROR]', error);
    throw error;
  }
}

// ─── Polling for New Messages ───
// Since Facebook/Instagram don't have native Composio triggers,
// we poll for new messages using the Composio tools.

/**
 * Poll for new Facebook Messenger or Instagram messages.
 * Fetches recent conversations and messages, then syncs any new ones
 * into our database as Contact + Conversation + Message records.
 *
 * Returns the count of new messages synced.
 */
export async function pollNewMessages(
  workspaceId: string,
  userId: string,
  channel: 'messenger' | 'instagram'
): Promise<{ newMessages: number; newContacts: number }> {
  const { session } = await createComposioSession(workspaceId, userId);

  let newMessages = 0;
  let newContacts = 0;

  try {
    if (channel === 'messenger') {
      // Step 1: List managed pages
      const pagesResult = await session.execute(FACEBOOK_TOOLS.LIST_PAGES, {});
      const pages = pagesResult?.data?.data || [];

      for (const page of pages) {
        // Step 2: Get conversations for this page
        const convosResult = await session.execute(FACEBOOK_TOOLS.GET_CONVERSATIONS, {
          page_id: page.id,
        });
        const conversations = convosResult?.data?.data || [];

        for (const convo of conversations.slice(0, 10)) {
          // Step 3: Get messages for this conversation
          const msgsResult = await session.execute(FACEBOOK_TOOLS.GET_MESSAGES, {
            conversation_id: convo.id,
          });
          const messages = msgsResult?.data?.data || [];

          for (const msg of messages.slice(-5)) {
            const senderId = msg.from?.id || '';
            const senderName = msg.from?.name || 'Desconocido';
            const content = msg.message || '';

            if (!senderId || !content) continue;

            // Check for duplicate
            const existing = await db.message.findFirst({
              where: {
                workspaceId,
                metadata: {
                  path: ['composioMessageId'],
                  equals: msg.id,
                },
              },
            });

            if (existing) continue;

            // Create/update contact
            const contact = await findOrCreateContact(workspaceId, 'messenger', senderId, senderName);
            // Create/update conversation
            const conversation = await findOrCreateConversation(workspaceId, contact.id, 'messenger');

            // Save message
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
                },
                status: 'delivered',
              },
            });

            // Update conversation
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
      // Step 1: List Instagram conversations
      const convosResult = await session.execute(INSTAGRAM_TOOLS.LIST_CONVERSATIONS, {});
      const conversations = convosResult?.data?.data || [];

      for (const convo of conversations.slice(0, 10)) {
        // Step 2: Get messages for this conversation
        const msgsResult = await session.execute(INSTAGRAM_TOOLS.LIST_MESSAGES, {
          conversation_id: convo.id,
        });
        const messages = msgsResult?.data?.data || [];

        for (const msg of messages.slice(-5)) {
          const senderId = msg.from?.id || '';
          const senderName = msg.from?.name || 'Desconocido';
          const content = msg.message || '';

          if (!senderId || !content) continue;

          // Check for duplicate
          const existing = await db.message.findFirst({
            where: {
              workspaceId,
              metadata: {
                path: ['composioMessageId'],
                equals: msg.id,
              },
            },
          });

          if (existing) continue;

          // Create/update contact
          const contact = await findOrCreateContact(workspaceId, 'instagram', senderId, senderName);
          // Create/update conversation
          const conversation = await findOrCreateConversation(workspaceId, contact.id, 'instagram');

          // Save message
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
              },
              status: 'delivered',
            },
          });

          // Update conversation
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

/**
 * Upsert a ComposioConnection record in our database.
 */
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

/**
 * Find or create a Contact for an incoming Composio message.
 */
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

/**
 * Find or create a Conversation for an incoming message.
 */
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

/**
 * Get the channel type from a Composio toolkit name.
 */
export function toolkitToChannel(toolkit: string): 'messenger' | 'instagram' | 'external' {
  if (toolkit === 'facebook') return 'messenger';
  if (toolkit === 'instagram') return 'instagram';
  return 'external';
}
