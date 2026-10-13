import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FeaturedPaymentStatus,
  FeaturedPlanDuration,
  FeaturedPlacementLocation,
  InvoiceStatus,
  InvoiceType,
  ListingStatus,
  UserRole,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../shared/mail.service';
import { LISTING_SELECT } from '../listings/listings.service';
import { DealerSubscriptionsService } from '../dealer-subscriptions/dealer-subscriptions.service';
import { InvoicesService } from '../invoices/invoices.service';
import { AdminAddFeaturedDto } from './dto/admin-add-featured.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreateFeaturedPlanDto } from './dto/create-featured-plan.dto';
import { DealerAddFeaturedDto } from './dto/dealer-add-featured.dto';
import { QueryFeaturedDto } from './dto/query-featured.dto';
import { UpdateFeaturedPlanDto } from './dto/update-featured-plan.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Maps the enum value to a concrete number of days */
const DURATION_DAYS: Record<FeaturedPlanDuration, number> = {
  SEVEN_DAYS: 7,
  TWENTY_DAYS: 20,
  THIRTY_DAYS: 30,
};

/**
 * Fisher-Yates in-place shuffle — returns the array shuffled.
 * Applied to the active featured pool so every API call yields a different order.
 */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class FeaturedService {
  private _stripe: Stripe | null = null;

  private get stripe(): Stripe {
    if (!this._stripe) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
      this._stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    }
    return this._stripe;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly dealerSubService: DealerSubscriptionsService,
    private readonly mail: MailService,
    private readonly invoices: InvoicesService,
  ) {}

  /**
   * Fire-and-forget "your listing is now featured" email + invoice generation for the
   * free/instantly-activated paths (createCheckout's free branch, dealerAddFeatured's
   * free-quota branch) — never blocks/throws the caller.
   */
  private async sendFeaturedActivationEmail(
    listingId: string,
    planId: string,
    endDate: Date,
    amountPaid: number | null,
    subIds: string[] = [],
    userId?: string,
  ) {
    try {
      const [listing, plan] = await Promise.all([
        this.prisma.listing.findUnique({
          where: { id: listingId },
          select: {
            propertyName: true,
            createdBy: { select: { name: true, email: true } },
          },
        }),
        this.prisma.featuredPlan.findUnique({ where: { id: planId } }),
      ]);
      if (!plan) return;

      if (listing?.createdBy?.email) {
        this.mail.sendFeaturedActivationEmail(
          listing.createdBy.email,
          listing.createdBy.name ?? 'there',
          listing.propertyName,
          plan.name,
          plan.locations,
          plan.durationDays,
          endDate,
          amountPaid,
        );
      }

      if (userId && subIds.length > 0) {
        const amount = amountPaid ?? 0;
        this.invoices
          .createForTransaction({
            type: InvoiceType.FEATURED_LISTING,
            referenceId: subIds[0],
            billedToId: userId,
            description: `Featured Listing — ${listing?.propertyName ?? listingId}`,
            lineItems: [
              {
                description: `${plan.name} (${plan.durationDays} days, ${subIds.length} location${subIds.length > 1 ? 's' : ''})`,
                quantity: 1,
                unitPrice: amount,
                amount,
              },
            ],
            subtotal: amount,
            status: InvoiceStatus.FREE,
          })
          .catch(() => {});
      }
    } catch {
      // Non-critical — never fail the purchase flow because of an email/invoice issue
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Admin: Featured Plan Management
  // ────────────────────────────────────────────────────────────────────────────

  async createPlan(dto: CreateFeaturedPlanDto) {
    const durationDays = DURATION_DAYS[dto.duration];
    return this.prisma.featuredPlan.create({
      data: {
        name: dto.name,
        locations: dto.locations,
        duration: dto.duration,
        durationDays,
        price: dto.price,
      },
    });
  }

  async listPlans(includeInactive = false) {
    return this.prisma.featuredPlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ durationDays: 'asc' }],
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Dealer: List Plans (with subscription-aware pricing + free-quota info)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Same active plan catalog as `listPlans`, but each plan is annotated with the
   * requesting dealer's actual purchase terms: the discount from their active
   * subscription plan (if any), the resulting discounted price, and whether they
   * currently have free-featured quota available to activate it at no charge.
   */
  async listPlansForDealer(userId: string, userRole: UserRole) {
    let agencyUserId = userId;
    if (userRole === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: userId },
        select: { dealerUserId: true, isActive: true },
      });
      if (!staffRecord?.isActive) {
        throw new ForbiddenException('Your staff account is inactive');
      }
      agencyUserId = staffRecord.dealerUserId;
    }

    const [plans, dealerProfile] = await Promise.all([
      this.prisma.featuredPlan.findMany({
        where: { isActive: true },
        orderBy: [{ durationDays: 'asc' }],
      }),
      this.prisma.dealerProfile.findUnique({ where: { userId: agencyUserId } }),
    ]);

    const now = new Date();
    const hasActiveSubscription = Boolean(
      dealerProfile?.subscriptionValidUntil &&
      dealerProfile.subscriptionValidUntil > now,
    );
    const discountPercent = hasActiveSubscription
      ? dealerProfile!.currentFeaturingDiscountPercent
      : 0;
    const availableFreeFeatured = hasActiveSubscription
      ? dealerProfile!.availableFreeFeatured
      : 0;
    const isIncludedFree = hasActiveSubscription && availableFreeFeatured > 0;

    return plans.map((plan) => {
      const discountedPrice = Math.max(
        0,
        plan.price * (1 - discountPercent / 100),
      );
      return {
        id: plan.id,
        name: plan.name,
        locations: plan.locations,
        duration: plan.duration,
        durationDays: plan.durationDays,
        actualPrice: plan.price,
        discountPercent,
        discountedPrice,
        isIncludedFree,
        availableFreeFeatured,
      };
    });
  }

  async updatePlan(id: string, dto: UpdateFeaturedPlanDto) {
    await this.getPlanOrThrow(id);
    const durationDays = dto.duration ? DURATION_DAYS[dto.duration] : undefined;
    return this.prisma.featuredPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.locations !== undefined && { locations: dto.locations }),
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(durationDays !== undefined && { durationDays }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deletePlan(id: string) {
    await this.getPlanOrThrow(id);
    return this.prisma.featuredPlan.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async getPlanOrThrow(id: string) {
    const plan = await this.prisma.featuredPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`Featured plan ${id} not found`);
    return plan;
  }

  /** Appends Stripe's `{CHECKOUT_SESSION_ID}` template as a `session_id` query param, whatever the URL already has. */
  private appendSessionIdParam(url: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}session_id={CHECKOUT_SESSION_ID}`;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // User: Stripe Checkout
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Creates a Stripe Checkout Session.
   * If the requesting user is a DEALER with an active subscription plan,
   * the boostDiscountPercent from their plan is applied to the featured plan price.
   */
  async createCheckout(dto: CreateCheckoutDto, userId: string) {
    const plan = await this.getPlanOrThrow(dto.planId);
    if (!plan.isActive)
      throw new BadRequestException(
        'This featured plan is no longer available.',
      );

    // Verify the listing belongs to the requesting user
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      select: { id: true, propertyName: true, createdById: true, status: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.createdById !== userId) {
      throw new ForbiddenException('You can only feature your own listings');
    }
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE listings can be featured');
    }

    const now = new Date();

    // Apply dealer boost discount if applicable
    let discountPercent = 0;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, dealerProfile: true },
    });
    if (user?.role === UserRole.DEALER && user.dealerProfile) {
      const dp = user.dealerProfile;
      const now = new Date();
      if (dp.subscriptionValidUntil && dp.subscriptionValidUntil > now) {
        discountPercent = dp.currentFeaturingDiscountPercent;
      }
    }

    const originalPrice = plan.price;
    const finalPrice = originalPrice * (1 - discountPercent / 100);

    // Create subscriptions for each location in the plan
    const existingChecks = await Promise.all(
      plan.locations.map((location) =>
        this.prisma.featuredSubscription.findFirst({
          where: {
            listingId: dto.listingId,
            location,
            paymentStatus: {
              in: [FeaturedPaymentStatus.PAID, FeaturedPaymentStatus.FREE],
            },
            endDate: { gte: now },
          },
        }),
      ),
    );

    const alreadyFeatured = existingChecks.find((e) => e != null);
    if (alreadyFeatured) {
      throw new BadRequestException(
        `This listing is already featured until ${alreadyFeatured.endDate.toISOString()}`,
      );
    }

    // Create placeholder subscriptions for all locations (PENDING — activated on webhook)
    const subs = await Promise.all(
      plan.locations.map((location) =>
        this.prisma.featuredSubscription.create({
          data: {
            listingId: dto.listingId,
            planId: dto.planId,
            location,
            startDate: now,
            endDate: new Date(now.getTime() + plan.durationDays * 86_400_000),
            paymentStatus: FeaturedPaymentStatus.PENDING,
            discountApplied: discountPercent > 0 ? discountPercent : null,
            createdById: userId,
          },
        }),
      ),
    );

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const successUrl = this.appendSessionIdParam(
      dto.successUrl ?? `${frontendUrl}/featured/success`,
    );
    const cancelUrl = dto.failedUrl ?? `${frontendUrl}/featured/cancel`;

    // If free plan (after discount makes it 0 or plan was free), activate immediately
    if (finalPrice <= 0) {
      await this.prisma.featuredSubscription.updateMany({
        where: { id: { in: subs.map((s) => s.id) } },
        data: {
          paymentStatus: FeaturedPaymentStatus.FREE,
          paidAmount: 0,
          startDate: now,
        },
      });
      this.sendFeaturedActivationEmail(
        dto.listingId,
        dto.planId,
        subs[0].endDate,
        0,
        subs.map((s) => s.id),
        userId,
      );
      return {
        subscriptionIds: subs.map((s) => s.id),
        activated: true,
        discountPercent,
        originalPrice,
        finalPrice: 0,
        message: 'Featured subscription activated (free/fully discounted).',
      };
    }

    // Paid checkout — use the first subscription's ID in metadata (others share session)
    const primarySubId = subs[0].id;
    const subscriptionIds = subs.map((s) => s.id).join(',');
    const amount = Math.round(finalPrice * 100);
    const description = `Feature "${listing.propertyName}" for ${plan.durationDays} days at ${plan.locations.join(', ')}${discountPercent > 0 ? ` (${discountPercent}% dealer discount applied)` : ''}`;

    // A Checkout Session's own PaymentIntent isn't reliably attached until the customer
    // reaches the payment step — expanding it right after `.create()` frequently comes back
    // null. For a client_secret that's usable *immediately* (mobile native PaymentSheet), we
    // create a standalone PaymentIntent instead, and cross-link it with the Checkout Session
    // (for the web hosted-redirect flow) so the webhook can reconcile whichever one gets paid.
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: 'qar',
      automatic_payment_methods: { enabled: true },
      description,
      metadata: {
        type: 'FEATURED_PAYMENT',
        primarySubscriptionId: primarySubId,
        subscriptionIds,
        listingId: dto.listingId,
        planId: dto.planId,
        userId,
        discountPercent: String(discountPercent),
      },
    });

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'qar',
            unit_amount: amount,
            product_data: { name: plan.name, description },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'FEATURED_PAYMENT',
        primarySubscriptionId: primarySubId,
        subscriptionIds,
        listingId: dto.listingId,
        planId: dto.planId,
        userId,
        discountPercent: String(discountPercent),
        linkedPaymentIntentId: paymentIntent.id,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    // Cross-link so the webhook can cancel/expire whichever path *wasn't* used
    await this.stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        type: 'FEATURED_PAYMENT',
        primarySubscriptionId: primarySubId,
        subscriptionIds,
        linkedSessionId: session.id,
      },
    });

    // Persist both IDs on every subscription in the batch (only stripeSessionId is unique,
    // so it stays primary-only; the PaymentIntent id is shared across the whole batch)
    await this.prisma.featuredSubscription.updateMany({
      where: { id: { in: subs.map((s) => s.id) } },
      data: { stripePaymentIntentId: paymentIntent.id },
    });
    await this.prisma.featuredSubscription.update({
      where: { id: primarySubId },
      data: { stripeSessionId: session.id },
    });

    return {
      subscriptionIds: subs.map((s) => s.id),
      activated: false,
      sessionId: session.id,
      url: session.url,
      paymentIntentClientSecret: paymentIntent.client_secret,
      discountPercent,
      originalPrice,
      finalPrice,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Admin: Direct Add
  // ────────────────────────────────────────────────────────────────────────────
  //
  // Note: Stripe webhook handling for featured-boost payments now lives in
  // DealerSubscriptionsService.handleStripeWebhook (see POST /featured/webhook), which is
  // the single canonical Stripe webhook receiver for this app — featured, listing, and
  // dealer-subscription payments alike. sendFeaturedActivationEmail() below is still used
  // directly by the free/instantly-activated paths in this service (createCheckout's free
  // branch, dealerAddFeatured's free-quota branch), which never touch Stripe at all.

  async adminAddFeatured(dto: AdminAddFeaturedDto, adminId: string) {
    const plan = await this.getPlanOrThrow(dto.planId);

    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      select: { id: true, status: true, propertyName: true, createdById: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const now = new Date();
    const endDate = new Date(now.getTime() + plan.durationDays * 86_400_000);

    // Admin-added boosts bypass Stripe entirely. Unless the admin explicitly overrides
    // paymentStatus/paidAmount (e.g. to grant it as genuinely FREE), default to recording
    // the plan's real price as PAID — so it doesn't show as "Free", the gateway is simply skipped.
    const paymentStatus = dto.paymentStatus ?? FeaturedPaymentStatus.PAID;
    const paidAmount =
      dto.paidAmount ??
      (paymentStatus === FeaturedPaymentStatus.PAID ? plan.price : null);

    // Create a subscription for each location in the plan
    const subs = await Promise.all(
      plan.locations.map((location) =>
        this.prisma.featuredSubscription.create({
          data: {
            listingId: dto.listingId,
            planId: dto.planId,
            location,
            startDate: now,
            endDate,
            paymentStatus,
            paidAmount,
            addedByAdminId: adminId,
            createdById: adminId,
          },
          include: {
            listing: { select: { id: true, propertyName: true, slug: true } },
            plan: true,
          },
        }),
      ),
    );

    const amount = paidAmount ?? 0;
    this.invoices
      .createForTransaction({
        type: InvoiceType.FEATURED_LISTING,
        referenceId: subs[0].id,
        billedToId: listing.createdById,
        description: `Featured Listing — ${listing.propertyName} (added by admin)`,
        lineItems: [
          {
            description: `${plan.name} (${plan.durationDays} days, ${subs.length} location${subs.length > 1 ? 's' : ''})`,
            quantity: 1,
            unitPrice: amount,
            amount,
          },
        ],
        subtotal: amount,
        status:
          paymentStatus === FeaturedPaymentStatus.PAID
            ? InvoiceStatus.PAID
            : InvoiceStatus.FREE,
      })
      .catch(() => {});

    return subs;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public: Get Featured Listings by Location (paginated + searchable)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns a paginated, randomly shuffled list of active featured listings
   * for a given location. Each API call yields a different order within the page.
   */
  async getFeaturedByLocation(
    location: FeaturedPlacementLocation,
    page = 1,
    limit = 8,
    search?: string,
    userId?: string,
  ) {
    const now = new Date();
    const skip = (page - 1) * limit;

    const baseWhere: any = {
      location,
      paymentStatus: {
        in: [FeaturedPaymentStatus.PAID, FeaturedPaymentStatus.FREE],
      },
      startDate: { lte: now },
      endDate: { gte: now },
      listing: {
        status: ListingStatus.ACTIVE,
        ...(search && {
          OR: [
            { propertyName: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { areaName: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
    };

    const [total, subs] = await Promise.all([
      this.prisma.featuredSubscription.count({ where: baseWhere }),
      this.prisma.featuredSubscription.findMany({
        where: baseWhere,
        include: {
          listing: {
            select: {
              ...LISTING_SELECT,
              ...(userId
                ? { wishlistedBy: { where: { userId }, select: { id: true } } }
                : {}),
              photos: {
                select: { id: true, url: true, caption: true, sortOrder: true },
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
            },
          },
        },
      }),
    ]);

    // Fisher-Yates shuffle → random rotation, then slice for current page
    shuffleArray(subs);
    const paginated = subs.slice(skip, skip + limit);

    return {
      location,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: paginated.map((s) => {
        const isWishlisted = (s.listing as any).wishlistedBy
          ? (s.listing as any).wishlistedBy.length > 0
          : false;
        const { wishlistedBy, ...listingRest } = s.listing as any;
        return {
          subscriptionId: s.id,
          endDate: s.endDate,
          listing: { ...listingRest, isWishlisted },
        };
      }),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // User: My Subscriptions
  // ────────────────────────────────────────────────────────────────────────────

  async getMySubscriptions(userId: string) {
    return this.prisma.featuredSubscription.findMany({
      where: {
        OR: [{ createdById: userId }, { listing: { createdById: userId } }],
      },
      include: {
        plan: true,
        listing: {
          select: { id: true, propertyName: true, slug: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Admin: All Subscriptions (paginated)
  // ────────────────────────────────────────────────────────────────────────────

  async getAllSubscriptionsAdmin(query: QueryFeaturedDto) {
    const {
      location,
      paymentStatus,
      listingId,
      search,
      limit = 10,
      page = 1,
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (location) where.location = location;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (listingId) where.listingId = listingId;
    if (search) {
      where.listing = {
        OR: [
          { propertyName: { contains: search, mode: 'insensitive' } },
          { areaName: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.featuredSubscription.count({ where }),
      this.prisma.featuredSubscription.findMany({
        where,
        skip,
        take: limit,
        include: {
          plan: true,
          listing: {
            select: { id: true, propertyName: true, slug: true, status: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          addedByAdmin: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Admin: Cancel / Remove Subscription
  // ────────────────────────────────────────────────────────────────────────────

  async removeSubscription(id: string, adminId: string) {
    const sub = await this.prisma.featuredSubscription.findUnique({
      where: { id },
    });
    if (!sub)
      throw new NotFoundException(`Featured subscription ${id} not found`);

    // Soft-expire: set endDate to now
    return this.prisma.featuredSubscription.update({
      where: { id },
      data: { endDate: new Date() },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // User: Cancel their own subscription (if still PENDING)
  // ────────────────────────────────────────────────────────────────────────────

  async cancelMySubscription(id: string, userId: string) {
    const sub = await this.prisma.featuredSubscription.findUnique({
      where: { id },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.createdById !== userId)
      throw new ForbiddenException('Not your subscription');
    if (sub.paymentStatus !== FeaturedPaymentStatus.PENDING) {
      throw new BadRequestException(
        'Only PENDING subscriptions can be cancelled',
      );
    }
    return this.prisma.featuredSubscription.update({
      where: { id },
      data: { paymentStatus: FeaturedPaymentStatus.FAILED },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Dealer: Directly Feature a Listing (bypasses payment for now)
  // ────────────────────────────────────────────────────────────────────────────

  async dealerAddFeatured(
    dto: DealerAddFeaturedDto,
    userId: string,
    userRole: UserRole,
  ) {
    const plan = await this.getPlanOrThrow(dto.planId);
    if (!plan.isActive)
      throw new BadRequestException(
        'This featured plan is no longer available.',
      );

    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      select: { id: true, propertyName: true, createdById: true, status: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE listings can be featured');
    }

    // Verify ownership for dealer / staff / owner / admin
    if (userRole === UserRole.DEALER) {
      const staffMembers = await this.prisma.dealerStaff.findMany({
        where: { dealerUserId: userId, isActive: true },
        select: { staffUserId: true },
      });
      const allowedUserIds = [
        userId,
        ...staffMembers.map((s) => s.staffUserId),
      ];
      if (!allowedUserIds.includes(listing.createdById)) {
        throw new ForbiddenException(
          'You can only feature listings belonging to your agency',
        );
      }
    } else if (userRole === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: userId },
        select: { dealerUserId: true, isActive: true },
      });
      if (!staffRecord?.isActive) {
        throw new ForbiddenException('Your staff account is inactive');
      }
      const staffMembers = await this.prisma.dealerStaff.findMany({
        where: { dealerUserId: staffRecord.dealerUserId, isActive: true },
        select: { staffUserId: true },
      });
      const allowedUserIds = [
        staffRecord.dealerUserId,
        ...staffMembers.map((s) => s.staffUserId),
      ];
      if (!allowedUserIds.includes(listing.createdById)) {
        throw new ForbiddenException(
          'You can only feature listings belonging to your agency',
        );
      }
    } else if (
      userRole !== UserRole.SUPER_ADMIN &&
      userRole !== UserRole.MODERATOR
    ) {
      if (listing.createdById !== userId) {
        throw new ForbiddenException('You can only feature your own listings');
      }
    }

    const now = new Date();

    // Check if already featured at any of the plan's locations
    const existingChecks = await Promise.all(
      plan.locations.map((location) =>
        this.prisma.featuredSubscription.findFirst({
          where: {
            listingId: dto.listingId,
            location,
            paymentStatus: {
              in: [FeaturedPaymentStatus.PAID, FeaturedPaymentStatus.FREE],
            },
            endDate: { gte: now },
          },
        }),
      ),
    );

    const alreadyFeatured = existingChecks.find((e) => e != null);
    if (alreadyFeatured) {
      throw new BadRequestException(
        `This listing is already featured until ${alreadyFeatured.endDate.toISOString()}`,
      );
    }

    const endDate = new Date(now.getTime() + plan.durationDays * 86_400_000);

    let agencyUserId = userId;
    if (userRole === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: userId },
      });
      if (staffRecord) agencyUserId = staffRecord.dealerUserId;
    }

    const dealerProfile = await this.prisma.dealerProfile.findUnique({
      where: { userId: agencyUserId },
    });

    const isWithinValidity =
      dealerProfile?.subscriptionValidUntil &&
      dealerProfile.subscriptionValidUntil > now;

    if (
      isWithinValidity &&
      dealerProfile &&
      dealerProfile.availableFreeFeatured > 0
    ) {
      // Use quota
      await this.prisma.dealerProfile.update({
        where: { id: dealerProfile.id },
        data: { availableFreeFeatured: { decrement: 1 } },
      });

      // Create active featured subscriptions for each placement location in the plan
      const subs = await Promise.all(
        plan.locations.map((location) =>
          this.prisma.featuredSubscription.create({
            data: {
              listingId: dto.listingId,
              planId: dto.planId,
              location,
              startDate: now,
              endDate,
              paymentStatus: FeaturedPaymentStatus.FREE,
              paidAmount: 0,
              createdById: userId,
            },
            include: {
              listing: { select: { id: true, propertyName: true, slug: true } },
              plan: true,
            },
          }),
        ),
      );

      this.sendFeaturedActivationEmail(
        dto.listingId,
        dto.planId,
        endDate,
        0,
        subs.map((s) => s.id),
        agencyUserId,
      );

      return {
        message: 'Listing featured successfully',
        activated: true,
        subscriptions: subs,
      };
    } else {
      // Fallback to checkout
      return this.createCheckout(
        { listingId: dto.listingId, planId: dto.planId },
        userId,
      );
    }
  }
}
