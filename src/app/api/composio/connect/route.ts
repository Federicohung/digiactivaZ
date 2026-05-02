import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { initiateOAuth, upsertComposioConnection } from '@/lib/composio';
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

    return NextResponse.json({
      authUrl: redirectUrl,
      toolkit: typedToolkit,
      message: `Visite la URL para conectar su cuenta de ${typedToolkit === 'facebook' ? 'Facebook' : 'Instagram'}`,
    });
  } catch (error) {
    console.error('[COMPOSIO_CONNECT_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al iniciar conexión OAuth' },
      { status: 500 }
    );
  }
}
