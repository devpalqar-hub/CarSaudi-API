import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApplyDealerDto } from './dto/apply-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { QueryDealersDto } from './dto/query-dealers.dto';
import { RejectDealerDto } from './dto/reject-dealer.dto';
import { SuspendDealerDto } from './dto/suspend-dealer.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { DealerStatus, ListingStatus, Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import * as XLSX from 'xlsx';

@Injectable()
export class DealersService {
  private readonly logger = new Logger(DealersService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Field Selects ──────────────────────────────────────

  private readonly dealerSelect = {
    id: true,
    userId: true,
    companyName: true,
    tradeLicenseNumber: true,
    tradeLicenseUrl: true,
    contactEmail: true,
    contactPhone: true,
    address: true,
    city: true,
    region: true,
    description: true,
    logoUrl: true,
    websiteUrl: true,
    status: true,
    subscriptionTier: true,
    subscriptionExpiresAt: true,
    verifiedAt: true,
    rejectionReason: true,
    maxListings: true,
    totalListings: true,
    totalViews: true,
    totalInquiries: true,
    createdAt: true,
    updatedAt: true,
    user: {
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        accountStatus: true,
      },
    },
  };

  private readonly publicDealerSelect = {
    id: true,
    companyName: true,
    city: true,
    region: true,
    description: true,
    logoUrl: true,
    websiteUrl: true,
    status: true,
    totalListings: true,
    createdAt: true,
  };

  // ─── Public: Get Dealer Profile ─────────────────────────

  async findOnePublic(id: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id },
      select: this.publicDealerSelect,
    });

    if (!dealer || dealer.status !== DealerStatus.VERIFIED) {
      throw new NotFoundException('Dealer not found');
    }

    return dealer;
  }

  // ─── Public: Browse Dealer Listings ────────────────────

  async findDealerListings(
    dealerId: string,
    query: { page?: number; limit?: number },
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const dealer = await this.prisma.dealer.findUnique({
      where: { id: dealerId },
    });

    if (!dealer || dealer.status !== DealerStatus.VERIFIED) {
      throw new NotFoundException('Dealer not found');
    }

    const where: Prisma.ListingWhereInput = {
      dealerId,
      status: ListingStatus.APPROVED,
    };

    const [data, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: {
          id: true,
          title: true,
          make: true,
          model: true,
          year: true,
          price: true,
          currency: true,
          mileage: true,
          city: true,
          condition: true,
          isFeatured: true,
          viewCount: true,
          createdAt: true,
          images: {
            select: { url: true, alt: true },
            take: 1,
            orderBy: { sortOrder: 'asc' },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── User: Apply as Dealer ────────────────────────────

  async apply(dto: ApplyDealerDto, userId: string) {
    // Check if user already has a dealer profile
    const existing = await this.prisma.dealer.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException(
        'You already have a dealer profile. Current status: ' + existing.status,
      );
    }

    const dealer = await this.prisma.dealer.create({
      data: {
        userId,
        companyName: dto.companyName,
        tradeLicenseNumber: dto.tradeLicenseNumber,
        tradeLicenseUrl: dto.tradeLicenseUrl,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        address: dto.address,
        city: dto.city,
        region: dto.region,
        description: dto.description,
        logoUrl: dto.logoUrl,
        websiteUrl: dto.websiteUrl,
        status: DealerStatus.PENDING_VERIFICATION,
      },
      select: this.dealerSelect,
    });

    this.logger.log(`Dealer application submitted by user ${userId}: ${dto.companyName}`);
    return dealer;
  }

  // ─── Dealer: Get Own Profile ──────────────────────────

  async getMyProfile(userId: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { userId },
      select: this.dealerSelect,
    });

    if (!dealer) {
      throw new NotFoundException('You do not have a dealer profile');
    }

    return dealer;
  }

  // ─── Dealer: Update Own Profile ───────────────────────

  async updateMyProfile(userId: string, dto: UpdateDealerDto) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { userId },
    });

    if (!dealer) {
      throw new NotFoundException('You do not have a dealer profile');
    }

    if (dealer.status === DealerStatus.SUSPENDED) {
      throw new ForbiddenException('Cannot update profile while suspended');
    }

    const updated = await this.prisma.dealer.update({
      where: { userId },
      data: {
        ...(dto.companyName && { companyName: dto.companyName }),
        ...(dto.tradeLicenseNumber !== undefined && {
          tradeLicenseNumber: dto.tradeLicenseNumber,
        }),
        ...(dto.tradeLicenseUrl !== undefined && {
          tradeLicenseUrl: dto.tradeLicenseUrl,
        }),
        ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
        ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.region !== undefined && { region: dto.region }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.websiteUrl !== undefined && { websiteUrl: dto.websiteUrl }),
      },
      select: this.dealerSelect,
    });

    this.logger.log(`Dealer profile updated by user ${userId}`);
    return updated;
  }

  // ─── Dealer: Own Analytics ────────────────────────────

  async getMyAnalytics(userId: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { userId },
    });

    if (!dealer) {
      throw new NotFoundException('You do not have a dealer profile');
    }

    const [
      listingsByStatus,
      recentInquiries,
      totalViews30d,
    ] = await Promise.all([
      this.prisma.listing.groupBy({
        by: ['status'],
        where: { dealerId: dealer.id },
        _count: true,
      }),
      this.prisma.listingInquiry.findMany({
        where: {
          listing: { dealerId: dealer.id },
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          message: true,
          isRead: true,
          createdAt: true,
          user: { select: { fullName: true, email: true, phone: true } },
          listing: { select: { id: true, title: true } },
        },
      }),
      this.prisma.listingView.count({
        where: {
          listing: { dealerId: dealer.id },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    listingsByStatus.forEach((s) => {
      statusMap[s.status] = s._count;
    });

    return {
      dealerId: dealer.id,
      companyName: dealer.companyName,
      subscriptionTier: dealer.subscriptionTier,
      metrics: {
        totalListings: dealer.totalListings,
        maxListings: dealer.maxListings,
        totalViews: dealer.totalViews,
        totalInquiries: dealer.totalInquiries,
        viewsLast30Days: totalViews30d,
        listingsByStatus: statusMap,
      },
      recentInquiries,
    };
  }

  // ═══════════════════════════════════════════════════════
  // ADMIN METHODS
  // ═══════════════════════════════════════════════════════

  // ─── Admin: List All Dealers ──────────────────────────

  async adminFindAll(
    query: QueryDealersDto,
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DealerWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.subscriptionTier) where.subscriptionTier = query.subscriptionTier;
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    if (query.region) where.region = { equals: query.region, mode: 'insensitive' };

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
        { tradeLicenseNumber: { contains: search, mode: 'insensitive' } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: Prisma.DealerOrderByWithRelationInput = {};
    const allowedSort = ['companyName', 'createdAt', 'totalListings', 'totalViews'];
    if (allowedSort.includes(sortBy)) {
      (orderBy as any)[sortBy] = sortOrder;
    } else {
      orderBy.createdAt = 'desc';
    }

    const [data, total] = await Promise.all([
      this.prisma.dealer.findMany({
        where,
        select: {
          ...this.dealerSelect,
          _count: { select: { listings: true } },
        },
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.dealer.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Admin: Get Dealer Details ────────────────────────

  async adminFindOne(id: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id },
      select: {
        ...this.dealerSelect,
        listings: {
          select: {
            id: true,
            title: true,
            status: true,
            price: true,
            viewCount: true,
            createdAt: true,
          },
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    return dealer;
  }

  // ─── Admin: Verify Dealer ────────────────────────────

  async verifyDealer(id: string) {
    const dealer = await this.prisma.dealer.findUnique({ where: { id } });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    if (dealer.status !== DealerStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        `Cannot verify a dealer with status: ${dealer.status}`,
      );
    }

    // Update dealer status
    const verified = await this.prisma.dealer.update({
      where: { id },
      data: {
        status: DealerStatus.VERIFIED,
        verifiedAt: new Date(),
        rejectionReason: null,
      },
      select: this.dealerSelect,
    });

    // Assign DEALER role to the user if not already assigned
    const dealerRole = await this.prisma.role.findUnique({
      where: { name: 'DEALER' },
    });

    if (dealerRole) {
      await this.prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: dealer.userId,
            roleId: dealerRole.id,
          },
        },
        update: {},
        create: {
          userId: dealer.userId,
          roleId: dealerRole.id,
        },
      });
    }

    this.logger.log(`Dealer verified: ${id} (${dealer.companyName})`);
    return verified;
  }

  // ─── Admin: Reject Dealer ────────────────────────────

  async rejectDealer(id: string, dto: RejectDealerDto) {
    const dealer = await this.prisma.dealer.findUnique({ where: { id } });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    if (dealer.status !== DealerStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        `Cannot reject a dealer with status: ${dealer.status}`,
      );
    }

    const rejected = await this.prisma.dealer.update({
      where: { id },
      data: {
        status: DealerStatus.REJECTED,
        rejectionReason: dto.reason,
      },
      select: this.dealerSelect,
    });

    this.logger.log(`Dealer rejected: ${id}. Reason: ${dto.reason}`);
    return rejected;
  }

  // ─── Admin: Suspend Dealer ────────────────────────────

  async suspendDealer(id: string, dto: SuspendDealerDto) {
    const dealer = await this.prisma.dealer.findUnique({ where: { id } });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    if (dealer.status === DealerStatus.SUSPENDED) {
      throw new BadRequestException('Dealer is already suspended');
    }

    // Suspend dealer
    const suspended = await this.prisma.dealer.update({
      where: { id },
      data: {
        status: DealerStatus.SUSPENDED,
        rejectionReason: dto.reason,
      },
      select: this.dealerSelect,
    });

    // Set all dealer's approved listings to PENDING_REVIEW
    await this.prisma.listing.updateMany({
      where: {
        dealerId: id,
        status: ListingStatus.APPROVED,
      },
      data: { status: ListingStatus.PENDING_REVIEW },
    });

    this.logger.log(`Dealer suspended: ${id}. Reason: ${dto.reason}`);
    return suspended;
  }

  // ─── Admin: Reactivate Dealer ─────────────────────────

  async reactivateDealer(id: string) {
    const dealer = await this.prisma.dealer.findUnique({ where: { id } });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    if (dealer.status !== DealerStatus.SUSPENDED) {
      throw new BadRequestException('Dealer is not suspended');
    }

    const reactivated = await this.prisma.dealer.update({
      where: { id },
      data: {
        status: DealerStatus.VERIFIED,
        rejectionReason: null,
      },
      select: this.dealerSelect,
    });

    this.logger.log(`Dealer reactivated: ${id}`);
    return reactivated;
  }

  // ─── Admin: Update Subscription ───────────────────────

  async updateSubscription(id: string, dto: UpdateSubscriptionDto) {
    const dealer = await this.prisma.dealer.findUnique({ where: { id } });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    const updated = await this.prisma.dealer.update({
      where: { id },
      data: {
        subscriptionTier: dto.tier,
        subscriptionExpiresAt: dto.expiresAt
          ? new Date(dto.expiresAt)
          : null,
        ...(dto.maxListings !== undefined && { maxListings: dto.maxListings }),
      },
      select: this.dealerSelect,
    });

    this.logger.log(
      `Dealer ${id} subscription updated: tier=${dto.tier}, maxListings=${dto.maxListings ?? dealer.maxListings}`,
    );
    return updated;
  }

  // ─── Admin: Dealer Analytics ──────────────────────────

  async getDealerAnalytics(id: string) {
    const dealer = await this.prisma.dealer.findUnique({
      where: { id },
      select: this.dealerSelect,
    });

    if (!dealer) {
      throw new NotFoundException('Dealer not found');
    }

    const [listingsByStatus, recentInquiries, viewsLast30d] =
      await Promise.all([
        this.prisma.listing.groupBy({
          by: ['status'],
          where: { dealerId: id },
          _count: true,
        }),
        this.prisma.listingInquiry.count({
          where: { listing: { dealerId: id } },
        }),
        this.prisma.listingView.count({
          where: {
            listing: { dealerId: id },
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

    const statusMap: Record<string, number> = {};
    listingsByStatus.forEach((s) => {
      statusMap[s.status] = s._count;
    });

    return {
      dealer,
      performance: {
        listingsByStatus: statusMap,
        totalInquiries: recentInquiries,
        viewsLast30Days: viewsLast30d,
      },
    };
  }

  // ─── Admin: Export Dealers to XLSX ────────────────────

  async exportToXlsx(query: QueryDealersDto): Promise<Buffer> {
    const where: Prisma.DealerWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.subscriptionTier) where.subscriptionTier = query.subscriptionTier;
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };

    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const dealers = await this.prisma.dealer.findMany({
      where,
      select: this.dealerSelect,
      orderBy: { createdAt: 'desc' },
    });

    const rows = dealers.map((d, index) => ({
      '#': index + 1,
      'Company Name': d.companyName,
      'Owner': d.user?.fullName ?? '',
      'Owner Email': d.user?.email ?? '',
      'Contact Email': d.contactEmail ?? '',
      'Contact Phone': d.contactPhone ?? '',
      'Trade License': d.tradeLicenseNumber ?? '',
      'City': d.city ?? '',
      'Region': d.region ?? '',
      'Status': d.status,
      'Subscription': d.subscriptionTier,
      'Total Listings': d.totalListings,
      'Max Listings': d.maxListings,
      'Total Views': d.totalViews,
      'Total Inquiries': d.totalInquiries,
      'Verified At': d.verifiedAt ? new Date(d.verifiedAt).toISOString() : '',
      'Created At': new Date(d.createdAt).toISOString(),
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 5 },  // #
      { wch: 25 }, // Company Name
      { wch: 20 }, // Owner
      { wch: 25 }, // Owner Email
      { wch: 25 }, // Contact Email
      { wch: 18 }, // Contact Phone
      { wch: 20 }, // Trade License
      { wch: 15 }, // City
      { wch: 15 }, // Region
      { wch: 20 }, // Status
      { wch: 15 }, // Subscription
      { wch: 14 }, // Total Listings
      { wch: 12 }, // Max Listings
      { wch: 12 }, // Total Views
      { wch: 14 }, // Total Inquiries
      { wch: 25 }, // Verified At
      { wch: 25 }, // Created At
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dealers');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
