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
  const connectionRequest = await session.authorize(toolkit, {
    callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://digiactiva-z.vercel.app'}/api/composio/callback`,
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

// ─── Triggers ───

// Map of Composio trigger slugs for each toolkit
const TRIGGER_SLUGS: Record<ComposioToolkit, string[]> = {
  facebook: [
    'FACEBOOK_MESSENGER_MESSAGE_RECEIVED',
    'FACEBOOK_MESSENGER_MESSAGE_DELIVERED',
  ],
  instagram: [
    'INSTAGRAM_DIRECT_MESSAGE_RECEIVED',
    'INSTAGRAM_MESSAGE_RECEIVED',
  ],
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
      ? 'FACEBOOK_MESSENGER_GET_CONVERSATIONS'
      : 'INSTAGRAM_GET_DIRECT_MESSAGES';

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
      ? 'FACEBOOK_MESSENGER_SEND_MESSAGE'
      : 'INSTAGRAM_SEND_DIRECT_MESSAGE';

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
