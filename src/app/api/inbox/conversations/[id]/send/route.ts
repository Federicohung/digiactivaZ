import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, extractBearerToken } from '@/lib/auth';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// POST /api/inbox/conversations/[id]/send — Send outbound message (JWT auth)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { content, channel } = body;

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json(
        { error: 'El contenido del mensaje es requerido' },
        { status: 400 }
      );
    }

    // Verify conversation belongs to workspace
    const conversation = await db.conversation.findFirst({
      where: { id, workspaceId: auth.activeWorkspaceId },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversación no encontrada' },
        { status: 404 }
      );
    }

    const messageChannel = channel || conversation.channel;

    // Create Message record (direction: outbound)
    const message = await db.message.create({
      data: {
        workspaceId: auth.activeWorkspaceId,
        contactId: conversation.contactId,
        channel: messageChannel,
        direction: 'outbound',
        content: content.trim(),
        conversationId: id,
        metadata: {
          sentBy: auth.userId,
          conversationId: id,
        },
        status: 'delivered',
      },
    });

    // Update conversation's lastMessagePreview and lastMessageAt
    await db.conversation.update({
      where: { id },
      data: {
        lastMessagePreview: content.trim().substring(0, 100),
        lastMessageAt: new Date(),
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('[INBOX_SEND_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al enviar mensaje' },
      { status: 500 }
    );
  }
}
