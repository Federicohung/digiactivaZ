import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, extractBearerToken, signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    // Verify user is a member of the workspace
    const membership = await db.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: payload.userId,
          workspaceId,
        },
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      );
    }

    // Update user's active workspace
    const user = await db.user.update({
      where: { id: payload.userId },
      data: { activeWorkspaceId: workspaceId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        activeWorkspaceId: true,
      },
    });

    // Sign new JWT with updated activeWorkspaceId
    const newToken = await signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      activeWorkspaceId: user.activeWorkspaceId ?? undefined,
    });

    return NextResponse.json({
      token: newToken,
      user,
      workspace: membership.workspace,
    });
  } catch (error) {
    console.error('[SWITCH_WORKSPACE_ERROR]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
