import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DealerSubPaymentStatus,
  InvoiceStatus,
  InvoiceType,
  ListingReviewAction,
  ListingStatus,
  UserRole,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../shared/mail.service';
import { InvoicesService } from '../invoices/invoices.service';
import { AssignDealerPlanDto } from './dto/assign-dealer-plan.dto';
import { CheckoutDealerPlanDto } from './dto/checkout-dealer-plan.dto';
import { CreateDealerPlanDto } from './dto/create-dealer-plan.dto';
import { QueryDealerPlanDto } from './dto/query-dealer-plan.dto';
import { UpdateDealerPlanDto } from './dto/update-dealer-plan.dto';

@Injectable()
export class DealerSubscriptionsService {
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
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly invoices: InvoicesService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Plan Management (Super Admin)
  // ─────────────────────────────────────────────────────────────────────────────

  async createPlan(dto: CreateDealerPlanDto) {
    return this.prisma.dealerSubscriptionPlan.create({
      data: {
        name: dto.name,
        maxListings: dto.maxListings,
        validityDays: dto.validityDays,
        price: dto.price,
        boostDiscountPercent: dto.boostDiscountPercent ?? 0,
        isActive: true,
      },
    });
  }

  async listPlans(query: QueryDealerPlanDto, includeInactive = false) {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.dealerSubscriptionPlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dealerSubscriptionPlan.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Returns a single plan. When called by an authenticated DEALER, also includes `counts` —
   * how many of that dealer's own subscriptions to this specific plan are still active
   * (paymentStatus PAID/FREE and not yet expired).
   */
  async getPlanById(id: string, requester?: { id: string; role: UserRole }) {
    const plan = await this.getPlanOrThrow(id);

    if (requester?.role !== UserRole.DEALER) {
      return plan;
    }

    const counts = await this.prisma.dealerSubscription.count({
      where: {
        dealerId: requester.id,
        planId: id,
        paymentStatus: {
          in: [DealerSubPaymentStatus.PAID, DealerSubPaymentStatus.FREE],
        },
        endDate: { gte: new Date() },
      },
    });

    return { ...plan, counts };
  }

  async updatePlan(id: string, dto: UpdateDealerPlanDto) {
    await this.getPlanOrThrow(id);
    return this.prisma.dealerSubscriptionPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.maxListings !== undefined && { maxListings: dto.maxListings }),
        ...(dto.validityDays !== undefined && {
          validityDays: dto.validityDays,
        }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.boostDiscountPercent !== undefined && {
          boostDiscountPercent: dto.boostDiscountPercent,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deletePlan(id: string) {
    await this.getPlanOrThrow(id);
    return this.prisma.dealerSubscriptionPlan.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async getPlanOrThrow(id: string) {
    const plan = await this.prisma.dealerSubscriptionPlan.findUnique({
      where: { id },
    });
    if (!plan)
      throw new NotFoundException(`Dealer subscription plan "${id}" not found`);
    return plan;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Admin: Assign Plan to Dealer (no payment required)
  // ─────────────────────────────────────────────────────────────────────────────

  async assignPlanToDealer(
    planId: string,
    dto: AssignDealerPlanDto,
    adminId: string,
  ) {
    const plan = await this.getPlanOrThrow(planId);

    const dealer = await this.prisma.user.findUnique({
      where: { id: dto.dealerId },
      select: { id: true, role: true, isActive: true },
    });
    if (!dealer || dealer.role !== UserRole.DEALER) {
      throw new NotFoundException(`Dealer with ID "${dto.dealerId}" not found`);
    }
    if (!dealer.isActive) {
      throw new BadRequestException('Dealer account is not active');
    }

    const dealerProfile = await this.prisma.dealerProfile.findUnique({
      where: { userId: dto.dealerId },
    });

    const now = new Date();
    const startDate =
      dealerProfile?.subscriptionValidUntil &&
      dealerProfile.subscriptionValidUntil > now
        ? dealerProfile.subscriptionValidUntil
        : now;
    const endDate = new Date(
      startDate.getTime() + plan.validityDays * 86_400_000,
    );

    // Admin-assigned plans bypass Stripe entirely, but still record the plan's real price —
    // marked PAID (not FREE/0) so invoices, receipts and the admin dashboard reflect the
    // actual plan value instead of showing it as a free grant.
    return this.prisma
      .$transaction(async (tx) => {
        const sub = await tx.dealerSubscription.create({
          data: {
            dealerId: dto.dealerId,
            planId,
            startDate,
            endDate,
            paymentStatus: DealerSubPaymentStatus.PAID,
            paidAmount: plan.price,
            assignedByAdminId: adminId,
          },
          include: {
            plan: true,
            dealer: {
              select: {
                id: true,
                name: true,
                email: true,
                dealerProfile: { select: { dealerName: true } },
              },
            },
          },
        });

        if (dealerProfile) {
          await tx.dealerProfile.update({
            where: { id: dealerProfile.id },
            data: {
              availableFreeListings: { increment: plan.freeListings },
              availableFreeFeatured: { increment: plan.freeFeaturedListings },
              subscriptionValidUntil: endDate,
              currentListingDiscountPercent: Math.max(
                dealerProfile.currentListingDiscountPercent,
                plan.listingDiscountPercent,
              ),
              currentFeaturingDiscountPercent: Math.max(
                dealerProfile.currentFeaturingDiscountPercent,
                plan.boostDiscountPercent,
              ),
            },
          });
        }

        return sub;
      })
      .then((sub) => {
        this.invoiceForDealerSubscription(
          sub,
          plan,
          InvoiceStatus.PAID,
          plan.price,
        ).catch(() => {});
        return sub;
      });
  }

  /** Shared invoice-generation for all three dealer-subscription activation paths (free, assigned, paid). */
  private async invoiceForDealerSubscription(
    sub: { id: string; dealerId: string },
    plan: { name: string; validityDays: number; maxListings: number },
    status: InvoiceStatus,
    amount: number,
  ) {
    await this.invoices.createForTransaction({
      type: InvoiceType.DEALER_SUBSCRIPTION,
      referenceId: sub.id,
      billedToId: sub.dealerId,
      description: `Dealer Subscription — ${plan.name}`,
      lineItems: [
        {
          description: `${plan.name} (${plan.validityDays} days, ${plan.maxListings === 0 ? 'unlimited listings' : `up to ${plan.maxListings} listings`})`,
          quantity: 1,
          unitPrice: amount,
          amount,
        },
      ],
      subtotal: amount,
      status,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Dealer: Stripe Checkout
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * If plan.price == 0 → activate immediately (no Stripe).
   * Otherwise → create Stripe Checkout Session.
   */
  async createCheckout(dto: CheckoutDealerPlanDto, dealerId: string) {
    const plan = await this.getPlanOrThrow(dto.planId);
    if (!plan.isActive)
      throw new BadRequestException('This plan is no longer available.');

    // Verify dealer
    const dealer = await this.prisma.user.findUnique({
      where: { id: dealerId },
      select: { id: true, role: true, name: true, email: true },
    });
    if (!dealer || dealer.role !== UserRole.DEALER) {
      throw new ForbiddenException(
        'Only DEALER accounts can purchase subscription plans',
      );
    }

    const dealerProfile = await this.prisma.dealerProfile.findUnique({
      where: { userId: dealerId },
    });

    const now = new Date();
    const startDate =
      dealerProfile?.subscriptionValidUntil &&
      dealerProfile.subscriptionValidUntil > now
        ? dealerProfile.subscriptionValidUntil
        : now;
    const endDate = new Date(
      startDate.getTime() + plan.validityDays * 86_400_000,
    );

    // Free plan — activate immediately without Stripe
    if (plan.price === 0) {
      const sub = await this.prisma.$transaction(async (tx) => {
        const createdSub = await tx.dealerSubscription.create({
          data: {
            dealerId,
            planId: plan.id,
            startDate,
            endDate,
            paymentStatus: DealerSubPaymentStatus.FREE,
            paidAmount: 0,
          },
          include: { plan: true },
        });

        if (dealerProfile) {
          await tx.dealerProfile.update({
            where: { id: dealerProfile.id },
            data: {
              availableFreeListings: { increment: plan.freeListings },
              availableFreeFeatured: { increment: plan.freeFeaturedListings },
              subscriptionValidUntil: endDate,
              currentListingDiscountPercent: Math.max(
                dealerProfile.currentListingDiscountPercent,
                plan.listingDiscountPercent,
              ),
              currentFeaturingDiscountPercent: Math.max(
                dealerProfile.currentFeaturingDiscountPercent,
                plan.boostDiscountPercent,
              ),
            },
          });
        }
        return createdSub;
      });
      this.invoiceForDealerSubscription(
        { id: sub.id, dealerId },
        plan,
        InvoiceStatus.FREE,
        0,
      ).catch(() => {});
      return {
        subscriptionId: sub.id,
        activated: true,
        message: 'Free plan activated immediately.',
      };
    }

    // Paid plan — create Stripe session
    const sub = await this.prisma.dealerSubscription.create({
      data: {
        dealerId,
        planId: plan.id,
        startDate,
        endDate,
        paymentStatus: DealerSubPaymentStatus.PENDING,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    const session = await this.stripe.checkout.sessions.create({
      expand: ['payment_intent'],
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: dealer.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'qar',
            unit_amount: Math.round(plan.price * 100),
            product_data: {
              name: plan.name,
              description: `Dealer Subscription: ${plan.validityDays} days, up to ${plan.maxListings === 0 ? 'unlimited' : plan.maxListings} listings, ${plan.boostDiscountPercent}% featured boost discount`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        subscriptionId: sub.id,
        planId: plan.id,
        dealerId,
      },
      success_url: `${frontendUrl}/dealer/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/dealer/subscription/cancel`,
    });

    await this.prisma.dealerSubscription.update({
      where: { id: sub.id },
      data: { stripeSessionId: session.id },
    });

    return {
      subscriptionId: sub.id,
      activated: false,
      sessionId: session.id,
      url: session.url,
      paymentIntentClientSecret:
        (session.payment_intent as Stripe.PaymentIntent)?.client_secret ?? null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Stripe Webhook Handler
  // ─────────────────────────────────────────────────────────────────────────────

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_DEALER_WEBHOOK_SECRET ??
          process.env.STRIPE_WEBHOOK_SECRET ??
          '',
      );
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.metadata?.type === 'LISTING_PAYMENT') {
        await this.activateListingBySession(session);
      } else if (session.metadata?.type === 'FEATURED_PAYMENT') {
        await this.activateFeaturedBySession(session);
      } else {
        await this.activateSubscriptionBySession(session);
      }
    }

    // Fires when a payment is completed via the standalone PaymentIntent (mobile native
    // payment) instead of the Checkout Session hosted redirect (web) — see
    // ListingsService.makePayment() / FeaturedService.createCheckout(). Both paths lead to
    // the same record; whichever completes first wins, and the other is cancelled/expired below.
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      if (paymentIntent.metadata?.type === 'LISTING_PAYMENT') {
        await this.activateListingByPaymentIntent(paymentIntent);
      } else if (paymentIntent.metadata?.type === 'FEATURED_PAYMENT') {
        await this.activateFeaturedByPaymentIntent(paymentIntent);
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      if (session.metadata?.type === 'LISTING_PAYMENT') {
        await this.prisma.listing.updateMany({
          where: { stripeSessionId: session.id },
          data: { paymentStatus: 'FAILED' },
        });
      } else if (session.metadata?.type === 'FEATURED_PAYMENT') {
        // Covers every location in the batch, not just the primary sub (only it carries stripeSessionId)
        const subIds = session.metadata?.subscriptionIds?.split(',') ?? [
          session.id,
        ];
        await this.prisma.featuredSubscription.updateMany({
          where: {
            OR: [{ id: { in: subIds } }, { stripeSessionId: session.id }],
          },
          data: { paymentStatus: 'FAILED' },
        });
      } else {
        await this.prisma.dealerSubscription.updateMany({
          where: { stripeSessionId: session.id },
          data: { paymentStatus: DealerSubPaymentStatus.FAILED },
        });
      }
    }

    return { received: true };
  }

  /**
   * Payment succeeded via the Checkout Session hosted redirect (web). A listing only reaches
   * PENDING_PAYMENT *after* admin/moderator has already approved its content (see
   * ListingsService.approve()) — this payment is purely the gate for going live.
   */
  private async activateListingBySession(session: Stripe.Checkout.Session) {
    const listingId = session.metadata?.listingId;
    if (!listingId) return;

    const paidAmount = session.amount_total ? session.amount_total / 100 : null;
    const activated = await this.activateListingPaid(listingId, paidAmount);
    if (!activated) return;

    // The standalone PaymentIntent created alongside this session (for mobile) is now moot —
    // cancel it so it can't also be used to pay (best-effort; ignore if already gone/succeeded).
    const linkedPaymentIntentId = session.metadata?.linkedPaymentIntentId;
    if (linkedPaymentIntentId) {
      await this.stripe.paymentIntents
        .cancel(linkedPaymentIntentId)
        .catch(() => {});
    }
  }

  /**
   * Payment succeeded via the standalone PaymentIntent (mobile native payment) instead of the
   * Checkout Session. Same activation, reached from the other path.
   */
  private async activateListingByPaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const listingId = paymentIntent.metadata?.listingId;
    if (!listingId) return;

    const paidAmount = paymentIntent.amount_received
      ? paymentIntent.amount_received / 100
      : null;
    const activated = await this.activateListingPaid(listingId, paidAmount);
    if (!activated) return;

    // The Checkout Session created alongside this PaymentIntent (for web) is now moot —
    // expire it so it can't also be used to pay (best-effort; ignore if already gone/completed).
    const linkedSessionId = paymentIntent.metadata?.linkedSessionId;
    if (linkedSessionId) {
      await this.stripe.checkout.sessions
        .expire(linkedSessionId)
        .catch(() => {});
    }
  }

  /**
   * Shared "mark a listing PAID and live" core, idempotent — a listing can be paid via either
   * the Checkout Session or the standalone PaymentIntent, and only one should actually apply.
   * Returns false (no-op) if the listing was already paid/active.
   */
  private async activateListingPaid(
    listingId: string,
    paidAmount: number | null,
  ): Promise<boolean> {
    const listing = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.listing.findUnique({
        where: { id: listingId },
      });
      if (!existing || existing.paymentStatus === 'PAID') return null; // already processed

      const updated = await tx.listing.update({
        where: { id: listingId },
        data: {
          paymentStatus: 'PAID',
          status: ListingStatus.ACTIVE,
          paidAmount,
        },
      });

      await tx.listingReview.create({
        data: {
          listingId,
          action: ListingReviewAction.APPROVED,
          message: 'Listing is now live (payment received)',
          reviewedById: updated.createdById,
        },
      });

      return updated;
    });

    if (!listing) return false;

    this.notifications
      .sendToUser(listing.createdById, {
        title: 'Listing is now live 🎉',
        body: `"${listing.propertyName}" is now live on VillasQatar.`,
        data: { type: 'LISTING_APPROVED', listingId },
      })
      .catch(() => {});

    const owner = await this.prisma.user.findUnique({
      where: { id: listing.createdById },
      select: { email: true, name: true },
    });
    if (owner?.email) {
      this.mail.sendListingApprovedEmail(
        owner.email,
        owner.name ?? 'there',
        listing.propertyName,
        listing.slug ?? listing.id,
      );
    }

    const amount = paidAmount ?? 0;
    this.invoices
      .createForTransaction({
        type: InvoiceType.LISTING_PAYMENT,
        referenceId: listing.id,
        billedToId: listing.createdById,
        description: `Listing Publication — ${listing.propertyName}`,
        lineItems: [
          {
            description: 'Pay-per-listing publication charge',
            quantity: 1,
            unitPrice: amount,
            amount,
          },
        ],
        subtotal: amount,
        status: InvoiceStatus.PAID,
      })
      .catch(() => {});

    return true;
  }

  /**
   * Payment succeeded via the Checkout Session hosted redirect (web). A featured-boost
   * checkout can cover several placement locations at once — all created together as
   * separate FeaturedSubscription rows sharing `subscriptionIds` in metadata.
   */
  private async activateFeaturedBySession(session: Stripe.Checkout.Session) {
    const subIds = session.metadata?.subscriptionIds?.split(',') ?? [];
    const paidAmount = session.amount_total ? session.amount_total / 100 : null;
    const activated = await this.activateFeaturedPaid(
      subIds,
      paidAmount,
      session.payment_intent as string | null,
    );
    if (!activated) return;

    // The standalone PaymentIntent created alongside this session (for mobile) is now moot —
    // cancel it so it can't also be used to pay (best-effort; ignore if already gone/succeeded).
    const linkedPaymentIntentId = session.metadata?.linkedPaymentIntentId;
    if (linkedPaymentIntentId) {
      await this.stripe.paymentIntents
        .cancel(linkedPaymentIntentId)
        .catch(() => {});
    }
  }

  /**
   * Payment succeeded via the standalone PaymentIntent (mobile native payment) instead of
   * the Checkout Session. Same activation, reached from the other path.
   */
  private async activateFeaturedByPaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const subIds = paymentIntent.metadata?.subscriptionIds?.split(',') ?? [];
    const paidAmount = paymentIntent.amount_received
      ? paymentIntent.amount_received / 100
      : null;
    const activated = await this.activateFeaturedPaid(
      subIds,
      paidAmount,
      paymentIntent.id,
    );
    if (!activated) return;

    // The Checkout Session created alongside this PaymentIntent (for web) is now moot —
    // expire it so it can't also be used to pay (best-effort; ignore if already gone/completed).
    const linkedSessionId = paymentIntent.metadata?.linkedSessionId;
    if (linkedSessionId) {
      await this.stripe.checkout.sessions
        .expire(linkedSessionId)
        .catch(() => {});
    }
  }

  /**
   * Shared "mark a featured-boost batch PAID and live" core, idempotent — a boost can be
   * paid via either the Checkout Session or the standalone PaymentIntent, and only one
   * should actually apply. Returns false (no-op) if already paid.
   */
  private async activateFeaturedPaid(
    subIds: string[],
    paidAmount: number | null,
    stripePaymentIntentId: string | null,
  ): Promise<boolean> {
    if (subIds.length === 0) return false;

    const primarySub = await this.prisma.featuredSubscription.findUnique({
      where: { id: subIds[0] },
      include: { plan: true },
    });
    if (!primarySub || primarySub.paymentStatus === 'PAID') return false; // not found or already processed

    const now = new Date();
    const endDate = new Date(
      now.getTime() + primarySub.plan.durationDays * 86_400_000,
    );

    await this.prisma.featuredSubscription.updateMany({
      where: { id: { in: subIds } },
      data: {
        paymentStatus: 'PAID',
        stripePaymentIntentId,
        paidAmount,
        startDate: now,
        endDate,
      },
    });

    const listing = await this.prisma.listing.findUnique({
      where: { id: primarySub.listingId },
      select: {
        propertyName: true,
        createdBy: { select: { name: true, email: true } },
      },
    });
    if (listing?.createdBy?.email) {
      this.mail.sendFeaturedActivationEmail(
        listing.createdBy.email,
        listing.createdBy.name ?? 'there',
        listing.propertyName,
        primarySub.plan.name,
        primarySub.plan.locations,
        primarySub.plan.durationDays,
        endDate,
        paidAmount,
      );
    }

    const amount = paidAmount ?? 0;
    this.invoices
      .createForTransaction({
        type: InvoiceType.FEATURED_LISTING,
        referenceId: primarySub.id,
        billedToId: primarySub.createdById,
        description: `Featured Listing — ${listing?.propertyName ?? primarySub.listingId}`,
        lineItems: [
          {
            description: `${primarySub.plan.name} (${primarySub.plan.durationDays} days, ${subIds.length} location${subIds.length > 1 ? 's' : ''})`,
            quantity: 1,
            unitPrice: amount,
            amount,
          },
        ],
        subtotal: amount,
        status: InvoiceStatus.PAID,
      })
      .catch(() => {});

    return true;
  }

  private async activateSubscriptionBySession(
    session: Stripe.Checkout.Session,
  ) {
    const sub = await this.prisma.dealerSubscription.findUnique({
      where: { stripeSessionId: session.id },
      include: { plan: true },
    });
    if (!sub || sub.paymentStatus === DealerSubPaymentStatus.PAID) return; // not found or already processed

    const dealerProfile = await this.prisma.dealerProfile.findUnique({
      where: { userId: sub.dealerId },
    });
    if (!dealerProfile) return;

    const now = new Date();
    const startDate =
      dealerProfile.subscriptionValidUntil &&
      dealerProfile.subscriptionValidUntil > now
        ? dealerProfile.subscriptionValidUntil
        : now;
    const endDate = new Date(
      startDate.getTime() + sub.plan.validityDays * 86_400_000,
    );

    await this.prisma.$transaction([
      this.prisma.dealerSubscription.update({
        where: { id: sub.id },
        data: {
          paymentStatus: DealerSubPaymentStatus.PAID,
          stripePaymentIntentId: session.payment_intent as string | null,
          paidAmount: session.amount_total ? session.amount_total / 100 : null,
          startDate,
          endDate,
        },
      }),
      this.prisma.dealerProfile.update({
        where: { id: dealerProfile.id },
        data: {
          availableFreeListings: { increment: sub.plan.freeListings },
          availableFreeFeatured: { increment: sub.plan.freeFeaturedListings },
          subscriptionValidUntil: endDate,
          currentListingDiscountPercent: Math.max(
            dealerProfile.currentListingDiscountPercent,
            sub.plan.listingDiscountPercent,
          ),
          currentFeaturingDiscountPercent: Math.max(
            dealerProfile.currentFeaturingDiscountPercent,
            sub.plan.boostDiscountPercent,
          ),
        },
      }),
    ]);

    const paidAmount = session.amount_total ? session.amount_total / 100 : 0;
    this.invoiceForDealerSubscription(
      { id: sub.id, dealerId: sub.dealerId },
      sub.plan,
      InvoiceStatus.PAID,
      paidAmount,
    ).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Get Active Plan for a Dealer (used internally for boost discount)
  // ─────────────────────────────────────────────────────────────────────────────

  async getActivePlanForDealer(dealerId: string) {
    const now = new Date();
    return this.prisma.dealerSubscription.findFirst({
      where: {
        dealerId,
        paymentStatus: {
          in: [DealerSubPaymentStatus.PAID, DealerSubPaymentStatus.FREE],
        },
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Dealer: My Subscriptions
  // ─────────────────────────────────────────────────────────────────────────────

  async getMySubscriptions(dealerId: string) {
    return this.prisma.dealerSubscription.findMany({
      where: { dealerId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Admin: All Subscriptions (paginated)
  // ─────────────────────────────────────────────────────────────────────────────

  async getAllSubscriptionsAdmin(query: QueryDealerPlanDto) {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      ...(search && {
        OR: [
          { plan: { name: { contains: search, mode: 'insensitive' } } },
          { dealer: { name: { contains: search, mode: 'insensitive' } } },
          { dealer: { email: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.dealerSubscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          plan: true,
          dealer: {
            select: {
              id: true,
              name: true,
              email: true,
              dealerProfile: { select: { dealerName: true } },
            },
          },
          assignedByAdmin: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.dealerSubscription.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
