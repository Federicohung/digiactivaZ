import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { pollNewMessages } from '@/lib/composio';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// POST /api/composio/messages — Poll (sync) messages from Facebook/Instagram via Composio
// Body: { channel: 'messenger' | 'instagram' }
// This fetches recent messages and syncs them to our database.
// Since FB/IG don't have native Composio triggers, we use polling.
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { channel } = body;

    if (!channel || !['messenger', 'instagram'].includes(channel)) {
      return NextResponse.json(
        { error: 'Canal inválido. Use "messenger" o "instagram"' },
        { status: 400 }
      );
    }

    const result = await pollNewMessages(
      auth.activeWorkspaceId,
      auth.userId,
      channel as 'messenger' | 'instagram'
    );

    return NextResponse.json({
      ok: true,
      channel,
      ...result,
      message: `Sincronizados ${result.newMessages} mensajes nuevos de ${channel}`,
    });
  } catch (error) {
    console.error('[COMPOSIO_MESSAGES_SYNC_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al sincronizar mensajes de Composio' },
      { status: 500 }
    );
  }
}
