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

const VALID_CHANNELS = ['web_chat', 'whatsapp', 'voice'] as const;
type AgentChannel = (typeof VALID_CHANNELS)[number];

const DEFAULT_PROMPTS: Record<AgentChannel, Record<string, string>> = {
  web_chat: {
    greeting: '¡Hola! 👋 Soy el asistente virtual. ¿En qué puedo ayudarte hoy?',
    qualification: 'Para poder ayudarte mejor, ¿podrías contarme un poco sobre tu negocio y qué estás buscando?',
    scheduling: '¿Te gustaría agendar una llamada con nuestro equipo? Podemos coordinar un horario que te funcione.',
    fallback: 'No estoy seguro de entender. ¿Podrías reformular tu pregunta?',
    closing: '¡Gracias por tu interés! Te estaremos contactando pronto.',
  },
  whatsapp: {
    greeting: '¡Hola! 👋 Gracias por escribirnos. ¿En qué podemos ayudarte?',
    qualification: 'Para darte la mejor atención, cuéntame: ¿cuál es tu negocio y qué solución estás buscando?',
    scheduling: '¿Te gustaría agendar una llamada? Podemos coordinar un horario que te venga bien.',
    fallback: 'No entendí bien tu mensaje. ¿Podrías repetirlo de otra forma?',
    closing: '¡Gracias por tu interés! Te contactaremos pronto. 🙌',
  },
  voice: {
    greeting: 'Bienvenido. Soy el asistente virtual. ¿En qué puedo ayudarle hoy?',
    qualification: 'Para brindarle la mejor atención, ¿podría decirme sobre su negocio y qué solución busca?',
    scheduling: '¿Le gustaría agendar una llamada con nuestro equipo?',
    fallback: 'Disculpe, no entendí. ¿Podría repetirlo?',
    closing: 'Gracias por su interés. Le contactaremos pronto.',
  },
};

// GET /api/crm/agent-config — Get agent config for active workspace
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const workspace = await db.workspace.findUnique({
      where: { id: auth.activeWorkspaceId },
      select: { agentPrompts: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    const agentPrompts = (workspace.agentPrompts as Record<string, Record<string, string>>) || {};

    // Fill in defaults for missing channels
    for (const channel of VALID_CHANNELS) {
      if (!agentPrompts[channel]) {
        agentPrompts[channel] = { ...DEFAULT_PROMPTS[channel] };
      } else {
        // Fill in any missing prompts with defaults
        for (const [key, value] of Object.entries(DEFAULT_PROMPTS[channel])) {
          if (!agentPrompts[channel][key]) {
            agentPrompts[channel][key] = value;
          }
        }
      }
    }

    return NextResponse.json({
      workspaceId: auth.activeWorkspaceId,
      channels: VALID_CHANNELS,
      agentPrompts,
    });
  } catch (error) {
    console.error('Error fetching agent config:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración del agente' },
      { status: 500 }
    );
  }
}

// PUT /api/crm/agent-config — Update agent prompts
export async function PUT(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { channel, prompts } = body;

    if (!channel || !VALID_CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: `Canal inválido. Valores permitidos: ${VALID_CHANNELS.join(', ')}` },
        { status: 400 }
      );
    }

    if (!prompts || typeof prompts !== 'object') {
      return NextResponse.json(
        { error: 'prompts debe ser un objeto con las configuraciones del agente' },
        { status: 400 }
      );
    }

    // Get current agent prompts
    const workspace = await db.workspace.findUnique({
      where: { id: auth.activeWorkspaceId },
      select: { agentPrompts: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    const agentPrompts = (workspace.agentPrompts as Record<string, Record<string, string>>) || {};

    // Ensure channel exists with defaults
    if (!agentPrompts[channel]) {
      agentPrompts[channel] = { ...DEFAULT_PROMPTS[channel] };
    }

    // Merge provided prompts
    for (const [key, value] of Object.entries(prompts)) {
      if (typeof value === 'string') {
        agentPrompts[channel][key] = value;
      }
    }

    // Save
    await db.workspace.update({
      where: { id: auth.activeWorkspaceId },
      data: { agentPrompts },
    });

    return NextResponse.json({
      workspaceId: auth.activeWorkspaceId,
      channel,
      prompts: agentPrompts[channel],
    });
  } catch (error) {
    console.error('Error updating agent config:', error);
    return NextResponse.json(
      { error: 'Error al actualizar configuración del agente' },
      { status: 500 }
    );
  }
}

// POST /api/crm/agent-config — Reset agent prompts to defaults
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, channel } = body;

    if (action !== 'reset') {
      return NextResponse.json(
        { error: 'Acción no válida. Use action: "reset"' },
        { status: 400 }
      );
    }

    // Reset specific channel or all channels
    const workspace = await db.workspace.findUnique({
      where: { id: auth.activeWorkspaceId },
      select: { agentPrompts: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    const agentPrompts = (workspace.agentPrompts as Record<string, Record<string, string>>) || {};

    if (channel && VALID_CHANNELS.includes(channel)) {
      // Reset specific channel
      agentPrompts[channel] = { ...DEFAULT_PROMPTS[channel] };
    } else {
      // Reset all channels
      for (const ch of VALID_CHANNELS) {
        agentPrompts[ch] = { ...DEFAULT_PROMPTS[ch] };
      }
    }

    await db.workspace.update({
      where: { id: auth.activeWorkspaceId },
      data: { agentPrompts },
    });

    return NextResponse.json({
      workspaceId: auth.activeWorkspaceId,
      message: channel
        ? `Prompts para ${channel} restaurados a valores por defecto`
        : 'Todos los prompts restaurados a valores por defecto',
      agentPrompts,
    });
  } catch (error) {
    console.error('Error resetting agent config:', error);
    return NextResponse.json(
      { error: 'Error al restaurar configuración del agente' },
      { status: 500 }
    );
  }
}
