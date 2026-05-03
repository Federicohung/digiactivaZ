// z-ai-web-dev-sdk reads from .z-ai-config file, which doesn't exist in Vercel.
// This module creates the config dynamically from environment variables.
// In Vercel, set: ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_TOKEN, ZAI_USER_ID

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_FILENAME = '.z-ai-config';

export function ensureZaiConfig(): void {
  const configPaths = [
    path.join(process.cwd(), CONFIG_FILENAME),
    path.join(os.homedir(), CONFIG_FILENAME),
    '/etc/' + CONFIG_FILENAME,
  ];

  // Check if config already exists
  for (const filePath of configPaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);
      if (config.baseUrl && config.apiKey) {
        // Config exists, no need to create
        return;
      }
    } catch {
      // Continue to next path
    }
  }

  // No config found — create one from environment variables
  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;

  if (baseUrl && apiKey) {
    const config = {
      baseUrl,
      apiKey,
      chatId: process.env.ZAI_CHAT_ID || '',
      token: process.env.ZAI_TOKEN || '',
      userId: process.env.ZAI_USER_ID || '',
    };

    const configPath = path.join(process.cwd(), CONFIG_FILENAME);
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('[ZAI_CONFIG] Created .z-ai-config from environment variables');
    } catch (err) {
      console.warn('[ZAI_CONFIG] Could not write .z-ai-config:', (err as Error).message);
    }
  } else {
    console.warn('[ZAI_CONFIG] No ZAI_BASE_URL/ZAI_API_KEY env vars found. z-ai-web-dev-sdk will use default config file.');
  }
}
