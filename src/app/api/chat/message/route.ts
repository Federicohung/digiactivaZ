import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// POST /api/chat/message — PUBLIC endpoint (no auth required for web visitors)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId, workspaceSlug } = body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'El mensaje es requerido' },
        { status: 400 }
      );
    }

    const slug = workspaceSlug || 'demo';

    // Find workspace by slug
    const workspace = await db.workspace.findUnique({
      where: { slug },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    // Parse agent prompts for web_chat (Json field returns native JS object)
    const agentPrompts = (workspace.agentPrompts as Record<string, unknown>) || {};

    const webChatPrompt = agentPrompts.web_chat as Record<string, unknown> | undefined;
    const systemPrompt =
      (webChatPrompt?.system as string) ||
      `Eres un agente de ventas virtual amable y profesional para el negocio "${workspace.name}".
Tu objetivo es:
1. Saludar al visitante y entender qué necesita
2. Hacer preguntas calificativas para conocer: nombre, email, teléfono y qué servicio/buscan
3. Extraer datos del lead de la conversación de forma natural
4. Ser útil, empático y orientado a resolver las dudas del visitante
5. Si el visitante parece interesado, sugerir agendar una llamada o dejar sus datos

IMPORTANTE: No inventes información. Solo usa lo que el visitante te dice. Responde en español.`;

    // Load or create session
    let session;
    let sessionMessages: Array<{ role: string; content: string }> = [];

    if (sessionId) {
      session = await db.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (session && session.workspaceId === workspace.id) {
        sessionMessages = (session.messages as Array<{ role: string; content: string }>) || [];
      } else {
        session = null;
      }
    }

    if (!session) {
      // Create a placeholder contact for this new chat session
      const placeholderContact = await db.contact.create({
        data: {
          workspaceId: workspace.id,
          nombre: 'Visitante Web',
          fuente: 'web_chat',
          etapa: 'nuevo',
        },
      });

      session = await db.chatSession.create({
        data: {
          workspaceId: workspace.id,
          contactId: placeholderContact.id,
          source: 'web_chat',
          status: 'active',
          messages: [],
          leadData: {},
        },
      });

      // Create a Conversation for inbox
      await db.conversation.create({
        data: {
          workspaceId: workspace.id,
          contactId: placeholderContact.id,
          channel: 'web_chat',
          provider: 'native',
          status: 'open',
          unreadCount: 0,
          lastMessageAt: new Date(),
          tags: [],
        },
      });
    }

    const contactId = session.contactId!;

    // Append user message
    sessionMessages.push({ role: 'user', content: message.trim() });

    // Call AI
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...sessionMessages.slice(-20), // Keep last 20 messages for context window
      ],
    });

    const reply =
      completion?.choices?.[0]?.message?.content ||
      completion?.content ||
      (typeof completion === 'string' ? completion : '');

    if (!reply) {
      return NextResponse.json(
        { error: 'Error al generar respuesta' },
        { status: 500 }
      );
    }

    // Append AI response
    sessionMessages.push({ role: 'assistant', content: String(reply) });

    // Update session with new messages
    await db.chatSession.update({
      where: { id: session.id },
      data: {
        messages: sessionMessages,
      },
    });

    // Create inbound Message record
    await db.message.create({
      data: {
        workspaceId: workspace.id,
        contactId,
        channel: 'web_chat',
        direction: 'inbound',
        content: message.trim(),
        sessionId: session.id,
        metadata: { sessionId: session.id },
      },
    });

    // Create outbound Message record
    await db.message.create({
      data: {
        workspaceId: workspace.id,
        contactId,
        channel: 'web_chat',
        direction: 'outbound',
        content: String(reply),
        sessionId: session.id,
        metadata: { sessionId: session.id },
      },
    });

    // Update conversation unread count and last message
    await db.conversation.updateMany({
      where: {
        contactId,
        workspaceId: workspace.id,
        channel: 'web_chat',
      },
      data: {
        lastMessagePreview: message.trim().substring(0, 100),
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });

    // Every 2 visitor messages, try to extract lead data and upsert Contact
    const visitorMessageCount = sessionMessages.filter(
      (m) => m.role === 'user'
    ).length;

    if (visitorMessageCount >= 2 && visitorMessageCount % 2 === 0) {
      try {
        const extractZai = await ZAI.create();
        const extractCompletion = await extractZai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `Eres un extractor de datos de leads. Analiza la conversación y extrae la siguiente información del visitante en formato JSON:
{
  "nombre": "string o null",
  "email": "string o null",
  "telefono": "string o null",
  "empresa": "string o null",
  "necesidad": "string o null"
}

Solo incluye campos que puedas identificar claramente en la conversación. Si no puedes identificar un campo, pon null.
Responde SOLO con el JSON, sin texto adicional.`,
            },
            {
              role: 'user',
              content: sessionMessages
                .map((m) => `${m.role === 'user' ? 'Visitante' : 'Agente'}: ${m.content}`)
                .join('\n'),
            },
          ],
        });

        const extractResult =
          extractCompletion?.choices?.[0]?.message?.content ||
          extractCompletion?.content ||
          '';

        // Parse extracted lead data
        const jsonMatch = String(extractResult).match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extracted = JSON.parse(jsonMatch[0]);
          const currentLeadData = (session.leadData as Record<string, unknown>) || {};
          const mergedLeadData = { ...currentLeadData, ...extracted };

          // Update session lead data
          await db.chatSession.update({
            where: { id: session.id },
            data: {
              leadData: mergedLeadData,
            },
          });

          // Update the existing contact with extracted data
          const updateData: Record<string, unknown> = {};
          if (extracted.nombre && extracted.nombre !== 'null')
            updateData.nombre = extracted.nombre;
          if (extracted.email && extracted.email !== 'null')
            updateData.email = extracted.email;
          if (extracted.telefono && extracted.telefono !== 'null')
            updateData.telefono = extracted.telefono;
          if (extracted.empresa && extracted.empresa !== 'null')
            updateData.empresa = extracted.empresa;

          if (Object.keys(updateData).length > 0) {
            await db.contact.update({
              where: { id: contactId },
              data: updateData,
            });

            // Create timeline event for contact update
            await db.timelineEvent.create({
              data: {
                workspaceId: workspace.id,
                contactId,
                tipo: 'nota',
                descripcion: `Datos actualizados desde chat: ${Object.keys(updateData).join(', ')}`,
                metadata: {
                  source: 'web_chat',
                  sessionId: session.id,
                  extractedFields: Object.keys(updateData),
                },
              },
            });
          }
        }
      } catch (extractError) {
        console.error('[CHAT_LEAD_EXTRACT_ERROR]', extractError);
        // Don't fail the request if lead extraction fails
      }
    }

    return NextResponse.json({
      reply: String(reply),
      sessionId: session.id,
    });
  } catch (error) {
    console.error('[CHAT_MESSAGE_ERROR]', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
