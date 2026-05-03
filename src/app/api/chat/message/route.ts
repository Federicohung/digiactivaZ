import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

// Fallback responses when AI is unavailable
const FALLBACK_RESPONSES = [
  '¡Gracias por tu mensaje! En este momento estamos procesando tu consulta. Un agente se pondrá en contacto contigo pronto. ¿Podrías dejarnos tu nombre y email para seguimiento?',
  'Entiendo tu consulta. Para poder ayudarte mejor, ¿podrías contarme tu nombre y qué servicio te interesa? También puedes escribirnos a nuestro WhatsApp para una atención más rápida.',
  '¡Hola! Gracias por escribirnos. Para darte la mejor atención, cuéntame: ¿cuál es tu negocio y qué solución estás buscando? Te recomendamos agendar una llamada gratuita con nuestro equipo.',
];

function getFallbackResponse(sessionId: string | null): string {
  // Use sessionId to get consistent-ish response for same session
  const idx = sessionId
    ? sessionId.charCodeAt(sessionId.length - 1) % FALLBACK_RESPONSES.length
    : Math.floor(Math.random() * FALLBACK_RESPONSES.length);
  return FALLBACK_RESPONSES[idx];
}

// Try to call AI - returns null if unavailable
async function tryAICompletion(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  customOpenAiKey?: string
): Promise<string | null> {
  // Strategy 1: Try custom OpenAI key first
  if (customOpenAiKey && customOpenAiKey.startsWith('sk-')) {
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: customOpenAiKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-20),
        ],
      });
      const reply = completion?.choices?.[0]?.message?.content;
      if (reply) return reply;
    } catch (openaiError) {
      console.warn('[CHAT] Custom OpenAI key failed, trying ZAI:', (openaiError as Error).message);
    }
  }

  // Strategy 2: Try ZAI SDK
  try {
    const { getZAI } = await import('@/lib/zai');
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-20),
      ],
    });

    const reply =
      completion?.choices?.[0]?.message?.content ||
      completion?.content ||
      (typeof completion === 'string' ? completion : '');
    if (reply) return String(reply);
  } catch (zaiError) {
    console.warn('[CHAT] ZAI SDK failed:', (zaiError as Error).message);
  }

  // Strategy 3: Try direct OpenAI with env key
  try {
    const envKey = process.env.OPENAI_API_KEY;
    if (envKey && envKey.startsWith('sk-')) {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: envKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-20),
        ],
      });
      const reply = completion?.choices?.[0]?.message?.content;
      if (reply) return reply;
    }
  } catch (envOpenaiError) {
    console.warn('[CHAT] Env OpenAI key failed:', (envOpenaiError as Error).message);
  }

  return null;
}

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
    let workspace: Awaited<ReturnType<typeof db.workspace.findUnique>> | null = null;
    try {
      workspace = await db.workspace.findUnique({
        where: { slug },
      });
    } catch (dbError) {
      console.warn('[CHAT] DB lookup failed, using fallback mode:', (dbError as Error).message);
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

  // Call AI with all strategies
  let reply = await tryAICompletion(DEFAULT_SYSTEM_PROMPT, sessionMessages);

  // If all AI strategies fail, use static fallback
  if (!reply) {
    console.warn('[CHAT] All AI strategies failed, using static fallback');
    reply = getFallbackResponse(effectiveSessionId);
  }

  // Save session in memory
  sessionMessages.push({ role: 'assistant', content: reply });
  demoSessions.set(effectiveSessionId, sessionMessages);

  // Clean up old sessions (keep max 100)
  if (demoSessions.size > 100) {
    const oldestKey = demoSessions.keys().next().value;
    if (oldestKey) demoSessions.delete(oldestKey);
  }

  return NextResponse.json({
    reply,
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
      console.error('[CHAT] DB create error, falling back:', (dbError as Error).message);
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

  let reply = await tryAICompletion(systemPrompt, sessionMessages, customOpenAiKey);

  // If all AI strategies fail, use static fallback
  if (!reply) {
    console.warn('[CHAT] All AI strategies failed in full mode, using static fallback');
    reply = getFallbackResponse(sessionId);
  }

  // Append AI response
  sessionMessages.push({ role: 'assistant', content: reply });

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
        content: reply,
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
    console.error('[CHAT] DB save error (non-critical):', (dbError as Error).message);
    // Still return the reply even if DB save fails
  }

  // Lead extraction every 2 visitor messages (best effort)
  const visitorMessageCount = sessionMessages.filter(m => m.role === 'user').length;
  if (visitorMessageCount >= 2 && visitorMessageCount % 2 === 0) {
    // Run extraction asynchronously (don't block the response)
    extractLeadData(workspace.id, session.id, contactId, sessionMessages).catch(() => {});
  }

  return NextResponse.json({
    reply,
    sessionId: session.id,
  });
}

// Background lead extraction
async function extractLeadData(
  workspaceId: string,
  sessionId: string,
  contactId: string,
  sessionMessages: Array<{ role: string; content: string }>
): Promise<void> {
  try {
    const { getZAI } = await import('@/lib/zai');
    const zai = await getZAI();
    const extractCompletion = await zai.chat.completions.create({
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
      const session = await db.chatSession.findUnique({ where: { id: sessionId } });
      const currentLeadData = (session?.leadData as Record<string, unknown>) || {};
      const mergedLeadData = { ...currentLeadData, ...extracted };

      await db.chatSession.update({
        where: { id: sessionId },
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
            workspaceId,
            contactId,
            tipo: 'nota',
            descripcion: `Datos actualizados desde chat: ${Object.keys(updateData).join(', ')}`,
            metadata: { source: 'web_chat', sessionId, extractedFields: Object.keys(updateData) },
          },
        });
      }
    }
  } catch (extractError) {
    console.warn('[CHAT] Lead extraction failed (non-critical):', (extractError as Error).message);
  }
}
