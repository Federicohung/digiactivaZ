import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { checkIntegrationStatus, upsertComposioConnection } from '@/lib/composio';
import type { ComposioToolkit } from '@/lib/composio';
import { db } from '@/lib/db';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// GET /api/composio/status — Check connection status for Facebook or Instagram
// Query: ?toolkit=facebook|instagram
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const toolkit = searchParams.get('toolkit');

    if (!toolkit || !['facebook', 'instagram'].includes(toolkit)) {
      return NextResponse.json(
        { error: 'Toolkit inválido. Use "facebook" o "instagram"' },
        { status: 400 }
      );
    }

    const typedToolkit = toolkit as ComposioToolkit;

    // Check via Composio SDK v0.8.1
    const statusResult = await checkIntegrationStatus(
      auth.activeWorkspaceId,
      auth.userId,
      typedToolkit
    );

    // Also check our database record
    const dbConnection = await db.composioConnection.findUnique({
      where: {
        workspaceId_toolkit: {
          workspaceId: auth.activeWorkspaceId,
          toolkit: typedToolkit,
        },
      },
    });

    // If Composio says connected but our DB doesn't reflect it, update
    if (statusResult.connected) {
      await upsertComposioConnection(auth.activeWorkspaceId, auth.userId, typedToolkit, {
        connected: true,
        accountId: statusResult.connectedAccountId,
        accountName: statusResult.accountName,
        metadata: {
          ...(dbConnection?.metadata as Record<string, unknown> || {}),
          status: 'active',
          connectedAt: new Date().toISOString(),
          connectedAccountId: statusResult.connectedAccountId,
        },
      });
    }

    return NextResponse.json({
      connected: statusResult.connected,
      toolkit: typedToolkit,
      connectedAccountId: statusResult.connectedAccountId,
      accountName: statusResult.accountName,
      dbRecord: dbConnection
        ? {
            id: dbConnection.id,
            accountId: dbConnection.accountId,
            accountName: dbConnection.accountName,
            connected: dbConnection.connected,
            createdAt: dbConnection.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error('[COMPOSIO_STATUS_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al verificar estado de conexión' },
      { status: 500 }
    );
  }
}
