import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractBearerToken } from '@/lib/auth';
import { getComposio, getComposioUserId, getConnectedAccountId, executeComposioTool } from '@/lib/composio';
import { db } from '@/lib/db';

// Re-import tool constants since they're not exported
const FB_TOOLS = {
  LIST_PAGES: 'FACEBOOK_LIST_MANAGED_PAGES',
  GET_CONVERSATIONS: 'FACEBOOK_GET_PAGE_CONVERSATIONS',
  GET_MESSAGES: 'FACEBOOK_GET_CONVERSATION_MESSAGES',
} as const;

const IG_TOOLS = {
  LIST_CONVERSATIONS: 'INSTAGRAM_LIST_ALL_CONVERSATIONS',
  LIST_MESSAGES: 'INSTAGRAM_LIST_ALL_MESSAGES',
  GET_MESSENGER_PROFILE: 'INSTAGRAM_GET_MESSENGER_PROFILE',
} as const;

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload;
}

// GET /api/composio/debug — Debug endpoint to see raw Composio API responses
// Query: ?action=accounts|pages|conversations|messages|profile&toolkit=facebook|instagram
export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth || !auth.activeWorkspaceId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'accounts';
    const toolkit = searchParams.get('toolkit') || 'instagram';

    const composio = getComposio();
    const composioUserId = getComposioUserId(auth.activeWorkspaceId, auth.userId);

    // List all connected accounts
    if (action === 'accounts') {
      let allAccounts: unknown[] = [];
      try {
        const result = await composio.connectedAccounts.list({
          userIds: [composioUserId],
        });
        allAccounts = (result as Record<string, unknown>)?.items as unknown[] || [];
      } catch (e) {
        console.error('[DEBUG] Error listing accounts:', e);
      }

      let broadAccounts: unknown[] = [];
      try {
        const result = await composio.connectedAccounts.list({
          statuses: ['ACTIVE'],
        });
        broadAccounts = (result as Record<string, unknown>)?.items as unknown[] || [];
      } catch (e) {
        console.error('[DEBUG] Error listing broad accounts:', e);
      }

      // Also check DB connections
      const dbConnections = await db.composioConnection.findMany({
        where: { workspaceId: auth.activeWorkspaceId },
      });

      return NextResponse.json({
        composioUserId,
        userAccounts: JSON.parse(JSON.stringify(allAccounts).substring(0, 3000)),
        broadAccounts: JSON.parse(JSON.stringify(broadAccounts).substring(0, 3000)),
        dbConnections,
      });
    }

    // Get Facebook pages
    if (action === 'pages' && toolkit === 'facebook') {
      const connectedAccountId = await getConnectedAccountId(auth.activeWorkspaceId, auth.userId, 'facebook');
      if (!connectedAccountId) {
        return NextResponse.json({ error: 'No Facebook connection found' });
      }

      const result = await executeComposioTool(FB_TOOLS.LIST_PAGES, connectedAccountId, {}, composioUserId);
      return NextResponse.json({
        connectedAccountId,
        rawResult: JSON.parse(JSON.stringify(result).substring(0, 5000)),
      });
    }

    // Get Instagram profile
    if (action === 'profile' && toolkit === 'instagram') {
      const connectedAccountId = await getConnectedAccountId(auth.activeWorkspaceId, auth.userId, 'instagram');
      if (!connectedAccountId) {
        return NextResponse.json({ error: 'No Instagram connection found' });
      }

      const result = await executeComposioTool(IG_TOOLS.GET_MESSENGER_PROFILE, connectedAccountId, {}, composioUserId);
      return NextResponse.json({
        connectedAccountId,
        rawResult: JSON.parse(JSON.stringify(result).substring(0, 5000)),
      });
    }

    // Get conversations
    if (action === 'conversations') {
      const tk = toolkit as 'facebook' | 'instagram';
      const connectedAccountId = await getConnectedAccountId(auth.activeWorkspaceId, auth.userId, tk);
      if (!connectedAccountId) {
        return NextResponse.json({ error: `No ${toolkit} connection found` });
      }

      if (toolkit === 'facebook') {
        // First get pages
        const pagesResult = await executeComposioTool(FB_TOOLS.LIST_PAGES, connectedAccountId, {}, composioUserId);
        const pagesData = pagesResult as Record<string, unknown>;
        const pagesInner = (pagesData?.data as Record<string, unknown>)?.data;
        const pages = (Array.isArray(pagesInner) ? pagesInner : Array.isArray(pagesData?.data) ? pagesData.data : []) as Record<string, unknown>[];

        let convosResult = null;
        if (pages.length > 0) {
          const pageId = String(pages[0].id || pages[0].page_id || '');
          convosResult = await executeComposioTool(FB_TOOLS.GET_CONVERSATIONS, connectedAccountId, {
            page_id: pageId,
          }, composioUserId);
        }

        return NextResponse.json({
          connectedAccountId,
          pages: JSON.parse(JSON.stringify(pagesResult).substring(0, 3000)),
          conversations: convosResult ? JSON.parse(JSON.stringify(convosResult).substring(0, 5000)) : null,
        });
      } else {
        const convosResult = await executeComposioTool(IG_TOOLS.LIST_CONVERSATIONS, connectedAccountId, {}, composioUserId);
        return NextResponse.json({
          connectedAccountId,
          rawResult: JSON.parse(JSON.stringify(convosResult).substring(0, 5000)),
        });
      }
    }

    // Get messages for a specific conversation
    if (action === 'messages') {
      const tk = toolkit as 'facebook' | 'instagram';
      const connectedAccountId = await getConnectedAccountId(auth.activeWorkspaceId, auth.userId, tk);
      const conversationId = searchParams.get('conversation_id');

      if (!connectedAccountId) {
        return NextResponse.json({ error: `No ${toolkit} connection found` });
      }

      if (!conversationId) {
        return NextResponse.json({ error: 'Provide conversation_id parameter' });
      }

      if (toolkit === 'facebook') {
        const msgsResult = await executeComposioTool(FB_TOOLS.GET_MESSAGES, connectedAccountId, {
          conversation_id: conversationId,
        }, composioUserId);
        return NextResponse.json({
          connectedAccountId,
          rawResult: JSON.parse(JSON.stringify(msgsResult).substring(0, 5000)),
        });
      } else {
        const msgsResult = await executeComposioTool(IG_TOOLS.LIST_MESSAGES, connectedAccountId, {
          conversation_id: conversationId,
        }, composioUserId);
        return NextResponse.json({
          connectedAccountId,
          rawResult: JSON.parse(JSON.stringify(msgsResult).substring(0, 5000)),
        });
      }
    }

    return NextResponse.json({ error: 'Unknown action. Use: accounts, pages, conversations, messages, profile' });
  } catch (error) {
    console.error('[COMPOSIO_DEBUG_ERROR]', error);
    return NextResponse.json(
      { error: 'Debug error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
