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

// GET /api/crm/chat-sessions/[id] — Get single session with messages (JWT auth)
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

    const session = await db.chatSession.findFirst({
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
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Sesión no encontrada' },
        { status: 404 }
      );
    }

    const parsed = {
      ...session,
      messages: session.messages || [],
      leadData: session.leadData || {},
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[CHAT_SESSION_GET_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al obtener sesión de chat' },
      { status: 500 }
    );
  }
}
