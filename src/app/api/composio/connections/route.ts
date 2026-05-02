import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { db } from '@/lib/db';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// GET /api/composio/connections — List all connected accounts with profile info
// Returns: { connections: [{ toolkit, connected, accountName, accountId, metadata }] }
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const connections = await db.composioConnection.findMany({
      where: { workspaceId: auth.activeWorkspaceId },
      select: {
        id: true,
        toolkit: true,
        connected: true,
        accountId: true,
        accountName: true,
        metadata: true,
        createdAt: true,
      },
    });

    // Format for frontend consumption
    const formatted = connections.map((c) => ({
      toolkit: c.toolkit,
      connected: c.connected,
      accountName: c.accountName || null,
      accountId: c.accountId || null,
      pageName: (c.metadata as Record<string, unknown>)?.pageName || null,
      pageId: (c.metadata as Record<string, unknown>)?.pageId || null,
      connectedAt: (c.metadata as Record<string, unknown>)?.connectedAt || null,
    }));

    return NextResponse.json({ connections: formatted });
  } catch (error) {
    console.error('[COMPOSIO_CONNECTIONS_LIST_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al listar conexiones' },
      { status: 500 }
    );
  }
}
