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

// GET /api/crm/settings — Get CRM settings for workspace
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const workspace = await db.workspace.findUnique({
      where: { id: auth.activeWorkspaceId },
      select: {
        id: true,
        name: true,
        plan: true,
        metaMensual: true,
        modules: true,
        agentPrompts: true,
        integrations: true,
        branding: true,
        onboardingCompleted: true,
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      workspaceId: workspace.id,
      name: workspace.name,
      plan: workspace.plan,
      metaMensual: workspace.metaMensual || { meta: 0, periodo: '' },
      modules: workspace.modules || {},
      agentPrompts: workspace.agentPrompts || {},
      integrations: workspace.integrations || {},
      branding: workspace.branding || {},
      onboardingCompleted: workspace.onboardingCompleted,
    });
  } catch (error) {
    console.error('Error fetching CRM settings:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    );
  }
}

// PUT /api/crm/settings — Update CRM settings
export async function PUT(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { metaMensual } = body;

    const workspace = await db.workspace.findUnique({
      where: { id: auth.activeWorkspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (metaMensual !== undefined) {
      if (typeof metaMensual !== 'object' || metaMensual === null) {
        return NextResponse.json(
          { error: 'metaMensual debe ser un objeto { meta, periodo }' },
          { status: 400 }
        );
      }
      updateData.metaMensual = {
        meta: typeof metaMensual.meta === 'number' ? metaMensual.meta : 0,
        periodo: typeof metaMensual.periodo === 'string' ? metaMensual.periodo : '',
      };
    }

    const updated = await db.workspace.update({
      where: { id: auth.activeWorkspaceId },
      data: updateData,
    });

    const parsedMetaMensual = updated.metaMensual || { meta: 0, periodo: '' };

    return NextResponse.json({
      workspaceId: updated.id,
      name: updated.name,
      metaMensual: parsedMetaMensual,
    });
  } catch (error) {
    console.error('Error updating CRM settings:', error);
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    );
  }
}
