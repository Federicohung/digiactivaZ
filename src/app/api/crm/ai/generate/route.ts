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

const VALID_TIPOS = ['email', 'whatsapp_message', 'summary', 'score'] as const;
type TipoGeneracion = (typeof VALID_TIPOS)[number];

function getSystemPrompt(tipo: TipoGeneracion): string {
  switch (tipo) {
    case 'email':
      return `Eres un experto en ventas y redacción de emails profesionales en español. Genera un email persuasivo y profesional para el contacto dado. El email debe ser cordial, directo y orientado a generar una respuesta. Incluye asunto y cuerpo del mensaje. Formato: ASUNTO: ... \\n\\n CUERPO: ...`;
    case 'whatsapp_message':
      return `Eres un experto en ventas por WhatsApp en español. Genera un mensaje de WhatsApp corto, amigable y persuasivo para el contacto dado. El mensaje debe ser conversacional, directo y generar respuesta. Máximo 300 caracteres.`;
    case 'summary':
      return `Eres un analista de CRM experto. Genera un resumen conciso del estado del lead/contacto dado. Incluye: situación actual, nivel de interés, recomendación de siguiente paso, y probabilidad de cierre estimada.`;
    case 'score':
      return `Eres un analista de datos de CRM experto. Analiza la información del contacto y asigna un score del 0 al 100 que represente la probabilidad de cierre. Responde ÚNICAMENTE con un número entre 0 y 100, sin texto adicional.`;
    default:
      return 'Eres un asistente de CRM experto.';
  }
}

function buildUserPrompt(tipo: TipoGeneracion, context?: string, contact?: Record<string, unknown>): string {
  const contactInfo = contact
    ? `Nombre: ${contact.nombre || 'N/A'}\nEmpresa: ${contact.empresa || 'N/A'}\nEmail: ${contact.email || 'N/A'}\nTeléfono: ${contact.telefono || 'N/A'}\nNicho: ${contact.nicho || 'N/A'}\nFuente: ${contact.fuente || 'N/A'}\nEtapa: ${contact.etapa || 'N/A'}\nValor Mensual: ${contact.valorMensual || 0}\nProbabilidad de Cierre: ${contact.probabilidadCierre || 0}%\nScore IA: ${contact.scoreIa || 0}\nNotas: ${contact.notas || 'N/A'}`
    : '';

  const contextStr = context ? `\n\nContexto adicional: ${context}` : '';

  switch (tipo) {
    case 'email':
      return `Genera un email profesional para el siguiente contacto:\n\n${contactInfo}${contextStr}`;
    case 'whatsapp_message':
      return `Genera un mensaje de WhatsApp para el siguiente contacto:\n\n${contactInfo}${contextStr}`;
    case 'summary':
      return `Genera un resumen del estado de este lead:\n\n${contactInfo}${contextStr}`;
    case 'score':
      return `Analiza y asigna un score de probabilidad de cierre (0-100) para este contacto:\n\n${contactInfo}${contextStr}\n\nResponde SOLO con el número.`;
    default:
      return context || 'Genera contenido útil.';
  }
}

// POST /api/crm/ai/generate — AI content generation
export async function POST(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tipo, contactId, context } = body;

    if (!tipo || !VALID_TIPOS.includes(tipo)) {
      return NextResponse.json(
        { error: `Tipo inválido. Valores permitidos: ${VALID_TIPOS.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch contact data if contactId provided
    let contact: Record<string, unknown> | null = null;
    if (contactId) {
      const found = await db.contact.findFirst({
        where: { id: contactId, workspaceId: auth.activeWorkspaceId },
      });
      if (!found) {
        return NextResponse.json(
          { error: 'Contacto no encontrado' },
          { status: 404 }
        );
      }
      contact = found as unknown as Record<string, unknown>;
    }

    // Generate AI content
    const zai = await ZAI.create();
    const systemPrompt = getSystemPrompt(tipo as TipoGeneracion);
    const userPrompt = buildUserPrompt(tipo as TipoGeneracion, context, contact || undefined);

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const generatedContent =
      completion?.choices?.[0]?.message?.content ||
      completion?.content ||
      (typeof completion === 'string' ? completion : JSON.stringify(completion));

    // If tipo is 'score', try to update the contact's scoreIa
    let scoreValue: number | null = null;
    if (tipo === 'score' && contactId && contact) {
      const parsed = parseInt(String(generatedContent).trim(), 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        scoreValue = parsed;
        await db.contact.update({
          where: { id: contactId },
          data: { scoreIa: parsed },
        });
      }
    }

    // Log to AiLog
    await db.aiLog.create({
      data: {
        workspaceId: auth.activeWorkspaceId,
        tipo: `generate_${tipo}`,
        contactId: contactId || null,
        model: 'z-ai',
        tokens: 0,
        contenido: String(generatedContent).substring(0, 5000),
      },
    });

    const response: Record<string, unknown> = {
      tipo,
      content: generatedContent,
    };

    if (scoreValue !== null) {
      response.score = scoreValue;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error generating AI content:', error);
    return NextResponse.json(
      { error: 'Error al generar contenido con IA' },
      { status: 500 }
    );
  }
}
