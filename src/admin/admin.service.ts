import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthProvider,
  Prisma,
  TrackingLogType,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import { CreateModeratorDto } from './dto/create-moderator.dto';
import { UpdateModeratorDto } from './dto/update-moderator.dto';
import {
  GetAdminAnalyticsDto,
  AdminAnalyticsSortBy,
} from './dto/get-admin-analytics.dto';
import {
  DashboardGranularity,
  GetAdminDashboardDto,
} from './dto/get-admin-dashboard.dto';
import { UpdateListingSettingsDto } from './dto/update-listing-settings.dto';
import {
  buildDashboardBucketKeys,
  getDashboardBucketKey,
  resolveDashboardDateRange,
} from '../shared/utils/dashboard-bucket.util';

@Injectable()
export class AdminService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Helper ───────────────────────────────────────────────────────────────

  private omitSensitive<T extends Record<string, any>>(obj: T) {
    const { password, googleId, appleId, ...safe } = obj as any;
    return safe;
  }

  // ─── Super Admin ──────────────────────────────────────────────────────────

  /**
   * Create a Super Admin.
   * First super admin is protected by SETUP_SECRET header.
   * Subsequent ones require an authenticated SUPER_ADMIN.
   */
  async createSuperAdmin(
    dto: CreateSuperAdminDto,
    setupKey: string | undefined,
    requestingUserId: string | undefined,
  ) {
    const existingSuperAdmin = await this.prisma.user.findFirst({
      where: { role: UserRole.SUPER_ADMIN },
    });

    if (!existingSuperAdmin) {
      // First super admin — validate setup secret
      const configuredKey = this.configService.get<string>('SETUP_SECRET');
      if (!configuredKey || setupKey !== configuredKey) {
        throw new UnauthorizedException(
          'Invalid or missing X-Setup-Key header. Required for creating the first super admin.',
        );
      }
    } else {
      // Subsequent super admins — must be requested by an existing super admin
      if (!requestingUserId) {
        throw new UnauthorizedException('Authentication required');
      }
      const requester = await this.prisma.user.findUnique({
        where: { id: requestingUserId },
      });
      if (!requester || requester.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Only an existing Super Admin can create another Super Admin',
        );
      }
    }

    // Check email uniqueness
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        authProvider: AuthProvider.LOCAL,
        isProfileComplete: true,
        isActive: true,
      },
    });

    return this.omitSensitive(user);
  }

  // ─── Moderators ───────────────────────────────────────────────────────────

  /**
   * Create a new Moderator with specified permissions.
   * Only SUPER_ADMIN can perform this action.
   */
  async createModerator(dto: CreateModeratorDto, createdById: string) {
    // Check email uniqueness
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Create user and moderator profile in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone ?? null,
          password: hashedPassword,
          role: UserRole.MODERATOR,
          authProvider: AuthProvider.LOCAL,
          isProfileComplete: true,
          isActive: true,
        },
      });

      const profile = await tx.moderatorProfile.create({
        data: {
          userId: user.id,
          createdById,
          permissions: dto.permissions,
          notes: dto.notes ?? null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
              createdAt: true,
            },
          },
        },
      });

      return profile;
    });

    return result;
  }

  /**
   * List all moderators with their profiles and permissions.
   */
  async getModerators(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = search
      ? {
          user: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          },
        }
      : {};

    const [profiles, total] = await Promise.all([
      this.prisma.moderatorProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.moderatorProfile.count({ where }),
    ]);

    return {
      data: profiles,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single moderator by user ID.
   */
  async getModerator(userId: string) {
    const profile = await this.prisma.moderatorProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException(
        `Moderator with user ID "${userId}" not found`,
      );
    }

    return profile;
  }

  /**
   * Update a moderator's permissions, name, or status.
   */
  async updateModerator(userId: string, dto: UpdateModeratorDto) {
    const profile = await this.prisma.moderatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException(
        `Moderator with user ID "${userId}" not found`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Update user fields (name, phone, password, isActive)
      const userUpdateData: Record<string, any> = {};
      if (dto.name !== undefined) userUpdateData.name = dto.name;
      if (dto.phone !== undefined) userUpdateData.phone = dto.phone;
      if (dto.isActive !== undefined) userUpdateData.isActive = dto.isActive;
      if (dto.password !== undefined) {
        userUpdateData.password = await bcrypt.hash(
          dto.password,
          this.SALT_ROUNDS,
        );
      }

      if (Object.keys(userUpdateData).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userUpdateData,
        });
      }

      // Update moderator profile (permissions, notes)
      const updatedProfile = await tx.moderatorProfile.update({
        where: { userId },
        data: {
          ...(dto.permissions !== undefined && {
            permissions: dto.permissions,
          }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      return updatedProfile;
    });
  }

  /**
   * Deactivate a moderator (soft delete).
   */
  async deleteModerator(userId: string) {
    const profile = await this.prisma.moderatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException(
        `Moderator with user ID "${userId}" not found`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return { message: `Moderator account deactivated successfully` };
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  /**
   * Fetch total views, impressions, reach count, and individual listing analytics metrics.
   */
  async getAdminAnalytics(dto: GetAdminAnalyticsDto) {
    const where: Prisma.CarListingWhereInput = {};

    if (dto.search) {
      where.OR = [
        { title: { contains: dto.search, mode: 'insensitive' } },
        { slug: { contains: dto.search, mode: 'insensitive' } },
      ];
    }

    if (dto.status) {
      where.status = dto.status;
    }

    if (dto.purpose) {
      where.purpose = dto.purpose;
    }

    if (dto.modelId) {
      where.modelId = dto.modelId;
    }

    if (dto.dealerId) {
      const staffRecords = await this.prisma.dealerStaff.findMany({
        where: { dealerUserId: dto.dealerId, isActive: true },
        select: { staffUserId: true },
      });
      const creatorIds = [
        dto.dealerId,
        ...staffRecords.map((s) => s.staffUserId),
      ];
      where.createdById = { in: creatorIds };
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;
    const skip = (page - 1) * limit;
    const sortBy = dto.sortBy ?? AdminAnalyticsSortBy.VIEWS_COUNT;
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

    let totalViews = 0;
    let totalImpressions = 0;
    let totalReach = 0;
    let totalListings = 0;

    if (!hasDateFilter) {
      const aggregateTotals = await this.prisma.carListing.aggregate({
        where,
        _sum: {
          viewsCount: true,
          impressionsCount: true,
          reachCount: true,
        },
        _count: {
          id: true,
        },
      });

      totalViews = aggregateTotals._sum.viewsCount ?? 0;
      totalImpressions = aggregateTotals._sum.impressionsCount ?? 0;
      totalReach = aggregateTotals._sum.reachCount ?? 0;
      totalListings = aggregateTotals._count.id ?? 0;
    } else {
      const matchingListings = await this.prisma.carListing.findMany({
        where,
        select: { id: true },
      });
      totalListings = matchingListings.length;
      const listingIds = matchingListings.map((l) => l.id);

      if (listingIds.length > 0) {
        const logWhere: Prisma.CarListingTrackingLogWhereInput = {
          listingId: { in: listingIds },
          createdAt: dateFilter,
        };

        const [impCount, vCount, reachGroups] = await Promise.all([
          this.prisma.carListingTrackingLog.count({
            where: { ...logWhere, type: TrackingLogType.IMPRESSION },
          }),
          this.prisma.carListingTrackingLog.count({
            where: { ...logWhere, type: TrackingLogType.VIEW },
          }),
          this.prisma.carListingTrackingLog.groupBy({
            by: ['deviceId', 'listingId'],
            where: { ...logWhere, type: TrackingLogType.VIEW },
          }),
        ]);

        totalImpressions = impCount;
        totalViews = vCount;
        totalReach = reachGroups.length;
      }
    }

    const [listings, totalFiltered] = await Promise.all([
      this.prisma.carListing.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          purpose: true,
          price: true,
          viewsCount: true,
          impressionsCount: true,
          reachCount: true,
          createdAt: true,
          updatedAt: true,
          model: {
            select: {
              id: true,
              title: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              dealerProfile: {
                select: {
                  id: true,
                  dealerName: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.carListing.count({ where }),
    ]);

    let formattedListings = listings as any[];

    if (hasDateFilter && listings.length > 0) {
      const listingIdsPage = listings.map((l) => l.id);
      const periodLogs = await this.prisma.carListingTrackingLog.findMany({
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

      formattedListings = listings.map((l) => {
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
        modelId: dto.modelId ?? null,
        dealerId: dto.dealerId ?? null,
        sortBy,
        sortOrder,
      },
      totals: {
        totalViews,
        totalImpressions,
        totalReach,
        totalListings,
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

  // ─── Full Analytics Dashboard ──────────────────────────────────────────────

  /**
   * Single all-in-one platform analytics dashboard for admins/moderators.
   * Combines revenue (subscription / featured / pay-per-listing, broken down + totalled),
   * listing counts (incl. new listings & new sales), user/dealer growth, engagement metrics,
   * active subscription/featured counts, top revenue-generating dealers, and a revenue +
   * growth trend graph bucketed by day/week/month/year — behind one call with an optional
   * date range and graph granularity.
   */
  async getAdminDashboard(dto: GetAdminDashboardDto) {
    const { start, end, normalizedGranularity } = resolveDashboardDateRange(
      dto.startDate ?? dto.from ?? dto.start,
      dto.endDate ?? dto.to ?? dto.end,
      dto.granularity,
    );
    const granularity = normalizedGranularity;
    const periodFilter: Prisma.DateTimeFilter = { gte: start, lte: end };
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 86_400_000);

    const [
      totalUsers,
      totalDealers,
      activeDealers,
      totalDealerStaff,
      totalModerators,
      newUsersPeriod,
      newDealersPeriod,
      totalListings,
      activeListings,
      pendingListings,
      rejectedListings,
      soldListingsTotal,
      newListingsPeriod,
      soldValueTotalAggregate,
      subscriptionRevenueTotalAgg,
      subscriptionRevenuePeriodAgg,
      featuredRevenueTotalAgg,
      featuredRevenuePeriodAgg,
      listingRevenueTotalAgg,
      listingRevenuePeriodAgg,
      engagementTotals,
      periodImpressionsCount,
      periodViewsCount,
      periodWhatsappClicksCount,
      totalConversations,
      periodConversations,
      activeSubscriptionsCount,
      expiringSoonSubscriptionsCount,
      activeFeaturedCount,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.USER } }),
      this.prisma.user.count({ where: { role: UserRole.DEALER } }),
      this.prisma.user.count({
        where: { role: UserRole.DEALER, isActive: true },
      }),
      this.prisma.user.count({ where: { role: UserRole.DEALER_STAFF } }),
      this.prisma.user.count({ where: { role: UserRole.MODERATOR } }),
      this.prisma.user.count({
        where: { role: UserRole.USER, createdAt: periodFilter },
      }),
      this.prisma.user.count({
        where: { role: UserRole.DEALER, createdAt: periodFilter },
      }),
      this.prisma.carListing.count(),
      this.prisma.carListing.count({ where: { status: 'ACTIVE' } }),
      this.prisma.carListing.count({
        where: { status: { in: ['PENDING', 'RESUBMITTED'] } },
      }),
      this.prisma.carListing.count({ where: { status: 'REJECTED' } }),
      this.prisma.carListing.count({ where: { status: 'SOLD' } }),
      this.prisma.carListing.count({ where: { createdAt: periodFilter } }),
      this.prisma.carListing.aggregate({
        where: { status: 'SOLD' },
        _sum: { price: true },
      }),
      this.prisma.dealerSubscription.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { paidAmount: true },
      }),
      this.prisma.dealerSubscription.aggregate({
        where: { paymentStatus: 'PAID', createdAt: periodFilter },
        _sum: { paidAmount: true },
      }),
      this.prisma.featuredSubscription.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { paidAmount: true },
      }),
      this.prisma.featuredSubscription.aggregate({
        where: { paymentStatus: 'PAID', createdAt: periodFilter },
        _sum: { paidAmount: true },
      }),
      this.prisma.carListing.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { paidAmount: true },
      }),
      this.prisma.carListing.aggregate({
        where: { paymentStatus: 'PAID', createdAt: periodFilter },
        _sum: { paidAmount: true },
      }),
      this.prisma.carListing.aggregate({
        _sum: {
          viewsCount: true,
          impressionsCount: true,
          reachCount: true,
          whatsappClicksCount: true,
        },
      }),
      this.prisma.carListingTrackingLog.count({
        where: { type: TrackingLogType.IMPRESSION, createdAt: periodFilter },
      }),
      this.prisma.carListingTrackingLog.count({
        where: { type: TrackingLogType.VIEW, createdAt: periodFilter },
      }),
      this.prisma.carListingTrackingLog.count({
        where: {
          type: TrackingLogType.WHATSAPP_CLICK,
          createdAt: periodFilter,
        },
      }),
      this.prisma.chatConversation.count(),
      this.prisma.chatConversation.count({
        where: { createdAt: periodFilter },
      }),
      this.prisma.dealerSubscription.count({
        where: {
          paymentStatus: { in: ['PAID', 'FREE'] },
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),
      // Active subscriptions expiring within the next 7 days (renewal warning window)
      this.prisma.dealerSubscription.count({
        where: {
          paymentStatus: { in: ['PAID', 'FREE'] },
          endDate: { gte: now, lte: soon },
        },
      }),
      this.prisma.featuredSubscription.count({
        where: {
          paymentStatus: { in: ['PAID', 'FREE'] },
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),
    ]);

    const subscriptionRevenueTotal =
      subscriptionRevenueTotalAgg._sum.paidAmount ?? 0;
    const subscriptionRevenuePeriod =
      subscriptionRevenuePeriodAgg._sum.paidAmount ?? 0;
    const featuredRevenueTotal = featuredRevenueTotalAgg._sum.paidAmount ?? 0;
    const featuredRevenuePeriod = featuredRevenuePeriodAgg._sum.paidAmount ?? 0;
    const listingRevenueTotal = listingRevenueTotalAgg._sum.paidAmount ?? 0;
    const listingRevenuePeriod = listingRevenuePeriodAgg._sum.paidAmount ?? 0;

    // ── Trend graph: revenue + growth, bucketed ────────────────────────────────
    const [
      newUserRows,
      newDealerRows,
      newListingRows,
      newSaleRows,
      subRevenueRows,
      featuredRevenueRows,
      listingRevenueRows,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: UserRole.USER, createdAt: periodFilter },
        select: { createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { role: UserRole.DEALER, createdAt: periodFilter },
        select: { createdAt: true },
      }),
      this.prisma.carListing.findMany({
        where: { createdAt: periodFilter },
        select: { createdAt: true },
      }),
      this.prisma.carListing.findMany({
        where: {
          status: 'SOLD',
          OR: [
            { soldAt: periodFilter },
            { soldAt: null, updatedAt: periodFilter },
          ],
        },
        select: { soldAt: true, updatedAt: true, price: true },
      }),
      this.prisma.dealerSubscription.findMany({
        where: { paymentStatus: 'PAID', createdAt: periodFilter },
        select: { createdAt: true, paidAmount: true },
      }),
      this.prisma.featuredSubscription.findMany({
        where: { paymentStatus: 'PAID', createdAt: periodFilter },
        select: { createdAt: true, paidAmount: true },
      }),
      this.prisma.carListing.findMany({
        where: { paymentStatus: 'PAID', createdAt: periodFilter },
        select: { createdAt: true, paidAmount: true },
      }),
    ]);

    const bucketKeys = buildDashboardBucketKeys(start, end, granularity);
    const bucketIndex = new Map(bucketKeys.map((key, i) => [key, i]));
    const series = bucketKeys.map((period) => ({
      period,
      newUsers: 0,
      newDealers: 0,
      newListings: 0,
      newSalesCount: 0,
      newSalesValue: 0,
      subscriptionRevenue: 0,
      featuredRevenue: 0,
      listingRevenue: 0,
      totalRevenue: 0,
    }));

    const bucketOf = (date: Date) =>
      bucketIndex.get(getDashboardBucketKey(date, granularity));

    for (const row of newUserRows) {
      const idx = bucketOf(row.createdAt);
      if (idx !== undefined) series[idx].newUsers += 1;
    }
    for (const row of newDealerRows) {
      const idx = bucketOf(row.createdAt);
      if (idx !== undefined) series[idx].newDealers += 1;
    }
    for (const row of newListingRows) {
      const idx = bucketOf(row.createdAt);
      if (idx !== undefined) series[idx].newListings += 1;
    }
    for (const row of newSaleRows) {
      const saleDate = row.soldAt ?? row.updatedAt;
      if (!saleDate) continue;
      const idx = bucketOf(saleDate);
      if (idx !== undefined) {
        series[idx].newSalesCount += 1;
        series[idx].newSalesValue += row.price ?? 0;
      }
    }
    for (const row of subRevenueRows) {
      const idx = bucketOf(row.createdAt);
      if (idx !== undefined) {
        const amount = row.paidAmount ?? 0;
        series[idx].subscriptionRevenue += amount;
        series[idx].totalRevenue += amount;
      }
    }
    for (const row of featuredRevenueRows) {
      const idx = bucketOf(row.createdAt);
      if (idx !== undefined) {
        const amount = row.paidAmount ?? 0;
        series[idx].featuredRevenue += amount;
        series[idx].totalRevenue += amount;
      }
    }
    for (const row of listingRevenueRows) {
      const idx = bucketOf(row.createdAt);
      if (idx !== undefined) {
        const amount = row.paidAmount ?? 0;
        series[idx].listingRevenue += amount;
        series[idx].totalRevenue += amount;
      }
    }

    // ── Top 5 dealers by revenue generated (subscriptions + featured + pay-per-listing) ──
    const topDealersByRevenue = await this.getTopDealersByRevenue();

    return {
      filtersApplied: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        granularity,
      },
      overview: {
        users: {
          totalUsers,
          totalDealers,
          activeDealers,
          totalDealerStaff,
          totalModerators,
          newUsers: newUsersPeriod,
          newDealers: newDealersPeriod,
        },
        listings: {
          total: totalListings,
          active: activeListings,
          pending: pendingListings,
          rejected: rejectedListings,
          sold: soldListingsTotal,
          newListings: newListingsPeriod,
        },
        sales: {
          totalSoldCount: soldListingsTotal,
          totalSoldValue: soldValueTotalAggregate._sum.price ?? 0,
          newSalesCount: newSaleRows.length,
          newSalesValue: newSaleRows.reduce(
            (sum, r) => sum + (r.price ?? 0),
            0,
          ),
        },
        revenue: {
          subscription: {
            total: subscriptionRevenueTotal,
            period: subscriptionRevenuePeriod,
          },
          featured: {
            total: featuredRevenueTotal,
            period: featuredRevenuePeriod,
          },
          listing: { total: listingRevenueTotal, period: listingRevenuePeriod },
          total: {
            total:
              subscriptionRevenueTotal +
              featuredRevenueTotal +
              listingRevenueTotal,
            period:
              subscriptionRevenuePeriod +
              featuredRevenuePeriod +
              listingRevenuePeriod,
          },
        },
        engagement: {
          totalViews: engagementTotals._sum.viewsCount ?? 0,
          periodViews: periodViewsCount,
          totalImpressions: engagementTotals._sum.impressionsCount ?? 0,
          periodImpressions: periodImpressionsCount,
          totalReach: engagementTotals._sum.reachCount ?? 0,
          totalWhatsappClicks: engagementTotals._sum.whatsappClicksCount ?? 0,
          periodWhatsappClicks: periodWhatsappClicksCount,
          totalConversations,
          periodConversations,
        },
        subscriptions: {
          activeCount: activeSubscriptionsCount,
          expiringWithin7Days: expiringSoonSubscriptionsCount,
        },
        featured: {
          activeCount: activeFeaturedCount,
        },
      },
      graph: {
        granularity,
        series,
      },
      topDealersByRevenue,
    };
  }

  /** Ranks dealers by total confirmed (PAID) revenue across subscriptions, featured boosts, and pay-per-listing charges. */
  private async getTopDealersByRevenue(limit = 5) {
    const [dealerSubGroups, featuredGroups, listingGroups, staffRecords] =
      await Promise.all([
        this.prisma.dealerSubscription.groupBy({
          by: ['dealerId'],
          where: { paymentStatus: 'PAID' },
          _sum: { paidAmount: true },
        }),
        this.prisma.featuredSubscription.groupBy({
          by: ['createdById'],
          where: { paymentStatus: 'PAID' },
          _sum: { paidAmount: true },
        }),
        this.prisma.carListing.groupBy({
          by: ['createdById'],
          where: { paymentStatus: 'PAID' },
          _sum: { paidAmount: true },
        }),
        this.prisma.dealerStaff.findMany({
          select: { staffUserId: true, dealerUserId: true },
        }),
      ]);

    // Attribute staff-initiated purchases back to their parent dealer
    const staffToDealer = new Map(
      staffRecords.map((s) => [s.staffUserId, s.dealerUserId]),
    );
    const resolveDealerId = (userId: string) =>
      staffToDealer.get(userId) ?? userId;

    const revenueMap = new Map<string, number>();
    const addRevenue = (userId: string, amount: number) => {
      if (!amount) return;
      const dealerId = resolveDealerId(userId);
      revenueMap.set(dealerId, (revenueMap.get(dealerId) ?? 0) + amount);
    };

    dealerSubGroups.forEach((g) =>
      addRevenue(g.dealerId, g._sum.paidAmount ?? 0),
    );
    featuredGroups.forEach((g) =>
      addRevenue(g.createdById, g._sum.paidAmount ?? 0),
    );
    listingGroups.forEach((g) =>
      addRevenue(g.createdById, g._sum.paidAmount ?? 0),
    );

    const ranked = [...revenueMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    if (ranked.length === 0) return [];

    const dealers = await this.prisma.user.findMany({
      where: { id: { in: ranked.map(([id]) => id) } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        dealerProfile: { select: { dealerName: true } },
      },
    });
    const dealerById = new Map(dealers.map((d) => [d.id, d]));

    return ranked.map(([id, revenue]) => {
      const dealer = dealerById.get(id);
      return {
        id,
        name: dealer?.dealerProfile?.dealerName ?? dealer?.name ?? 'Unknown',
        email: dealer?.email ?? null,
        role: dealer?.role ?? null,
        revenue,
      };
    });
  }



  async getSystemSettings() {
    return this.prisma.systemSetting.findMany();
  }

  async getSystemSetting(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });
    if (!setting) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }
    return setting;
  }

  async updateSystemSetting(key: string, value: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  // ─── Listing Payment Settings ──────────────────────────────────────────────
  // Thin convenience wrapper over the generic system_settings key/value store —
  // keeps the two listing-economics keys (DEFAULT_LISTING_CHARGE, USER_FREE_LISTINGS_LIMIT)
  // readable/writable together instead of two separate raw /admin/settings/:key calls.

  async getListingSettings() {
    const [priceRow, limitRow] = await Promise.all([
      this.prisma.systemSetting.findUnique({
        where: { key: 'DEFAULT_LISTING_CHARGE' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'USER_FREE_LISTINGS_LIMIT' },
      }),
    ]);

    return {
      pricePerListing: priceRow ? parseFloat(priceRow.value) || 0 : 0,
      userFreeListingsLimit: limitRow ? parseInt(limitRow.value, 10) || 0 : 0,
    };
  }

  async updateListingSettings(dto: UpdateListingSettingsDto) {
    await Promise.all([
      dto.pricePerListing !== undefined &&
        this.prisma.systemSetting.upsert({
          where: { key: 'DEFAULT_LISTING_CHARGE' },
          update: { value: String(dto.pricePerListing) },
          create: {
            key: 'DEFAULT_LISTING_CHARGE',
            value: String(dto.pricePerListing),
          },
        }),
      dto.userFreeListingsLimit !== undefined &&
        this.prisma.systemSetting.upsert({
          where: { key: 'USER_FREE_LISTINGS_LIMIT' },
          update: { value: String(dto.userFreeListingsLimit) },
          create: {
            key: 'USER_FREE_LISTINGS_LIMIT',
            value: String(dto.userFreeListingsLimit),
          },
        }),
    ]);

    return this.getListingSettings();
  }
}
