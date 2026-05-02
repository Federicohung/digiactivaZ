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

// GET /api/inbox/conversations — List conversations (JWT auth)
// Query params: ?channel=...&status=...&cursor=...&limit=20
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');
    const status = searchParams.get('status');
    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const where: Record<string, unknown> = {
      workspaceId: auth.activeWorkspaceId,
    };

    if (channel) {
      where.channel = channel;
    }

    if (status) {
      where.status = status;
    }

    if (cursor) {
      where.id = { lt: cursor };
    }

    const conversations = await db.conversation.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            nombre: true,
            email: true,
            telefono: true,
            empresa: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: limit + 1, // Take one extra to check for next page
    });

    const hasMore = conversations.length > limit;
    const items = hasMore ? conversations.slice(0, limit) : conversations;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Parse tags JSON for each conversation
    const parsed = items.map((c) => ({
      ...c,
      tags: JSON.parse(c.tags || '[]'),
    }));

    return NextResponse.json({
      conversations: parsed,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('[INBOX_CONVERSATIONS_LIST_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al listar conversaciones' },
      { status: 500 }
    );
  }
}
