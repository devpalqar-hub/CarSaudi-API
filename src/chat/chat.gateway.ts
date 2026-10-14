import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UserRole } from '@prisma/client';

import { WsJwtGuard } from './guards/ws-jwt.guard';
import { ChatService } from './chat.service';
import { JoinConversationDto } from './dto/join-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

/**
 * Socket.IO room naming conventions:
 *   conv:<conversationId>  – all participants of a single conversation
 *   dealer:<dealerUserId>  – dealer + all their staff (shared broadcast room)
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*', // tighten in production
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly wsJwtGuard: WsJwtGuard,
  ) {}

  afterInit() {
    this.logger.log('Chat WebSocket Gateway initialised');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Connection lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * On connect: authenticate the socket via the WsJwtGuard,
   * then auto-join the dealer room if the user is DEALER or DEALER_STAFF.
   */
  async handleConnection(client: Socket) {
    this.logger.log(
      `[Gateway] Incoming connection attempt: socketId=${client.id} | address=${client.handshake?.address}`,
    );

    // Manually invoke the guard at the connection phase
    const mockContext = this.buildExecutionContext(client);
    const allowed = await this.wsJwtGuard.canActivate(mockContext as any);
    if (!allowed) {
      this.logger.warn(
        `[Gateway] Connection REJECTED: socketId=${client.id} (auth failed)`,
      );
      return;
    }

    const user = client.data.user;
    this.logger.log(
      `[Gateway] Client CONNECTED: socketId=${client.id} | userId=${user.id} | email=${user.email} | role=${user.role}`,
    );

    // Auto-join dealer room
    if (user.role === UserRole.DEALER) {
      const dealerRoom = `dealer:${user.id}`;
      await client.join(dealerRoom);
      this.logger.log(
        `[Gateway] ${client.id} auto-joined dealer room: ${dealerRoom}`,
      );
    } else if (user.role === UserRole.DEALER_STAFF) {
      const dealerUserId = await this.chatService.getDealerUserIdForStaff(
        user.id,
      );
      if (dealerUserId) {
        const dealerRoom = `dealer:${dealerUserId}`;
        await client.join(dealerRoom);
        this.logger.log(
          `[Gateway] ${client.id} (DEALER_STAFF) auto-joined dealer room: ${dealerRoom}`,
        );
      } else {
        this.logger.warn(
          `[Gateway] DEALER_STAFF ${user.email} has no parent dealer — skipping dealer room join`,
        );
      }
    }

    client.emit('connected', {
      message: 'Connected to CarSaudi Chat',
      userId: user.id,
      role: user.role,
    });
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user;
    this.logger.log(
      `[Gateway] Client DISCONNECTED: socketId=${client.id}${
        user
          ? ` | userId=${user.id} | email=${user.email} | role=${user.role}`
          : ' (unauthenticated)'
      }`,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * join_conversation — creates or fetches a conversation for the listing.
   *
   * Payload: { listingId: string }
   *
   * Response (to requesting client):
   *   conversation_joined — { conversation, listing, messages }
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ) {
    const user = client.data.user;
    this.logger.log(
      `[join_conversation] socketId=${client.id} | userId=${user.id} | payload=${JSON.stringify(payload)}`,
    );

    const dto = await this.validateWsPayload(JoinConversationDto, payload);

    try {
      const result = await this.chatService.getOrCreateConversation(
        user.id,
        dto.listingId,
      );

      // Join the Socket.IO conversation room
      const convRoom = `conv:${result.conversation.id}`;
      await client.join(convRoom);
      this.logger.log(
        `[join_conversation] socketId=${client.id} joined room: ${convRoom} | conversationId=${result.conversation.id}`,
      );

      client.emit('conversation_joined', result);
    } catch (err) {
      this.logger.error(
        `[join_conversation] ERROR for socketId=${client.id} | ${err.message}`,
        err.stack,
      );
      this.emitError(client, err.message ?? 'Failed to join conversation');
    }
  }

  /**
   * send_message — persists a message and broadcasts it to all room members.
   *
   * Payload: SendMessageDto
   *
   * Broadcast (to conv room + dealer room):
   *   new_message — full message object
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ) {
    const user = client.data.user;
    this.logger.log(
      `[send_message] socketId=${client.id} | userId=${user.id} | payload=${JSON.stringify(payload)}`,
    );

    const dto = await this.validateWsPayload(SendMessageDto, payload);

    try {
      const message = await this.chatService.saveMessage(user.id, dto);

      const convRoom = `conv:${dto.conversationId}`;

      // Ensure the sender is in the conv room (in case they reconnected)
      if (!client.rooms.has(convRoom)) {
        await client.join(convRoom);
        this.logger.debug(
          `[send_message] socketId=${client.id} auto-rejoined room: ${convRoom}`,
        );
      }

      // Broadcast to all in the conversation room
      this.server.to(convRoom).emit('new_message', message);
      this.logger.log(
        `[send_message] Broadcast new_message to room ${convRoom} | messageId=${message.id}`,
      );

      // Also broadcast to dealer room so any online dealer/staff gets notified
      // even if they haven't explicitly joined this conversation room
      const conv = await this.chatService['prisma'].chatConversation.findUnique(
        {
          where: { id: dto.conversationId },
          select: {
            listing: {
              select: {
                createdById: true,
                createdBy: { select: { role: true } },
              },
            },
          },
        },
      );

      if (conv) {
        const owner = conv.listing.createdBy;
        let dealerUserId: string | null = null;

        if (owner.role === UserRole.DEALER) {
          dealerUserId = conv.listing.createdById;
        } else if (owner.role === UserRole.DEALER_STAFF) {
          dealerUserId = await this.chatService.getDealerUserIdForStaff(
            conv.listing.createdById,
          );
        }

        if (dealerUserId) {
          this.server.to(`dealer:${dealerUserId}`).emit('new_message', message);
          this.logger.log(
            `[send_message] Broadcast new_message to dealer room: dealer:${dealerUserId}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `[send_message] ERROR for socketId=${client.id} | ${err.message}`,
        err.stack,
      );
      this.emitError(client, err.message ?? 'Failed to send message');
    }
  }

  /**
   * typing — ephemeral typing indicator, not persisted.
   *
   * Payload: { conversationId: string }
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string },
  ) {
    const user = client.data.user;
    const convRoom = `conv:${payload?.conversationId}`;

    this.logger.debug(
      `[typing] socketId=${client.id} | userId=${user.id} | room=${convRoom}`,
    );

    // Broadcast to everyone else in the room (exclude sender)
    client.to(convRoom).emit('typing', {
      conversationId: payload?.conversationId,
      userId: user.id,
      name: user.name,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ────────────────────────────────────────────────────────────────────────────

  private emitError(client: Socket, message: string) {
    client.emit('error', { message });
  }

  /**
   * Validates an incoming WS payload against a DTO class.
   * Throws WsException on validation failure.
   */
  private async validateWsPayload<T extends object>(
    DtoClass: new () => T,
    payload: unknown,
  ): Promise<T> {
    const instance = plainToInstance(DtoClass, payload);
    const errors = await validate(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      const messages = errors
        .flatMap((e) => Object.values(e.constraints ?? {}))
        .join('; ');
      throw new WsException(`Validation failed: ${messages}`);
    }

    return instance;
  }

  /**
   * Builds a mock NestJS ExecutionContext for manual guard invocation
   * during the handleConnection phase.
   */
  private buildExecutionContext(client: Socket) {
    return {
      switchToWs: () => ({
        getClient: () => client,
        getData: () => ({}),
      }),
      getType: () => 'ws',
      getClass: () => ChatGateway,
      getHandler: () => this.handleConnection,
      getArgs: () => [client],
      getArgByIndex: (i: number) => [client][i],
      switchToHttp: () => ({}),
      switchToRpc: () => ({}),
    };
  }
}
