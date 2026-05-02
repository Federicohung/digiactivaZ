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

// GET /api/crm/messages/[contactId] — Get all messages for a contact (JWT auth)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { contactId } = await params;

    // Verify contact belongs to workspace
    const contact = await db.contact.findFirst({
      where: { id: contactId, workspaceId: auth.activeWorkspaceId },
    });

    if (!contact) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }

    const messages = await db.message.findMany({
      where: {
        contactId,
        workspaceId: auth.activeWorkspaceId,
      },
      orderBy: { createdAt: 'asc' },
    });

    // metadata is already a native JS object for Json fields
    const parsed = messages.map((m) => ({
      ...m,
      metadata: m.metadata || {},
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[CRM_MESSAGES_GET_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al obtener mensajes' },
      { status: 500 }
    );
  }
}
