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

const VALID_ETAPAS = [
  'nuevo',
  'contactado',
  'calificado',
  'propuesta',
  'negociacion',
  'cerrado',
];

// PUT /api/crm/pipeline/move/[id] — Move contact to different etapa
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
    const { etapa } = body;

    if (!etapa || !VALID_ETAPAS.includes(etapa)) {
      return NextResponse.json(
        { error: `Etapa inválida. Valores permitidos: ${VALID_ETAPAS.join(', ')}` },
        { status: 400 }
      );
    }

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

    const previousEtapa = existing.etapa;

    // Update contact etapa
    const contact = await db.contact.update({
      where: { id },
      data: { etapa },
    });

    // Create timeline event for stage change
    await db.timelineEvent.create({
      data: {
        workspaceId: auth.activeWorkspaceId,
        contactId: id,
        tipo: 'etapa_cambiada',
        descripcion: `Etapa cambiada de "${previousEtapa}" a "${etapa}"`,
        metadata: {
          previousEtapa,
          newEtapa: etapa,
          changedBy: auth.userId,
        },
      },
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error moving contact in pipeline:', error);
    return NextResponse.json(
      { error: 'Error al mover contacto en pipeline' },
      { status: 500 }
    );
  }
}
