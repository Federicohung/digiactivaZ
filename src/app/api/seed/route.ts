import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export async function GET() {
  try {
    // Check if founder admin already exists
    const existingAdmin = await db.user.findUnique({
      where: { email: 'founder@digiactiva.com' },
    });

    if (existingAdmin) {
      return NextResponse.json({
        ok: true,
        message: 'Seed already completed. Founder admin exists.',
        user: {
          id: existingAdmin.id,
          email: existingAdmin.email,
          name: existingAdmin.name,
          role: existingAdmin.role,
        },
      });
    }

    // Hash password
    const passwordHash = await hashPassword('digiactiva2025');

    // Create founder admin, demo workspace, and membership
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: 'founder@digiactiva.com',
          passwordHash,
          name: 'Founder Admin',
          role: 'founder_admin',
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: 'DigiActiva Demo',
          slug: 'demo',
          plan: 'founder_full',
          modules: JSON.stringify({
            chat: true,
            whatsapp: true,
            crm: true,
            inbox: true,
            voice: true,
            copilot: true,
          }),
          branding: JSON.stringify({
            color: '#10b981',
            nombre_negocio: 'DigiActiva',
          }),
          metaMensual: JSON.stringify({ meta: 5000000, periodo: '2025-01' }),
        },
      });

      await tx.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          role: 'admin',
        },
      });

      // Update user with active workspace
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          activeWorkspaceId: workspace.id,
          workspaceIds: JSON.stringify([workspace.id]),
        },
      });

      // ─── Demo Contacts ───
      const contactData = [
        { nombre: 'María González', empresa: 'Clínica Estética Glow', email: 'maria@clinicaglow.cl', telefono: '+56912345678', nicho: 'clínica_estética', fuente: 'web_chat', etapa: 'nuevo', valorMensual: 450000, probabilidadCierre: 30, scoreIa: 65 },
        { nombre: 'Carlos Muñoz', empresa: 'Restaurante Sabores', email: 'carlos@sabores.cl', telefono: '+56923456789', nicho: 'restaurante', fuente: 'whatsapp', etapa: 'contactado', valorMensual: 320000, probabilidadCierre: 45, scoreIa: 72 },
        { nombre: 'Ana Rodríguez', empresa: 'Inmobiliaria CasaPerfecta', email: 'ana@casaperfecta.cl', telefono: '+56934567890', nicho: 'inmobiliaria', fuente: 'manual', etapa: 'calificado', valorMensual: 890000, probabilidadCierre: 60, scoreIa: 85 },
        { nombre: 'Pedro Silva', empresa: 'Abogados Silva & Asociados', email: 'pedro@silvaabogados.cl', telefono: '+56945678901', nicho: 'abogado', fuente: 'web_chat', etapa: 'propuesta', valorMensual: 750000, probabilidadCierre: 75, scoreIa: 88 },
        { nombre: 'Laura Fernández', empresa: 'Academia Aprende+', email: 'laura@academiaaprende.cl', telefono: '+56956789012', nicho: 'academia', fuente: 'instagram', etapa: 'negociacion', valorMensual: 280000, probabilidadCierre: 85, scoreIa: 91 },
        { nombre: 'Diego Torres', empresa: 'Ferretería El Clavo', email: 'diego@ferreteriaclavo.cl', telefono: '+56967890123', nicho: 'negocio_local', fuente: 'whatsapp', etapa: 'cerrado', valorMensual: 195000, probabilidadCierre: 100, scoreIa: 95 },
        { nombre: 'Valentina Díaz', empresa: 'Spa Relajarte', email: 'valentina@sparelajarte.cl', telefono: '+56978901234', nicho: 'clínica_estética', fuente: 'web_chat', etapa: 'nuevo', valorMensual: 380000, probabilidadCierre: 20, scoreIa: 45 },
        { nombre: 'Jorge Ramírez', empresa: 'Pizzería Napoli', email: 'jorge@pizzerianapoli.es', telefono: '+34612345678', nicho: 'restaurante', fuente: 'messenger', etapa: 'contactado', valorMensual: 220000, probabilidadCierre: 40, scoreIa: 58 },
        { nombre: 'Isabel Navarro', empresa: 'Centro Médico Vida', email: 'isabel@cmvida.es', telefono: '+34623456789', nicho: 'clínica_estética', fuente: 'web_chat', etapa: 'calificado', valorMensual: 950000, probabilidadCierre: 55, scoreIa: 78 },
        { nombre: 'Roberto Vega', empresa: 'Vega Inversiones', email: 'roberto@vegainv.cl', telefono: '+56989012345', nicho: 'inmobiliaria', fuente: 'manual', etapa: 'propuesta', valorMensual: 1200000, probabilidadCierre: 70, scoreIa: 82 },
        { nombre: 'Camila Rojas', empresa: 'Estudio Jurídico Rojas', email: 'camila@estudiorojas.cl', telefono: '+56990123456', nicho: 'abogado', fuente: 'whatsapp', etapa: 'nuevo', valorMensual: 550000, probabilidadCierre: 25, scoreIa: 55 },
        { nombre: 'Felipe Mora', empresa: 'Gym PowerFit', email: 'felipe@gypowerfit.cl', telefono: '+56901234567', nicho: 'academia', fuente: 'web_chat', etapa: 'contactado', valorMensual: 180000, probabilidadCierre: 35, scoreIa: 50 },
      ];

      const contacts = [];
      for (const c of contactData) {
        const contact = await tx.contact.create({
          data: {
            workspaceId: workspace.id,
            nombre: c.nombre,
            empresa: c.empresa,
            email: c.email,
            telefono: c.telefono,
            nicho: c.nicho,
            fuente: c.fuente,
            etapa: c.etapa,
            valorMensual: c.valorMensual,
            probabilidadCierre: c.probabilidadCierre,
            scoreIa: c.scoreIa,
          },
        });
        contacts.push(contact);

        // Create timeline event for each contact
        await tx.timelineEvent.create({
          data: {
            workspaceId: workspace.id,
            contactId: contact.id,
            tipo: 'nota',
            descripcion: `Contacto creado: ${contact.nombre} - ${contact.empresa}`,
            metadata: JSON.stringify({ action: 'contact_created', fuente: contact.fuente }),
          },
        });
      }

      // ─── Demo Conversations with Messages ───
      for (let i = 0; i < Math.min(6, contacts.length); i++) {
        const contact = contacts[i];
        const channel = ['web_chat', 'whatsapp', 'web_chat', 'messenger', 'whatsapp', 'web_chat'][i];

        const conversation = await tx.conversation.create({
          data: {
            workspaceId: workspace.id,
            contactId: contact.id,
            channel,
            provider: 'native',
            status: i < 4 ? 'open' : 'closed',
            unreadCount: i < 3 ? Math.floor(Math.random() * 4) + 1 : 0,
            lastMessagePreview: [
              'Hola, me interesa conocer más sobre sus servicios',
              '¿Cuáles son los precios del plan Premium?',
              'Necesito agendar una reunión para la próxima semana',
              'Gracias por la información, lo voy a pensar',
              'Perfecto, confirmo la reunión del viernes',
              'Me gustaría saber sobre la integración con WhatsApp',
            ][i],
            lastMessageAt: new Date(Date.now() - i * 3600000),
            tags: JSON.stringify(['lead', channel === 'whatsapp' ? 'whatsapp' : 'web']),
          },
        });

        // Create some messages for each conversation
        const messagePairs = [
          [
            { direction: 'inbound', content: `Hola, soy ${contact.nombre} de ${contact.empresa}. Me interesa conocer más sobre sus servicios de automatización.` },
            { direction: 'outbound', content: `¡Hola ${contact.nombre}! Gracias por contactarnos. Con gusto te cuento más sobre nuestras soluciones. ¿Cuál es tu principal necesidad actualmente?` },
          ],
          [
            { direction: 'inbound', content: '¿Cuáles son los precios del plan Premium y qué incluye exactamente?' },
            { direction: 'outbound', content: 'El plan Premium incluye chat IA, CRM completo, WhatsApp Business y Copiloto IA. El precio es desde $199.000 CLP/mes. ¿Te gustaría una demo personalizada?' },
          ],
          [
            { direction: 'inbound', content: 'Necesito agendar una reunión para la próxima semana para ver la plataforma en vivo.' },
            { direction: 'outbound', content: '¡Claro! Podemos agendar una videollamada de 30 minutos. ¿Qué día y horario te funciona mejor?' },
          ],
        ];

        for (const pair of messagePairs.slice(0, i < 3 ? 2 : 1)) {
          for (const msg of pair) {
            await tx.message.create({
              data: {
                workspaceId: workspace.id,
                contactId: contact.id,
                channel,
                direction: msg.direction,
                content: msg.content,
                conversationId: conversation.id,
                metadata: JSON.stringify({}),
                status: 'delivered',
              },
            });
          }
        }
      }

      // ─── Demo Chat Sessions ───
      for (let i = 0; i < 4; i++) {
        const contact = contacts[i];
        await tx.chatSession.create({
          data: {
            workspaceId: workspace.id,
            contactId: contact.id,
            source: i % 2 === 0 ? 'web_chat' : 'whatsapp',
            status: i < 3 ? 'active' : 'closed',
            messages: JSON.stringify([
              { role: 'user', content: `Hola, necesito información sobre sus servicios`, timestamp: new Date(Date.now() - 86400000).toISOString() },
              { role: 'assistant', content: `¡Hola! Soy el asistente virtual de DigiActiva. Con gusto te ayudo. ¿Qué tipo de negocio tienes?`, timestamp: new Date(Date.now() - 86300000).toISOString() },
              { role: 'user', content: `Tengo un negocio de ${contact.empresa}`, timestamp: new Date(Date.now() - 86200000).toISOString() },
              { role: 'assistant', content: `¡Excelente! Para negocios como el tuyo, nuestro plan Premium es ideal. Incluye chat IA, CRM y WhatsApp Business. ¿Te gustaría saber más?`, timestamp: new Date(Date.now() - 86100000).toISOString() },
            ]),
            leadData: JSON.stringify({ nombre: contact.nombre, empresa: contact.empresa, email: contact.email }),
          },
        });
      }

      return { user: updatedUser, workspace, contactsCount: contacts.length };
    });

    return NextResponse.json({
      ok: true,
      message: 'Seed completed successfully!',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      workspace: {
        id: result.workspace.id,
        name: result.workspace.name,
        slug: result.workspace.slug,
        plan: result.workspace.plan,
      },
      contactsCount: result.contactsCount,
    });
  } catch (error) {
    console.error('[SEED_API_ERROR]', error);
    return NextResponse.json(
      { error: 'Seed failed', details: String(error) },
      { status: 500 }
    );
  }
}
