import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getZAI } from '@/lib/zai';

// In-memory session store for demo/fallback mode (no DB)
const demoSessions = new Map<string, Array<{ role: string; content: string }>>();

const DEFAULT_SYSTEM_PROMPT = `Eres un agente de ventas virtual amable y profesional para DigiActiva.
Tu objetivo es:
1. Saludar al visitante y entender qué necesita
2. Hacer preguntas calificativas para conocer: nombre, email, teléfono y qué servicio buscan
3. Extraer datos del lead de la conversación de forma natural
4. Ser útil, empático y orientado a resolver las dudas del visitante
5. Si el visitante parece interesado, sugerir agendar una llamada o dejar sus datos
6. Explicar brevemente qué ofrece DigiActiva: agentes IA para atención automática, WhatsApp Business conectado, CRM comercial, todo en un solo lugar

IMPORTANTE: No inventes información. Solo usa lo que el visitante te dice. Responde en español.
Responde de forma concisa (máximo 2-3 párrafos cortos).`;

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

    // Try to find workspace by slug
    let workspace: Awaited<ReturnType<typeof db.workspace.findUnique>> = null;
    try {
      workspace = await db.workspace.findUnique({
        where: { slug },
      });
    } catch (dbError) {
      console.warn('[CHAT_MESSAGE] DB lookup failed, using fallback mode:', (dbError as Error).message);
    }

    // ─── Fallback mode: no workspace found or DB unavailable ───
    if (!workspace) {
      return handleFallbackChat(message.trim(), sessionId);
    }

    // ─── Full mode: workspace exists, save to DB ───
    return handleFullChat(message.trim(), sessionId, workspace);
  } catch (error) {
    console.error('[CHAT_MESSAGE_ERROR]', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ─── Fallback: AI-only chat without database ───
async function handleFallbackChat(
  message: string,
  sessionId: string | null
): Promise<NextResponse> {
  // Get or create session messages in memory
  let sessionMessages: Array<{ role: string; content: string }> = [];
  const effectiveSessionId = sessionId || `demo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  if (sessionId && demoSessions.has(sessionId)) {
    sessionMessages = demoSessions.get(sessionId)!;
  }

  // Append user message
  sessionMessages.push({ role: 'user', content: message });

  // Call AI
  let reply = '';
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
        ...sessionMessages.slice(-20),
      ],
    });

    reply =
      completion?.choices?.[0]?.message?.content ||
      completion?.content ||
      (typeof completion === 'string' ? completion : '');
  } catch (aiError) {
    console.error('[CHAT_FALLBACK_AI_ERROR]', aiError);
    return NextResponse.json(
      { error: 'Error al generar respuesta. Intenta de nuevo.' },
      { status: 500 }
    );
  }

  if (!reply) {
    return NextResponse.json(
      { error: 'Error al generar respuesta' },
      { status: 500 }
    );
  }

  // Save session in memory
  sessionMessages.push({ role: 'assistant', content: String(reply) });
  demoSessions.set(effectiveSessionId, sessionMessages);

  // Clean up old sessions (keep max 100)
  if (demoSessions.size > 100) {
    const oldestKey = demoSessions.keys().next().value;
    if (oldestKey) demoSessions.delete(oldestKey);
  }

  return NextResponse.json({
    reply: String(reply),
    sessionId: effectiveSessionId,
  });
}

// ─── Full mode: workspace exists, save everything to DB ───
async function handleFullChat(
  message: string,
  sessionId: string | null,
  workspace: NonNullable<Awaited<ReturnType<typeof db.workspace.findUnique>>>
): Promise<NextResponse> {
  // Parse agent prompts
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
    try {
      session = await db.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (session && session.workspaceId === workspace.id) {
        sessionMessages = (session.messages as Array<{ role: string; content: string }>) || [];
      } else {
        session = null;
      }
    } catch (e) {
      session = null;
    }
  }

  if (!session) {
    try {
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
    } catch (dbError) {
      console.error('[CHAT_FULL_DB_CREATE_ERROR]', dbError);
      // Fall back to in-memory session
      return handleFallbackChat(message, sessionId);
    }
  }

  const contactId = session.contactId!;

  // Append user message
  sessionMessages.push({ role: 'user', content: message });

  // Call AI — check for custom OpenAI key first
  const workspaceIntegrations = (workspace.integrations as Record<string, any>) || {};
  const customOpenAiKey = workspaceIntegrations?.openai?.apiKey as string | undefined;
  let reply = '';

  if (customOpenAiKey && customOpenAiKey.startsWith('sk-')) {
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: customOpenAiKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...sessionMessages.slice(-20),
        ],
      });
      reply = completion?.choices?.[0]?.message?.content || '';
    } catch (openaiError) {
      console.error('[CHAT_OPENAI_ERROR]', openaiError);
      // Fall through to z-ai
    }
  }

  if (!reply) {
    try {
      const zai = await getZAI();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          ...sessionMessages.slice(-20),
        ],
      });

      reply =
        completion?.choices?.[0]?.message?.content ||
        completion?.content ||
        (typeof completion === 'string' ? completion : '');
    } catch (aiError) {
      console.error('[CHAT_ZAI_ERROR]', aiError);
      return NextResponse.json(
        { error: 'Error al generar respuesta. Intenta de nuevo.' },
        { status: 500 }
      );
    }
  }

  if (!reply) {
    return NextResponse.json(
      { error: 'Error al generar respuesta' },
      { status: 500 }
    );
  }

  // Append AI response
  sessionMessages.push({ role: 'assistant', content: String(reply) });

  // Update session + save messages (best effort, don't fail if DB is unavailable)
  try {
    await db.chatSession.update({
      where: { id: session.id },
      data: { messages: sessionMessages },
    });

    await db.message.create({
      data: {
        workspaceId: workspace.id,
        contactId,
        channel: 'web_chat',
        direction: 'inbound',
        content: message,
        sessionId: session.id,
        metadata: { sessionId: session.id },
      },
    });

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

    await db.conversation.updateMany({
      where: { contactId, workspaceId: workspace.id, channel: 'web_chat' },
      data: {
        lastMessagePreview: message.substring(0, 100),
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });
  } catch (dbError) {
    console.error('[CHAT_FULL_DB_SAVE_ERROR]', dbError);
    // Still return the reply even if DB save fails
  }

  // Lead extraction every 2 visitor messages (best effort)
  const visitorMessageCount = sessionMessages.filter(m => m.role === 'user').length;
  if (visitorMessageCount >= 2 && visitorMessageCount % 2 === 0) {
    try {
      const extractZai = await getZAI();
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
              .map(m => `${m.role === 'user' ? 'Visitante' : 'Agente'}: ${m.content}`)
              .join('\n'),
          },
        ],
      });

      const extractResult =
        extractCompletion?.choices?.[0]?.message?.content ||
        extractCompletion?.content || '';

      const jsonMatch = String(extractResult).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        const currentLeadData = (session.leadData as Record<string, unknown>) || {};
        const mergedLeadData = { ...currentLeadData, ...extracted };

        await db.chatSession.update({
          where: { id: session.id },
          data: { leadData: mergedLeadData },
        });

        const updateData: Record<string, unknown> = {};
        if (extracted.nombre && extracted.nombre !== 'null') updateData.nombre = extracted.nombre;
        if (extracted.email && extracted.email !== 'null') updateData.email = extracted.email;
        if (extracted.telefono && extracted.telefono !== 'null') updateData.telefono = extracted.telefono;
        if (extracted.empresa && extracted.empresa !== 'null') updateData.empresa = extracted.empresa;

        if (Object.keys(updateData).length > 0) {
          await db.contact.update({
            where: { id: contactId },
            data: updateData,
          });

          await db.timelineEvent.create({
            data: {
              workspaceId: workspace.id,
              contactId,
              tipo: 'nota',
              descripcion: `Datos actualizados desde chat: ${Object.keys(updateData).join(', ')}`,
              metadata: { source: 'web_chat', sessionId: session.id, extractedFields: Object.keys(updateData) },
            },
          });
        }
      }
    } catch (extractError) {
      console.error('[CHAT_LEAD_EXTRACT_ERROR]', extractError);
    }
  }

  return NextResponse.json({
    reply: String(reply),
    sessionId: session.id,
  });
}
