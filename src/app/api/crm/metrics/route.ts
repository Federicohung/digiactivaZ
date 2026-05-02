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

// GET /api/crm/metrics — Dashboard metrics for workspace
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const workspaceId = auth.activeWorkspaceId;

    // Total contacts
    const totalContacts = await db.contact.count({
      where: { workspaceId },
    });

    // Contacts by etapa
    const byEtapa: Record<string, number> = {};
    for (const stage of PIPELINE_STAGES) {
      const count = await db.contact.count({
        where: { workspaceId, etapa: stage },
      });
      byEtapa[stage] = count;
    }

    // Total valor mensual
    const valorResult = await db.contact.aggregate({
      where: { workspaceId },
      _sum: { valorMensual: true },
    });
    const totalValorMensual = valorResult._sum.valorMensual ?? 0;

    // Average probabilidad de cierre
    const probResult = await db.contact.aggregate({
      where: { workspaceId },
      _avg: { probabilidadCierre: true },
    });
    const avgProbabilidadCierre = Math.round((probResult._avg.probabilidadCierre ?? 0) * 100) / 100;

    // Recent contacts (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentContacts = await db.contact.count({
      where: {
        workspaceId,
        createdAt: { gte: sevenDaysAgo },
      },
    });

    // Hot leads (scoreIa > 70 OR probabilidadCierre > 50)
    const hotLeads = await db.contact.findMany({
      where: {
        workspaceId,
        OR: [
          { scoreIa: { gt: 70 } },
          { probabilidadCierre: { gt: 50 } },
        ],
      },
      orderBy: { scoreIa: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      totalContacts,
      byEtapa,
      totalValorMensual,
      avgProbabilidadCierre,
      recentContacts,
      hotLeads,
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Error al obtener métricas' },
      { status: 500 }
    );
  }
}
