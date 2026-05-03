import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import {
  setupTriggersForToolkit,
  listTriggerTypes,
  listActiveTriggers,
  disableTrigger,
  enableTrigger,
  deleteTrigger,
} from '@/lib/composio';
import type { ComposioToolkit } from '@/lib/composio';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// POST /api/composio/triggers — Setup triggers for a toolkit after OAuth
// Body: { toolkit: 'facebook' | 'instagram', action: 'setup' | 'disable' | 'enable' | 'delete', triggerId?: string }
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { toolkit, action, triggerId } = body;

    if (!toolkit || !['facebook', 'instagram', 'whatsapp'].includes(toolkit)) {
      return NextResponse.json(
        { error: 'Toolkit inválido. Use "facebook", "instagram" o "whatsapp"' },
        { status: 400 }
      );
    }

    const typedToolkit = toolkit as ComposioToolkit;

    switch (action) {
      case 'setup': {
        // Create all triggers for the toolkit after OAuth connection
        const results = await setupTriggersForToolkit(
          auth.activeWorkspaceId,
          auth.userId,
          typedToolkit
        );
        return NextResponse.json({
          ok: true,
          message: `Triggers configurados para ${typedToolkit}`,
          results,
        });
      }

      case 'disable': {
        if (!triggerId) {
          return NextResponse.json(
            { error: 'triggerId es requerido para disable' },
            { status: 400 }
          );
        }
        await disableTrigger(triggerId);
        return NextResponse.json({
          ok: true,
          message: `Trigger ${triggerId} deshabilitado`,
        });
      }

      case 'enable': {
        if (!triggerId) {
          return NextResponse.json(
            { error: 'triggerId es requerido para enable' },
            { status: 400 }
          );
        }
        await enableTrigger(triggerId);
        return NextResponse.json({
          ok: true,
          message: `Trigger ${triggerId} habilitado`,
        });
      }

      case 'delete': {
        if (!triggerId) {
          return NextResponse.json(
            { error: 'triggerId es requerido para delete' },
            { status: 400 }
          );
        }
        await deleteTrigger(triggerId);
        return NextResponse.json({
          ok: true,
          message: `Trigger ${triggerId} eliminado`,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Acción inválida. Use "setup", "disable", "enable" o "delete"' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[COMPOSIO_TRIGGERS_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al gestionar triggers' },
      { status: 500 }
    );
  }
}

// GET /api/composio/triggers — List trigger types or active triggers
// Query: ?action=types&toolkit=facebook OR ?action=active
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'types';
    const toolkit = searchParams.get('toolkit') as ComposioToolkit | null;

    switch (action) {
      case 'types': {
        // List available trigger types for a toolkit
        const result = await listTriggerTypes(toolkit || undefined);
        return NextResponse.json({ triggers: result });
      }

      case 'active': {
        // List active trigger instances for this user
        const result = await listActiveTriggers();
        return NextResponse.json({ triggers: result });
      }

      default:
        return NextResponse.json(
          { error: 'Acción inválida. Use "types" o "active"' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[COMPOSIO_TRIGGERS_LIST_ERROR]', error);
    return NextResponse.json(
      { error: 'Error al listar triggers' },
      { status: 500 }
    );
  }
}
