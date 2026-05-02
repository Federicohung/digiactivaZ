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

const PIPELINE_STAGES = [
  'nuevo',
  'contactado',
  'calificado',
  'propuesta',
  'negociacion',
  'cerrado',
] as const;

// GET /api/crm/pipeline — Get contacts grouped by etapa
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const contacts = await db.contact.findMany({
      where: { workspaceId: auth.activeWorkspaceId },
      orderBy: { updatedAt: 'desc' },
    });

    const pipeline: Record<string, typeof contacts> = {};
    for (const stage of PIPELINE_STAGES) {
      pipeline[stage] = [];
    }

    for (const contact of contacts) {
      const etapa = contact.etapa as string;
      if (pipeline[etapa]) {
        pipeline[etapa].push(contact);
      } else {
        // Contacts with unknown etapa go to 'nuevo'
        pipeline['nuevo'].push(contact);
      }
    }

    return NextResponse.json(pipeline);
  } catch (error) {
    console.error('Error fetching pipeline:', error);
    return NextResponse.json(
      { error: 'Error al obtener pipeline' },
      { status: 500 }
    );
  }
}
