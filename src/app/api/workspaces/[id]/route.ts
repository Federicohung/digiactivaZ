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

    // Parse JSON fields safely
    const safeParse = (jsonStr: string) => {
      try {
        return JSON.parse(jsonStr);
      } catch {
        return {};
      }
    };

    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
      modules: safeParse(workspace.modules),
      integrations: safeParse(workspace.integrations),
      agentPrompts: safeParse(workspace.agentPrompts),
      metaMensual: safeParse(workspace.metaMensual),
      branding: safeParse(workspace.branding),
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
      updateData.modules = JSON.stringify(body.modules);
    }

    if (body.integrations !== undefined) {
      updateData.integrations = JSON.stringify(body.integrations);
    }

    if (body.agentPrompts !== undefined) {
      updateData.agentPrompts = JSON.stringify(body.agentPrompts);
    }

    if (body.branding !== undefined) {
      updateData.branding = JSON.stringify(body.branding);
    }

    if (body.onboardingCompleted !== undefined) {
      updateData.onboardingCompleted = Boolean(body.onboardingCompleted);
    }

    if (body.metaMensual !== undefined) {
      updateData.metaMensual = JSON.stringify(body.metaMensual);
    }

    const updated = await db.workspace.update({
      where: { id },
      data: updateData,
    });

    const safeParse = (jsonStr: string) => {
      try {
        return JSON.parse(jsonStr);
      } catch {
        return {};
      }
    };

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      plan: updated.plan,
      modules: safeParse(updated.modules),
      integrations: safeParse(updated.integrations),
      agentPrompts: safeParse(updated.agentPrompts),
      metaMensual: safeParse(updated.metaMensual),
      branding: safeParse(updated.branding),
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
