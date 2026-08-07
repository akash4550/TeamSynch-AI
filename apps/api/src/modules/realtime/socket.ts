import { Server as HttpServer } from 'node:http';
import { Role } from '@prisma/client';
import { Server, Socket } from 'socket.io';

import { env } from '../../config/env';
import { logger } from '../../core/utils/logger';
import { verifyAccessToken } from '../../core/security/jwt';
import { authService } from '../auth/auth.service';

const AUTHENTICATION_ERROR = 'Authentication error';
const USER_ROOM_PREFIX = 'user:';
const ORGANIZATION_ROOM_PREFIX = 'organization:';

export interface SocketPrincipal {
  userId: string;
  organizationId: string;
  role: Role;
  accessTokenExpiresAt: number;
  tokenId: string;
}

interface AuthenticatedSocketData {
  principal?: SocketPrincipal;
}

export type AuthSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  AuthenticatedSocketData
>;

export const userRoom = (userId: string): string => `${USER_ROOM_PREFIX}${userId}`;
export const organizationRoom = (organizationId: string): string =>
  `${ORGANIZATION_ROOM_PREFIX}${organizationId}`;

let io: Server | undefined;

/*
 * BUG FIX (#72 — presence "offline" lie with multiple tabs/devices):
 * every socket connection announced `online` and every disconnect
 * announced `offline`, with no accounting for the user's OTHER live
 * sockets. A user with two open tabs who closed one was broadcast as
 * offline to the whole organization while actively working in the
 * surviving tab — and routine tab reloads flapped org-wide status.
 * Connections are now counted per user (in-memory is correct: this
 * deployment runs a single socket.io process with no Redis adapter), and
 * presence is announced only on genuine transitions: first live
 * connection → online, last disconnect → offline.
 */
const activeConnectionCounts = new Map<string, number>();

export const initializeSocket = (httpServer: HttpServer): Server => {
  const socketServer = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });
  io = socketServer;

  socketServer.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || token.length === 0) {
        logger.warn('Socket authentication rejected', { category: 'missing_access_token' });
        next(new Error(AUTHENTICATION_ERROR));
        return;
      }

      const claims = verifyAccessToken(token);
      const identity = await authService.loadAuthoritativeIdentity(
        claims.sub,
        claims.organizationId,
      );

      socket.data.principal = {
        userId: identity.id,
        organizationId: identity.organizationId,
        role: identity.role,
        accessTokenExpiresAt: claims.exp,
        tokenId: claims.jti,
      };
      next();
    } catch {
      logger.warn('Socket authentication rejected', { category: 'invalid_access_token' });
      next(new Error(AUTHENTICATION_ERROR));
    }
  });

  socketServer.on('connection', (socket: AuthSocket) => {
    const principal = socket.data.principal;
    if (!principal) {
      socket.disconnect(true);
      return;
    }

    const orgRoom = organizationRoom(principal.organizationId);
    const personalRoom = userRoom(principal.userId);

    /*
     * FEATURE (queued item #11 — presence roster snapshot-on-join): until
     * now, a freshly loaded page learned who is online ONLY from future
     * deltas — after a reload everyone looked offline until some user
     * happened to connect/disconnect, and colleagues never saw the
     * current truth (#72 made the deltas accurate; this makes the
     * baseline accurate too). After room join completes, the joining
     * socket — and only it — receives `presence.snapshot` with the
     * org room's current distinct userIds, read from the socket.io
     * adapter (the single source of room truth; no parallel bookkeeping
     * that could drift from #72's connection accounting, and self +
     * multi-tab duplicates collapse via the Set). Emission is
     * best-effort: a snapshot failure must never fail a handshake, so
     * errors are logged and swallowed.
     */
    // Promise.resolve(): Socket.join returns void under some adapters/
    // socket.io versions and a Promise under others — resolve() normalizes
    // both so the snapshot always fires strictly after the join lands.
    void Promise.resolve(socket.join([orgRoom, personalRoom])).then(async () => {
      try {
        const roomSockets = await socketServer.in(orgRoom).fetchSockets();
        const onlineUserIds = new Set<string>();
        for (const roomSocket of roomSockets) {
          const roomPrincipal = (roomSocket.data as AuthenticatedSocketData).principal;
          if (roomPrincipal?.userId) onlineUserIds.add(roomPrincipal.userId);
        }
        // Cast to base Socket: AuthSocket's emit map is Record<string, never>
        // (no server→client events declared); BroadcastOperator#to(...) is
        // permissive, but a direct socket.emit needs the widened type.
        (socket as Socket).emit('presence.snapshot', {
          users: [...onlineUserIds].map((userId) => ({
            userId,
            status: 'online' as const,
            lastSeen: new Date(),
          })),
          timestamp: new Date(),
        });
      } catch (error) {
        logger.warn('Presence snapshot emit skipped (best-effort)', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.info('Socket connected', { socketId: socket.id, userId: principal.userId });

    // BUG FIX (#72): only the user's FIRST live connection announces
    // `online` — additional tabs/devices must not re-announce.
    const liveConnections = (activeConnectionCounts.get(principal.userId) ?? 0) + 1;
    activeConnectionCounts.set(principal.userId, liveConnections);

    if (liveConnections === 1) {
      socket.to(orgRoom).emit('presence.status', {
        userId: principal.userId,
        status: 'online',
        timestamp: new Date(),
      });
    }

    const expiresInMs = Math.max(0, principal.accessTokenExpiresAt * 1000 - Date.now());
    const expirationTimer = setTimeout(() => socket.disconnect(true), expiresInMs);

    socket.once('disconnect', () => {
      clearTimeout(expirationTimer);

      // BUG FIX (#72): only the user's LAST remaining disconnect announces
      // `offline`; closing one of several tabs leaves them online.
      const remaining = (activeConnectionCounts.get(principal.userId) ?? 1) - 1;
      if (remaining <= 0) {
        activeConnectionCounts.delete(principal.userId);
        socket.to(orgRoom).emit('presence.status', {
          userId: principal.userId,
          status: 'offline',
          timestamp: new Date(),
        });
      } else {
        activeConnectionCounts.set(principal.userId, remaining);
      }
    });
  });

  return socketServer;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.io has not been initialized!');
  }
  return io;
};
