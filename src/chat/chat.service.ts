import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MessageType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../shared/minio.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SendMessageDto } from './dto/send-message.dto';
import { v4 as uuidv4 } from 'uuid';

/** Lightweight participant selector reused across queries */
const PARTICIPANT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
};

/** Lightweight listing snapshot fields */
const LISTING_SNAPSHOT_SELECT = {
  id: true,
  slug: true,
  referenceCode: true,
  status: true,
  propertyName: true,
  type: true,
  purpose: true,
  price: true,
  priceNegotiable: true,
  areaName: true,
  municipality: true,
  bedrooms: true,
  bathrooms: true,
  area: true,
  addressLine1: true,
  contactPhone: true,
  contactWhatsapp: true,
  photos: {
    select: { url: true, caption: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
    take: 5,
  },
  createdBy: { select: { id: true, name: true, email: true } },
};

/** Message sender fields */
const SENDER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly notifications: NotificationsService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Dealer–Staff helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns all staff user IDs for a given dealer user ID.
   * Returns an empty array if the dealer has no staff.
   */
  async getDealerStaffIds(dealerUserId: string): Promise<string[]> {
    const staffRecords = await this.prisma.dealerStaff.findMany({
      where: { dealerUserId },
      select: { staffUserId: true },
    });
    return staffRecords.map((s) => s.staffUserId);
  }

  /**
   * If the given userId is a DEALER_STAFF, returns their parent dealer's userId.
   */
  async getDealerUserIdForStaff(staffUserId: string): Promise<string | null> {
    const record = await this.prisma.dealerStaff.findUnique({
      where: { staffUserId },
      select: { dealerUserId: true },
    });
    return record?.dealerUserId ?? null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Conversation management
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Gets or creates a conversation for (userId ↔ listingId).
   * Participants added automatically:
   *   - The enquiring user
   *   - The property owner (listing.createdById)
   *   - The listing dealer (if the owner is a dealer)
   *   - All dealer staff
   */
  async getOrCreateConversation(userId: string, listingId: string) {
    // Verify listing exists
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        ...LISTING_SNAPSHOT_SELECT,
        createdById: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException(`Listing "${listingId}" not found`);
    }

    // Prevent dealer/staff from starting a conversation on their own listing
    const dealerStaffForListing = await this.getDealerStaffIds(
      listing.createdById,
    );
    const isDealerOwner = listing.createdById === userId;
    const isStaffOfOwner = dealerStaffForListing.includes(userId);
    if (isDealerOwner || isStaffOfOwner) {
      throw new ForbiddenException(
        'Dealers and their staff cannot initiate a chat on their own listing',
      );
    }

    // Find or create conversation
    let conversation = await this.prisma.chatConversation.findUnique({
      where: { listingId_userId: { listingId, userId } },
      include: {
        participants: { select: { userId: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            type: true,
            content: true,
            mediaUrl: true,
            latitude: true,
            longitude: true,
            locationLabel: true,
            createdAt: true,
            sender: { select: SENDER_SELECT },
          },
        },
      },
    });

    if (!conversation) {
      // Collect all participant IDs: enquirer + property owner + dealer staff
      const participantIds = new Set<string>([userId, listing.createdById]);

      // If the listing owner is DEALER or DEALER_STAFF, also add all their staff
      const ownerRole = listing.createdBy.role;
      if (ownerRole === UserRole.DEALER) {
        const staffIds = await this.getDealerStaffIds(listing.createdById);
        staffIds.forEach((id) => participantIds.add(id));
      } else if (ownerRole === UserRole.DEALER_STAFF) {
        // Find the parent dealer and add dealer + all other staff
        const parentDealerId = await this.getDealerUserIdForStaff(
          listing.createdById,
        );
        if (parentDealerId) {
          participantIds.add(parentDealerId);
          const staffIds = await this.getDealerStaffIds(parentDealerId);
          staffIds.forEach((id) => participantIds.add(id));
        }
      }

      conversation = await this.prisma.chatConversation.create({
        data: {
          listingId,
          userId,
          participants: {
            createMany: {
              data: Array.from(participantIds).map((uid) => ({ userId: uid })),
              skipDuplicates: true,
            },
          },
        },
        include: {
          participants: { select: { userId: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              type: true,
              content: true,
              mediaUrl: true,
              latitude: true,
              longitude: true,
              locationLabel: true,
              createdAt: true,
              sender: { select: SENDER_SELECT },
            },
          },
        },
      });

      this.logger.log(
        `New conversation created: ${conversation.id} (listing=${listingId}, user=${userId})`,
      );
    }

    return {
      conversation: {
        id: conversation.id,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        participantIds: conversation.participants.map((p) => p.userId),
      },
      listing,
      messages: [...conversation.messages].reverse(), // oldest first
    };
  }

  /**
   * Validates that the sender is an active participant of the conversation.
   */
  async validateParticipant(conversationId: string, userId: string) {
    const participation = await this.prisma.chatParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participation) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }
    return participation;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Message persistence
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Saves a message to the DB after validating the sender is a participant.
   * Returns the full message payload ready to broadcast.
   */
  async saveMessage(senderId: string, dto: SendMessageDto) {
    await this.validateParticipant(dto.conversationId, senderId);

    this.validateMessagePayload(dto);

    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          conversationId: dto.conversationId,
          senderId,
          type: dto.type,
          content: dto.content ?? null,
          mediaUrl: dto.mediaUrl ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          locationLabel: dto.locationLabel ?? null,
        },
        select: {
          id: true,
          conversationId: true,
          type: true,
          content: true,
          mediaUrl: true,
          latitude: true,
          longitude: true,
          locationLabel: true,
          createdAt: true,
          sender: { select: SENDER_SELECT },
        },
      }),
      this.prisma.chatConversation.update({
        where: { id: dto.conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    this.notifyParticipants(dto.conversationId, senderId, message);

    return message;
  }

  /**
   * Fire-and-forget FCM push to every other participant of the conversation
   * (everyone except the sender). Never throws — a failed push must not affect
   * message delivery, which already happened over the socket/DB.
   */
  private async notifyParticipants(
    conversationId: string,
    senderId: string,
    message: {
      type: string;
      content: string | null;
      sender: { name: string | null };
    },
  ) {
    try {
      const [participants, conversation] = await Promise.all([
        this.prisma.chatParticipant.findMany({
          where: { conversationId, userId: { not: senderId } },
          select: { userId: true },
        }),
        this.prisma.chatConversation.findUnique({
          where: { id: conversationId },
          select: { listing: { select: { propertyName: true } } },
        }),
      ]);
      if (participants.length === 0) return;

      const body =
        message.type === 'TEXT'
          ? (message.content ?? '').slice(0, 120)
          : message.type === 'IMAGE'
            ? '📷 Sent a photo'
            : '📍 Shared a location';

      await this.notifications.sendToUsers(
        participants.map((p) => p.userId),
        {
          title: message.sender.name ?? 'New message',
          body,
          data: {
            type: 'CHAT_MESSAGE',
            conversationId,
          },
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to push chat notification (non-critical): ${err?.message}`,
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // REST history
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns all conversations the calling user participates in,
   * with last-message preview.
   */
  async getConversations(userId: string) {
    const participations = await this.prisma.chatParticipant.findMany({
      where: {
        userId,
        conversation: {
          messages: {
            some: {},
          },
        },
      },
      select: {
        conversation: {
          select: {
            id: true,
            createdAt: true,
            updatedAt: true,
            listing: { select: LISTING_SNAPSHOT_SELECT },
            user: { select: { id: true, name: true, email: true } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                type: true,
                content: true,
                mediaUrl: true,
                createdAt: true,
                sender: { select: { id: true, name: true } },
              },
            },
            participants: {
              select: {
                userId: true,
                user: { select: { id: true, name: true, role: true } },
              },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    return participations.map((p) => ({
      ...p.conversation,
      lastMessage: p.conversation.messages[0] ?? null,
      messages: undefined,
    }));
  }

  /**
   * Returns paginated message history for a conversation.
   * Only accessible if the user is a participant.
   */
  async getMessageHistory(
    conversationId: string,
    userId: string,
    page = 1,
    limit = 50,
  ) {
    await this.validateParticipant(conversationId, userId);

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          content: true,
          mediaUrl: true,
          latitude: true,
          longitude: true,
          locationLabel: true,
          createdAt: true,
          sender: { select: SENDER_SELECT },
        },
      }),
      this.prisma.chatMessage.count({ where: { conversationId } }),
    ]);

    return {
      data: messages,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Image upload
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Uploads a chat image to MinIO and returns its URL.
   */
  async uploadChatImage(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{ url: string; key: string }> {
    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const key = `chat/${userId}/${uuidv4()}.${ext}`;

    await this.minio.uploadFile(
      Buffer.from(file.buffer),
      key,
      file.mimetype,
      file.size,
    );

    const url = await this.minio.getPresignedUrl(key, 86400 * 7); // 7 days
    return { url, key };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────────

  private validateMessagePayload(dto: SendMessageDto) {
    if (dto.type === MessageType.TEXT && !dto.content?.trim()) {
      throw new BadRequestException(
        'TEXT message must include a non-empty content field',
      );
    }
    if (dto.type === MessageType.IMAGE && !dto.mediaUrl) {
      throw new BadRequestException(
        'IMAGE message must include a mediaUrl field',
      );
    }
    if (
      dto.type === MessageType.LOCATION &&
      (dto.latitude == null || dto.longitude == null)
    ) {
      throw new BadRequestException(
        'LOCATION message must include latitude and longitude fields',
      );
    }
  }
}
