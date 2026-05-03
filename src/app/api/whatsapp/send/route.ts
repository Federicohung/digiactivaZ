import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { sendWhatsAppMessage } from '@/lib/meta-whatsapp';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// POST /api/whatsapp/send — Send a WhatsApp message via Meta API
// Body: { to: string, text: string }
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { to, text } = body;

    if (!to || typeof to !== 'string') {
      return NextResponse.json(
        { error: 'El destinatario (to) es requerido' },
        { status: 400 }
      );
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return NextResponse.json(
        { error: 'El mensaje (text) es requerido' },
        { status: 400 }
      );
    }

    // Get workspace WhatsApp configuration
    const workspace = await db.workspace.findUnique({
      where: { id: auth.activeWorkspaceId },
      select: { integrations: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    const integrations = workspace.integrations as Record<string, any> || {};
    const whatsappConfig = integrations.whatsapp as Record<string, any> | undefined;

    if (!whatsappConfig || whatsappConfig.mode !== 'meta') {
      return NextResponse.json(
        { error: 'WhatsApp no está configurado en modo Meta. Configure la integración primero.' },
        { status: 400 }
      );
    }

    if (!whatsappConfig.phoneNumberId || !whatsappConfig.accessToken) {
      return NextResponse.json(
        { error: 'Falta configuración de WhatsApp (Phone Number ID o Access Token)' },
        { status: 400 }
      );
    }

    // Send message via Meta API
    const result = await sendWhatsAppMessage(
      whatsappConfig.phoneNumberId,
      whatsappConfig.accessToken,
      to,
      text.trim()
    );

    // Find or create contact for this recipient
    const contact = await db.contact.findFirst({
      where: {
        workspaceId: auth.activeWorkspaceId,
        whatsappId: to,
      },
    });

    if (contact) {
      // Find or create conversation
      let conversation = await db.conversation.findFirst({
        where: {
          workspaceId: auth.activeWorkspaceId,
          contactId: contact.id,
          channel: 'whatsapp',
          status: 'open',
        },
      });

      if (!conversation) {
        conversation = await db.conversation.create({
          data: {
            workspaceId: auth.activeWorkspaceId,
            contactId: contact.id,
            channel: 'whatsapp',
            provider: 'meta',
            status: 'open',
            unreadCount: 0,
            lastMessageAt: new Date(),
            tags: [],
          },
        });
      }

      // Save outbound message
      await db.message.create({
        data: {
          workspaceId: auth.activeWorkspaceId,
          contactId: contact.id,
          channel: 'whatsapp',
          direction: 'outbound',
          content: text.trim(),
          conversationId: conversation.id,
          metadata: {
            source: 'meta_whatsapp_send',
            whatsappMessageId: result.messageId,
            to,
          },
          status: 'delivered',
        },
      });

      // Update conversation
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessagePreview: text.trim().substring(0, 100),
          lastMessageAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('[WA_SEND_ERROR]', error);
    const message = error instanceof Error ? error.message : 'Error al enviar mensaje';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
