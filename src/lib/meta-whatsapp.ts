// Meta WhatsApp Business API Integration for DigiActiva
// Direct integration with Meta's WhatsApp Cloud API (v21.0)
// Bypasses Composio and connects directly to Meta's API endpoints.

// ─── Types ───

export interface WhatsAppIncomingMessage {
  from: string;          // Phone number of sender
  messageId: string;     // wa_id
  text: string;          // Message text
  timestamp: string;     // Unix timestamp
  profileName?: string;  // Sender's WhatsApp profile name
  type: string;          // 'text', 'image', 'document', etc.
  phoneNumberId?: string; // The phone_number_id that received the message
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: {
          name: string;
        };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: string;
        text?: {
          body: string;
        };
        image?: {
          caption?: string;
          id: string;
          mime_type: string;
          sha256: string;
        };
        document?: {
          caption?: string;
          filename?: string;
          id: string;
          mime_type: string;
          sha256: string;
        };
        audio?: {
          id: string;
          mime_type: string;
          sha256: string;
        };
        video?: {
          id: string;
          mime_type: string;
          sha256: string;
        };
        sticker?: {
          id: string;
          mime_type: string;
          sha256: string;
        };
        location?: {
          latitude: number;
          longitude: number;
          name?: string;
          address?: string;
        };
        contacts?: Array<{
          name: {
            formatted_name: string;
            first_name?: string;
          };
          phones: Array<{
            phone: string;
            type?: string;
            wa_id: string;
          }>;
        }>;
        interactive?: {
          type: string;
          button_reply?: {
            id: string;
            title: string;
          };
          list_reply?: {
            id: string;
            title: string;
            description?: string;
          };
        };
        context?: {
          forwarded?: boolean;
          frequently_forwarded?: boolean;
          from: string;
          id: string;
          referred_product?: {
            catalog_id: string;
            product_retailer_id: string;
          };
        };
        referral?: {
          head_text?: string;
          body: string;
          source_url: string;
          source_type: string;
          source_id: string;
          media_id?: string;
          media_type?: string;
          thumbnail_url?: string;
          video_url?: string;
        };
        reaction?: {
          emoji: string;
          message_id: string;
        };
      }>;
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
        conversation?: {
          id: string;
          origin?: {
            type: string;
          };
          expiration_timestamp?: string;
        };
        pricing?: {
          billable: boolean;
          pricing_model: string;
          category: string;
        };
        errors?: Array<{
          code: number;
          title: string;
          message: string;
          error_data?: {
            details: string;
          };
        }>;
      }>;
    };
    field: string;
  }>;
}

// ─── Webhook Verification ───

/**
 * Verify webhook (GET) — responds to Meta's verification challenge.
 * During setup, Meta sends a GET request with hub.mode=subscribe,
 * hub.verify_token, and hub.challenge.
 * If the verify_token matches, respond with the challenge value.
 */
export function verifyMetaWebhook(
  mode: string,
  token: string,
  challenge: string,
  verifyToken: string
): { status: number; body: string } {
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[META_WHATSAPP] Webhook verified successfully');
    return { status: 200, body: challenge };
  }
  console.warn('[META_WHATSAPP] Webhook verification failed', { mode, token: token?.substring(0, 5) + '...' });
  return { status: 403, body: 'Forbidden' };
}

// ─── Webhook Parsing ───

/**
 * Process incoming webhook (POST) — parses Meta's WhatsApp message webhook payload.
 * Extracts messages from the webhook body and returns them in a normalized format.
 */
export function parseWhatsAppWebhook(body: any): WhatsAppIncomingMessage[] {
  const messages: WhatsAppIncomingMessage[] = [];

  if (!body?.entry || !Array.isArray(body.entry)) {
    return messages;
  }

  for (const entry of body.entry as WhatsAppWebhookEntry[]) {
    if (!entry.changes || !Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      if (!change.value?.messages) continue;

      const phoneNumberId = change.value.metadata?.phone_number_id || '';

      for (const msg of change.value.messages) {
        // Extract text content based on message type
        let text = '';
        if (msg.type === 'text' && msg.text?.body) {
          text = msg.text.body;
        } else if (msg.type === 'image' && msg.image?.caption) {
          text = `[Imagen] ${msg.image.caption}`;
        } else if (msg.type === 'document' && msg.document?.caption) {
          text = `[Documento: ${msg.document.filename || 'archivo'}] ${msg.document.caption}`;
        } else if (msg.type === 'document') {
          text = `[Documento: ${msg.document?.filename || 'archivo'}]`;
        } else if (msg.type === 'image') {
          text = '[Imagen]';
        } else if (msg.type === 'audio') {
          text = '[Audio]';
        } else if (msg.type === 'video') {
          text = '[Video]';
        } else if (msg.type === 'sticker') {
          text = '[Sticker]';
        } else if (msg.type === 'location' && msg.location) {
          text = `[Ubicación: ${msg.location.name || `${msg.location.latitude}, ${msg.location.longitude}`}]`;
        } else if (msg.type === 'contacts' && msg.contacts) {
          const names = msg.contacts.map(c => c.name?.formatted_name || 'Sin nombre').join(', ');
          text = `[Contacto: ${names}]`;
        } else if (msg.type === 'interactive' && msg.interactive) {
          if (msg.interactive.button_reply) {
            text = msg.interactive.button_reply.title;
          } else if (msg.interactive.list_reply) {
            text = msg.interactive.list_reply.title;
          } else {
            text = '[Interactivo]';
          }
        } else if (msg.type === 'reaction' && msg.reaction) {
          text = `[Reacción: ${msg.reaction.emoji}]`;
        } else {
          text = `[${msg.type}]`;
        }

        // Extract profile name from contacts array
        const profileName = change.value.contacts?.find(c => c.wa_id === msg.from)?.profile?.name;

        messages.push({
          from: msg.from,
          messageId: msg.id,
          text,
          timestamp: msg.timestamp,
          profileName,
          type: msg.type,
          phoneNumberId,
        });
      }
    }
  }

  return messages;
}

// ─── Send Message ───

const META_API_VERSION = 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Send a text message via Meta WhatsApp Business API.
 */
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  text: string
): Promise<{ messageId: string }> {
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'text',
    text: {
      body: text,
    },
  };

  console.log(`[META_WHATSAPP] Sending message to ${recipientPhone} via phone_number_id ${phoneNumberId}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[META_WHATSAPP] Send message error:', JSON.stringify(data));
    throw new Error(
      `Meta WhatsApp API error: ${data?.error?.message || response.statusText} (code: ${data?.error?.code || response.status})`
    );
  }

  const messageId = data?.messages?.[0]?.id || '';
  console.log(`[META_WHATSAPP] Message sent successfully, id=${messageId}`);

  return { messageId };
}

// ─── Send Template Message ───

/**
 * Send a template message via Meta WhatsApp Business API.
 */
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  templateName: string,
  languageCode: string,
  components?: any[]
): Promise<{ messageId: string }> {
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      ...(components ? { components } : {}),
    },
  };

  console.log(`[META_WHATSAPP] Sending template "${templateName}" to ${recipientPhone}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[META_WHATSAPP] Send template error:', JSON.stringify(data));
    throw new Error(
      `Meta WhatsApp API error: ${data?.error?.message || response.statusText} (code: ${data?.error?.code || response.status})`
    );
  }

  const messageId = data?.messages?.[0]?.id || '';
  console.log(`[META_WHATSAPP] Template sent successfully, id=${messageId}`);

  return { messageId };
}

// ─── Mark Message as Read ───

/**
 * Mark a message as read via Meta WhatsApp Business API.
 */
export async function markWhatsAppMessageRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json();
      console.warn('[META_WHATSAPP] Mark as read error:', JSON.stringify(data));
    } else {
      console.log(`[META_WHATSAPP] Message ${messageId} marked as read`);
    }
  } catch (error) {
    console.warn('[META_WHATSAPP] Mark as read failed:', error);
  }
}

// ─── Verify Access Token (Test Connection) ───

/**
 * Verify that the access token is valid by making a simple API call.
 * Uses the /me endpoint to check token validity.
 */
export async function verifyMetaAccessToken(
  accessToken: string
): Promise<{ valid: boolean; businessName?: string; phoneNumberId?: string; error?: string }> {
  try {
    // First, verify the token itself
    const url = `${META_API_BASE}/me?fields=name&access_token=${accessToken}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return {
        valid: false,
        error: data?.error?.message || 'Token inválido',
      };
    }

    // If we have a phone number ID, try to get phone number details
    return {
      valid: true,
      businessName: data.name || undefined,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Error al verificar token',
    };
  }
}

/**
 * Get the phone numbers associated with a WhatsApp Business Account.
 */
export async function getWhatsAppPhoneNumbers(
  businessAccountId: string,
  accessToken: string
): Promise<Array<{ id: string; display_phone_number: string; verified_name?: string }>> {
  try {
    const url = `${META_API_BASE}/${businessAccountId}/phone_numbers?access_token=${accessToken}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('[META_WHATSAPP] Get phone numbers error:', JSON.stringify(data));
      return [];
    }

    return data?.data || [];
  } catch (error) {
    console.error('[META_WHATSAPP] Get phone numbers failed:', error);
    return [];
  }
}
