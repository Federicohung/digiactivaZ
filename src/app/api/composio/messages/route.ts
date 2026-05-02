import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { fetchComposioMessages, findOrCreateContact, findOrCreateConversation } from '@/lib/composio';
import { db } from '@/lib/db';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// GET /api/composio/messages — Fetch messages from Facebook/Instagram via Composio
// Query: ?channel=messenger|instagram&limit=20&cursor=...
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel') as 'messenger' | 'instagram' | null;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const cursor = searchParams.get('cursor') || undefined;

    if (!channel || !['messenger', 'instagram'].includes(channel)) {
      return NextResponse.json(
        { error: 'Canal inválido. Use "messenger" o "instagram"' },
        { status: 400 }
      );
    }

    // Fetch messages from Composio
    const composioResult = await fetchComposioMessages(
      auth.activeWorkspaceId,
      auth.userId,
      channel,
      limit,
      cursor
    );

    // Process and sync to our database
    const conversations: Array<{
      id: string;
      contactId: string;
      contactName: string;
      channel: string;
      lastMessage: string;
      lastMessageAt: string;
      unreadCount: number;
    }> = [];

    // Parse the Composio response and upsert into our DB
    // The response structure depends on the Composio tool output
    const responseData = composioResult as Record<string, unknown>;
    const data = (responseData?.data ?? responseData) as Record<string, unknown>;

    if (data && typeof data === 'object') {
      // Handle array of conversations from Composio
      const items = Array.isArray(data) ? data : (data.conversations || data.data || []);

      for (const item of items) {
        const msg = item as Record<string, unknown>;
        const senderId = String(msg.sender_id || msg.from?.id || msg.senderId || '');
        const senderName = String(msg.sender_name || msg.from?.name || msg.senderName || 'Desconocido');
        const messageContent = String(msg.message || msg.text || msg.content || '');
        const messageId = String(msg.id || msg.message_id || '');

        if (!senderId) continue;

        // Find or create contact
        const contact = await findOrCreateContact(
          auth.activeWorkspaceId,
          channel,
          senderId,
          senderName
        );

        // Find or create conversation
        const conversation = await findOrCreateConversation(
          auth.activeWorkspaceId,
          contact.id,
          channel
        );

        // Check if message already exists (dedup by metadata.composioMessageId)
        const existingMessage = await db.message.findFirst({
          where: {
            workspaceId: auth.activeWorkspaceId,
            conversationId: conversation.id,
            metadata: {
              path: ['composioMessageId'],
              equals: messageId,
            },
          },
        });

        if (!existingMessage && messageContent) {
          // Create message in our database
          await db.message.create({
            data: {
              workspaceId: auth.activeWorkspaceId,
              contactId: contact.id,
              channel,
              direction: 'inbound',
              content: messageContent,
              conversationId: conversation.id,
              metadata: {
                composioMessageId: messageId,
                senderId,
                senderName,
                raw: msg,
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
        }

        conversations.push({
          id: conversation.id,
          contactId: contact.id,
          contactName: contact.nombre,
          channel,
          lastMessage: messageContent.substring(0, 100),
          lastMessageAt: conversation.lastMessageAt.toISOString(),
          unreadCount: conversation.unreadCount,
        });
      }
    }

    return NextResponse.json({
      conversations,
      channel,
      raw: composioResult,
    });
  } catch (error) {
    console.error('[COMPOSIO_MESSAGES_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al obtener mensajes de Composio' },
      { status: 500 }
    );
  }
}
