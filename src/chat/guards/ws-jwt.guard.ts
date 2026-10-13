import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Socket } from 'socket.io';

/**
 * WebSocket JWT guard.
 *
 * Reads the bearer token from:
 *   1. client.handshake.auth.token  (socket.io auth object)
 *   2. client.handshake.headers.authorization  (Bearer <token>)
 *
 * On success, attaches the full user object to client.data.user so
 * the gateway can access it via `client.data.user`.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();

    this.logger.debug(
      `[WsJwtGuard] canActivate called for socket ${client.id} | handshake from ${client.handshake?.address}`,
    );

    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(
          `[WsJwtGuard] REJECTED socket ${client.id} — no token found in auth object or Authorization header`,
        );
        client.emit('error', { message: 'Authentication token is required' });
        client.disconnect(true);
        return false;
      }

      this.logger.debug(
        `[WsJwtGuard] Token extracted for socket ${client.id}, verifying...`,
      );

      const secret = this.configService.get<string>(
        'JWT_SECRET',
        'fallback-secret',
      );
      const payload = this.jwtService.verify(token, { secret });

      this.logger.debug(
        `[WsJwtGuard] Token valid for socket ${client.id} | sub=${payload.sub}`,
      );

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
        },
      });

      if (!user) {
        this.logger.warn(
          `[WsJwtGuard] REJECTED socket ${client.id} — user sub=${payload.sub} not found in DB`,
        );
        client.emit('error', {
          message: 'User not found or account deactivated',
        });
        client.disconnect(true);
        return false;
      }

      if (!user.isActive) {
        this.logger.warn(
          `[WsJwtGuard] REJECTED socket ${client.id} — user ${user.email} is deactivated`,
        );
        client.emit('error', {
          message: 'User not found or account deactivated',
        });
        client.disconnect(true);
        return false;
      }

      // Attach to socket data for use in gateway handlers
      client.data.user = user;
      this.logger.log(
        `[WsJwtGuard] ALLOWED socket ${client.id} — user=${user.email} role=${user.role}`,
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `[WsJwtGuard] REJECTED socket ${client.id} — JWT error: ${err?.message}`,
      );
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect(true);
      return false;
    }
  }

  private extractToken(client: Socket): string | undefined {
    // Try socket.io auth object first
    const authToken = client.handshake?.auth?.token as string | undefined;
    if (authToken) {
      this.logger.debug(
        `[WsJwtGuard] Token source: handshake.auth.token for socket ${client.id}`,
      );
      return authToken;
    }

    // Fallback: Authorization header
    const authHeader = client.handshake?.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      this.logger.debug(
        `[WsJwtGuard] Token source: Authorization header for socket ${client.id}`,
      );
      return authHeader.slice(7);
    }

    this.logger.debug(
      `[WsJwtGuard] No token found in auth object or Authorization header for socket ${client.id}`,
    );
    return undefined;
  }
}
