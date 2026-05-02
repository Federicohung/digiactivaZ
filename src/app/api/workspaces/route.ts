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

// GET /api/workspaces — List user's workspaces
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const memberships = await db.workspaceMember.findMany({
      where: { userId: auth.userId },
      include: { workspace: true },
      orderBy: { joinedAt: 'desc' },
    });

    const workspaces = memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      plan: m.workspace.plan,
      role: m.role,
      onboardingCompleted: m.workspace.onboardingCompleted,
      createdAt: m.workspace.createdAt,
    }));

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Error listing workspaces:', error);
    return NextResponse.json(
      { error: 'Error al listar workspaces' },
      { status: 500 }
    );
  }
}

// POST /api/workspaces — Create workspace (founder_admin only)
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (auth.role !== 'founder_admin') {
    return NextResponse.json(
      { error: 'Solo founder_admin puede crear workspaces' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { name, plan } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'El nombre es requerido' },
        { status: 400 }
      );
    }

    const validPlans = ['essential', 'premium', 'elite', 'founder_full'];
    const planValue = validPlans.includes(plan) ? plan : 'essential';

    // Generate slug from name
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if slug is unique
    const existingSlug = await db.workspace.findUnique({
      where: { slug },
    });

    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    // Create workspace
    const workspace = await db.workspace.create({
      data: {
        name: name.trim(),
        slug: finalSlug,
        plan: planValue,
      },
    });

    // Add user as member
    await db.workspaceMember.create({
      data: {
        userId: auth.userId,
        workspaceId: workspace.id,
        role: 'admin',
      },
    });

    // Update user's workspaceIds
    const user = await db.user.findUnique({
      where: { id: auth.userId },
    });

    if (user) {
      const workspaceIds = (user.workspaceIds as string[]) || [];
      workspaceIds.push(workspace.id);

      await db.user.update({
        where: { id: auth.userId },
        data: { workspaceIds },
      });
    }

    return NextResponse.json(
      {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        plan: workspace.plan,
        createdAt: workspace.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating workspace:', error);
    return NextResponse.json(
      { error: 'Error al crear workspace' },
      { status: 500 }
    );
  }
}
