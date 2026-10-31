import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

const room = (userId: string) => `user:${userId}`;

/**
 * CLAUDE.md: WebSocket gateway at `/ws` for messages and notifications (Socket.IO, which
 * reconnects by itself on flaky mobile networks). Clients authenticate with their access
 * token in the handshake; each user joins a private room. The server only pushes: every
 * action still goes through the REST API and its guards.
 */
@WebSocketGateway({
  path: '/ws',
  cors: { origin: process.env.APP_URL ?? 'http://localhost:3000', credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() private server?: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = (client.handshake.auth as { token?: unknown })?.token;
    try {
      if (typeof token !== 'string') throw new Error('no token');
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, status: true, deletedAt: true } });
      if (!user || user.status !== 'active' || user.deletedAt) throw new Error('inactive');
      await client.join(room(user.id));
    } catch {
      client.emit('unauthorized');
      client.disconnect(true);
    }
  }

  /** Pushes an event to every open tab/device of one user. No-op when nobody is connected. */
  emitToUser(userId: string, event: string, data: unknown): void {
    this.server?.to(room(userId)).emit(event, data);
  }

  /** Suspended or deleted users lose their live connection at once. */
  disconnectUser(userId: string): void {
    this.server?.in(room(userId)).disconnectSockets(true);
    this.logger.log(`Disconnected sockets of ${userId}`);
  }
}
