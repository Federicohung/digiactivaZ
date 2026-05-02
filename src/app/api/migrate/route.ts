import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/migrate — Run database migrations
// This adds the whatsappId column to Contact table
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // Add whatsappId column if it doesn't exist (safe, idempotent)
    await db.$executeRawUnsafe(`
      ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "whatsappId" TEXT;
    `);

    return NextResponse.json({ ok: true, message: 'Migration completed: whatsappId column added' });
  } catch (error) {
    console.error('Migration error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
