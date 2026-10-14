import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VisitStatus } from '@prisma/client';
import { LISTING_SELECT } from '../listings/listings.service';

@Injectable()
export class CarVisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async scheduleVisit(
    visitorId: string,
    listingId: string,
    scheduledAt: Date,
    notes?: string,
  ) {
    const listing = await this.prisma.carListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const ownerId = listing.createdById;

    // Check if visit already exists
    const existing = await this.prisma.carVisit.findFirst({
      where: {
        visitorId,
        listingId,
        status: {
          in: [
            VisitStatus.PENDING,
            VisitStatus.ACCEPTED,
            VisitStatus.RESCHEDULED,
          ],
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have an active visit request for this listing',
      );
    }

    return this.prisma.carVisit.create({
      data: {
        listingId,
        visitorId,
        ownerId,
        scheduledAt,
        notes,
        status: VisitStatus.PENDING,
      },
    });
  }

  async getVisitsAsVisitor(visitorId: string) {
    return this.prisma.carVisit.findMany({
      where: { visitorId },
      include: {
        listing: { select: LISTING_SELECT },
        owner: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVisitsAsOwner(ownerId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.carVisit.findMany({
        where: { ownerId },
        include: {
          listing: { select: LISTING_SELECT },
          visitor: {
            select: { id: true, name: true, phone: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.carVisit.count({ where: { ownerId } }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async acceptVisit(ownerId: string, visitId: string) {
    const visit = await this.prisma.carVisit.findUnique({
      where: { id: visitId },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.ownerId !== ownerId)
      throw new ForbiddenException('Not the owner');

    return this.prisma.carVisit.update({
      where: { id: visitId },
      data: { status: VisitStatus.ACCEPTED },
    });
  }

  async reconfirmVisit(ownerId: string, visitId: string, proposedAt: Date) {
    const visit = await this.prisma.carVisit.findUnique({
      where: { id: visitId },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.ownerId !== ownerId)
      throw new ForbiddenException('Not the owner');

    return this.prisma.carVisit.update({
      where: { id: visitId },
      data: { status: VisitStatus.RESCHEDULED, proposedAt },
    });
  }

  async closeVisit(userId: string, visitId: string) {
    const visit = await this.prisma.carVisit.findUnique({
      where: { id: visitId },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.ownerId !== userId && visit.visitorId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const status =
      visit.ownerId === userId ? VisitStatus.REJECTED : VisitStatus.CANCELLED;

    return this.prisma.carVisit.update({
      where: { id: visitId },
      data: { status },
    });
  }
}
