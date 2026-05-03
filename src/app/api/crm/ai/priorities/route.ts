import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { getZAI } from '@/lib/zai';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// GET /api/crm/ai/priorities — Get AI-suggested daily priorities
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const workspaceId = auth.activeWorkspaceId;

    // Find contacts that need attention
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Contacts untouched for > 3 days (no recent timeline events)
    const untouchedContacts = await db.contact.findMany({
      where: {
        workspaceId,
        etapa: { not: 'cerrado' },
        updatedAt: { lt: threeDaysAgo },
      },
      orderBy: { scoreIa: 'desc' },
      take: 10,
    });

    // Hot leads (scoreIa > 70 or probabilidadCierre > 50)
    const hotLeads = await db.contact.findMany({
      where: {
        workspaceId,
        etapa: { not: 'cerrado' },
        OR: [
          { scoreIa: { gt: 70 } },
          { probabilidadCierre: { gt: 50 } },
        ],
      },
      orderBy: { scoreIa: 'desc' },
      take: 10,
    });

    // New contacts from last 48 hours without follow-up
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const newUnfollowedContacts = await db.contact.findMany({
      where: {
        workspaceId,
        etapa: 'nuevo',
        createdAt: { gte: twoDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Contacts in negociacion or propuesta stage
    const closingContacts = await db.contact.findMany({
      where: {
        workspaceId,
        etapa: { in: ['negociacion', 'propuesta'] },
      },
      orderBy: { valorMensual: 'desc' },
      take: 10,
    });

    // Build context for AI prioritization
    const buildContactSummary = (contacts: typeof untouchedContacts, label: string) => {
      if (contacts.length === 0) return `${label}: Ninguno`;
      return `${label}:\n${contacts
        .map(
          (c) =>
            `  - ${c.nombre} (${c.empresa || 'sin empresa'}) | Etapa: ${c.etapa} | Score: ${c.scoreIa} | Valor: $${c.valorMensual} | Última actualización: ${new Date(c.updatedAt).toLocaleDateString('es-ES')}`
        )
        .join('\n')}`;
    };

    const contextForAI = `
CONTACTOS SIN SEGUIMIENTO (>3 días):
${buildContactSummary(untouchedContacts, 'Sin seguimiento')}

LEADS CALIENTES:
${buildContactSummary(hotLeads, 'Leads calientes')}

CONTACTOS NUEVOS SIN SEGUIMIENTO:
${buildContactSummary(newUnfollowedContacts, 'Nuevos sin seguimiento')}

CONTACTOS EN ETAPA DE CIERRE:
${buildContactSummary(closingContacts, 'En cierre')}
`.trim();

    // Use AI to rank and suggest actions
    const zai = await getZAI();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Eres un asistente de CRM experto para la plataforma DigiActiva. Analiza los contactos proporcionados y genera una lista priorizada de acciones diarias. Para cada acción, indica:
1. Prioridad (ALTA, MEDIA, BAJA)
2. Contacto
3. Acción recomendada
4. Razón

Devuelve la respuesta en formato JSON como un array de objetos con: { prioridad, contactoId, contactoNombre, accion, razon, urgencia (1-5) }
Responde SOLO con el JSON válido, sin texto adicional.`,
        },
        {
          role: 'user',
          content: contextForAI,
        },
      ],
    });

    let priorities;
    const rawContent =
      completion?.choices?.[0]?.message?.content ||
      completion?.content ||
      (typeof completion === 'string' ? completion : JSON.stringify(completion));

    try {
      // Try to extract JSON from the response
      const jsonMatch = String(rawContent).match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        priorities = JSON.parse(jsonMatch[0]);
      } else {
        priorities = [];
      }
    } catch {
      priorities = [];
    }

    // If AI parsing failed, build fallback priorities
    if (!Array.isArray(priorities) || priorities.length === 0) {
      priorities = [];

      // Hot leads first
      for (const c of hotLeads.slice(0, 3)) {
        priorities.push({
          prioridad: 'ALTA',
          contactoId: c.id,
          contactoNombre: c.nombre,
          accion: `Seguimiento inmediato - Lead caliente (Score: ${c.scoreIa})`,
          razon: 'Alta probabilidad de cierre',
          urgencia: 5,
        });
      }

      // Closing contacts
      for (const c of closingContacts.slice(0, 3)) {
        priorities.push({
          prioridad: 'ALTA',
          contactoId: c.id,
          contactoNombre: c.nombre,
          accion: `Avanzar negociación - Etapa: ${c.etapa}`,
          razon: 'En etapa de cierre, necesita atención',
          urgencia: 4,
        });
      }

      // New unfollowed
      for (const c of newUnfollowedContacts.slice(0, 3)) {
        priorities.push({
          prioridad: 'MEDIA',
          contactoId: c.id,
          contactoNombre: c.nombre,
          accion: 'Primer seguimiento - Contacto nuevo sin respuesta',
          razon: 'Contacto nuevo necesita primer contacto',
          urgencia: 3,
        });
      }

      // Untouched
      for (const c of untouchedContacts.slice(0, 3)) {
        priorities.push({
          prioridad: 'MEDIA',
          contactoId: c.id,
          contactoNombre: c.nombre,
          accion: 'Reactivar contacto - Sin seguimiento >3 días',
          razon: 'Contacto olvidado necesita reactivación',
          urgencia: 2,
        });
      }
    }

    // Sort by urgency
    priorities.sort((a: { urgencia?: number }, b: { urgencia?: number }) => (b.urgencia || 0) - (a.urgencia || 0));

    // Log to AiLog
    await db.aiLog.create({
      data: {
        workspaceId,
        tipo: 'priorities',
        contactId: null,
        model: 'z-ai',
        tokens: 0,
        contenido: JSON.stringify(priorities).substring(0, 5000),
      },
    });

    return NextResponse.json({
      priorities,
      stats: {
        untouchedCount: untouchedContacts.length,
        hotLeadsCount: hotLeads.length,
        newUnfollowedCount: newUnfollowedContacts.length,
        closingCount: closingContacts.length,
      },
    });
  } catch (error) {
    console.error('Error generating AI priorities:', error);
    return NextResponse.json(
      { error: 'Error al generar prioridades con IA' },
      { status: 500 }
    );
  }
}
