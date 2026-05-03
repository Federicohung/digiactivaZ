import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { verifyMetaAccessToken } from '@/lib/meta-whatsapp';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// GET /api/whatsapp/config — Get current WhatsApp Business configuration for the workspace
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const workspace = await db.workspace.findUnique({
      where: { id: auth.activeWorkspaceId },
      select: { integrations: true, slug: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    const integrations = workspace.integrations as Record<string, any> || {};
    const whatsappConfig = integrations.whatsapp as Record<string, any> | undefined;

    if (!whatsappConfig) {
      return NextResponse.json({
        mode: null,
        meta: {
          phoneNumberId: '',
          businessAccountId: '',
          verifyToken: '',
          accessToken: '',
        },
        connected: false,
        accountName: '',
        webhookUrl: `https://digiactiva-z.vercel.app/api/whatsapp/webhook`,
        workspaceSlug: workspace.slug,
      });
    }

    // Mask sensitive fields
    const maskValue = (val: string | undefined) => {
      if (!val) return '';
      if (val.length <= 8) return '••••••••';
      return val.substring(0, 4) + '••••' + val.substring(val.length - 4);
    };

    return NextResponse.json({
      mode: whatsappConfig.mode || null,
      meta: {
        phoneNumberId: whatsappConfig.phoneNumberId || '',
        businessAccountId: whatsappConfig.businessAccountId || '',
        verifyToken: maskValue(whatsappConfig.verifyToken),
        accessToken: maskValue(whatsappConfig.accessToken),
      },
      // Unmasked fields for editing — only return if user is editing
      _raw: {
        phoneNumberId: whatsappConfig.phoneNumberId || '',
        businessAccountId: whatsappConfig.businessAccountId || '',
        verifyToken: whatsappConfig.verifyToken || '',
        accessToken: whatsappConfig.accessToken || '',
      },
      connected: whatsappConfig.connectedAt ? true : false,
      accountName: whatsappConfig.accountName || '',
      connectedAt: whatsappConfig.connectedAt || null,
      webhookUrl: `https://digiactiva-z.vercel.app/api/whatsapp/webhook`,
      workspaceSlug: workspace.slug,
    });
  } catch (error) {
    console.error('[WA_CONFIG_GET_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración de WhatsApp' },
      { status: 500 }
    );
  }
}

// PUT /api/whatsapp/config — Save WhatsApp Business configuration
export async function PUT(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { mode, phoneNumberId, businessAccountId, accessToken, verifyToken, accountName } = body;

    if (!mode || !['composio', 'meta'].includes(mode)) {
      return NextResponse.json(
        { error: 'Mode inválido. Use "composio" o "meta"' },
        { status: 400 }
      );
    }

    const workspace = await db.workspace.findUnique({
      where: { id: auth.activeWorkspaceId },
      select: { integrations: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace no encontrado' },
        { status: 404 }
      );
    }

    const currentIntegrations = (workspace.integrations as Record<string, any>) || {};
    const currentWhatsapp = currentIntegrations.whatsapp as Record<string, any> || {};

    if (mode === 'meta') {
      // Validate required fields for meta mode
      if (!phoneNumberId || !accessToken || !verifyToken) {
        return NextResponse.json(
          { error: 'Phone Number ID, Access Token y Verify Token son requeridos para modo Meta' },
          { status: 400 }
        );
      }

      // If access token hasn't changed (is masked), keep the old one
      const finalAccessToken = accessToken.includes('••••')
        ? currentWhatsapp.accessToken || accessToken
        : accessToken;

      // If verify token hasn't changed (is masked), keep the old one
      const finalVerifyToken = verifyToken.includes('••••')
        ? currentWhatsapp.verifyToken || verifyToken
        : verifyToken;

      // Test the connection if we have a new access token
      let connectionValid = false;
      let connectionError = '';
      try {
        const verification = await verifyMetaAccessToken(finalAccessToken);
        connectionValid = verification.valid;
        connectionError = verification.error || '';
      } catch (err) {
        connectionError = 'Error al verificar token de acceso';
      }

      const updatedIntegrations = {
        ...currentIntegrations,
        whatsapp: {
          mode: 'meta',
          phoneNumberId,
          businessAccountId: businessAccountId || '',
          accessToken: finalAccessToken,
          verifyToken: finalVerifyToken,
          accountName: accountName || '',
          connectedAt: connectionValid ? new Date().toISOString() : currentWhatsapp.connectedAt || null,
          connectionValid,
          connectionError,
        },
      };

      await db.workspace.update({
        where: { id: auth.activeWorkspaceId },
        data: { integrations: updatedIntegrations },
      });

      return NextResponse.json({
        success: true,
        mode: 'meta',
        connected: connectionValid,
        accountName: accountName || '',
        connectionValid,
        connectionError: connectionValid ? '' : connectionError,
        message: connectionValid
          ? 'WhatsApp Business configurado exitosamente'
          : `Configuración guardada, pero la verificación del token falló: ${connectionError}`,
      });
    } else {
      // Composio mode — just store the mode preference
      const updatedIntegrations = {
        ...currentIntegrations,
        whatsapp: {
          mode: 'composio',
        },
      };

      await db.workspace.update({
        where: { id: auth.activeWorkspaceId },
        data: { integrations: updatedIntegrations },
      });

      return NextResponse.json({
        success: true,
        mode: 'composio',
        connected: false,
        message: 'WhatsApp configurado para usar Composio. Conecta tu cuenta en la sección de mensajería.',
      });
    }
  } catch (error) {
    console.error('[WA_CONFIG_PUT_ERROR]', error);
    const message = error instanceof Error ? error.message : 'Error al guardar configuración de WhatsApp';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
