import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyMetaWebhook,
  parseWhatsAppWebhook,
  markWhatsAppMessageRead,
} from '@/lib/meta-whatsapp';
import { shouldTriggerAutoReply, handleAutoReply } from '@/lib/agent-auto-reply';

// GET /api/whatsapp/webhook — Webhook verification (Meta sends this during setup)
// Matches hub.mode=subscribe, hub.verify_token, hub.challenge
// Returns hub.challenge as plain text with status 200
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!mode || !token || !challenge) {
    return new NextResponse('Missing required parameters', { status: 400 });
  }

  // Find workspace that has this verify token configured
  // We need to check all workspaces for a matching verify token
  const workspaces = await db.workspace.findMany({
    select: {
      id: true,
      integrations: true,
    },
  });

  let matchedWorkspaceId: string | null = null;
  let matchedVerifyToken: string | null = null;

  for (const ws of workspaces) {
    const integrations = ws.integrations as Record<string, any> || {};
    const whatsappConfig = integrations.whatsapp as Record<string, any> | undefined;
    if (whatsappConfig?.mode === 'meta' && whatsappConfig.verifyToken === token) {
      matchedWorkspaceId = ws.id;
      matchedVerifyToken = whatsappConfig.verifyToken;
      break;
    }
  }

  if (!matchedVerifyToken) {
    console.warn('[WA_WEBHOOK] No workspace found with matching verify token');
    return new NextResponse('Forbidden', { status: 403 });
  }

  const result = verifyMetaWebhook(mode, token, challenge, matchedVerifyToken);
  return new NextResponse(result.body, { status: result.status });
}

// POST /api/whatsapp/webhook — Incoming message webhook from Meta
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Parse the webhook payload
    const incomingMessages = parseWhatsAppWebhook(body);

    if (incomingMessages.length === 0) {
      // Could be a status update or other non-message event — acknowledge it
      return NextResponse.json({ status: 'ok' });
    }

    console.log(`[WA_WEBHOOK] Received ${incomingMessages.length} WhatsApp messages`);

    // Process each message
    for (const msg of incomingMessages) {
      try {
        // 1. Find workspace by matching the recipient phone_number_id to workspace integrations config
        const workspace = await findWorkspaceByPhoneNumberId(msg.phoneNumberId || '');

        if (!workspace) {
          console.warn(`[WA_WEBHOOK] No workspace found for phone_number_id: ${msg.phoneNumberId}`);
          continue;
        }

        const integrations = workspace.integrations as Record<string, any> || {};
        const whatsappConfig = integrations.whatsapp as Record<string, any> | undefined;

        // 2. Find or create Contact (using phone number as whatsappId)
        const contact = await findOrCreateContact(
          workspace.id,
          msg.from,
          msg.profileName
        );

        // 3. Find or create Conversation
        const conversation = await findOrCreateConversation(
          workspace.id,
          contact.id
        );

        // 4. Save Message to DB
        await db.message.create({
          data: {
            workspaceId: workspace.id,
            contactId: contact.id,
            channel: 'whatsapp',
            direction: 'inbound',
            content: msg.text,
            conversationId: conversation.id,
            metadata: {
              source: 'meta_whatsapp_webhook',
              whatsappMessageId: msg.messageId,
              from: msg.from,
              type: msg.type,
              timestamp: msg.timestamp,
              profileName: msg.profileName,
              phoneNumberId: msg.phoneNumberId,
            },
            status: 'delivered',
          },
        });

        // 5. Update Conversation
        await db.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessagePreview: msg.text.substring(0, 100),
            lastMessageAt: new Date(parseInt(msg.timestamp) * 1000),
            unreadCount: { increment: 1 },
          },
        });

        // 6. Mark message as read (best effort)
        if (whatsappConfig?.phoneNumberId && whatsappConfig?.accessToken) {
          markWhatsAppMessageRead(
            whatsappConfig.phoneNumberId,
            whatsappConfig.accessToken,
            msg.messageId
          ).catch(() => {});
        }

        // 7. Trigger auto-reply if enabled
        if (shouldTriggerAutoReply('whatsapp')) {
          // Don't await — auto-reply runs in the background
          handleAutoReply({
            workspaceId: workspace.id,
            contactId: contact.id,
            conversationId: conversation.id,
            channel: 'whatsapp',
            incomingMessage: msg.text,
            senderId: msg.from,
            senderName: msg.profileName,
          }).catch(err => {
            console.error('[WA_WEBHOOK] Auto-reply error:', err);
          });
        }
      } catch (msgError) {
        console.error('[WA_WEBHOOK] Error processing message:', msgError);
        // Continue processing other messages
      }
    }

    // Always return 200 quickly — Meta requires fast response
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[WA_WEBHOOK_ERROR]', error);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: 'error' });
  }
}

// ─── Helper Functions ───

async function findWorkspaceByPhoneNumberId(phoneNumberId: string) {
  if (!phoneNumberId) return null;

  const workspaces = await db.workspace.findMany({
    select: { id: true, integrations: true },
  });

  for (const ws of workspaces) {
    const integrations = ws.integrations as Record<string, any> || {};
    const whatsappConfig = integrations.whatsapp as Record<string, any> | undefined;
    if (whatsappConfig?.mode === 'meta' && whatsappConfig.phoneNumberId === phoneNumberId) {
      return ws;
    }
  }

  return null;
}

async function findOrCreateContact(
  workspaceId: string,
  phone: string,
  profileName?: string
) {
  // Try to find existing contact by WhatsApp ID
  const existing = await db.contact.findFirst({
    where: {
      workspaceId,
      whatsappId: phone,
    },
  });

  if (existing) {
    // Update name if we have a profile name and current name is generic
    if (profileName && (existing.nombre === 'Contacto WhatsApp' || existing.nombre.startsWith('Contacto '))) {
      await db.contact.update({
        where: { id: existing.id },
        data: { nombre: profileName },
      });
    }
    return existing;
  }

  // Create new contact
  const contact = await db.contact.create({
    data: {
      workspaceId,
      nombre: profileName || 'Contacto WhatsApp',
      whatsappId: phone,
      telefono: phone,
      fuente: 'whatsapp',
      etapa: 'nuevo',
    },
  });

  // Create timeline event
  await db.timelineEvent.create({
    data: {
      workspaceId,
      contactId: contact.id,
      tipo: 'mensaje',
      descripcion: `Nuevo contacto por WhatsApp${profileName ? ` (${profileName})` : ''}`,
      metadata: {
        source: 'meta_whatsapp_webhook',
        phone,
        profileName,
      },
    },
  });

  return contact;
}

async function findOrCreateConversation(
  workspaceId: string,
  contactId: string
) {
  // Try to find existing open conversation
  const existing = await db.conversation.findFirst({
    where: {
      workspaceId,
      contactId,
      channel: 'whatsapp',
      status: 'open',
    },
  });

  if (existing) return existing;

  // Create new conversation
  return db.conversation.create({
    data: {
      workspaceId,
      contactId,
      channel: 'whatsapp',
      provider: 'meta',
      status: 'open',
      unreadCount: 0,
      lastMessageAt: new Date(),
      tags: [],
    },
  });
}
