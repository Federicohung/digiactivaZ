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

// GET /api/crm/chat-sessions — List chat sessions for workspace (JWT auth)
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const sessions = await db.chatSession.findMany({
      where: { workspaceId: auth.activeWorkspaceId },
      orderBy: { updatedAt: 'desc' },
    });

    // Get unique contactIds and fetch contacts
    const contactIds = sessions
      .map(s => s.contactId)
      .filter((id): id is string => id !== null);
    
    const contacts = contactIds.length > 0
      ? await db.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, nombre: true, email: true, telefono: true, empresa: true, etapa: true },
        })
      : [];
    
    const contactMap = new Map(contacts.map(c => [c.id, c]));

    // Json fields already return native JS objects
    const parsed = sessions.map((s) => ({
      ...s,
      messages: s.messages || [],
      leadData: s.leadData || {},
      contact: s.contactId ? contactMap.get(s.contactId) || null : null,
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[CHAT_SESSIONS_LIST_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al listar sesiones de chat' },
      { status: 500 }
    );
  }
}
