import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken, extractBearerToken } from '@/lib/auth';

/**
 * POST /api/leads - Create a new lead (public, for landing page)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nombre, email, telefono, servicioInteres } = body;

    if (!nombre || !email) {
      return NextResponse.json(
        { error: 'Nombre and email are required' },
        { status: 400 }
      );
    }

    const lead = await db.lead.create({
      data: {
        nombre: nombre.trim(),
        email: email.toLowerCase().trim(),
        telefono: telefono?.trim() || null,
        servicioInteres: servicioInteres?.trim() || null,
      },
    });

    return NextResponse.json({ ok: true, lead }, { status: 201 });
  } catch (error) {
    console.error('[LEADS_CREATE_ERROR]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/leads - List all leads (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Only founder_admin can list all leads
    if (payload.role !== 'founder_admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const leads = await db.lead.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ leads });
  } catch (error) {
    console.error('[LEADS_LIST_ERROR]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
