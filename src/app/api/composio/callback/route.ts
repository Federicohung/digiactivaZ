import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { upsertComposioConnection, checkIntegrationStatus } from '@/lib/composio';
import type { ComposioToolkit } from '@/lib/composio';

// GET /api/composio/callback
// This is the OAuth callback URL that Composio redirects to after
// the user authorizes Facebook or Instagram.
// Composio may send: ?connectedAccountId=xxx&toolkit=facebook&status=ACTIVE
// Or it may redirect here without those params — in that case we try to
// find the pending connection and verify via the Composio API.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const connectedAccountId = searchParams.get('connectedAccountId');
  const toolkit = searchParams.get('toolkit') as ComposioToolkit | null;
  const status = searchParams.get('status');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  console.log('[COMPOSIO_CALLBACK] Received callback:', {
    connectedAccountId,
    toolkit,
    status,
    state,
    error,
    url: request.url,
  });

  // If OAuth was denied or failed
  if (error) {
    console.error('[COMPOSIO_CALLBACK] OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/crm?integraciones_error=${encodeURIComponent(errorDescription || error)}`, request.url)
    );
  }

  // Try to determine the toolkit from params or from our pending connections
  let typedToolkit: ComposioToolkit | null = null;

  if (toolkit && ['facebook', 'instagram'].includes(toolkit)) {
    typedToolkit = toolkit as ComposioToolkit;
  }

  // Try to extract workspace/user info from state parameter
  let workspaceId = '';
  let userId = '';

  if (state) {
    try {
      const stateData = JSON.parse(decodeURIComponent(state));
      workspaceId = stateData.workspaceId || '';
      userId = stateData.userId || '';
    } catch {
      const match = state.match(/^ws_([^_]+)_user_(.+)$/);
      if (match) {
        workspaceId = match[1];
        userId = match[2];
      }
    }
  }

  // If we couldn't parse state, find pending connections in DB
  if (!workspaceId || !userId) {
    const pendingFilter: { toolkit?: string; connected: boolean } = { connected: false };
    if (typedToolkit) pendingFilter.toolkit = typedToolkit;

    const pendingConnections = await db.composioConnection.findMany({
      where: pendingFilter,
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    // Find the most recent pending connection
    if (pendingConnections.length > 0) {
      // If we know the toolkit, pick the matching one
      const match = typedToolkit
        ? pendingConnections.find(c => c.toolkit === typedToolkit)
        : pendingConnections[0];

      if (match) {
        workspaceId = match.workspaceId;
        userId = match.userId;
        if (!typedToolkit) typedToolkit = match.toolkit as ComposioToolkit;
      }
    }
  }

  // If we still don't have workspace/user but have a connectedAccountId,
  // try to find the connection by the connectedAccountId stored in metadata
  if ((!workspaceId || !userId) && connectedAccountId) {
    const allConnections = await db.composioConnection.findMany({
      where: { connected: false },
      orderBy: { updatedAt: 'desc' },
    });

    const matchByAccountId = allConnections.find(c => {
      const meta = c.metadata as Record<string, unknown>;
      return meta?.connectedAccountId === connectedAccountId;
    });

    if (matchByAccountId) {
      workspaceId = matchByAccountId.workspaceId;
      userId = matchByAccountId.userId;
      typedToolkit = matchByAccountId.toolkit as ComposioToolkit;
    }
  }

  // If still no workspace/user, try to verify any pending connection
  if (!workspaceId || !userId || !typedToolkit) {
    console.error('[COMPOSIO_CALLBACK] Could not determine workspace/user/toolkit');
    // Redirect to CRM anyway so the user isn't stuck
    return NextResponse.redirect(
      new URL('/crm?integraciones_status=callback_unknown', request.url)
    );
  }

  try {
    // Update the connection in our DB as connected
    await upsertComposioConnection(workspaceId, userId, typedToolkit, {
      connected: true,
      accountId: connectedAccountId || undefined,
      metadata: {
        connectedAccountId,
        status: status || 'ACTIVE',
        connectedAt: new Date().toISOString(),
        callbackReceived: true,
      },
    });

    console.log(`[COMPOSIO_CALLBACK] Connection marked as connected: ${typedToolkit} for workspace ${workspaceId}`);

    // Verify connection via Composio SDK (updates our DB with latest data)
    try {
      const statusResult = await checkIntegrationStatus(workspaceId, userId, typedToolkit);
      console.log(`[COMPOSIO_CALLBACK] SDK verification: ${typedToolkit} connected=${statusResult.connected}`);
    } catch (verifyError) {
      console.warn('[COMPOSIO_CALLBACK] SDK verification failed (connection may still be valid):', verifyError);
    }

    // Redirect to CRM integrations page with success indicator
    return NextResponse.redirect(
      new URL(`/crm?integraciones_conectado=${typedToolkit}`, request.url)
    );
  } catch (error) {
    console.error('[COMPOSIO_CALLBACK] Error processing callback:', error);
    return NextResponse.redirect(
      new URL(`/crm?integraciones_error=callback_failed`, request.url)
    );
  }
}

// POST /api/composio/callback
// Some Composio versions send a POST callback instead of GET
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[COMPOSIO_CALLBACK] POST callback received:', JSON.stringify(body).substring(0, 500));

    const toolkit = (body.toolkit || body.toolkitSlug) as ComposioToolkit | undefined;
    const connectedAccountId = body.connectedAccountId || body.id;
    const status = body.status || body.connectionStatus;

    if (!toolkit || !['facebook', 'instagram'].includes(toolkit)) {
      return NextResponse.json({ error: 'Invalid toolkit' }, { status: 400 });
    }

    const typedToolkit = toolkit as ComposioToolkit;

    // Find pending connection
    const pendingConnection = await db.composioConnection.findFirst({
      where: {
        toolkit: typedToolkit,
        connected: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingConnection) {
      await upsertComposioConnection(pendingConnection.workspaceId, pendingConnection.userId, typedToolkit, {
        connected: true,
        accountId: connectedAccountId,
        metadata: {
          connectedAccountId,
          status: status || 'ACTIVE',
          connectedAt: new Date().toISOString(),
          callbackReceived: true,
          callbackMethod: 'POST',
        },
      });

      // Verify via SDK
      try {
        await checkIntegrationStatus(pendingConnection.workspaceId, pendingConnection.userId, typedToolkit);
      } catch {
        console.warn('[COMPOSIO_CALLBACK] POST: SDK verification skipped');
      }
    }

    return NextResponse.json({ success: true, toolkit: typedToolkit });
  } catch (error) {
    console.error('[COMPOSIO_CALLBACK] POST error:', error);
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 });
  }
}
