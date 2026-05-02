import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/chat/greeting?workspaceSlug=demo — PUBLIC
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('workspaceSlug') || 'demo';

    const workspace = await db.workspace.findUnique({
      where: { slug },
    });

    if (!workspace) {
      return NextResponse.json({
        greeting: '¡Hola! 👋 Soy el asistente virtual. ¿En qué puedo ayudarte hoy?',
      });
    }

    // Parse agent prompts for web_chat greeting
    let agentPrompts: Record<string, unknown> = {};
    try {
      agentPrompts = JSON.parse(workspace.agentPrompts || '{}');
    } catch {
      agentPrompts = {};
    }

    const webChatPrompt = agentPrompts.web_chat as Record<string, unknown> | undefined;
    const greeting =
      (webChatPrompt?.greeting as string) ||
      '¡Hola! 👋 Soy el asistente virtual. ¿En qué puedo ayudarte hoy?';

    return NextResponse.json({ greeting });
  } catch (error) {
    console.error('[CHAT_GREETING_ERROR]', error);
    return NextResponse.json({
      greeting: '¡Hola! 👋 Soy el asistente virtual. ¿En qué puedo ayudarte hoy?',
    });
  }
}
