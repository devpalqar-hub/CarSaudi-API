import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthProvider,
  ListingPurpose,
  ListingStatus,
  Prisma,
  TrackingLogType,
  UserRole,
  VisitStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../shared/mail.service';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { UpdateDealerProfileSelfDto } from './dto/update-dealer-profile-self.dto';
import {
  DealerAnalyticsSortBy,
  GetDealerAnalyticsDto,
} from './dto/get-dealer-analytics.dto';
import {
  DashboardGranularity,
  GetDealerDashboardDto,
} from './dto/get-dealer-dashboard.dto';
import {
  buildDashboardBucketKeys,
  getDashboardBucketKey,
  resolveDashboardDateRange,
} from '../shared/utils/dashboard-bucket.util';

@Injectable()
export class DealersService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Admin-direct dealer account creation (bypasses onboarding flow).
   */
  async create(dto: CreateDealerDto) {
    // Check email uniqueness
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    if (dto.contactPhone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone: dto.contactPhone },
      });
      if (existingPhone) {
        throw new ConflictException(
          'A user with this phone number already exists',
        );
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.contactPhone ?? null,
          password: hashedPassword,
          role: UserRole.DEALER,
          authProvider: AuthProvider.LOCAL,
          isProfileComplete: true,
          isActive: true,
        },
      });

      const profile = await tx.dealerProfile.create({
        data: {
          userId: user.id,
          dealerName: dto.dealerName,
          contactPhone: dto.contactPhone ?? null,
          tradeNumber: dto.tradeNumber ?? null,
          reraNumber: dto.reraNumber ?? null,
          address: dto.address ?? null,
          city: dto.city ?? null,
          website: dto.website ?? null,
          description: dto.description ?? null,
          facebook: dto.facebook ?? null,
          youtube: dto.youtube ?? null,
          whatsapp: dto.whatsapp ?? null,
          instagram: dto.instagram ?? null,
        },
      });

      return { user, profile };
    });

    // Fire-and-forget welcome email (re-uses approval template)
    this.mail.sendDealerApprovalEmail(dto.email, dto.name, dto.password);

    const { password, googleId, appleId, ...safeUser } = result.user as any;

    return {
      ...safeUser,
      dealerProfile: result.profile,
    };
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = {
      role: UserRole.DEALER,
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          {
            dealerProfile: {
              dealerName: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
          dealerProfile: true,
          dealerSubscriptions: {
            where: {
              paymentStatus: { in: ['PAID', 'FREE'] },
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            },
            take: 1,
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Resolve agency membership (dealer + their active staff) for the whole page in one query,
    // so the active-property count matches everything the dealer's listings/analytics endpoints
    // consider "theirs" (staff-created listings included).
    const dealerIds = users.map((u) => u.id);
    const staffRecords = dealerIds.length
      ? await this.prisma.dealerStaff.findMany({
          where: { dealerUserId: { in: dealerIds }, isActive: true },
          select: { dealerUserId: true, staffUserId: true },
        })
      : [];

    const agencyCreatorIds = new Map<string, string[]>(
      dealerIds.map((id) => [id, [id]]),
    );
    staffRecords.forEach((s) =>
      agencyCreatorIds.get(s.dealerUserId)?.push(s.staffUserId),
    );

    const allCreatorIds = Array.from(
      new Set([...dealerIds, ...staffRecords.map((s) => s.staffUserId)]),
    );
    const activeCounts = allCreatorIds.length
      ? await this.prisma.listing.groupBy({
          by: ['createdById'],
          where: {
            createdById: { in: allCreatorIds },
            status: ListingStatus.ACTIVE,
          },
          _count: true,
        })
      : [];
    const countByCreator = new Map(
      activeCounts.map((c) => [c.createdById, c._count]),
    );

    const mappedUsers = users.map((user) => {
      const { dealerSubscriptions, ...rest } = user;
      const creatorIds = agencyCreatorIds.get(user.id) ?? [user.id];
      const activePropertiesCount = creatorIds.reduce(
        (sum, cid) => sum + (countByCreator.get(cid) ?? 0),
        0,
      );
      return {
        ...rest,
        hasActiveSubscription: dealerSubscriptions.length > 0,
        /** Count of currently ACTIVE (unsold) listings across the dealer + their staff */
        activePropertiesCount,
      };
    });

    return {
      data: mappedUsers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        dealerProfile: true,
        dealerApplication: {
          select: {
            submissionId: true,
            status: true,
            reviews: { orderBy: { reviewedAt: 'desc' } },
          },
        },
        dealerSubscriptions: {
          where: {
            paymentStatus: { in: ['PAID', 'FREE'] },
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
          },
          take: 1,
          include: { plan: true },
        },
      },
    });

    if (!user || !user.dealerProfile) {
      throw new NotFoundException(`Dealer with ID "${id}" not found`);
    }

    // Get staff member user IDs to include listings posted by dealer's staff
    const staffMembers = await this.prisma.dealerStaff.findMany({
      where: { dealerUserId: id, isActive: true },
      select: { staffUserId: true },
    });
    const staffIds = staffMembers.map((s) => s.staffUserId);
    const allCreatorIds = [id, ...staffIds];

    const listings = await this.prisma.listing.findMany({
      where: {
        createdById: { in: allCreatorIds },
      },
      select: {
        id: true,
        referenceCode: true,
        slug: true,
        propertyName: true,
        description: true,
        purpose: true,
        typeId: true,
        type: { select: { id: true, title: true } },
        price: true,
        priceNegotiable: true,
        bedrooms: true,
        bathrooms: true,
        area: true,
        livingRooms: true,
        parkingSpaces: true,
        addressLine1: true,
        addressLine2: true,
        areaName: true,
        municipalityId: true,
        municipality: { select: { id: true, name: true, image: true } },
        contactPhone: true,
        contactWhatsapp: true,
        amenities: true,
        nearbyTags: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        photos: {
          select: {
            id: true,
            url: true,
            minioKey: true,
            caption: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const activePropertiesCount = listings.filter(
      (l) => l.status === ListingStatus.ACTIVE,
    ).length;

    const { dealerSubscriptions, ...rest } = user;
    return {
      ...rest,
      listings,
      hasActiveSubscription: dealerSubscriptions.length > 0,
      activeSubscription: dealerSubscriptions[0] || null,
      /** Count of currently ACTIVE (unsold) listings across the dealer + their staff */
      activePropertiesCount,
    };
  }

  async update(id: string, dto: UpdateDealerDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== UserRole.DEALER) {
      throw new NotFoundException(`Dealer with ID "${id}" not found`);
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) throw new ConflictException('Email already in use');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.name || dto.email || dto.contactPhone) {
        await tx.user.update({
          where: { id },
          data: {
            ...(dto.name && { name: dto.name }),
            ...(dto.email && { email: dto.email }),
            ...(dto.contactPhone && { phone: dto.contactPhone }),
          },
        });
      }

      const updatedProfile = await tx.dealerProfile.update({
        where: { userId: id },
        data: {
          ...(dto.dealerName !== undefined && { dealerName: dto.dealerName }),
          ...(dto.contactPhone !== undefined && {
            contactPhone: dto.contactPhone,
          }),
          ...(dto.tradeNumber !== undefined && {
            tradeNumber: dto.tradeNumber,
          }),
          ...(dto.reraNumber !== undefined && { reraNumber: dto.reraNumber }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.website !== undefined && { website: dto.website }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.facebook !== undefined && { facebook: dto.facebook }),
          ...(dto.youtube !== undefined && { youtube: dto.youtube }),
          ...(dto.whatsapp !== undefined && { whatsapp: dto.whatsapp }),
          ...(dto.instagram !== undefined && { instagram: dto.instagram }),
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      return updatedProfile;
    });
  }

  // ─── Dealer: Self Profile Get ───────────────────────────────────────────────

  /**
   * Full profile for the dealer's own public page: cover/logo images, social/contact links,
   * property stats (sold/active across the whole agency incl. staff), free-listing/featured
   * quota, and current subscription plan details (name, discounts, expiry, days remaining).
   * Callable by the dealer themselves or any of their active staff (staff see their agency's).
   */
  async getMyProfile(userId: string, userRole: UserRole) {
    let dealerUserId: string;

    if (userRole === UserRole.DEALER) {
      dealerUserId = userId;
    } else if (userRole === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: userId },
        select: { dealerUserId: true, isActive: true },
      });
      if (!staffRecord?.isActive) {
        throw new ForbiddenException('Your staff account is inactive');
      }
      dealerUserId = staffRecord.dealerUserId;
    } else {
      throw new ForbiddenException(
        'Only dealers or dealer staff can view this profile',
      );
    }

    const [user, staffRecords] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: dealerUserId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
          dealerProfile: true,
        },
      }),
      this.prisma.dealerStaff.findMany({
        where: { dealerUserId, isActive: true },
        select: { staffUserId: true },
      }),
    ]);

    if (!user || !user.dealerProfile) {
      throw new NotFoundException('Dealer profile not found');
    }

    // Agency = dealer + all active staff — listings created by any of them belong to the agency
    const agencyUserIds = [
      dealerUserId,
      ...staffRecords.map((s) => s.staffUserId),
    ];
    const now = new Date();

    const [soldCount, activeCount, activeSubscription] = await Promise.all([
      this.prisma.listing.count({
        where: {
          createdById: { in: agencyUserIds },
          status: ListingStatus.SOLD,
        },
      }),
      this.prisma.listing.count({
        where: {
          createdById: { in: agencyUserIds },
          status: ListingStatus.ACTIVE,
        },
      }),
      this.prisma.dealerSubscription.findFirst({
        where: {
          dealerId: dealerUserId,
          paymentStatus: { in: ['PAID', 'FREE'] },
          startDate: { lte: now },
          endDate: { gte: now },
        },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
    ]);

    const daysRemaining = activeSubscription
      ? Math.max(
          0,
          Math.ceil(
            (activeSubscription.endDate.getTime() - now.getTime()) / 86_400_000,
          ),
        )
      : 0;

    const { dealerProfile: p } = user;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      memberSince: user.createdAt,

      dealerName: p.dealerName,
      tagline: p.tagline,
      description: p.description,
      coverImage: p.coverImage,
      logoImage: p.logoImage,
      contactPhone: p.contactPhone,
      address: p.address,
      city: p.city,
      country: p.country,
      tradeNumber: p.tradeNumber,
      reraNumber: p.reraNumber,

      links: {
        website: p.website,
        facebook: p.facebook,
        youtube: p.youtube,
        whatsapp: p.whatsapp,
        instagram: p.instagram,
      },

      stats: {
        soldPropertiesCount: soldCount,
        activePropertiesCount: activeCount,
        staffCount: agencyUserIds.length - 1,
      },

      quota: {
        remainingFreeListings: p.availableFreeListings,
        remainingFreeFeatured: p.availableFreeFeatured,
      },

      plan: activeSubscription
        ? {
            hasActivePlan: true,
            planId: activeSubscription.planId,
            planName: activeSubscription.plan.name,
            maxListings: activeSubscription.plan.maxListings,
            listingDiscountPercent: p.currentListingDiscountPercent,
            featuringDiscountPercent: p.currentFeaturingDiscountPercent,
            startDate: activeSubscription.startDate,
            endDate: activeSubscription.endDate,
            daysRemaining,
            isExpired: false,
          }
        : {
            hasActivePlan: false,
            planId: null,
            planName: null,
            maxListings: null,
            listingDiscountPercent: 0,
            featuringDiscountPercent: 0,
            startDate: null,
            endDate: p.subscriptionValidUntil,
            daysRemaining: 0,
            isExpired: true,
          },
    };
  }

  async updateMyProfile(dealerId: string, dto: UpdateDealerProfileSelfDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dealerId } });
    if (!user || user.role !== UserRole.DEALER) {
      throw new NotFoundException(`Dealer account not found`);
    }

    // Update phone on User record if provided
    if (dto.contactPhone && dto.contactPhone !== user.phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone: dto.contactPhone },
      });
      if (existingPhone && existingPhone.id !== dealerId) {
        throw new ConflictException('Phone number already in use');
      }
      await this.prisma.user.update({
        where: { id: dealerId },
        data: { phone: dto.contactPhone },
      });
    }

    const updatedProfile = await this.prisma.dealerProfile.update({
      where: { userId: dealerId },
      data: {
        ...(dto.dealerName !== undefined && { dealerName: dto.dealerName }),
        ...(dto.contactPhone !== undefined && {
          contactPhone: dto.contactPhone,
        }),
        ...(dto.tagline !== undefined && { tagline: dto.tagline }),
        ...(dto.coverImage !== undefined && { coverImage: dto.coverImage }),
        ...(dto.logoImage !== undefined && { logoImage: dto.logoImage }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.facebook !== undefined && { facebook: dto.facebook }),
        ...(dto.youtube !== undefined && { youtube: dto.youtube }),
        ...(dto.whatsapp !== undefined && { whatsapp: dto.whatsapp }),
        ...(dto.instagram !== undefined && { instagram: dto.instagram }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return updatedProfile;
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== UserRole.DEALER) {
      throw new NotFoundException(`Dealer with ID "${id}" not found`);
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: `Dealer account deactivated successfully` };
  }

  // ─── Dealer Web Analytics ──────────────────────────────────────────────────

  async getDealerAnalytics(
    requestingUserId: string,
    requestingUserRole: UserRole,
    dto: GetDealerAnalyticsDto,
  ) {
    let dealerUserId: string;

    if (requestingUserRole === UserRole.DEALER) {
      dealerUserId = requestingUserId;
    } else if (requestingUserRole === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: requestingUserId },
        select: { dealerUserId: true, isActive: true },
      });
      if (!staffRecord?.isActive) {
        throw new ForbiddenException('Your staff account is inactive');
      }
      dealerUserId = staffRecord.dealerUserId;
    } else {
      throw new ForbiddenException(
        'Only dealers or dealer staff can view dealer analytics',
      );
    }

    // Collect all agency user IDs (dealer + staff)
    const staffMembers = await this.prisma.dealerStaff.findMany({
      where: { dealerUserId, isActive: true },
      select: {
        staffUserId: true,
        staffUser: { select: { id: true, name: true, email: true } },
      },
    });
    const staffIds = staffMembers.map((s) => s.staffUserId);
    const agencyUserIds = [dealerUserId, ...staffIds];

    let scopedCreatorIds = agencyUserIds;
    if (dto.staffUserId) {
      if (!agencyUserIds.includes(dto.staffUserId)) {
        throw new NotFoundException('Staff member not found in this agency');
      }
      scopedCreatorIds = [dto.staffUserId];
    }

    const where: Prisma.ListingWhereInput = {
      createdById: { in: scopedCreatorIds },
    };

    if (dto.listingId) {
      where.OR = [
        { id: dto.listingId },
        { slug: dto.listingId },
      ];
    }

    if (dto.typeId) {
      where.typeId = dto.typeId;
    }

    if (dto.municipalityId) {
      where.municipalityId = dto.municipalityId;
    }

    if (dto.areaName) {
      where.areaName = { contains: dto.areaName, mode: 'insensitive' };
    }

    if (dto.search) {
      const searchOr: Prisma.ListingWhereInput[] = [
        { propertyName: { contains: dto.search, mode: 'insensitive' } },
        { slug: { contains: dto.search, mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: searchOr }];
      } else {
        where.OR = searchOr;
      }
    }

    if (dto.status) {
      where.status = dto.status;
    }

    if (dto.purpose) {
      where.purpose = dto.purpose;
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;
    const sortBy = dto.sortBy ?? DealerAnalyticsSortBy.VIEWS_COUNT;
    const sortOrder = dto.sortOrder ?? 'desc';

    const effectiveStartDate = dto.startDate ?? dto.from ?? dto.start;
    const effectiveEndDate = dto.endDate ?? dto.to ?? dto.end;
    const hasDateFilter = Boolean(effectiveStartDate || effectiveEndDate);

    const dateFilter: Prisma.DateTimeFilter = {};
    if (effectiveStartDate) {
      const s = new Date(effectiveStartDate);
      if (effectiveStartDate.length <= 10) s.setUTCHours(0, 0, 0, 0);
      dateFilter.gte = s;
    }
    if (effectiveEndDate) {
      const e = new Date(effectiveEndDate);
      if (effectiveEndDate.length <= 10) e.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = e;
    }

    const now = new Date();

    // 1. Overview counts for agency listings matching filters
    const [
      totalListings,
      activeListings,
      pendingListings,
      rejectedListings,
      soldListings,
      activeFeaturedListings,
      aggregateTotals,
      totalVisitsCount,
      totalConversationsCount,
    ] = await Promise.all([
      this.prisma.listing.count({
        where,
      }),
      this.prisma.listing.count({
        where: {
          ...where,
          status: ListingStatus.ACTIVE,
        },
      }),
      this.prisma.listing.count({
        where: {
          ...where,
          status: { in: [ListingStatus.PENDING, ListingStatus.RESUBMITTED] },
        },
      }),
      this.prisma.listing.count({
        where: {
          ...where,
          status: ListingStatus.REJECTED,
        },
      }),
      this.prisma.listing.count({
        where: {
          ...where,
          status: ListingStatus.SOLD,
        },
      }),
      this.prisma.featuredSubscription.count({
        where: {
          listing: where,
          paymentStatus: { in: ['PAID', 'FREE'] },
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),
      this.prisma.listing.aggregate({
        where,
        _sum: {
          viewsCount: true,
          impressionsCount: true,
          reachCount: true,
        },
      }),
      this.prisma.propertyVisit.count({
        where: { listing: where },
      }),
      this.prisma.chatConversation.count({
        where: {
          listing: where,
        },
      }),
    ]);

    let periodViews = aggregateTotals._sum.viewsCount ?? 0;
    let periodImpressions = aggregateTotals._sum.impressionsCount ?? 0;
    let periodReach = aggregateTotals._sum.reachCount ?? 0;

    // If date range filter is active, calculate precise period metrics from tracking logs
    if (hasDateFilter) {
      const matchingListings = await this.prisma.listing.findMany({
        where,
        select: { id: true },
      });
      const matchingListingIds = matchingListings.map((l) => l.id);

      if (matchingListingIds.length > 0) {
        const logWhere: Prisma.ListingTrackingLogWhereInput = {
          listingId: { in: matchingListingIds },
          createdAt: dateFilter,
        };

        const [impCount, vCount, reachGroups] = await Promise.all([
          this.prisma.listingTrackingLog.count({
            where: { ...logWhere, type: TrackingLogType.IMPRESSION },
          }),
          this.prisma.listingTrackingLog.count({
            where: { ...logWhere, type: TrackingLogType.VIEW },
          }),
          this.prisma.listingTrackingLog.groupBy({
            by: ['deviceId', 'listingId'],
            where: { ...logWhere, type: TrackingLogType.VIEW },
          }),
        ]);

        periodImpressions = impCount;
        periodViews = vCount;
        periodReach = reachGroups.length;
      }
    }

    // 2. Fetch paginated listing performance data
    const [listings, totalFiltered] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          propertyName: true,
          slug: true,
          status: true,
          purpose: true,
          price: true,
          viewsCount: true,
          impressionsCount: true,
          reachCount: true,
          createdAt: true,
          updatedAt: true,
          type: {
            select: { id: true, title: true },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          featuredSubscriptions: {
            where: {
              paymentStatus: { in: ['PAID', 'FREE'] },
              startDate: { lte: now },
              endDate: { gte: now },
            },
            select: { id: true },
            take: 1,
          },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    let formattedListings = listings.map((l) => {
      const isFeatured = l.featuredSubscriptions.length > 0;
      const { featuredSubscriptions, ...rest } = l;
      return {
        ...rest,
        isFeatured,
      };
    });

    if (hasDateFilter && listings.length > 0) {
      const listingIdsPage = listings.map((l) => l.id);
      const periodLogs = await this.prisma.listingTrackingLog.findMany({
        where: {
          listingId: { in: listingIdsPage },
          createdAt: dateFilter,
        },
        select: {
          listingId: true,
          type: true,
          deviceId: true,
        },
      });

      const periodMetricsMap = new Map<
        string,
        { views: number; impressions: number; devices: Set<string> }
      >();

      for (const log of periodLogs) {
        if (!periodMetricsMap.has(log.listingId)) {
          periodMetricsMap.set(log.listingId, {
            views: 0,
            impressions: 0,
            devices: new Set(),
          });
        }
        const metric = periodMetricsMap.get(log.listingId)!;
        if (log.type === TrackingLogType.IMPRESSION) {
          metric.impressions += 1;
        } else if (log.type === TrackingLogType.VIEW) {
          metric.views += 1;
          metric.devices.add(log.deviceId);
        }
      }

      formattedListings = formattedListings.map((l) => {
        const periodMetric = periodMetricsMap.get(l.id);
        return {
          ...l,
          periodViewsCount: periodMetric ? periodMetric.views : 0,
          periodImpressionsCount: periodMetric ? periodMetric.impressions : 0,
          periodReachCount: periodMetric ? periodMetric.devices.size : 0,
        };
      });
    }

    return {
      filtersApplied: {
        startDate: effectiveStartDate ?? null,
        endDate: effectiveEndDate ?? null,
        search: dto.search ?? null,
        status: dto.status ?? null,
        purpose: dto.purpose ?? null,
        typeId: dto.typeId ?? null,
        staffUserId: dto.staffUserId ?? null,
        listingId: dto.listingId ?? null,
        municipalityId: dto.municipalityId ?? null,
        areaName: dto.areaName ?? null,
        sortBy,
        sortOrder,
      },
      overview: {
        totalListings,
        activeListings,
        pendingListings,
        rejectedListings,
        soldListings,
        activeFeaturedListings,
        totalViews: aggregateTotals._sum.viewsCount ?? 0,
        totalImpressions: aggregateTotals._sum.impressionsCount ?? 0,
        totalReach: aggregateTotals._sum.reachCount ?? 0,
        periodViews,
        periodImpressions,
        periodReach,
        totalStaffMembers: staffMembers.length,
        totalVisitsCount,
        totalConversationsCount,
      },
      listings: formattedListings,
      meta: {
        total: totalFiltered,
        page,
        limit,
        totalPages: Math.ceil(totalFiltered / limit),
      },
    };
  }

  // ─── Dealer Full Analytics Dashboard ───────────────────────────────────────

  /**
   * Single all-in-one analytics dashboard for a dealer agency (dealer + all dealer staff).
   * Combines listing status counts, engagement metrics (views/impressions/reach), in-app
   * chat + WhatsApp chat-initiation counts, scheduled property visits, remaining free
   * listing/featured quota, active subscription plan expiry, total property sales, and a
   * visits-vs-views-vs-chats trend graph — all behind one call with fully optional filters.
   */
  async getDealerDashboard(
    requestingUserId: string,
    requestingUserRole: UserRole,
    dto: GetDealerDashboardDto,
  ) {
    let dealerUserId: string;

    if (requestingUserRole === UserRole.DEALER) {
      dealerUserId = requestingUserId;
    } else if (requestingUserRole === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: requestingUserId },
        select: { dealerUserId: true, isActive: true },
      });
      if (!staffRecord?.isActive) {
        throw new ForbiddenException('Your staff account is inactive');
      }
      dealerUserId = staffRecord.dealerUserId;
    } else {
      throw new ForbiddenException(
        'Only dealers or dealer staff can view the dealer dashboard',
      );
    }

    return this.buildDealerDashboard(dealerUserId, dto);
  }

  /**
   * Admin/moderator view of a specific dealer's full analytics dashboard — same data a
   * dealer sees about themselves (GET /dealers/analytics/dashboard), scoped to whichever
   * dealer the admin picks.
   */
  async getDealerDashboardForAdmin(
    dealerUserId: string,
    dto: GetDealerDashboardDto,
  ) {
    const dealer = await this.prisma.user.findUnique({
      where: { id: dealerUserId },
      select: { id: true, role: true },
    });
    if (!dealer || dealer.role !== UserRole.DEALER) {
      throw new NotFoundException(`Dealer with ID "${dealerUserId}" not found`);
    }

    return this.buildDealerDashboard(dealerUserId, dto);
  }

  private async buildDealerDashboard(
    dealerUserId: string,
    dto: GetDealerDashboardDto,
  ) {
    const [dealerProfile, staffMembers] = await Promise.all([
      this.prisma.dealerProfile.findUnique({ where: { userId: dealerUserId } }),
      this.prisma.dealerStaff.findMany({
        where: { dealerUserId, isActive: true },
        select: {
          staffUserId: true,
          position: true,
          staffUser: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const staffIds = staffMembers.map((s) => s.staffUserId);
    const agencyUserIds = [dealerUserId, ...staffIds];

    // Optional staff filter — restrict the whole dashboard to one agency member
    let scopedCreatorIds = agencyUserIds;
    if (dto.staffUserId) {
      if (!agencyUserIds.includes(dto.staffUserId)) {
        throw new NotFoundException('Staff member not found in this agency');
      }
      scopedCreatorIds = [dto.staffUserId];
    }

    const { start, end, normalizedGranularity } = resolveDashboardDateRange(
      dto.startDate ?? dto.from ?? dto.start,
      dto.endDate ?? dto.to ?? dto.end,
      dto.granularity,
    );
    const granularity = normalizedGranularity;
    const periodFilter: Prisma.DateTimeFilter = { gte: start, lte: end };
    const now = new Date();

    // Status-agnostic base filter — agency/staff scope + property/type/purpose/location.
    // Used for the status breakdown itself (a status filter here would be self-defeating).
    const baseListingFilter: Prisma.ListingWhereInput = {
      createdById: { in: scopedCreatorIds },
      ...(dto.typeId && { typeId: dto.typeId }),
      ...(dto.purpose && { purpose: dto.purpose }),
      ...(dto.municipalityId && { municipalityId: dto.municipalityId }),
      ...(dto.areaName && {
        areaName: { contains: dto.areaName, mode: 'insensitive' },
      }),
    };

    if (dto.listingId) {
      const foundListing = await this.prisma.listing.findFirst({
        where: {
          createdById: { in: scopedCreatorIds },
          OR: [{ id: dto.listingId }, { slug: dto.listingId }],
        },
        select: { id: true },
      });
      if (!foundListing) {
        throw new NotFoundException('Property not found in this agency');
      }
      baseListingFilter.id = foundListing.id;
    }

    // Full filter — adds the optional status filter, used for everything except the status breakdown
    const listingFilter: Prisma.ListingWhereInput = {
      ...baseListingFilter,
      ...(dto.status && { status: dto.status }),
    };

    const [
      totalListings,
      openListings,
      pendingListings,
      rejectedListings,
      soldListings,
      inactiveListings,
      activeFeaturedListings,
      aggregateTotals,
      soldAggregate,
      activeSubscription,
    ] = await Promise.all([
      this.prisma.listing.count({ where: baseListingFilter }),
      this.prisma.listing.count({
        where: { ...baseListingFilter, status: ListingStatus.ACTIVE },
      }),
      this.prisma.listing.count({
        where: {
          ...baseListingFilter,
          status: { in: [ListingStatus.PENDING, ListingStatus.RESUBMITTED] },
        },
      }),
      this.prisma.listing.count({
        where: { ...baseListingFilter, status: ListingStatus.REJECTED },
      }),
      this.prisma.listing.count({
        where: { ...baseListingFilter, status: ListingStatus.SOLD },
      }),
      this.prisma.listing.count({
        where: { ...baseListingFilter, status: ListingStatus.INACTIVE },
      }),
      this.prisma.featuredSubscription.count({
        where: {
          listing: listingFilter,
          paymentStatus: { in: ['PAID', 'FREE'] },
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),
      this.prisma.listing.aggregate({
        where: listingFilter,
        _sum: {
          viewsCount: true,
          impressionsCount: true,
          reachCount: true,
          whatsappClicksCount: true,
        },
      }),
      this.prisma.listing.aggregate({
        where: { ...baseListingFilter, status: ListingStatus.SOLD },
        _sum: { price: true },
        _count: true,
      }),
      this.prisma.dealerSubscription.findFirst({
        where: {
          dealerId: dealerUserId,
          paymentStatus: { in: ['PAID', 'FREE'] },
          startDate: { lte: now },
          endDate: { gte: now },
        },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
    ]);

    const [
      periodImpressions,
      periodViews,
      periodWhatsappClicks,
      periodReachGroups,
      totalConversations,
      periodConversations,
      distinctChatUsersTotal,
      distinctChatUsersPeriod,
      totalVisits,
      periodVisits,
      visitsByStatusRaw,
      viewLogs,
      whatsappLogs,
      visitLogs,
      chatLogs,
      topListings,
    ] = await Promise.all([
      this.prisma.listingTrackingLog.count({
        where: {
          listing: listingFilter,
          type: TrackingLogType.IMPRESSION,
          createdAt: periodFilter,
        },
      }),
      this.prisma.listingTrackingLog.count({
        where: {
          listing: listingFilter,
          type: TrackingLogType.VIEW,
          createdAt: periodFilter,
        },
      }),
      this.prisma.listingTrackingLog.count({
        where: {
          listing: listingFilter,
          type: TrackingLogType.WHATSAPP_CLICK,
          createdAt: periodFilter,
        },
      }),
      this.prisma.listingTrackingLog.groupBy({
        by: ['deviceId', 'listingId'],
        where: {
          listing: listingFilter,
          type: TrackingLogType.VIEW,
          createdAt: periodFilter,
        },
      }),
      this.prisma.chatConversation.count({ where: { listing: listingFilter } }),
      this.prisma.chatConversation.count({
        where: { listing: listingFilter, createdAt: periodFilter },
      }),
      this.prisma.chatConversation.findMany({
        where: { listing: listingFilter },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.chatConversation.findMany({
        where: { listing: listingFilter, createdAt: periodFilter },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.propertyVisit.count({ where: { listing: listingFilter } }),
      this.prisma.propertyVisit.count({
        where: { listing: listingFilter, createdAt: periodFilter },
      }),
      this.prisma.propertyVisit.groupBy({
        by: ['status'],
        where: { listing: listingFilter },
        _count: true,
      }),
      this.prisma.listingTrackingLog.findMany({
        where: {
          listing: listingFilter,
          type: TrackingLogType.VIEW,
          createdAt: periodFilter,
        },
        select: { createdAt: true },
      }),
      this.prisma.listingTrackingLog.findMany({
        where: {
          listing: listingFilter,
          type: TrackingLogType.WHATSAPP_CLICK,
          createdAt: periodFilter,
        },
        select: { createdAt: true },
      }),
      this.prisma.propertyVisit.findMany({
        where: { listing: listingFilter, createdAt: periodFilter },
        select: { createdAt: true },
      }),
      this.prisma.chatConversation.findMany({
        where: { listing: listingFilter, createdAt: periodFilter },
        select: { createdAt: true },
      }),
      this.prisma.listing.findMany({
        where: listingFilter,
        orderBy: { viewsCount: 'desc' },
        take: 5,
        select: {
          id: true,
          propertyName: true,
          slug: true,
          referenceCode: true,
          status: true,
          purpose: true,
          price: true,
          viewsCount: true,
          reachCount: true,
          whatsappClicksCount: true,
          type: { select: { id: true, title: true } },
          _count: { select: { conversations: true, visits: true } },
        },
      }),
    ]);

    const visitsByStatus = Object.fromEntries(
      Object.values(VisitStatus).map((s) => [s, 0]),
    ) as Record<string, number>;
    visitsByStatusRaw.forEach((row) => {
      visitsByStatus[row.status] = row._count;
    });

    // ── Trend graph: views vs visits vs chats vs WhatsApp clicks ─────────────
    const bucketKeys = buildDashboardBucketKeys(start, end, granularity);
    const bucketIndex = new Map(bucketKeys.map((key, i) => [key, i]));
    const series = bucketKeys.map((period) => ({
      period,
      views: 0,
      visits: 0,
      chats: 0,
      whatsappChats: 0,
    }));

    const fillSeries = (
      rows: { createdAt: Date }[],
      field: 'views' | 'visits' | 'chats' | 'whatsappChats',
    ) => {
      for (const row of rows) {
        const key = getDashboardBucketKey(row.createdAt, granularity);
        const idx = bucketIndex.get(key);
        if (idx !== undefined) series[idx][field] += 1;
      }
    };
    fillSeries(viewLogs, 'views');
    fillSeries(visitLogs, 'visits');
    fillSeries(chatLogs, 'chats');
    fillSeries(whatsappLogs, 'whatsappChats');

    // ── Subscription / plan quota ─────────────────────────────────────────────
    const daysRemaining = activeSubscription
      ? Math.max(
          0,
          Math.ceil(
            (activeSubscription.endDate.getTime() - now.getTime()) / 86_400_000,
          ),
        )
      : 0;

    return {
      filtersApplied: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        granularity,
        listingId: dto.listingId ?? null,
        staffUserId: dto.staffUserId ?? null,
        typeId: dto.typeId ?? null,
        purpose: dto.purpose ?? null,
        status: dto.status ?? null,
        municipalityId: dto.municipalityId ?? null,
        areaName: dto.areaName ?? null,
      },
      overview: {
        listings: {
          total: totalListings,
          open: openListings,
          pending: pendingListings,
          rejected: rejectedListings,
          sold: soldListings,
          inactive: inactiveListings,
          activeFeatured: activeFeaturedListings,
        },
        engagement: {
          totalViews: aggregateTotals._sum.viewsCount ?? 0,
          periodViews,
          totalImpressions: aggregateTotals._sum.impressionsCount ?? 0,
          periodImpressions,
          totalReach: aggregateTotals._sum.reachCount ?? 0,
          periodReach: periodReachGroups.length,
        },
        chats: {
          totalConversations,
          periodConversations,
          totalUsersStartedChat: distinctChatUsersTotal.length,
          periodUsersStartedChat: distinctChatUsersPeriod.length,
        },
        whatsapp: {
          totalClicks: aggregateTotals._sum.whatsappClicksCount ?? 0,
          periodClicks: periodWhatsappClicks,
        },
        visits: {
          total: totalVisits,
          period: periodVisits,
          byStatus: visitsByStatus,
        },
        quota: {
          remainingFreeListings: dealerProfile?.availableFreeListings ?? 0,
          remainingFreeFeatured: dealerProfile?.availableFreeFeatured ?? 0,
        },
        subscription: activeSubscription
          ? {
              hasActivePlan: true,
              planId: activeSubscription.planId,
              planName: activeSubscription.plan.name,
              maxListings: activeSubscription.plan.maxListings,
              startDate: activeSubscription.startDate,
              endDate: activeSubscription.endDate,
              daysRemaining,
              isExpired: false,
            }
          : {
              hasActivePlan: false,
              planId: null,
              planName: null,
              maxListings: null,
              startDate: null,
              endDate: dealerProfile?.subscriptionValidUntil ?? null,
              daysRemaining: 0,
              isExpired: true,
            },
        staff: {
          totalStaffMembers: staffMembers.length,
          members: staffMembers.map((s) => ({
            id: s.staffUserId,
            name: s.staffUser.name,
            email: s.staffUser.email,
            position: s.position,
          })),
        },
        sales: {
          soldCount: soldAggregate._count,
          soldValue: soldAggregate._sum.price ?? 0,
        },
      },
      graph: {
        granularity,
        series,
      },
      topListings: topListings.map((l) => ({
        id: l.id,
        propertyName: l.propertyName,
        slug: l.slug,
        referenceCode: l.referenceCode,
        status: l.status,
        purpose: l.purpose,
        price: l.price,
        type: l.type,
        viewsCount: l.viewsCount,
        reachCount: l.reachCount,
        whatsappClicksCount: l.whatsappClicksCount,
        conversationsCount: l._count.conversations,
        visitsCount: l._count.visits,
      })),
    };
  }

  // ─── Dashboard date-bucketing helpers ──────────────────────────────────────
}
