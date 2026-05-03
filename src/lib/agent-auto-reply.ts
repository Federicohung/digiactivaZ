// Agent Auto-Reply Module for DigiActiva
// Handles automatic AI responses for ALL channels: Web Chat, Messenger, Instagram, WhatsApp
//
// This module is triggered by:
// 1. Webhook route (real-time incoming messages from Composio triggers)
// 2. Inbox sync/polling route (periodic message sync)
// 3. Chat message route (web chat visitors)
//
// It checks:
// - If the agent is globally enabled for the workspace
// - If the agent is not paused for the specific conversation
// - If the workspace has a custom prompt configured
// - Then generates a reply via AI and sends it back through the appropriate channel

import { db } from '@/lib/db';
import { sendComposioMessage, getConnectedAccountId } from '@/lib/composio';
import { sendWhatsAppMessage } from '@/lib/meta-whatsapp';

// ─── Types ───

export type AutoReplyChannel = 'web_chat' | 'messenger' | 'instagram' | 'whatsapp';

export interface AutoReplyParams {
  workspaceId: string;
  contactId: string;
  conversationId: string;
  channel: AutoReplyChannel;
  incomingMessage: string;
  senderId?: string;         // Composio sender ID for FB/IG/WA
  senderName?: string;       // Sender display name
  connectedAccountId?: string; // Composio connected account ID
  composioUserId?: string;   // Composio user ID format: ws_{wsId}_user_{userId}
}

export interface AutoReplyResult {
  replied: boolean;
  reply?: string;
  error?: string;
  skippedReason?: string;
}

// ─── Default System Prompts ───

const DEFAULT_PROMPTS: Record<AutoReplyChannel, string> = {
  web_chat: `Eres un agente de ventas virtual amable y profesional.
Tu objetivo es:
1. Saludar al visitante y entender qué necesita
2. Hacer preguntas calificativas para conocer: nombre, email, teléfono y qué servicio buscan
3. Extraer datos del lead de la conversación de forma natural
4. Ser útil, empático y orientado a resolver las dudas del visitante
5. Si el visitante parece interesado, sugerir agendar una llamada o dejar sus datos

IMPORTANTE: No inventes información. Solo usa lo que el visitante te dice. Responde en español.
Responde de forma concisa (máximo 2-3 párrafos cortos).`,

  messenger: `Eres un agente de atención al cliente por Facebook Messenger.
Tu objetivo es:
1. Responder rápidamente al mensaje del usuario de forma amable
2. Hacer preguntas para entender qué necesita
3. Calificar al lead obteniendo: nombre, email, teléfono y necesidad
4. Si el usuario está interesado, sugerir agendar una llamada
5. Si no puedes resolver su consulta, indicar que un agente humano lo contactará pronto

IMPORTANTE:
- Responde en español
- Sé conciso (máximo 2-3 mensajes cortos)
- No inventes información
- Usa un tono cercano pero profesional
- No uses emojis excesivos`,

  instagram: `Eres un agente de atención al cliente por Instagram DM.
Tu objetivo es:
1. Responder al mensaje del usuario de forma amigable y cercana
2. Entender qué producto o servicio le interesa
3. Calificar al lead obteniendo: nombre, email, necesidad principal
4. Sugerir agendar una llamada o dejar sus datos de contacto
5. Si no puedes ayudar, indicar que un agente humano lo contactará

IMPORTANTE:
- Responde en español
- Sé conciso (máximo 2-3 mensajes cortos)
- Tono cercano y moderno
- Puedes usar algunos emojis (máximo 1-2 por mensaje)
- No inventes precios ni disponibilidad`,

  whatsapp: `Eres un agente de atención al cliente por WhatsApp.
Tu objetivo es:
1. Responder al mensaje del usuario de forma rápida y clara
2. Hacer preguntas para entender su necesidad
3. Calificar al lead obteniendo: nombre, email, teléfono, empresa y necesidad
4. Si el usuario está interesado, sugerir agendar una llamada
5. Si no puedes resolver, indicar que un agente humano lo contactará

IMPORTANTE:
- Responde en español
- Sé conciso (máximo 2-3 mensajes cortos)
- Tono profesional pero cercano
- No inventes información
- Usa viñetas o listas cortas si es útil para la respuesta`,
};

// ─── Main Auto-Reply Function ───

export async function handleAutoReply(params: AutoReplyParams): Promise<AutoReplyResult> {
  const { workspaceId, contactId, conversationId, channel, incomingMessage } = params;

  try {
    // 1. Check if agent is globally enabled for this workspace
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { agentPrompts: true, name: true, integrations: true },
    });

    if (!workspace) {
      return { replied: false, skippedReason: 'Workspace not found' };
    }

    const agentPrompts = (workspace.agentPrompts as Record<string, Record<string, string>>) || {};
    const globalConfig = agentPrompts.global || {};
    const isGloballyEnabled = globalConfig.enabled === 'true';

    if (!isGloballyEnabled) {
      return { replied: false, skippedReason: 'Agent is not enabled for this workspace' };
    }

    // 2. Check if agent is paused for this specific conversation
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { tags: true },
    });

    if (conversation) {
      const tags = (conversation.tags as string[]) || [];
      if (tags.includes('agent_paused')) {
        return { replied: false, skippedReason: 'Agent is paused for this conversation' };
      }
    }

    // 3. Get conversation history for context
    const recentMessages = await db.message.findMany({
      where: {
        conversationId,
        status: 'delivered',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Reverse to chronological order
    const historyMessages = recentMessages.reverse();

    // Build conversation context for AI
    const contextMessages = historyMessages.map(msg => ({
      role: (msg.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add the current incoming message
    contextMessages.push({ role: 'user', content: incomingMessage });

    // Keep only last 20 messages for context window
    const trimmedContext = contextMessages.slice(-20);

    // 4. Determine the system prompt
    const channelConfig = agentPrompts[channel] || {};
    const systemPrompt =
      channelConfig.estructurado ||
      channelConfig.system ||
      channelConfig.prompt ||
      DEFAULT_PROMPTS[channel];

    // Add workspace name context
    const fullSystemPrompt = systemPrompt.replace(/\{nombre_negocio\}/g, workspace.name);

    // 5. Call AI to generate reply
    let reply = '';

    // Check if workspace has a custom OpenAI API key
    const integrations = (workspace.integrations as Record<string, any>) || {};
    const openaiKey = integrations?.openai?.apiKey as string | undefined;

    if (openaiKey && openaiKey.startsWith('sk-')) {
      // Use OpenAI SDK directly
      try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: openaiKey });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: fullSystemPrompt },
            ...trimmedContext,
          ],
          temperature: 0.7,
          max_tokens: 500,
        });
        reply = completion?.choices?.[0]?.message?.content || '';
      } catch (openaiError) {
        console.error('[AUTO_REPLY_OPENAI_ERROR]', openaiError);
        // Fall through to z-ai
      }
    }

    if (!reply) {
      // Fall back to z-ai-web-dev-sdk
      const zai = await import('z-ai-web-dev-sdk').then(m => m.default);
      const ai = await zai.create();

      const completion = await ai.chat.completions.create({
        messages: [
          { role: 'system', content: fullSystemPrompt },
          ...trimmedContext,
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      reply =
        completion?.choices?.[0]?.message?.content ||
        completion?.content ||
        (typeof completion === 'string' ? completion : '');
    }

    if (!reply) {
      return { replied: false, error: 'AI returned empty response' };
    }

    const replyText = String(reply);

    // 6. Send the reply through the appropriate channel
    if (channel === 'web_chat') {
      // For web chat, just save the message (the chat route handles this separately)
      await db.message.create({
        data: {
          workspaceId,
          contactId,
          channel: 'web_chat',
          direction: 'outbound',
          content: replyText,
          conversationId,
          metadata: {
            source: 'agent_auto_reply',
            channel,
          },
          status: 'delivered',
        },
      });
    } else {
      // For Messenger, Instagram, WhatsApp: send via appropriate channel
      try {
        const contact = await db.contact.findUnique({
          where: { id: contactId },
          select: { messengerId: true, instagramId: true, whatsappId: true, nombre: true },
        });

        if (!contact) {
          return { replied: false, error: 'Contact not found for sending reply' };
        }

        // Get the recipient ID based on channel
        let recipientId = '';
        if (channel === 'messenger') recipientId = contact.messengerId || params.senderId || '';
        else if (channel === 'instagram') recipientId = contact.instagramId || params.senderId || '';
        else if (channel === 'whatsapp') recipientId = contact.whatsappId || params.senderId || '';

        if (!recipientId) {
          return { replied: false, error: `No recipient ID found for ${channel}` };
        }

        // Check if this is a WhatsApp message and workspace has direct Meta integration
        if (channel === 'whatsapp') {
          const waConfig = integrations?.whatsapp as Record<string, any> | undefined;
          if (waConfig?.mode === 'meta' && waConfig.phoneNumberId && waConfig.accessToken) {
            // Use direct Meta WhatsApp API
            const result = await sendWhatsAppMessage(
              waConfig.phoneNumberId,
              waConfig.accessToken,
              recipientId,
              replyText
            );

            // Save the outbound message
            await db.message.create({
              data: {
                workspaceId,
                contactId,
                channel: 'whatsapp',
                direction: 'outbound',
                content: replyText,
                conversationId,
                metadata: {
                  source: 'agent_auto_reply',
                  channel: 'whatsapp',
                  mode: 'meta',
                  recipientId,
                  whatsappMessageId: result.messageId,
                },
                status: 'delivered',
              },
            });

            // Skip the Composio path for WhatsApp when using Meta direct
            // Jump to step 7 (update conversation)
            await db.conversation.update({
              where: { id: conversationId },
              data: {
                lastMessagePreview: replyText.substring(0, 100),
                lastMessageAt: new Date(),
              },
            });

            await db.timelineEvent.create({
              data: {
                workspaceId,
                contactId,
                tipo: 'mensaje',
                descripcion: `Respuesta automática (whatsapp/meta): ${replyText.substring(0, 80)}`,
                metadata: {
                  channel: 'whatsapp',
                  mode: 'meta',
                  source: 'agent_auto_reply',
                  conversationId,
                },
              },
            });

            await db.aiLog.create({
              data: {
                workspaceId,
                tipo: 'auto_reply',
                contactId,
                model: openaiKey ? 'openai' : 'z-ai',
                tokens: replyText.length,
                contenido: replyText.substring(0, 500),
              },
            });

            console.log(`[AUTO_REPLY] Sent reply via WhatsApp (Meta) for conversation ${conversationId}`);
            return { replied: true, reply: replyText };
          }
        }

        // Fall through to Composio for non-Meta WhatsApp, Messenger, Instagram
        // Get workspace members to find a userId for Composio
        const workspaceMember = await db.workspaceMember.findFirst({
          where: { workspaceId },
          select: { userId: true },
        });

        if (!workspaceMember) {
          return { replied: false, error: 'No workspace member found' };
        }

        const composioUserId = params.composioUserId ||
          `ws_${workspaceId}_user_${workspaceMember.userId}`;

        // Send via Composio
        await sendComposioMessage(
          workspaceId,
          workspaceMember.userId,
          channel as 'messenger' | 'instagram' | 'whatsapp',
          recipientId,
          replyText
        );

        // Save the outbound message
        await db.message.create({
          data: {
            workspaceId,
            contactId,
            channel,
            direction: 'outbound',
            content: replyText,
            conversationId,
            metadata: {
              source: 'agent_auto_reply',
              channel,
              recipientId,
              composioUserId,
            },
            status: 'delivered',
          },
        });
      } catch (sendError) {
        console.error('[AUTO_REPLY_SEND_ERROR]', sendError);
        // Still save the message even if send fails, so we don't lose the AI response
        await db.message.create({
          data: {
            workspaceId,
            contactId,
            channel,
            direction: 'outbound',
            content: replyText,
            conversationId,
            metadata: {
              source: 'agent_auto_reply',
              channel,
              sendError: String(sendError),
            },
            status: 'failed',
          },
        });
        return { replied: false, error: `Failed to send reply: ${String(sendError)}` };
      }
    }

    // 7. Update conversation
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessagePreview: replyText.substring(0, 100),
        lastMessageAt: new Date(),
      },
    });

    // 8. Create timeline event
    await db.timelineEvent.create({
      data: {
        workspaceId,
        contactId,
        tipo: 'mensaje',
        descripcion: `Respuesta automática (${channel}): ${replyText.substring(0, 80)}`,
        metadata: {
          channel,
          source: 'agent_auto_reply',
          conversationId,
        },
      },
    });

    // 9. Log AI usage
    await db.aiLog.create({
      data: {
        workspaceId,
        tipo: 'auto_reply',
        contactId,
        model: openaiKey ? 'openai' : 'z-ai',
        tokens: replyText.length, // Approximate
        contenido: replyText.substring(0, 500),
      },
    });

    console.log(`[AUTO_REPLY] Sent reply via ${channel} for conversation ${conversationId}`);

    return { replied: true, reply: replyText };
  } catch (error) {
    console.error('[AUTO_REPLY_ERROR]', error);
    return { replied: false, error: String(error) };
  }
}

// ─── Check if auto-reply should be triggered ───

export function shouldTriggerAutoReply(channel: string): boolean {
  return ['web_chat', 'messenger', 'instagram', 'whatsapp'].includes(channel);
}
