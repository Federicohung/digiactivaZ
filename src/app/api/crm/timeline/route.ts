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

// POST /api/crm/timeline — Add timeline event
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { contactId, tipo, descripcion, metadata } = body;

    if (!contactId || typeof contactId !== 'string') {
      return NextResponse.json(
        { error: 'contactId es requerido' },
        { status: 400 }
      );
    }

    if (!tipo || typeof tipo !== 'string') {
      return NextResponse.json(
        { error: 'tipo es requerido' },
        { status: 400 }
      );
    }

    if (!descripcion || typeof descripcion !== 'string' || descripcion.trim() === '') {
      return NextResponse.json(
        { error: 'descripcion es requerida' },
        { status: 400 }
      );
    }

    const validTipos = [
      'nota',
      'mensaje',
      'llamada',
      'etapa_cambiada',
      'ai_summary',
      'email',
      'whatsapp',
    ];

    if (!validTipos.includes(tipo)) {
      return NextResponse.json(
        { error: `Tipo inválido. Valores permitidos: ${validTipos.join(', ')}` },
        { status: 400 }
      );
    }

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

    const event = await db.timelineEvent.create({
      data: {
        workspaceId: auth.activeWorkspaceId,
        contactId,
        tipo,
        descripcion: descripcion.trim(),
        metadata: metadata || {},
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error('Error creating timeline event:', error);
    return NextResponse.json(
      { error: 'Error al crear evento de timeline' },
      { status: 500 }
    );
  }
}
