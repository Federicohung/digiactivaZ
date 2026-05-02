import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { sendComposioMessage } from '@/lib/composio';
import { db } from '@/lib/db';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// POST /api/composio/send — Send a message via Composio to Facebook/Instagram
// Body: { conversationId: string, content: string, channel: 'messenger' | 'instagram' }
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { conversationId, content, channel } = body;

    if (!conversationId || !content || !channel) {
      return NextResponse.json(
        { error: 'conversationId, content y channel son requeridos' },
        { status: 400 }
      );
    }

    if (!['messenger', 'instagram'].includes(channel)) {
      return NextResponse.json(
        { error: 'Canal inválido. Use "messenger" o "instagram"' },
        { status: 400 }
      );
    }

    if (typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json(
        { error: 'El contenido del mensaje es requerido' },
        { status: 400 }
      );
    }

    // Verify conversation belongs to workspace
    const conversation = await db.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: auth.activeWorkspaceId,
      },
      include: {
        contact: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversación no encontrada' },
        { status: 404 }
      );
    }

    if (conversation.provider !== 'composio') {
      return NextResponse.json(
        { error: 'Esta conversación no usa Composio como proveedor' },
        { status: 400 }
      );
    }

    // Get the recipient ID from the contact
    const recipientId =
      channel === 'messenger'
        ? conversation.contact.messengerId
        : conversation.contact.instagramId;

    if (!recipientId) {
      return NextResponse.json(
        { error: `Contacto no tiene ${channel === 'messenger' ? 'messengerId' : 'instagramId'} configurado` },
        { status: 400 }
      );
    }

    // Send via Composio
    const composioResult = await sendComposioMessage(
      auth.activeWorkspaceId,
      auth.userId,
      channel as 'messenger' | 'instagram',
      recipientId,
      content.trim()
    );

    // Create Message record in our database
    const message = await db.message.create({
      data: {
        workspaceId: auth.activeWorkspaceId,
        contactId: conversation.contactId,
        channel,
        direction: 'outbound',
        content: content.trim(),
        conversationId,
        metadata: {
          sentBy: auth.userId,
          composioResult: composioResult as Record<string, unknown>,
          recipientId,
        },
        status: 'delivered',
      },
    });

    // Update conversation
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessagePreview: content.trim().substring(0, 100),
        lastMessageAt: new Date(),
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('[COMPOSIO_SEND_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al enviar mensaje via Composio' },
      { status: 500 }
    );
  }
}
