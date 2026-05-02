import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { upsertComposioConnection, setupTriggersForToolkit, checkIntegrationStatus } from '@/lib/composio';
import type { ComposioToolkit } from '@/lib/composio';

// GET /api/composio/callback
// This is the OAuth callback URL that Composio redirects to after
// the user authorizes Facebook or Instagram.
// Composio sends: ?connectedAccountId=xxx&toolkit=facebook&status=ACTIVE
// We update our DB, set up triggers, and redirect to the CRM dashboard.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const connectedAccountId = searchParams.get('connectedAccountId');
  const toolkit = searchParams.get('toolkit') as ComposioToolkit | null;
  const status = searchParams.get('status');
  const state = searchParams.get('state'); // May contain workspace/user info
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  console.log('[COMPOSIO_CALLBACK] Received callback:', {
    connectedAccountId,
    toolkit,
    status,
    state,
    error,
  });

  // If OAuth was denied or failed
  if (error) {
    console.error('[COMPOSIO_CALLBACK] OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/crm?tab=integraciones&error=${encodeURIComponent(errorDescription || error)}&toolkit=${toolkit || ''}`, request.url)
    );
  }

  // Validate toolkit
  if (!toolkit || !['facebook', 'instagram'].includes(toolkit)) {
    console.error('[COMPOSIO_CALLBACK] Invalid or missing toolkit:', toolkit);
    return NextResponse.redirect(
      new URL('/crm?tab=integraciones&error=invalid_toolkit', request.url)
    );
  }

  const typedToolkit = toolkit as ComposioToolkit;

  // Try to extract workspace/user info from state parameter
  // State format: ws_{workspaceId}_user_{userId} or JSON
  let workspaceId = '';
  let userId = '';

  if (state) {
    try {
      const stateData = JSON.parse(decodeURIComponent(state));
      workspaceId = stateData.workspaceId || '';
      userId = stateData.userId || '';
    } catch {
      // State might be the composioUserId format: ws_{workspaceId}_user_{userId}
      const match = state.match(/^ws_([^_]+)_user_(.+)$/);
      if (match) {
        workspaceId = match[1];
        userId = match[2];
      }
    }
  }

  // If we couldn't parse state, try to find a pending connection for this toolkit
  if (!workspaceId || !userId) {
    const pendingConnection = await db.composioConnection.findFirst({
      where: {
        toolkit: typedToolkit,
        connected: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingConnection) {
      workspaceId = pendingConnection.workspaceId;
      userId = pendingConnection.userId;
    }
  }

  // If still no workspace/user, redirect with error
  if (!workspaceId || !userId) {
    console.error('[COMPOSIO_CALLBACK] Could not determine workspace/user');
    return NextResponse.redirect(
      new URL('/crm?tab=integraciones&error=session_expired', request.url)
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

    // Verify connection via Composio SDK
    let verified = false;
    try {
      const statusResult = await checkIntegrationStatus(workspaceId, userId, typedToolkit);
      verified = statusResult.connected;
      console.log(`[COMPOSIO_CALLBACK] SDK verification: ${typedToolkit} connected=${verified}`);
    } catch (verifyError) {
      console.warn('[COMPOSIO_CALLBACK] SDK verification failed (connection may still be valid):', verifyError);
    }

    // Try to set up triggers
    let triggersSetup = false;
    try {
      const triggerResults = await setupTriggersForToolkit(workspaceId, userId, typedToolkit);
      triggersSetup = triggerResults.length > 0 && triggerResults.some(r => r.success);
      console.log(`[COMPOSIO_CALLBACK] Triggers setup for ${typedToolkit}:`, triggerResults);
    } catch (triggerError) {
      // Triggers may not be available for FB/IG yet - this is expected
      console.warn(`[COMPOSIO_CALLBACK] Triggers setup skipped for ${typedToolkit}:`, triggerError);
    }

    // Redirect to CRM integrations page with success
    const successParams = new URLSearchParams({
      tab: 'integraciones',
      connected: typedToolkit,
      verified: String(verified),
      triggers: String(triggersSetup),
    });

    return NextResponse.redirect(
      new URL(`/crm?${successParams.toString()}`, request.url)
    );
  } catch (error) {
    console.error('[COMPOSIO_CALLBACK] Error processing callback:', error);
    return NextResponse.redirect(
      new URL(`/crm?tab=integraciones&error=callback_failed&toolkit=${typedToolkit}`, request.url)
    );
  }
}

// POST /api/composio/callback
// Some Composio versions send a POST callback instead of GET
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[COMPOSIO_CALLBACK] POST callback received:', JSON.stringify(body));

    const toolkit = body.toolkit as ComposioToolkit | undefined;
    const connectedAccountId = body.connectedAccountId || body.connectedAccountId;
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

      // Try trigger setup
      try {
        await setupTriggersForToolkit(pendingConnection.workspaceId, pendingConnection.userId, typedToolkit);
      } catch {
        console.warn('[COMPOSIO_CALLBACK] POST: Triggers setup skipped');
      }
    }

    return NextResponse.json({ success: true, toolkit: typedToolkit });
  } catch (error) {
    console.error('[COMPOSIO_CALLBACK] POST error:', error);
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 });
  }
}
