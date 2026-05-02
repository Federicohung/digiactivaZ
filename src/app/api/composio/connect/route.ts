import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { initiateOAuth, upsertComposioConnection, setupTriggersForToolkit } from '@/lib/composio';
import type { ComposioToolkit } from '@/lib/composio';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// POST /api/composio/connect — Initiate OAuth flow for Facebook or Instagram
// Body: { toolkit: 'facebook' | 'instagram' }
// Returns the auth URL for the user to visit.
// After the user authenticates, triggers are automatically set up.
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { toolkit } = body;

    if (!toolkit || !['facebook', 'instagram'].includes(toolkit)) {
      return NextResponse.json(
        { error: 'Toolkit inválido. Use "facebook" o "instagram"' },
        { status: 400 }
      );
    }

    const typedToolkit = toolkit as ComposioToolkit;

    // Initiate OAuth flow via Composio
    const { redirectUrl, connectedAccountId } = await initiateOAuth(
      auth.activeWorkspaceId,
      auth.userId,
      typedToolkit
    );

    if (!redirectUrl) {
      return NextResponse.json(
        { error: 'No se pudo generar la URL de autenticación' },
        { status: 500 }
      );
    }

    // Store pending connection in our database
    await upsertComposioConnection(auth.activeWorkspaceId, auth.userId, typedToolkit, {
      connected: false,
      metadata: {
        connectedAccountId,
        status: 'pending',
        initiatedAt: new Date().toISOString(),
      },
    });

    // Try to set up triggers immediately (will work if already authenticated)
    // If not yet authenticated, triggers will be set up via the callback or manual trigger
    let triggersSetup = false;
    try {
      const triggerResults = await setupTriggersForToolkit(
        auth.activeWorkspaceId,
        auth.userId,
        typedToolkit
      );
      triggersSetup = triggerResults.some(r => r.success);
    } catch {
      // Triggers will fail if OAuth is not yet completed — this is expected
      console.log('[COMPOSIO_CONNECT] Triggers setup deferred (OAuth not yet completed)');
    }

    return NextResponse.json({
      authUrl: redirectUrl,
      toolkit: typedToolkit,
      message: `Visite la URL para conectar su cuenta de ${typedToolkit === 'facebook' ? 'Facebook' : 'Instagram'}`,
      triggersSetup,
      nextStep: triggersSetup
        ? 'Conexión completada y triggers activos'
        : 'Después de autenticar, llame POST /api/composio/triggers con action=setup para activar los triggers',
    });
  } catch (error) {
    console.error('[COMPOSIO_CONNECT_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al iniciar conexión OAuth' },
      { status: 500 }
    );
  }
}
