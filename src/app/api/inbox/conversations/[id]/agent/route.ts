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

// POST /api/inbox/conversations/[id]/agent — Toggle agent for a conversation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { enabled } = body;

    // Verify conversation belongs to workspace
    const conversation = await db.conversation.findFirst({
      where: { id, workspaceId: auth.activeWorkspaceId },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
    }

    // Store agent enabled/disabled status in conversation tags
    const currentTags = (conversation.tags as string[]) || [];
    const newTags = enabled
      ? currentTags.filter(t => t !== 'agent_paused')
      : [...currentTags.filter(t => t !== 'agent_paused'), 'agent_paused'];

    await db.conversation.update({
      where: { id },
      data: { tags: newTags },
    });

    return NextResponse.json({
      ok: true,
      conversationId: id,
      agentEnabled: enabled,
      message: enabled ? 'Agente reactivado para esta conversación' : 'Agente pausado para esta conversación',
    });
  } catch (error) {
    console.error('Error toggling agent for conversation:', error);
    return NextResponse.json({ error: 'Error al cambiar estado del agente' }, { status: 500 });
  }
}
