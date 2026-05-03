import { NextResponse } from 'next/server';

// GET /api/health — PUBLIC diagnostic endpoint
export async function GET() {
  const checks: Record<string, { status: string; details?: string }> = {};

  // Check 1: Database connection
  try {
    const { db } = await import('@/lib/db');
    await db.workspace.findFirst({ take: 1 });
    checks.database = { status: 'ok' };
  } catch (dbError) {
    checks.database = { status: 'error', details: (dbError as Error).message };
  }

  // Check 2: ZAI SDK
  try {
    const { getZAI } = await import('@/lib/zai');
    const zai = await getZAI();
    if (zai) {
      checks.zai = { status: 'ok', details: 'ZAI SDK initialized' };
    } else {
      checks.zai = { status: 'error', details: 'ZAI instance is null' };
    }
  } catch (zaiError) {
    checks.zai = { status: 'error', details: (zaiError as Error).message };
  }

  // Check 3: ZAI environment variables
  const zaiBaseUrl = process.env.ZAI_BASE_URL;
  const zaiApiKey = process.env.ZAI_API_KEY;
  checks.zai_env = {
    status: zaiBaseUrl && zaiApiKey ? 'ok' : 'missing',
    details: `ZAI_BASE_URL: ${zaiBaseUrl ? 'set' : 'missing'}, ZAI_API_KEY: ${zaiApiKey ? 'set' : 'missing'}`,
  };

  // Check 4: PostgreSQL environment variables
  const postgresUrl = process.env.POSTGRES_URL;
  const postgresUrlNoSsl = process.env.POSTGRES_URL_NO_SSL;
  const databaseUrl = process.env.DATABASE_URL;
  checks.postgres_env = {
    status: postgresUrl ? 'ok' : 'missing',
    details: `POSTGRES_URL: ${postgresUrl ? 'set' : 'missing'}, POSTGRES_URL_NO_SSL: ${postgresUrlNoSsl ? 'set' : 'missing'}, DATABASE_URL: ${databaseUrl ? 'set' : 'missing'}`,
  };

  // Check 5: OpenAI env key
  const openaiKey = process.env.OPENAI_API_KEY;
  checks.openai_env = {
    status: openaiKey ? 'ok' : 'not_set',
    details: openaiKey ? 'Key is set' : 'No OPENAI_API_KEY env var',
  };

  // Check 6: JWT secret
  const jwtSecret = process.env.JWT_SECRET;
  checks.jwt = {
    status: jwtSecret ? 'ok' : 'missing',
    details: jwtSecret ? 'JWT_SECRET is set' : 'JWT_SECRET is missing - auth will fail!',
  };

  // Check 7: Composio
  const composioKey = process.env.COMPOSIO_API_KEY;
  checks.composio = {
    status: composioKey ? 'ok' : 'not_set',
    details: composioKey ? 'API key is set' : 'No COMPOSIO_API_KEY env var',
  };

  // Overall status
  const allOk = Object.values(checks).every(c => c.status === 'ok' || c.status === 'not_set');
  const criticalOk = checks.database.status === 'ok' || checks.zai.status === 'ok';

  return NextResponse.json({
    status: allOk ? 'healthy' : criticalOk ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.2.0',
    environment: process.env.NODE_ENV || 'unknown',
    checks,
  });
}
