import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingLogType } from '@prisma/client';

export interface TrackingJobData {
  type: TrackingLogType;
  listingId: string;
  deviceId: string;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processTrackingJob(data: TrackingJobData) {
    const { type, listingId, deviceId } = data;

    // 10 minutes cooldown check
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    try {
      const recentLog = await this.prisma.listingTrackingLog.findFirst({
        where: {
          listingId,
          deviceId,
          type,
          createdAt: {
            gte: tenMinutesAgo,
          },
        },
      });

      if (recentLog) {
        // Cooldown active, do not increment
        return { status: 'cooldown_active' };
      }

      // Check if it's the first time this device views this listing for Reach
      let isFirstView = false;
      if (type === TrackingLogType.VIEW) {
        const existingViewLog = await this.prisma.listingTrackingLog.findFirst({
          where: {
            listingId,
            deviceId,
            type: TrackingLogType.VIEW,
          },
        });
        if (!existingViewLog) {
          isFirstView = true;
        }
      }

      // Perform updates inside a transaction
      await this.prisma.$transaction(async (tx) => {
        await tx.listingTrackingLog.create({
          data: {
            listingId,
            deviceId,
            type,
          },
        });

        const updateData: any = {};
        if (type === TrackingLogType.IMPRESSION) {
          updateData.impressionsCount = { increment: 1 };
        } else if (type === TrackingLogType.VIEW) {
          updateData.viewsCount = { increment: 1 };
          if (isFirstView) {
            updateData.reachCount = { increment: 1 };
          }
        } else if (type === TrackingLogType.WHATSAPP_CLICK) {
          updateData.whatsappClicksCount = { increment: 1 };
        }

        await tx.listing.update({
          where: { id: listingId },
          data: updateData,
        });
      });

      return { status: 'success' };
    } catch (error) {
      this.logger.error(
        `Failed to process tracking job for listing ${listingId}`,
        error,
      );
      throw error;
    }
  }

  async purgeLogsForListing(listingId: string) {
    await this.prisma.listingTrackingLog.deleteMany({
      where: { listingId },
    });
  }
}
