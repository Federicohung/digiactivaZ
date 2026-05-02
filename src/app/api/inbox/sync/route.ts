import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { pollNewMessages, checkIntegrationStatus } from '@/lib/composio';
import type { ComposioToolkit } from '@/lib/composio';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// POST /api/inbox/sync — Sync messages from Composio for connected channels
// This pulls new messages from Facebook/Instagram and creates conversations/contacts
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { channel } = body;

    const results: { channel: string; synced: number; error?: string }[] = [];

    const channelsToSync = channel
      ? [channel as 'messenger' | 'instagram']
      : ['messenger', 'instagram'] as const;

    for (const ch of channelsToSync) {
      const toolkit: ComposioToolkit = ch === 'messenger' ? 'facebook' : 'instagram';

      // Check if this channel is connected
      const status = await checkIntegrationStatus(
        auth.activeWorkspaceId,
        auth.userId,
        toolkit
      );

      if (!status.connected) {
        results.push({ channel: ch, synced: 0, error: 'No conectado' });
        continue;
      }

      try {
        const result = await pollNewMessages(
          auth.activeWorkspaceId,
          auth.userId,
          ch
        );
        results.push({ channel: ch, synced: result.newMessages });
      } catch (err) {
        console.error(`[INBOX_SYNC_ERROR] channel=${ch}:`, err);
        results.push({ channel: ch, synced: 0, error: 'Error al sincronizar' });
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);

    return NextResponse.json({
      ok: true,
      results,
      totalSynced,
      message: `${totalSynced} mensajes nuevos sincronizados`,
    });
  } catch (error) {
    console.error('[INBOX_SYNC_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al sincronizar inbox' },
      { status: 500 }
    );
  }
}
