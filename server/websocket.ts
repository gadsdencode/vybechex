import { WebSocket, WebSocketServer } from 'ws';
import { parse } from 'url';
import type { Server } from 'http';
import type { SelectUser } from '@db/schema';
import { db } from '@db';
import { messages, matches } from '@db/schema';
import { eq, and, or } from 'drizzle-orm';

interface ChatMessage {
  type: 'message';
  matchId: number;
  content: string;
}

interface ExtendedWebSocket extends WebSocket {
  userId?: number;
  matchId?: number;
  isAlive: boolean;
}

// Store active connections
const connections = new Map<number, ExtendedWebSocket[]>();

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade
  server.on('upgrade', async (request, socket, head) => {
    try {
      // Skip Vite HMR connections
      const protocol = request.headers['sec-websocket-protocol'];
      if (protocol === 'vite-hmr') {
        return;
      }

      const { pathname, query } = parse(request.url || '', true);
      if (pathname === '/ws/chat') {
        const userId = parseInt(query.userId as string);
        const matchId = parseInt(query.matchId as string);

        if (isNaN(userId) || isNaN(matchId)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // Verify match exists and user has access
        try {
          const [match] = await db
            .select()
            .from(matches)
            .where(
              and(
                eq(matches.id, matchId),
                or(
                  eq(matches.userId1, userId),
                  eq(matches.userId2, userId)
                ),
                eq(matches.status, 'accepted')
              )
            )
            .limit(1);

          if (!match) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }

          wss.handleUpgrade(request, socket, head, (ws) => {
            const extWs = ws as ExtendedWebSocket;
            extWs.userId = userId;
            extWs.matchId = matchId;
            extWs.isAlive = true;
            wss.emit('connection', extWs);
          });
        } catch (error) {
          console.error('WebSocket upgrade error:', error);
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
        }
      }
    } catch (error) {
      console.error('WebSocket upgrade error:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  // Setup heartbeat
  const interval = setInterval(() => {
    const clients = Array.from(wss.clients) as ExtendedWebSocket[];
    clients.forEach((ws) => {
      if (!ws.isAlive) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  // Handle new connections
  wss.on('connection', (ws: ExtendedWebSocket) => {
    const { userId, matchId } = ws;
    if (!userId || !matchId) {
      ws.close(1008, 'Missing user or match information');
      return;
    }

    // Store connection
    if (!connections.has(matchId)) {
      connections.set(matchId, []);
    }
    connections.get(matchId)?.push(ws);

    // Setup pong handler for heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });

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
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Failed to process message',
          timestamp: new Date().toISOString()
        }));
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      ws.isAlive = false;
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

    // Send initial connection success
    ws.send(JSON.stringify({ 
      type: 'connected', 
      message: 'Successfully connected to chat',
      timestamp: new Date().toISOString()
    }));
  });

  return wss;
}