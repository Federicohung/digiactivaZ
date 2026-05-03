import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { checkIntegrationStatus } from '@/lib/composio';
import type { ComposioToolkit } from '@/lib/composio';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// GET /api/composio/status — Check connection status for Facebook or Instagram
// Query: ?toolkit=facebook|instagram
// This endpoint checks both Composio API AND our database.
// It auto-updates our DB when it discovers a connection is ACTIVE.
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const toolkit = searchParams.get('toolkit');

    if (!toolkit || !['facebook', 'instagram', 'whatsapp'].includes(toolkit)) {
      return NextResponse.json(
        { error: 'Toolkit inválido. Use "facebook", "instagram" o "whatsapp"' },
        { status: 400 }
      );
    }

    const typedToolkit = toolkit as ComposioToolkit;

    // Check via Composio SDK (also updates our DB if needed)
    const statusResult = await checkIntegrationStatus(
      auth.activeWorkspaceId,
      auth.userId,
      typedToolkit
    );

    return NextResponse.json({
      connected: statusResult.connected,
      toolkit: typedToolkit,
      connectedAccountId: statusResult.connectedAccountId,
      accountName: statusResult.accountName,
    });
  } catch (error) {
    console.error('[COMPOSIO_STATUS_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al verificar estado de conexión', connected: false },
      { status: 500 }
    );
  }
}
