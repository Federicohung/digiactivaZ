import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { pollNewMessages, checkIntegrationStatus } from '@/lib/composio';
import { handleAutoReply, shouldTriggerAutoReply } from '@/lib/agent-auto-reply';
import type { ComposioToolkit } from '@/lib/composio';
import { db } from '@/lib/db';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// POST /api/inbox/sync — Sync messages from Composio for connected channels
// This pulls new messages from Facebook/Instagram/WhatsApp and creates conversations/contacts
// Also triggers auto-reply for new inbound messages if the agent is enabled
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { channel } = body;

    const results: { channel: string; synced: number; autoReplies: number; error?: string }[] = [];

    const channelsToSync = channel
      ? [channel as 'messenger' | 'instagram' | 'whatsapp']
      : ['messenger', 'instagram', 'whatsapp'] as const;

    for (const ch of channelsToSync) {
      const toolkit: ComposioToolkit = ch === 'messenger' ? 'facebook' : ch === 'whatsapp' ? 'whatsapp' : 'instagram';

      // Check if this channel is connected
      const status = await checkIntegrationStatus(
        auth.activeWorkspaceId,
        auth.userId,
        toolkit
      );

      if (!status.connected) {
        results.push({ channel: ch, synced: 0, autoReplies: 0, error: 'No conectado' });
        continue;
      }

      try {
        const result = await pollNewMessages(
          auth.activeWorkspaceId,
          auth.userId,
          ch
        );

        // Trigger auto-reply for new inbound messages
        let autoReplies = 0;
        if (result.newMessages > 0 && shouldTriggerAutoReply(ch)) {
          try {
            // Find the most recent inbound messages that haven't been auto-replied yet
            const recentInbound = await db.message.findMany({
              where: {
                workspaceId: auth.activeWorkspaceId,
                channel: ch,
                direction: 'inbound',
                status: 'delivered',
                metadata: {
                  path: ['source'],
                  equals: 'composio_poll',
                },
              },
              orderBy: { createdAt: 'desc' },
              take: result.newMessages,
              include: {
                conversation: true,
              },
            });

            for (const msg of recentInbound) {
              if (!msg.conversationId) continue;

              // Check if we already auto-replied to this message
              const existingAutoReply = await db.message.findFirst({
                where: {
                  conversationId: msg.conversationId,
                  direction: 'outbound',
                  metadata: {
                    path: ['source'],
                    equals: 'agent_auto_reply',
                  },
                  createdAt: {
                    gte: msg.createdAt,
                  },
                },
              });

              if (existingAutoReply) continue; // Already replied

              // Get sender info from metadata
              const metadata = (msg.metadata as Record<string, unknown>) || {};
              const senderId = String(metadata.senderId || '');
              const senderName = String(metadata.senderName || '');

              const replyResult = await handleAutoReply({
                workspaceId: auth.activeWorkspaceId,
                contactId: msg.contactId,
                conversationId: msg.conversationId,
                channel: ch as 'messenger' | 'instagram' | 'whatsapp',
                incomingMessage: msg.content,
                senderId,
                senderName,
                composioUserId: `ws_${auth.activeWorkspaceId}_user_${auth.userId}`,
              });

              if (replyResult.replied) {
                autoReplies++;
              }
            }
          } catch (autoReplyErr) {
            console.error(`[INBOX_SYNC_AUTO_REPLY_ERROR] channel=${ch}:`, autoReplyErr);
          }
        }

        results.push({ channel: ch, synced: result.newMessages, autoReplies });
      } catch (err) {
        console.error(`[INBOX_SYNC_ERROR] channel=${ch}:`, err);
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({ channel: ch, synced: 0, autoReplies: 0, error: errMsg || 'Error al sincronizar' });
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
    const totalAutoReplies = results.reduce((sum, r) => sum + r.autoReplies, 0);

    return NextResponse.json({
      ok: true,
      results,
      totalSynced,
      totalAutoReplies,
      message: `${totalSynced} mensajes nuevos sincronizados${totalAutoReplies > 0 ? `, ${totalAutoReplies} respuestas automáticas` : ''}`,
    });
  } catch (error) {
    console.error('[INBOX_SYNC_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al sincronizar inbox' },
      { status: 500 }
    );
  }
}
