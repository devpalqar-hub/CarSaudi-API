import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DevicePlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FirebaseService,
  PushNotificationPayload,
} from '../shared/firebase.service';
import { QueryNotificationDto } from './dto/query-notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Device token registration (called from the user-facing API)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Registers (or re-associates) an FCM device token for a user.
   * A token is unique across the whole system — if the same device token was
   * previously registered under a different account (e.g. logout/login as another
   * user on the same device), it's reassigned to the current user.
   */
  async registerToken(
    userId: string,
    token: string,
    platform?: DevicePlatform,
  ) {
    return this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
      select: { id: true, token: true, platform: true, updatedAt: true },
    });
  }

  /** Unregisters a device token (e.g. on logout) so it stops receiving pushes. */
  async removeToken(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
    return { message: 'Device token removed' };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Sending
  // ────────────────────────────────────────────────────────────────────────────

  /** Sends a push notification to every device registered to a single user. */
  async sendToUser(userId: string, payload: PushNotificationPayload) {
    return this.sendToUsers([userId], payload);
  }

  /**
   * Sends the same push notification to every device registered to any of the given users.
   * Also persists an in-app `Notification` row for each recipient (best-effort, never throws)
   * so the account's in-app notification list stays complete even if push delivery fails or
   * the user has no device registered.
   */
  async sendToUsers(userIds: string[], payload: PushNotificationPayload) {
    if (userIds.length === 0) return { successCount: 0 };

    this.persistInApp(userIds, payload).catch((err) =>
      this.logger.warn(
        `Failed to persist in-app notifications: ${err?.message}`,
      ),
    );

    const devices = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    if (devices.length === 0) return { successCount: 0 };

    const tokens = devices.map((d) => d.token);
    const { successCount, invalidTokens } = await this.firebase.sendToTokens(
      tokens,
      payload,
    );

    if (invalidTokens.length > 0) {
      await this.prisma.deviceToken
        .deleteMany({ where: { token: { in: invalidTokens } } })
        .catch((err) =>
          this.logger.warn(
            `Failed to prune stale device tokens: ${err?.message}`,
          ),
        );
    }

    return { successCount };
  }

  /** Writes one in-app `Notification` row per recipient. Never throws. */
  private async persistInApp(
    userIds: string[],
    payload: PushNotificationPayload,
  ) {
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title: payload.title,
        body: payload.body,
        type: payload.data?.type,
        data: (payload.data as Prisma.InputJsonValue) ?? undefined,
      })),
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // In-app notification list (dealer / dealer-staff facing)
  // ────────────────────────────────────────────────────────────────────────────

  /** Paginated in-app notification list for the given user, newest first. */
  async listForUser(userId: string, query: QueryNotificationDto) {
    const { page = 1, limit = 20, isRead } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(isRead !== undefined && { isRead }),
    };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  /** Count of unread in-app notifications for the given user (e.g. for a badge). */
  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  /** Marks a single notification as read. Scoped to the owning user. */
  async markAsRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
  }

  /** Marks every unread notification for the user as read. */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { message: 'All notifications marked as read', count: result.count };
  }
}
