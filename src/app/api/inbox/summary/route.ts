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

// GET /api/inbox/summary — Inbox summary by channel (JWT auth)
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const workspaceId = auth.activeWorkspaceId;

    // Get total conversations count
    const total = await db.conversation.count({
      where: { workspaceId },
    });

    // Get conversations grouped by channel
    const conversations = await db.conversation.findMany({
      where: { workspaceId },
      select: { channel: true },
    });

    const byChannel: Record<string, number> = {};
    for (const c of conversations) {
      byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
    }

    // Get unread count
    const unread = await db.conversation.count({
      where: {
        workspaceId,
        unreadCount: { gt: 0 },
      },
    });

    return NextResponse.json({
      total,
      byChannel,
      unread,
    });
  } catch (error) {
    console.error('[INBOX_SUMMARY_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al obtener resumen de inbox' },
      { status: 500 }
    );
  }
}
