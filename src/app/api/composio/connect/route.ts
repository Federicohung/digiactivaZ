import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { initiateOAuth } from '@/lib/composio';
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
// After the user authenticates, Composio marks the connection as ACTIVE.
// The frontend polls /api/composio/status to detect the change.
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { toolkit } = body;

    if (!toolkit || !['facebook', 'instagram', 'whatsapp'].includes(toolkit)) {
      return NextResponse.json(
        { error: 'Toolkit inválido. Use "facebook", "instagram" o "whatsapp"' },
        { status: 400 }
      );
    }

    const typedToolkit = toolkit as ComposioToolkit;

    // Initiate OAuth flow via Composio
    // This also saves a pending connection to our DB
    const { redirectUrl, connectedAccountId } = await initiateOAuth(
      auth.activeWorkspaceId,
      auth.userId,
      typedToolkit
    );

    if (!redirectUrl) {
      return NextResponse.json(
        { error: 'No se pudo generar la URL de autenticación. Verifique que la API key de Composio sea válida y que el toolkit esté habilitado.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      authUrl: redirectUrl,
      toolkit: typedToolkit,
      connectedAccountId,
      message: `Visite la URL para conectar su cuenta de ${typedToolkit === 'facebook' ? 'Facebook' : typedToolkit === 'whatsapp' ? 'WhatsApp' : 'Instagram'}`,
    });
  } catch (error) {
    console.error('[COMPOSIO_CONNECT_ERROR]', error);
    const message = error instanceof Error ? error.message : 'Error al iniciar conexión OAuth';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
