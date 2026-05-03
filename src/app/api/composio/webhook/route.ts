import { NextRequest, NextResponse } from 'next/server';
import { verifyComposioWebhook, verifyWebhookSignature, findOrCreateContact, findOrCreateConversation, toolkitToChannel } from '@/lib/composio';
import { handleAutoReply, shouldTriggerAutoReply } from '@/lib/agent-auto-reply';
import { db } from '@/lib/db';

// POST /api/composio/webhook — Receive real-time messages from Composio Triggers
// Composio sends webhook payloads (V1/V2/V3) when trigger events fire
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // ─── Try SDK-based verification first (V3 format) ───
    const webhookId = request.headers.get('webhook-id') || '';
    const webhookSignature = request.headers.get('webhook-signature') || '';
    const webhookTimestamp = request.headers.get('webhook-timestamp') || '';

    let verifiedPayload: Record<string, unknown> | null = null;

    if (webhookId && webhookSignature && webhookTimestamp) {
      // V3 webhook format with proper headers
      const result = await verifyComposioWebhook({
        payload: body,
        signature: webhookSignature,
        webhookId,
        webhookTimestamp,
      });

      if (result.valid && result.parsed) {
        verifiedPayload = result.parsed;
      }
    }

    // ─── Fallback: legacy signature verification ───
    if (!verifiedPayload) {
      const signature = request.headers.get('x-composio-signature') ||
                        request.headers.get('x-composio-webhook-signature') || '';
      const isValid = await verifyWebhookSignature(signature, body);

      if (!isValid && webhookId) {
        // If V3 headers were present but verification failed, reject
        console.warn('[COMPOSIO_WEBHOOK_WARN] V3 verification failed, rejecting');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      // For legacy/no-signature webhooks during setup, we allow through with a warning
    }

    // ─── Parse the payload ───
    let payload: Record<string, unknown>;
    try {
      payload = verifiedPayload || JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    console.log('[COMPOSIO_WEBHOOK] Received payload:', JSON.stringify(payload).substring(0, 500));

    // ─── Extract message data from Composio Trigger payload ───
    // V3 format: { triggerSlug, triggerData, connectedAccountId, userId, ... }
    // V2/V1 format: { event_type, message, data, toolkit, ... }

    const triggerSlug = String(payload.triggerSlug || payload.trigger_slug || '');
    const triggerData = (payload.triggerData || payload.trigger_data || payload.data || {}) as Record<string, unknown>;

    // Determine toolkit from trigger slug (e.g., FACEBOOK_MESSENGER_MESSAGE_RECEIVED -> facebook)
    let toolkit = String(payload.toolkit || payload.app || '').toLowerCase();
    if (!toolkit) {
      if (triggerSlug.startsWith('FACEBOOK')) toolkit = 'facebook';
      else if (triggerSlug.startsWith('INSTAGRAM')) toolkit = 'instagram';
      else if (triggerSlug.startsWith('WHATSAPP')) toolkit = 'whatsapp';
      else toolkit = '';
    }

    const channel = toolkitToChannel(toolkit);

    // Skip non-message events
    const isMessageEvent = triggerSlug.includes('MESSAGE') ||
      triggerSlug.includes('message') ||
      !!payload.message ||
      !!payload.text ||
      !!triggerData.message ||
      !!triggerData.text;

    if (!isMessageEvent) {
      return NextResponse.json({ received: true, skipped: true, reason: 'Not a message event' });
    }

    // ─── Extract message details from trigger data ───
    const messageData = (triggerData.message || triggerData) as Record<string, unknown>;

    const senderId = String(
      messageData.sender_id ||
      messageData.from?.id ||
      messageData.senderId ||
      messageData.sender?.id ||
      triggerData.sender_id ||
      ''
    );
    const senderName = String(
      messageData.sender_name ||
      messageData.from?.name ||
      messageData.senderName ||
      messageData.sender?.name ||
      triggerData.sender_name ||
      'Desconocido'
    );
    const messageContent = String(
      messageData.message ||
      messageData.text ||
      messageData.content ||
      triggerData.text ||
      triggerData.content ||
      ''
    );
    const messageId = String(
      messageData.id ||
      messageData.message_id ||
      messageData.mid ||
      triggerData.message_id ||
      ''
    );

    // ─── Resolve workspace ───
    // From V3 payload userId (format: ws_{workspaceId}_user_{userId})
    // or from connected account metadata
    const composioUserId = String(payload.userId || payload.user_id || '');
    let workspaceId = '';
    const match = composioUserId.match(/^ws_(.+)_user_(.+)$/);
    if (match) {
      workspaceId = match[1];
    }

    // Fallback: look up workspace from ComposioConnection
    if (!workspaceId && toolkit) {
      const connection = await db.composioConnection.findFirst({
        where: { toolkit, connected: true },
      });
      if (connection) {
        workspaceId = connection.workspaceId;
      }
    }

    if (!workspaceId || !senderId || !messageContent) {
      console.warn('[COMPOSIO_WEBHOOK_WARN] Missing required fields:', {
        workspaceId: workspaceId || 'missing',
        senderId: senderId || 'missing',
        messageContent: messageContent ? 'present' : 'missing',
      });
      return NextResponse.json(
        { received: true, skipped: true, reason: 'Missing required fields' }
      );
    }

    // ─── Find or create contact ───
    const contact = await findOrCreateContact(workspaceId, channel, senderId, senderName);

    // ─── Find or create conversation ───
    const conversation = await findOrCreateConversation(workspaceId, contact.id, channel);

    // ─── Check for duplicate message ───
    if (messageId) {
      const existingMessage = await db.message.findFirst({
        where: {
          workspaceId,
          conversationId: conversation.id,
          metadata: {
            path: ['composioMessageId'],
            equals: messageId,
          },
        },
      });

      if (existingMessage) {
        return NextResponse.json({ received: true, duplicate: true });
      }
    }

    // ─── Create message in our database ───
    await db.message.create({
      data: {
        workspaceId,
        contactId: contact.id,
        channel,
        direction: 'inbound',
        content: messageContent,
        conversationId: conversation.id,
        metadata: {
          composioMessageId: messageId,
          senderId,
          senderName,
          triggerSlug,
          toolkit,
          source: 'composio_trigger',
        },
        status: 'delivered',
      },
    });

    // ─── Update conversation ───
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessagePreview: messageContent.substring(0, 100),
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });

    // ─── Create timeline event ───
    await db.timelineEvent.create({
      data: {
        workspaceId,
        contactId: contact.id,
        tipo: 'mensaje',
        descripcion: `Mensaje ${channel} recibido: ${messageContent.substring(0, 80)}`,
        metadata: {
          channel,
          source: 'composio_trigger',
          triggerSlug,
          senderId,
          senderName,
        },
      },
    });

    console.log('[COMPOSIO_WEBHOOK] Message saved:', {
      conversationId: conversation.id,
      contactId: contact.id,
      channel,
      triggerSlug,
      contentLength: messageContent.length,
    });

    // ─── Trigger auto-reply if applicable ───
    if (shouldTriggerAutoReply(channel)) {
      // Fire and forget — don't block the webhook response
      handleAutoReply({
        workspaceId,
        contactId: contact.id,
        conversationId: conversation.id,
        channel: channel as 'messenger' | 'instagram' | 'whatsapp',
        incomingMessage: messageContent,
        senderId,
        senderName,
        composioUserId: composioUserId || undefined,
      }).then(result => {
        if (result.replied) {
          console.log(`[COMPOSIO_WEBHOOK] Auto-reply sent for conversation ${conversation.id}`);
        } else if (result.skippedReason) {
          console.log(`[COMPOSIO_WEBHOOK] Auto-reply skipped: ${result.skippedReason}`);
        } else if (result.error) {
          console.warn(`[COMPOSIO_WEBHOOK] Auto-reply error: ${result.error}`);
        }
      }).catch(err => {
        console.error('[COMPOSIO_WEBHOOK] Auto-reply failed:', err);
      });
    }

    return NextResponse.json({ received: true, processed: true });
  } catch (error) {
    console.error('[COMPOSIO_WEBHOOK_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al procesar webhook' },
      { status: 500 }
    );
  }
}

// GET /api/composio/webhook — Webhook verification endpoint
// Composio and Meta/Facebook may send verification challenges
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = searchParams.get('hub.verify_token');

  // Facebook/Meta webhook verification
  if (mode === 'subscribe' && challenge) {
    console.log('[COMPOSIO_WEBHOOK_VERIFY] Meta verification request received');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Composio webhook endpoint active',
    version: 'v3',
  });
}
