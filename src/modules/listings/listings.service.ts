import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { QueryListingsDto } from './dto/query-listings.dto';
import { AdminQueryListingsDto } from './dto/admin-query-listings.dto';
import { FlagListingDto } from './dto/flag-listing.dto';
import { ModerateFlagDto } from './dto/moderate-flag.dto';
import { RejectListingDto } from './dto/reject-listing.dto';
import { BulkActionDto } from './dto/bulk-action.dto';
import { FeatureListingDto } from './dto/feature-listing.dto';
import { ListingInquiryDto } from './dto/listing-inquiry.dto';
import { ListingStatus, FlagStatus, Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import * as XLSX from 'xlsx';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Field Selects ──────────────────────────────────────

  private readonly listingSelect = {
    id: true,
    title: true,
    description: true,
    sellerId: true,
    dealerId: true,
    make: true,
    model: true,
    year: true,
    mileage: true,
    price: true,
    currency: true,
    negotiable: true,
    fuelType: true,
    transmission: true,
    bodyType: true,
    condition: true,
    color: true,
    engineSize: true,
    horsepower: true,
    doors: true,
    cylinders: true,
    vin: true,
    city: true,
    region: true,
    status: true,
    rejectionReason: true,
    isFeatured: true,
    featuredUntil: true,
    viewCount: true,
    inquiryCount: true,
    flagCount: true,
    expiresAt: true,
    publishedAt: true,
    createdAt: true,
    updatedAt: true,
    images: {
      select: { id: true, url: true, alt: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' as const },
    },
    seller: {
      select: { id: true, fullName: true, email: true, phone: true },
    },
    dealer: {
      select: { id: true, companyName: true, logoUrl: true, city: true },
    },
  };

  // ─── Public: Browse Approved Listings ───────────────────

  async findAllPublic(query: QueryListingsDto): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where = this.buildPublicWhereClause(query);

    const orderBy = this.buildOrderBy(sortBy, sortOrder);

    const [data, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: this.listingSelect,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Public: Get Single Listing ─────────────────────────

  async findOnePublic(
    id: string,
    viewerId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: {
        ...this.listingSelect,
        flags: {
          select: { id: true, reason: true, status: true, createdAt: true },
          where: { status: FlagStatus.PENDING },
        },
      },
    });

    if (!listing || listing.status === ListingStatus.DELETED) {
      throw new NotFoundException('Listing not found');
    }

    // Track view (fire-and-forget)
    this.trackView(id, viewerId, ipAddress, userAgent).catch(() => {});

    return listing;
  }

  // ─── User: Create Listing ──────────────────────────────

  async create(dto: CreateListingDto, sellerId: string) {
    // Check if user is a dealer
    const dealer = await this.prisma.dealer.findUnique({
      where: { userId: sellerId },
    });

    // If dealer, check listing limit
    if (dealer) {
      if (dealer.status !== 'VERIFIED') {
        throw new ForbiddenException(
          'Dealer account must be verified before creating listings',
        );
      }

      if (dealer.totalListings >= dealer.maxListings) {
        throw new BadRequestException(
          `Listing limit reached (${dealer.maxListings}). Upgrade your subscription to create more.`,
        );
      }
    }

    const { images, ...listingData } = dto;

    const listing = await this.prisma.listing.create({
      data: {
        ...listingData,
        sellerId,
        dealerId: dealer?.id ?? null,
        status: ListingStatus.PENDING_REVIEW,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        images: images?.length
          ? {
              create: images.map((img, index) => ({
                url: img.url,
                alt: img.alt,
                sortOrder: img.sortOrder ?? index,
              })),
            }
          : undefined,
      },
      select: this.listingSelect,
    });

    // Increment dealer listing count
    if (dealer) {
      await this.prisma.dealer.update({
        where: { id: dealer.id },
        data: { totalListings: { increment: 1 } },
      });
    }

    this.logger.log(`Listing created: ${listing.id} by user ${sellerId}`);
    return listing;
  }

  // ─── User: Get My Listings ─────────────────────────────

  async findMyListings(
    sellerId: string,
    query: QueryListingsDto,
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ListingWhereInput = {
      sellerId,
      status: { not: ListingStatus.DELETED },
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { make: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy = this.buildOrderBy(sortBy, sortOrder);

    const [data, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: this.listingSelect,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── User: Update Own Listing ──────────────────────────

  async update(id: string, dto: UpdateListingDto, sellerId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    if (listing.status === ListingStatus.DELETED) {
      throw new BadRequestException('Cannot update a deleted listing');
    }

    const { images, ...updateData } = dto;

    // If listing was approved, editing resets it to pending review
    const newStatus =
      listing.status === ListingStatus.APPROVED
        ? ListingStatus.PENDING_REVIEW
        : listing.status;

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        ...updateData,
        status: newStatus,
        rejectionReason: newStatus === ListingStatus.PENDING_REVIEW ? null : undefined,
      },
      select: this.listingSelect,
    });

    // If images provided, replace all existing images
    if (images) {
      await this.prisma.listingImage.deleteMany({ where: { listingId: id } });
      if (images.length > 0) {
        await this.prisma.listingImage.createMany({
          data: images.map((img, index) => ({
            listingId: id,
            url: img.url,
            alt: img.alt,
            sortOrder: img.sortOrder ?? index,
          })),
        });
      }
    }

    this.logger.log(`Listing updated: ${id} by seller ${sellerId}`);
    return updated;
  }

  // ─── User: Delete Own Listing (soft) ───────────────────

  async softDelete(id: string, sellerId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    await this.prisma.listing.update({
      where: { id },
      data: { status: ListingStatus.DELETED },
    });

    this.logger.log(`Listing soft-deleted: ${id} by seller ${sellerId}`);
    return { message: 'Listing deleted successfully' };
  }

  // ─── User: Flag a Listing ─────────────────────────────

  async flagListing(id: string, dto: FlagListingDto, userId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId === userId) {
      throw new BadRequestException('You cannot flag your own listing');
    }

    // Check if user already flagged this listing
    const existingFlag = await this.prisma.listingFlag.findFirst({
      where: { listingId: id, flaggedById: userId, status: FlagStatus.PENDING },
    });

    if (existingFlag) {
      throw new BadRequestException('You have already flagged this listing');
    }

    const flag = await this.prisma.listingFlag.create({
      data: {
        listingId: id,
        flaggedById: userId,
        reason: dto.reason,
        description: dto.description,
      },
    });

    // Increment flag count
    await this.prisma.listing.update({
      where: { id },
      data: { flagCount: { increment: 1 } },
    });

    this.logger.log(`Listing ${id} flagged by user ${userId}: ${dto.reason}`);
    return flag;
  }

  // ─── User: Submit Inquiry ──────────────────────────────

  async submitInquiry(id: string, dto: ListingInquiryDto, userId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== ListingStatus.APPROVED) {
      throw new BadRequestException('Can only inquire about approved listings');
    }

    if (listing.sellerId === userId) {
      throw new BadRequestException('You cannot inquire about your own listing');
    }

    const inquiry = await this.prisma.listingInquiry.create({
      data: {
        listingId: id,
        userId,
        message: dto.message,
        phone: dto.phone,
        email: dto.email,
      },
    });

    // Increment inquiry count
    await this.prisma.listing.update({
      where: { id },
      data: { inquiryCount: { increment: 1 } },
    });

    // Increment dealer inquiry count if applicable
    if (listing.dealerId) {
      await this.prisma.dealer.update({
        where: { id: listing.dealerId },
        data: { totalInquiries: { increment: 1 } },
      });
    }

    this.logger.log(`Inquiry submitted on listing ${id} by user ${userId}`);
    return inquiry;
  }

  // ─── User: Listing Analytics (own) ─────────────────────

  async getListingAnalytics(id: string, sellerId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('You can only view analytics for your own listings');
    }

    // Get views over last 30 days grouped by day
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [viewsByDay, totalViews, totalInquiries, totalFlags, recentInquiries] =
      await Promise.all([
        this.prisma.listingView.groupBy({
          by: ['createdAt'],
          where: { listingId: id, createdAt: { gte: thirtyDaysAgo } },
          _count: true,
        }),
        this.prisma.listingView.count({ where: { listingId: id } }),
        this.prisma.listingInquiry.count({ where: { listingId: id } }),
        this.prisma.listingFlag.count({ where: { listingId: id } }),
        this.prisma.listingInquiry.findMany({
          where: { listingId: id },
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            message: true,
            phone: true,
            email: true,
            isRead: true,
            createdAt: true,
            user: { select: { fullName: true, email: true } },
          },
        }),
      ]);

    return {
      listingId: id,
      title: listing.title,
      status: listing.status,
      metrics: {
        totalViews,
        totalInquiries,
        totalFlags,
        viewCount: listing.viewCount,
      },
      recentInquiries,
    };
  }

  // ═══════════════════════════════════════════════════════
  // ADMIN METHODS
  // ═══════════════════════════════════════════════════════

  // ─── Admin: List All Listings ──────────────────────────

  async adminFindAll(
    query: AdminQueryListingsDto,
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where = this.buildAdminWhereClause(query);
    const orderBy = this.buildOrderBy(sortBy, sortOrder);

    const [data, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: {
          ...this.listingSelect,
          _count: { select: { flags: true, inquiries: true, views: true } },
        },
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Admin: Approve Listing ────────────────────────────

  async approveListing(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== ListingStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Cannot approve a listing with status: ${listing.status}`,
      );
    }

    const approved = await this.prisma.listing.update({
      where: { id },
      data: {
        status: ListingStatus.APPROVED,
        publishedAt: new Date(),
        rejectionReason: null,
      },
      select: this.listingSelect,
    });

    this.logger.log(`Listing approved: ${id}`);
    return approved;
  }

  // ─── Admin: Reject Listing ─────────────────────────────

  async rejectListing(id: string, dto: RejectListingDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (
      listing.status !== ListingStatus.PENDING_REVIEW &&
      listing.status !== ListingStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Cannot reject a listing with status: ${listing.status}`,
      );
    }

    const rejected = await this.prisma.listing.update({
      where: { id },
      data: {
        status: ListingStatus.REJECTED,
        rejectionReason: dto.reason,
      },
      select: this.listingSelect,
    });

    this.logger.log(`Listing rejected: ${id}. Reason: ${dto.reason}`);
    return rejected;
  }

  // ─── Admin: Bulk Approve ───────────────────────────────

  async bulkApprove(dto: BulkActionDto) {
    const result = await this.prisma.listing.updateMany({
      where: {
        id: { in: dto.ids },
        status: ListingStatus.PENDING_REVIEW,
      },
      data: {
        status: ListingStatus.APPROVED,
        publishedAt: new Date(),
        rejectionReason: null,
      },
    });

    this.logger.log(`Bulk approved ${result.count} listings`);
    return {
      message: `${result.count} listing(s) approved`,
      count: result.count,
    };
  }

  // ─── Admin: Bulk Reject ────────────────────────────────

  async bulkReject(dto: BulkActionDto) {
    if (!dto.reason) {
      throw new BadRequestException('Reason is required for bulk rejection');
    }

    const result = await this.prisma.listing.updateMany({
      where: {
        id: { in: dto.ids },
        status: { in: [ListingStatus.PENDING_REVIEW, ListingStatus.APPROVED] },
      },
      data: {
        status: ListingStatus.REJECTED,
        rejectionReason: dto.reason,
      },
    });

    this.logger.log(`Bulk rejected ${result.count} listings`);
    return {
      message: `${result.count} listing(s) rejected`,
      count: result.count,
    };
  }

  // ─── Admin: Feature Listing ────────────────────────────

  async featureListing(id: string, dto: FeatureListingDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        isFeatured: dto.isFeatured,
        featuredUntil: dto.isFeatured && dto.featuredUntil
          ? new Date(dto.featuredUntil)
          : dto.isFeatured
            ? null
            : null,
      },
      select: this.listingSelect,
    });

    this.logger.log(
      `Listing ${id} featured status set to ${dto.isFeatured}`,
    );
    return updated;
  }

  // ─── Admin: Force Delete Listing ───────────────────────

  async adminDelete(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    await this.prisma.listing.delete({ where: { id } });

    // Decrement dealer listing count
    if (listing.dealerId) {
      await this.prisma.dealer.update({
        where: { id: listing.dealerId },
        data: { totalListings: { decrement: 1 } },
      });
    }

    this.logger.log(`Listing permanently deleted by admin: ${id}`);
    return { message: 'Listing permanently deleted' };
  }

  // ─── Admin: List All Flags ─────────────────────────────

  async findAllFlags(
    query: { page?: number; limit?: number; status?: FlagStatus },
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ListingFlagWhereInput = {};
    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.listingFlag.findMany({
        where,
        include: {
          listing: {
            select: { id: true, title: true, status: true, sellerId: true },
          },
          flaggedBy: {
            select: { id: true, fullName: true, email: true },
          },
          moderator: {
            select: { id: true, fullName: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.listingFlag.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Admin: Resolve/Dismiss Flag ──────────────────────

  async moderateFlag(flagId: string, dto: ModerateFlagDto, moderatorId: string) {
    const flag = await this.prisma.listingFlag.findUnique({
      where: { id: flagId },
    });

    if (!flag) {
      throw new NotFoundException('Flag not found');
    }

    if (flag.status !== FlagStatus.PENDING) {
      throw new BadRequestException('This flag has already been moderated');
    }

    const updated = await this.prisma.listingFlag.update({
      where: { id: flagId },
      data: {
        status: dto.status,
        moderatorId,
        moderatorNote: dto.moderatorNote,
        resolvedAt: new Date(),
      },
      include: {
        listing: { select: { id: true, title: true } },
        flaggedBy: { select: { fullName: true } },
      },
    });

    this.logger.log(
      `Flag ${flagId} moderated to ${dto.status} by moderator ${moderatorId}`,
    );
    return updated;
  }

  // ─── Admin: Expire Check ──────────────────────────────

  async expireListings() {
    const now = new Date();

    const result = await this.prisma.listing.updateMany({
      where: {
        status: ListingStatus.APPROVED,
        expiresAt: { lte: now },
      },
      data: {
        status: ListingStatus.EXPIRED,
      },
    });

    // Also un-feature expired featured listings
    await this.prisma.listing.updateMany({
      where: {
        isFeatured: true,
        featuredUntil: { lte: now },
      },
      data: {
        isFeatured: false,
        featuredUntil: null,
      },
    });

    this.logger.log(`Expired ${result.count} listings`);
    return {
      message: `${result.count} listing(s) expired`,
      count: result.count,
    };
  }

  // ─── Admin: Platform Analytics ────────────────────────

  async getPlatformAnalytics() {
    const [
      totalListings,
      byStatus,
      totalFlags,
      pendingFlags,
      totalInquiries,
      totalViews,
      topMakes,
      topCities,
    ] = await Promise.all([
      this.prisma.listing.count(),
      this.prisma.listing.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.listingFlag.count(),
      this.prisma.listingFlag.count({ where: { status: FlagStatus.PENDING } }),
      this.prisma.listingInquiry.count(),
      this.prisma.listingView.count(),
      this.prisma.listing.groupBy({
        by: ['make'],
        _count: true,
        orderBy: { _count: { make: 'desc' } },
        take: 10,
      }),
      this.prisma.listing.groupBy({
        by: ['city'],
        where: { city: { not: null } },
        _count: true,
        orderBy: { _count: { city: 'desc' } },
        take: 10,
      }),
    ]);

    const statusMap: Record<string, number> = {};
    byStatus.forEach((s) => {
      statusMap[s.status] = s._count;
    });

    return {
      overview: {
        totalListings,
        byStatus: statusMap,
        totalFlags,
        pendingFlags,
        totalInquiries,
        totalViews,
      },
      popularMakes: topMakes.map((m) => ({ make: m.make, count: m._count })),
      popularCities: topCities.map((c) => ({ city: c.city, count: c._count })),
    };
  }

  // ─── Admin: Export Listings to XLSX ────────────────────

  async exportToXlsx(query: AdminQueryListingsDto): Promise<Buffer> {
    const where = this.buildAdminWhereClause(query);

    const listings = await this.prisma.listing.findMany({
      where,
      select: this.listingSelect,
      orderBy: { createdAt: 'desc' },
    });

    const rows = listings.map((l, index) => ({
      '#': index + 1,
      Title: l.title,
      Make: l.make,
      Model: l.model,
      Year: l.year,
      Price: `${l.price} ${l.currency}`,
      Mileage: l.mileage,
      Status: l.status,
      Condition: l.condition,
      City: l.city ?? '',
      Seller: l.seller?.fullName ?? '',
      Dealer: l.dealer?.companyName ?? '',
      Featured: l.isFeatured ? 'Yes' : 'No',
      Views: l.viewCount,
      Inquiries: l.inquiryCount,
      Flags: l.flagCount,
      'Published At': l.publishedAt ? new Date(l.publishedAt).toISOString() : '',
      'Expires At': l.expiresAt ? new Date(l.expiresAt).toISOString() : '',
      'Created At': new Date(l.createdAt).toISOString(),
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 5 },  // #
      { wch: 30 }, // Title
      { wch: 15 }, // Make
      { wch: 15 }, // Model
      { wch: 8 },  // Year
      { wch: 15 }, // Price
      { wch: 10 }, // Mileage
      { wch: 15 }, // Status
      { wch: 15 }, // Condition
      { wch: 15 }, // City
      { wch: 20 }, // Seller
      { wch: 20 }, // Dealer
      { wch: 10 }, // Featured
      { wch: 8 },  // Views
      { wch: 10 }, // Inquiries
      { wch: 8 },  // Flags
      { wch: 25 }, // Published At
      { wch: 25 }, // Expires At
      { wch: 25 }, // Created At
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Listings');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════

  private buildPublicWhereClause(
    query: QueryListingsDto,
  ): Prisma.ListingWhereInput {
    const where: Prisma.ListingWhereInput = {
      status: ListingStatus.APPROVED,
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { make: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.make) where.make = { equals: query.make, mode: 'insensitive' };
    if (query.model) where.model = { equals: query.model, mode: 'insensitive' };
    if (query.fuelType) where.fuelType = query.fuelType;
    if (query.transmission) where.transmission = query.transmission;
    if (query.bodyType) where.bodyType = query.bodyType;
    if (query.condition) where.condition = query.condition;
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    if (query.region) where.region = { equals: query.region, mode: 'insensitive' };
    if (query.sellerId) where.sellerId = query.sellerId;
    if (query.dealerId) where.dealerId = query.dealerId;

    if (query.isFeatured === 'true') where.isFeatured = true;

    if (query.yearMin || query.yearMax) {
      where.year = {};
      if (query.yearMin) where.year.gte = query.yearMin;
      if (query.yearMax) where.year.lte = query.yearMax;
    }

    if (query.priceMin || query.priceMax) {
      where.price = {};
      if (query.priceMin) where.price.gte = query.priceMin;
      if (query.priceMax) where.price.lte = query.priceMax;
    }

    return where;
  }

  private buildAdminWhereClause(
    query: AdminQueryListingsDto,
  ): Prisma.ListingWhereInput {
    // Start without forcing APPROVED status
    const where: Prisma.ListingWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { make: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.make) where.make = { equals: query.make, mode: 'insensitive' };
    if (query.model) where.model = { equals: query.model, mode: 'insensitive' };
    if (query.fuelType) where.fuelType = query.fuelType;
    if (query.transmission) where.transmission = query.transmission;
    if (query.bodyType) where.bodyType = query.bodyType;
    if (query.condition) where.condition = query.condition;
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    if (query.sellerId) where.sellerId = query.sellerId;
    if (query.dealerId) where.dealerId = query.dealerId;

    if (query.flagged === 'true') {
      where.flagCount = { gt: 0 };
    }

    if (query.yearMin || query.yearMax) {
      where.year = {};
      if (query.yearMin) where.year.gte = query.yearMin;
      if (query.yearMax) where.year.lte = query.yearMax;
    }

    if (query.priceMin || query.priceMax) {
      where.price = {};
      if (query.priceMin) where.price.gte = query.priceMin;
      if (query.priceMax) where.price.lte = query.priceMax;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    return where;
  }

  private buildOrderBy(
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Prisma.ListingOrderByWithRelationInput {
    const allowed = [
      'title',
      'price',
      'year',
      'mileage',
      'viewCount',
      'inquiryCount',
      'createdAt',
      'publishedAt',
    ];

    if (allowed.includes(sortBy)) {
      return { [sortBy]: sortOrder } as any;
    }
    return { createdAt: 'desc' };
  }

  private async trackView(
    listingId: string,
    viewerId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.prisma.listingView.create({
      data: { listingId, viewerId, ipAddress, userAgent },
    });

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { viewCount: { increment: 1 } },
    });

    // Update dealer view count if applicable
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { dealerId: true },
    });

    if (listing?.dealerId) {
      await this.prisma.dealer.update({
        where: { id: listing.dealerId },
        data: { totalViews: { increment: 1 } },
      });
    }
  }
}
