import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import ZAI from 'z-ai-web-dev-sdk';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// POST /api/crm/ai/summary/[id] — Generate AI summary for a contact
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Fetch contact with recent data
    const contact = await db.contact.findFirst({
      where: { id, workspaceId: auth.activeWorkspaceId },
      include: {
        timeline: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!contact) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }

    // Fetch recent messages
    const recentMessages = await db.message.findMany({
      where: { contactId: id, workspaceId: auth.activeWorkspaceId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Build context for AI
    const contactInfo = `
Nombre: ${contact.nombre}
Empresa: ${contact.empresa || 'N/A'}
Email: ${contact.email || 'N/A'}
Teléfono: ${contact.telefono || 'N/A'}
Nicho: ${contact.nicho || 'N/A'}
Fuente: ${contact.fuente}
Etapa: ${contact.etapa}
Valor Mensual: $${contact.valorMensual}
Probabilidad de Cierre: ${contact.probabilidadCierre}%
Score IA: ${contact.scoreIa}
Notas: ${contact.notas || 'Sin notas'}
`.trim();

    const timelineInfo = contact.timeline.length > 0
      ? contact.timeline
          .map(
            (e) =>
              `[${new Date(e.createdAt).toLocaleDateString('es-ES')}] ${e.tipo}: ${e.descripcion}`
          )
          .join('\n')
      : 'Sin eventos de timeline';

    const messagesInfo = recentMessages.length > 0
      ? recentMessages
          .map(
            (m) =>
              `[${new Date(m.createdAt).toLocaleDateString('es-ES')}] ${m.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${m.content.substring(0, 200)}`
          )
          .join('\n')
      : 'Sin mensajes recientes';

    // Generate AI summary
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Eres un analista de CRM experto para la plataforma DigiActiva. Genera un resumen ejecutivo del estado de este lead en español. Incluye:
1. Estado actual del lead
2. Nivel de interés y engagement
3. Historial de interacciones clave
4. Probabilidad de cierre estimada (0-100%)
5. Recomendación de siguiente paso
6. Riesgos o alertas

Sé conciso pero informativo. Máximo 500 palabras.`,
        },
        {
          role: 'user',
          content: `Genera un resumen del estado de este lead:\n\nINFORMACIÓN DEL CONTACTO:\n${contactInfo}\n\nHISTORIAL DE TIMELINE:\n${timelineInfo}\n\nMENSAJES RECIENTES:\n${messagesInfo}`,
        },
      ],
    });

    const summary =
      completion?.choices?.[0]?.message?.content ||
      completion?.content ||
      (typeof completion === 'string' ? completion : JSON.stringify(completion));

    // Update contact AI summary
    await db.contact.update({
      where: { id },
      data: { aiSummary: String(summary) },
    });

    // Create timeline event
    await db.timelineEvent.create({
      data: {
        workspaceId: auth.activeWorkspaceId,
        contactId: id,
        tipo: 'ai_summary',
        descripcion: 'Resumen IA generado',
        metadata: { summaryLength: String(summary).length },
      },
    });

    // Log to AiLog
    await db.aiLog.create({
      data: {
        workspaceId: auth.activeWorkspaceId,
        tipo: 'summary',
        contactId: id,
        model: 'z-ai',
        tokens: 0,
        contenido: String(summary).substring(0, 5000),
      },
    });

    return NextResponse.json({
      contactId: id,
      summary,
    });
  } catch (error) {
    console.error('Error generating AI summary:', error);
    return NextResponse.json(
      { error: 'Error al generar resumen con IA' },
      { status: 500 }
    );
  }
}
