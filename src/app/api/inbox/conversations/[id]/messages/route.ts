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

// GET /api/inbox/conversations/[id]/messages — Get messages for conversation (JWT auth)
// Paginated with cursor
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

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

    const where: Record<string, unknown> = {
      conversationId: id,
      workspaceId: auth.activeWorkspaceId,
    };

    if (cursor) {
      where.id = { lt: cursor };
    }

    const messages = await db.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // metadata is already a native JS object for Json fields
    const parsed = items
      .map((m) => ({
        ...m,
        metadata: m.metadata || {},
      }))
      .reverse();

    return NextResponse.json({
      messages: parsed,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('[INBOX_MESSAGES_GET_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al obtener mensajes' },
      { status: 500 }
    );
  }
}
