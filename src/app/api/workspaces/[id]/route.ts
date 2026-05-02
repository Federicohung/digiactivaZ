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

// GET /api/workspaces/[id] — Get workspace details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verify user has access to this workspace
    const membership = await db.workspaceMember.findFirst({
      where: { userId: auth.userId, workspaceId: id },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'No tienes acceso a este workspace' },
        { status: 403 }
      );
    }

    const workspace = await db.workspace.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
      modules: workspace.modules || {},
      integrations: workspace.integrations || {},
      agentPrompts: workspace.agentPrompts || {},
      metaMensual: workspace.metaMensual || {},
      branding: workspace.branding || {},
      onboardingCompleted: workspace.onboardingCompleted,
      members: workspace.members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching workspace:', error);
    return NextResponse.json(
      { error: 'Error al obtener workspace' },
      { status: 500 }
    );
  }
}

// PUT /api/workspaces/[id] — Update workspace
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    // Verify user has access to this workspace
    const membership = await db.workspaceMember.findFirst({
      where: { userId: auth.userId, workspaceId: id },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'No tienes acceso a este workspace' },
        { status: 403 }
      );
    }

    if (membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tienes permisos para actualizar este workspace' },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        return NextResponse.json(
          { error: 'El nombre no puede estar vacío' },
          { status: 400 }
        );
      }
      updateData.name = body.name.trim();
    }

    if (body.modules !== undefined) {
      updateData.modules = body.modules;
    }

    if (body.integrations !== undefined) {
      updateData.integrations = body.integrations;
    }

    if (body.agentPrompts !== undefined) {
      updateData.agentPrompts = body.agentPrompts;
    }

    if (body.branding !== undefined) {
      updateData.branding = body.branding;
    }

    if (body.onboardingCompleted !== undefined) {
      updateData.onboardingCompleted = Boolean(body.onboardingCompleted);
    }

    if (body.metaMensual !== undefined) {
      updateData.metaMensual = body.metaMensual;
    }

    const updated = await db.workspace.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      plan: updated.plan,
      modules: updated.modules || {},
      integrations: updated.integrations || {},
      agentPrompts: updated.agentPrompts || {},
      metaMensual: updated.metaMensual || {},
      branding: updated.branding || {},
      onboardingCompleted: updated.onboardingCompleted,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Error updating workspace:', error);
    return NextResponse.json(
      { error: 'Error al actualizar workspace' },
      { status: 500 }
    );
  }
}
