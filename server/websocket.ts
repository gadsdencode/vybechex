import { WebSocket, WebSocketServer } from 'ws';
import { parse } from 'url';
import type { Server } from 'http';
import type { SelectUser } from '@db/schema';
import { db } from '@db';
import { messages } from '@db/schema';
import { eq } from 'drizzle-orm';

interface ChatMessage {
  type: 'message';
  matchId: number;
  content: string;
}

interface ExtendedWebSocket extends WebSocket {
  userId?: number;
  matchId?: number;
}

// Store active connections
const connections = new Map<number, ExtendedWebSocket[]>();

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    // Skip Vite HMR connections
    const protocol = request.headers['sec-websocket-protocol'];
    if (protocol === 'vite-hmr') {
      return;
    }

    const { pathname, query } = parse(request.url || '', true);
    if (pathname === '/ws/chat') {
      // Authenticate the connection
      const userId = parseInt(query.userId as string);
      const matchId = parseInt(query.matchId as string);

      if (isNaN(userId) || isNaN(matchId)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const extWs = ws as ExtendedWebSocket;
        extWs.userId = userId;
        extWs.matchId = matchId;
        wss.emit('connection', extWs);
      });
    }
  });

  // Handle new connections
  wss.on('connection', (ws: ExtendedWebSocket) => {
    const { userId, matchId } = ws;
    if (!userId || !matchId) return;

    // Store connection
    if (!connections.has(matchId)) {
      connections.set(matchId, []);
    }
    connections.get(matchId)?.push(ws);

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as ChatMessage;
        if (message.type !== 'message') return;

        // Store message in database
        const [savedMessage] = await db
          .insert(messages)
          .values({
            matchId: message.matchId,
            senderId: userId,
            content: message.content,
          })
          .returning();

        // Broadcast to all users in the match
        const matchConnections = connections.get(message.matchId) || [];
        const outgoingMessage = JSON.stringify({
          type: 'message',
          message: savedMessage,
        });

        matchConnections.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(outgoingMessage);
          }
        });
      } catch (error) {
        console.error('Error processing message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      const matchConnections = connections.get(matchId);
      if (matchConnections) {
        const index = matchConnections.indexOf(ws);
        if (index !== -1) {
          matchConnections.splice(index, 1);
        }
        if (matchConnections.length === 0) {
          connections.delete(matchId);
        }
      }
    });
  });

  return wss;
}
