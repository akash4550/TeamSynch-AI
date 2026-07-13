import { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { verifyAccessToken } from '../../core/security/jwt';
import { authService } from '../auth/auth.service';
import { DocumentService } from './document.service';
import { logger } from '../../core/utils/logger';
import { hasPermission } from '../../core/middlewares/rbacMiddleware';
import { PERMISSIONS } from '../../core/auth/permissions';

interface RoomSession {
  roomName: string;
  organizationId: string;
  documentId: string;
  doc: Y.Doc;
  sockets: Map<WebSocket, { userId: string; name: string; color: string }>;
}

export class CRDTServer {
  private wss: WebSocketServer | null = null;
  private rooms = new Map<string, RoomSession>();
  private documentService = new DocumentService();

  initialize(httpServer: HttpServer) {
    this.wss = new WebSocketServer({
      noServer: true,
      path: '/api/v1/realtime/documents/crdt',
    });

    httpServer.on('upgrade', async (request, socket, head) => {
      if (request.url?.startsWith('/api/v1/realtime/documents/crdt')) {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', async (ws: WebSocket, req) => {
      try {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        const documentId = url.searchParams.get('documentId');

        if (!token || !documentId) {
          ws.close(4001, 'Unauthorized: Missing auth token or documentId');
          return;
        }

        const claims = verifyAccessToken(token);
        const identity = await authService.loadAuthoritativeIdentity(claims.sub, claims.organizationId);

        // Assert user has document read & update permissions
        const canEdit = hasPermission(identity as any, PERMISSIONS.DOCUMENT.UPDATE);
        if (!canEdit) {
          ws.close(4030, 'Forbidden: Insufficient document edit permissions');
          return;
        }

        const organizationId = identity.organizationId;
        const roomName = `org_${organizationId}:doc_${documentId}`;

        // Get or initialize tenant-isolated room session with an authoritative Y.Doc instance
        let room = this.rooms.get(roomName);
        if (!room) {
          const doc = new Y.Doc();
          const snapshot = await this.documentService.loadDocumentSnapshot(organizationId, documentId);
          if (snapshot && snapshot.length > 0) {
            Y.applyUpdate(doc, new Uint8Array(snapshot));
          }

          room = {
            roomName,
            organizationId,
            documentId,
            doc,
            sockets: new Map(),
          };
          this.rooms.set(roomName, room);
        }

        const userColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
        room.sockets.set(ws, {
          userId: identity.id,
          name: `${identity.id.slice(0, 6)}`,
          color: userColor,
        });

        logger.info(`[CRDTServer] Socket connected to Yjs room ${roomName}`);

        // Send full Yjs document state vector to newly connected socket
        const initialStateUpdate = Y.encodeStateAsUpdate(room.doc);
        ws.send(Buffer.from(initialStateUpdate));

        // Handle incoming Yjs update deltas from client
        ws.on('message', (message: Buffer) => {
          if (!room) return;

          try {
            const update = new Uint8Array(message);
            // Cryptographically merge operational transformation delta into authoritative Y.Doc
            Y.applyUpdate(room.doc, update);

            // Broadcast merged CRDT update delta to all other connected room peers
            for (const [clientWs] of room.sockets) {
              if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(message);
              }
            }
          } catch (err: any) {
            logger.error(`[CRDTServer] Error applying Yjs update: ${err.message}`);
          }
        });

        ws.on('close', async () => {
          if (!room) return;
          room.sockets.delete(ws);

          // If room becomes empty, encode authoritative Y.Doc state & persist snapshot to PostgreSQL
          if (room.sockets.size === 0) {
            const snapshotBuffer = Buffer.from(Y.encodeStateAsUpdate(room.doc));
            await this.documentService.saveDocumentSnapshot(
              room.organizationId,
              room.documentId,
              snapshotBuffer
            );
            logger.info(`[CRDTServer] Persisted Yjs CRDT state snapshot for doc ${room.documentId}`);
            room.doc.destroy();
            this.rooms.delete(roomName);
          }
        });
      } catch (error: any) {
        logger.error(`[CRDTServer] Connection error: ${error.message}`);
        ws.close(4000, 'Authentication error');
      }
    });
  }
}
