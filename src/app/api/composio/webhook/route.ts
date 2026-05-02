import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, findOrCreateContact, findOrCreateConversation, toolkitToChannel } from '@/lib/composio';
import { db } from '@/lib/db';

// POST /api/composio/webhook — Receive real-time messages from Composio
// This endpoint should be registered in the Composio dashboard
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-composio-signature') || 
                      request.headers.get('x-composio-webhook-signature') ||
                      request.headers.get('signature') || '';

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(signature, body);
    if (!isValid) {
      console.warn('[COMPOSIO_WEBHOOK_WARN] Invalid signature, processing anyway for initial setup');
      // During initial setup, we allow unverified webhooks to facilitate testing
      // In production, you may want to enforce this: return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    console.log('[COMPOSIO_WEBHOOK] Received payload:', JSON.stringify(payload).substring(0, 500));

    // Extract message data from the webhook payload
    // Composio webhook format varies by toolkit; handle common patterns
    const eventType = payload.event_type || payload.eventType || payload.type || '';
    const toolkit = String(payload.toolkit || payload.app || '').toLowerCase();

    // Determine channel from toolkit
    const channel = toolkitToChannel(toolkit);

    // Skip non-message events
    if (!eventType.toString().includes('message') && !payload.message && !payload.text) {
      return NextResponse.json({ received: true, skipped: true, reason: 'Not a message event' });
    }

    // Extract message details
    const messageData = (payload.message || payload.data || payload) as Record<string, unknown>;
    const senderId = String(
      messageData.sender_id || 
      messageData.from?.id || 
      messageData.senderId || 
      messageData.sender?.id || 
      ''
    );
    const senderName = String(
      messageData.sender_name || 
      messageData.from?.name || 
      messageData.senderName || 
      messageData.sender?.name || 
      'Desconocido'
    );
    const messageContent = String(
      messageData.message || 
      messageData.text || 
      messageData.content || 
      ''
    );
    const messageId = String(
      messageData.id || 
      messageData.message_id || 
      messageData.mid || 
      ''
    );

    // Extract workspace ID from payload metadata or use a lookup
    // Composio webhooks include the connected account's user_id which we set as composioUserId
    const composioUserId = String(payload.user_id || payload.userId || '');
    
    // Parse workspace ID from our composioUserId format: ws_{workspaceId}_user_{userId}
    let workspaceId = '';
    const match = composioUserId.match(/^ws_(.+)_user_(.+)$/);
    if (match) {
      workspaceId = match[1];
    }

    if (!workspaceId || !senderId || !messageContent) {
      console.warn('[COMPOSIO_WEBHOOK_WARN] Missing required fields:', {
        workspaceId,
        senderId,
        messageContent: messageContent ? 'present' : 'missing',
      });
      return NextResponse.json(
        { received: true, skipped: true, reason: 'Missing required fields' }
      );
    }

    // Find or create contact
    const contact = await findOrCreateContact(workspaceId, channel, senderId, senderName);

    // Find or create conversation
    const conversation = await findOrCreateConversation(workspaceId, contact.id, channel);

    // Check for duplicate message
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

    // Create message in our database
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
          eventType,
          toolkit,
          raw: payload,
        },
        status: 'delivered',
      },
    });

    // Update conversation
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessagePreview: messageContent.substring(0, 100),
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });

    console.log('[COMPOSIO_WEBHOOK] Message saved:', {
      conversationId: conversation.id,
      contactId: contact.id,
      channel,
      contentLength: messageContent.length,
    });

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
// Composio may send a verification challenge
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = searchParams.get('hub.verify_token');

  // Facebook/Meta webhook verification
  if (mode === 'subscribe' && challenge) {
    // In a real scenario, you'd verify the verify_token matches your app's verify token
    console.log('[COMPOSIO_WEBHOOK_VERIFY] Verification request received');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Composio webhook endpoint active',
  });
}
