import { NextResponse } from 'next/server';

// Available plans and their module configurations
const PLANS = [
  {
    id: 'essential',
    name: 'Essential',
    description: 'Ideal para negocios que comienzan con automatización básica',
    price: '49',
    currency: 'USD',
    period: 'mes',
    modules: {
      chat: true,
      whatsapp: false,
      crm: true,
      inbox: true,
      voice: false,
      copilot: false,
    },
    limits: {
      contacts: 500,
      messages: 2000,
      aiGenerations: 100,
      workspaces: 1,
    },
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Para negocios en crecimiento que necesitan más canales y IA',
    price: '99',
    currency: 'USD',
    period: 'mes',
    modules: {
      chat: true,
      whatsapp: true,
      crm: true,
      inbox: true,
      voice: false,
      copilot: true,
    },
    limits: {
      contacts: 5000,
      messages: 10000,
      aiGenerations: 500,
      workspaces: 3,
    },
  },
  {
    id: 'elite',
    name: 'Elite',
    description: 'Acceso completo con todos los canales y IA avanzada',
    price: '199',
    currency: 'USD',
    period: 'mes',
    modules: {
      chat: true,
      whatsapp: true,
      crm: true,
      inbox: true,
      voice: true,
      copilot: true,
    },
    limits: {
      contacts: -1, // unlimited
      messages: -1,
      aiGenerations: -1,
      workspaces: 10,
    },
  },
  {
    id: 'founder_full',
    name: 'Founder Full',
    description: 'Acceso completo para fundadores - todo incluido, sin límites',
    price: '0',
    currency: 'USD',
    period: 'lifetime',
    modules: {
      chat: true,
      whatsapp: true,
      crm: true,
      inbox: true,
      voice: true,
      copilot: true,
    },
    limits: {
      contacts: -1,
      messages: -1,
      aiGenerations: -1,
      workspaces: -1,
    },
  },
];

// GET /api/workspaces/plans — List available plans (public)
export async function GET() {
  try {
    return NextResponse.json(PLANS);
  } catch (error) {
    console.error('Error listing plans:', error);
    return NextResponse.json(
      { error: 'Error al obtener planes' },
      { status: 500 }
    );
  }
}
