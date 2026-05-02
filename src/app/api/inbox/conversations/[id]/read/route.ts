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

// POST /api/inbox/conversations/[id]/read — Mark as read (JWT auth)
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

    // Set unreadCount to 0
    const updated = await db.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
      include: {
        contact: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });

    const parsed = {
      ...updated,
      tags: updated.tags || [],
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[INBOX_READ_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al marcar como leído' },
      { status: 500 }
    );
  }
}
