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

// GET /api/inbox/conversations/[id] — Get conversation detail (JWT auth)
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

    const conversation = await db.conversation.findFirst({
      where: { id, workspaceId: auth.activeWorkspaceId },
      include: {
        contact: {
          select: {
            id: true,
            nombre: true,
            email: true,
            telefono: true,
            empresa: true,
            etapa: true,
            nicho: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversación no encontrada' },
        { status: 404 }
      );
    }

    const parsed = {
      ...conversation,
      tags: JSON.parse(conversation.tags || '[]'),
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[INBOX_CONVERSATION_GET_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al obtener conversación' },
      { status: 500 }
    );
  }
}
