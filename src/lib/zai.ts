// z-ai-web-dev-sdk helper that works both locally and on Vercel
// Locally: reads from /etc/.z-ai-config (automatic via ZAI.create())
// Vercel: constructs ZAI instance from environment variables

import ZAI from 'z-ai-web-dev-sdk';

let _zaiInstance: InstanceType<typeof ZAI> | null = null;

export async function getZAI(): Promise<InstanceType<typeof ZAI>> {
  if (_zaiInstance) return _zaiInstance;

  // Check if environment variables are set (Vercel production)
  const envBaseUrl = process.env.ZAI_BASE_URL;
  const envApiKey = process.env.ZAI_API_KEY;

  if (envBaseUrl && envApiKey) {
    _zaiInstance = new ZAI({
      baseUrl: envBaseUrl,
      apiKey: envApiKey,
      chatId: process.env.ZAI_CHAT_ID || '',
      token: process.env.ZAI_TOKEN || '',
      userId: process.env.ZAI_USER_ID || '',
    });
    console.log('[ZAI] Created instance from environment variables');
    return _zaiInstance;
  }

  // Fallback: use ZAI.create() which reads from .z-ai-config file
  _zaiInstance = await ZAI.create();
  return _zaiInstance;
}
