// Composio Integration Layer for DigiActiva CRM
// Handles Facebook & Instagram messaging via Composio SDK

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

// ─── Message Fetching ───

/**
 * Fetch recent messages from Facebook Messenger or Instagram DMs via Composio.
 * Creates/updates Conversation and Message records in our database.
 */
export async function fetchComposioMessages(
  workspaceId: string,
  userId: string,
  channel: 'messenger' | 'instagram',
  limit: number = 20,
  cursor?: string
) {
  const { session } = await createComposioSession(workspaceId, userId);

  // Determine tool slugs based on channel
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

// ─── Webhook Verification ───

/**
 * Verify incoming webhook from Composio using the webhook secret.
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
    // Composio sends a signature in the header that we can validate
    // Using HMAC-SHA256 verification
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
  // Try to find existing contact by messengerId or instagramId
  const existing = await db.contact.findFirst({
    where: {
      workspaceId,
      ...(channel === 'messenger'
        ? { messengerId: externalId }
        : { instagramId: externalId }),
    },
  });

  if (existing) return existing;

  // Create new contact
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
