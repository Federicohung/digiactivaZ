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

// GET /api/crm/contacts/[id] — Get single contact
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const contact = await db.contact.findFirst({
      where: {
        id,
        workspaceId: auth.activeWorkspaceId,
      },
      include: {
        timeline: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!contact) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    return NextResponse.json(
      { error: 'Error al obtener contacto' },
      { status: 500 }
    );
  }
}

// PUT /api/crm/contacts/[id] — Update contact
export async function PUT(
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

    // Verify contact belongs to workspace
    const existing = await db.contact.findFirst({
      where: { id, workspaceId: auth.activeWorkspaceId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }

    const validFuentes = [
      'web_chat',
      'whatsapp',
      'manual',
      'messenger',
      'instagram',
      'external',
    ];
    const validEtapas = [
      'nuevo',
      'contactado',
      'calificado',
      'propuesta',
      'negociacion',
      'cerrado',
    ];

    if (body.fuente && !validFuentes.includes(body.fuente)) {
      return NextResponse.json(
        { error: `Fuente inválida. Valores permitidos: ${validFuentes.join(', ')}` },
        { status: 400 }
      );
    }

    if (body.etapa && !validEtapas.includes(body.etapa)) {
      return NextResponse.json(
        { error: `Etapa inválida. Valores permitidos: ${validEtapas.join(', ')}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'nombre',
      'email',
      'telefono',
      'empresa',
      'nicho',
      'fuente',
      'etapa',
      'valorMensual',
      'probabilidadCierre',
      'scoreIa',
      'aiSummary',
      'notas',
      'instagramId',
      'messengerId',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'nombre') {
          updateData[field] = String(body[field]).trim();
        } else if (field === 'email' || field === 'telefono' || field === 'empresa' || field === 'nicho' || field === 'aiSummary' || field === 'notas' || field === 'instagramId' || field === 'messengerId') {
          updateData[field] = body[field] ?? null;
        } else if (field === 'valorMensual' || field === 'probabilidadCierre' || field === 'scoreIa') {
          updateData[field] = typeof body[field] === 'number' ? body[field] : 0;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const contact = await db.contact.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error updating contact:', error);
    return NextResponse.json(
      { error: 'Error al actualizar contacto' },
      { status: 500 }
    );
  }
}

// DELETE /api/crm/contacts/[id] — Delete contact
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verify contact belongs to workspace
    const existing = await db.contact.findFirst({
      where: { id, workspaceId: auth.activeWorkspaceId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }

    // Delete related records first
    await db.timelineEvent.deleteMany({
      where: { contactId: id },
    });

    await db.message.deleteMany({
      where: { contactId: id },
    });

    await db.contact.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Contacto eliminado' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json(
      { error: 'Error al eliminar contacto' },
      { status: 500 }
    );
  }
}
