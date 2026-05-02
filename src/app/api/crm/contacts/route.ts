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

// POST /api/crm/contacts — Create contact
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      nombre,
      email,
      telefono,
      empresa,
      nicho,
      fuente,
      etapa,
      valorMensual,
    } = body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      return NextResponse.json(
        { error: 'El nombre es requerido' },
        { status: 400 }
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

    if (fuente && !validFuentes.includes(fuente)) {
      return NextResponse.json(
        { error: `Fuente inválida. Valores permitidos: ${validFuentes.join(', ')}` },
        { status: 400 }
      );
    }

    if (etapa && !validEtapas.includes(etapa)) {
      return NextResponse.json(
        { error: `Etapa inválida. Valores permitidos: ${validEtapas.join(', ')}` },
        { status: 400 }
      );
    }

    const contact = await db.contact.create({
      data: {
        workspaceId: auth.activeWorkspaceId,
        nombre: nombre.trim(),
        email: email?.trim() || null,
        telefono: telefono?.trim() || null,
        empresa: empresa?.trim() || null,
        nicho: nicho?.trim() || null,
        fuente: fuente || 'manual',
        etapa: etapa || 'nuevo',
        valorMensual: typeof valorMensual === 'number' ? valorMensual : 0,
      },
    });

    // Create timeline event for new contact
    await db.timelineEvent.create({
      data: {
        workspaceId: auth.activeWorkspaceId,
        contactId: contact.id,
        tipo: 'nota',
        descripcion: `Contacto creado: ${contact.nombre}`,
        metadata: JSON.stringify({ action: 'contact_created', fuente: contact.fuente }),
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json(
      { error: 'Error al crear contacto' },
      { status: 500 }
    );
  }
}

// GET /api/crm/contacts — List contacts with optional filters
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const etapa = searchParams.get('etapa');
    const fuente = searchParams.get('fuente');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {
      workspaceId: auth.activeWorkspaceId,
    };

    if (etapa) {
      where.etapa = etapa;
    }

    if (fuente) {
      where.fuente = fuente;
    }

    if (search && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { nombre: { contains: searchTerm } },
        { email: { contains: searchTerm } },
        { empresa: { contains: searchTerm } },
      ];
    }

    const contacts = await db.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Error listing contacts:', error);
    return NextResponse.json(
      { error: 'Error al listar contactos' },
      { status: 500 }
    );
  }
}
