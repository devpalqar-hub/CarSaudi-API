import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  DealerProfile,
  InvoiceStatus,
  InvoiceType,
  ListingPurpose,
  ListingReviewAction,
  ListingStatus,
  Prisma,
  UserRole,
  TrackingLogType,
  ListingPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { CreateListingDto } from './dto/create-listing.dto';
import { QueryListingDto } from './dto/query-listing.dto';
import { QueryNearbyListingsDto } from './dto/query-nearby-listings.dto';
import { GeocodeLocationDto } from './dto/geocode-location.dto';
import { ReverseGeocodeLocationDto } from './dto/reverse-geocode-location.dto';
import { RejectListingDto } from './dto/reject-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { PriceEstimationDto } from './dto/price-estimation.dto';
import { ListingAnalyticsQueryDto } from './dto/listing-analytics-query.dto';
import { MakePaymentDto } from './dto/make-payment.dto';
import Groq from 'groq-sdk';

import { OtpService } from '../auth/services/otp.service';
import { MailService } from '../shared/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListingDraftsService } from './listing-drafts.service';
import { InvoicesService } from '../invoices/invoices.service';
import {
  DashboardGranularity,
  buildDashboardBucketKeys,
  computeGrowthPercent,
  getDashboardBucketKey,
  getPreviousPeriodRange,
  resolveDashboardDateRange,
} from '../shared/utils/dashboard-bucket.util';

// ─────────────────────────────────────────────────────────────────────────────
// Haversine distance helper (returns metres)
// ─────────────────────────────────────────────────────────────────────────────
function parseRelationId(id: string | undefined | null): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined')
    return null;
  return trimmed;
}

function haversineMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared select — returned in list & detail views
// ─────────────────────────────────────────────────────────────────────────────
export const LISTING_SELECT = {
  id: true,
  referenceCode: true,
  slug: true,
  title: true,
  description: true,
  purpose: true,
  modelId: true,
  model: { select: { id: true, title: true, image: true } },
  latitude: true,
  longitude: true,
  isPotentialDuplicate: true,
  duplicateOfId: true,
  modelYear: true,
  mileage: true,
  transmission: true,
  fuelType: true,
  condition: true,
  exteriorColor: true,
  interiorColor: true,
  cylinders: true,
  doors: true,
  vin: true,
  carTypeId: true,
  carType: true,
  extraProperties: true,
  price: true,
  priceNegotiable: true,
  addressLine1: true,
  addressLine2: true,
  areaName: true,
  brandId: true,
  brand: {
    select: {
      id: true,
      name: true,
      image: true,
    },
  },
  country: true,
  contactPhone: true,
  contactWhatsapp: true,
  contactVerified: true,
  features: true,
  tags: true,
  otherFeatures: true,
  status: true,
  submissionCount: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      dealerProfile: {
        select: {
          id: true,
          dealerName: true,
          coverImage: true,
          contactPhone: true,
        },
      },
    },
  },
  photos: {
    select: {
      id: true,
      url: true,
      minioKey: true,
      caption: true,
      sortOrder: true,
      uploadedAt: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.CarListingSelect;

// ─────────────────────────────────────────────────────────────────────────────
// isFeatured subquery — checks for any active featured subscription
// ─────────────────────────────────────────────────────────────────────────────
function buildFeaturedSelect() {
  const now = new Date();
  return {
    featuredSubscriptions: {
      where: {
        paymentStatus: { in: ['PAID', 'FREE'] as any },
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: { id: true },
      take: 1,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ListingsService implements OnModuleInit {
  private _stripe: Stripe | null = null;

  private get stripe(): Stripe {
    if (!this._stripe) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
      this._stripe = new Stripe(key, {
        apiVersion: '2026-06-24.dahlia',
      });
    }
    return this._stripe;
  }

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('tracking') private readonly trackingQueue: Queue,
    private readonly otpService: OtpService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly listingDrafts: ListingDraftsService,
    private readonly invoices: InvoicesService,
  ) {}

  async onModuleInit() {
    await this.backfillReferenceCodes();
  }

  private async backfillReferenceCodes() {
    try {
      const unassignedListings = await this.prisma.carListing.findMany({
        where: { referenceCode: null },
        select: { id: true, createdById: true },
      });

      for (const listing of unassignedListings) {
        const code = await this.generateReferenceCode(listing.createdById);
        await this.prisma.carListing.update({
          where: { id: listing.id },
          data: { referenceCode: code },
        });
      }
    } catch (err) {
      // Silently ignore backfill errors
    }
  }

  private async generateReferenceCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const prefix = user?.role === UserRole.DEALER ? 'DL' : 'UL';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    while (true) {
      let randomPart = '';
      for (let i = 0; i < 4; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const code = `${prefix}${randomPart}`;

      const existing = await this.prisma.carListing.findFirst({
        where: { referenceCode: code },
      });

      if (!existing) {
        return code;
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private isAdminRole(role: UserRole): boolean {
    return role === UserRole.SUPER_ADMIN || role === UserRole.MODERATOR;
  }

  /**
   * Spam check: within 50 metres radius, same title (case-insensitive).
   * Returns the found duplicate listing id, or null.
   */
  private async findNearbyDuplicate(
    title: string,
    latitude: number,
    longitude: number,
    excludeId?: string,
  ): Promise<string | null> {
    // Pull candidates within a ~0.001° bbox (~110m) — cheap pre-filter
    const delta = 0.001;
    const candidates = await this.prisma.carListing.findMany({
      where: {
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        latitude: { gte: latitude - delta, lte: latitude + delta },
        longitude: { gte: longitude - delta, lte: longitude + delta },
        title: { equals: title, mode: 'insensitive' },
      },
      select: { id: true, latitude: true, longitude: true },
    });

    for (const c of candidates) {
      if (c.latitude == null || c.longitude == null) continue;
      const dist = haversineMetres(
        latitude,
        longitude,
        c.latitude,
        c.longitude,
      );
      if (dist <= 50) return c.id;
    }
    return null;
  }

  /** Replace all photos for a listing (delete + recreate in one tx). */
  private async replacePhotos(
    tx: Prisma.TransactionClient,
    listingId: string,
    photos: {
      url: string;
      minioKey?: string;
      caption?: string;
      sortOrder: number;
    }[],
  ) {
    await tx.carListingPhoto.deleteMany({ where: { listingId } });
    if (photos.length > 0) {
      await tx.carListingPhoto.createMany({
        data: photos.map((p) => ({ listingId, ...p })),
      });
    }
  }

  /** Maps raw listing with featuredSubscriptions to clean result with isFeatured boolean */
  private mapWithFeatured(listing: any): any {
    const isFeatured = (listing.featuredSubscriptions?.length ?? 0) > 0;
    const { featuredSubscriptions, ...rest } = listing;
    return { ...rest, isFeatured };
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateListingDto, userId: string) {
    const effectiveDto = await this.resolveEffectiveCreateDto(dto, userId);

    // Spam / duplicate detection
    let isPotentialDuplicate = false;
    let duplicateOfId: string | null = null;

    if (effectiveDto.latitude != null && effectiveDto.longitude != null) {
      duplicateOfId = await this.findNearbyDuplicate(
        effectiveDto.title,
        effectiveDto.latitude,
        effectiveDto.longitude,
      );
      if (duplicateOfId) isPotentialDuplicate = true;
    }

    const { photos, draftId, ...rest } = effectiveDto;

    // Generate a basic slug from the listing title
    const baseSlug = rest.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const shortId = Math.random().toString(36).substring(2, 8);
    const slug = `${baseSlug}-${shortId}`;

    // Generate unique 6-character reference code (ULxxxx or DLxxxx)
    const referenceCode = await this.generateReferenceCode(userId);

    const creator = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, role: true },
    });
    if (!creator) {
      throw new NotFoundException(`User with ID "${userId}" not found.`);
    }

    const contactToVerify = rest.contactPhone || rest.contactWhatsapp;
    let contactVerified = false;
    if (contactToVerify) {
      const check = await this.checkListingPhoneVerification(contactToVerify);
      contactVerified = check.isVerified;
    } else {
      if (creator.phone) {
        const check = await this.checkListingPhoneVerification(creator.phone);
        contactVerified = check.isVerified;
      }
    }

    // Validate brand existence
    if (rest.brandId) {
      const brand = await this.prisma.carBrandOption.findUnique({
        where: { id: rest.brandId },
        select: { id: true },
      });
      if (!brand) {
        throw new BadRequestException(
          `Brand with ID "${rest.brandId}" does not exist.`,
        );
      }
    }

    // Validate model existence
    if (rest.modelId) {
      const model = await this.prisma.carModelOption.findUnique({
        where: { id: rest.modelId },
        select: { id: true },
      });
      if (!model) {
        throw new BadRequestException(
          `Model with ID "${rest.modelId}" does not exist.`,
        );
      }
    }

    // Validate car body type existence
    const parsedCarTypeId = parseRelationId(rest.carTypeId);
    if (parsedCarTypeId) {
      const carType = await this.prisma.carTypeOption.findUnique({
        where: { id: parsedCarTypeId },
        select: { id: true },
      });
      if (!carType) {
        throw new BadRequestException(
          `Car body type with ID "${parsedCarTypeId}" does not exist.`,
        );
      }
    }

    // Validate VIN uniqueness if provided
    if (rest.vin && typeof rest.vin === 'string' && rest.vin.trim()) {
      const trimmedVin = rest.vin.trim();
      const existingVin = await this.prisma.carListing.findUnique({
        where: { vin: trimmedVin },
        select: { id: true },
      });
      if (existingVin) {
        throw new BadRequestException(
          `A car listing with VIN "${trimmedVin}" already exists.`,
        );
      }
    }

    // Deduplicate and validate features
    const rawFeatures = Array.isArray(rest.features) ? rest.features : [];
    const featureIds = Array.from(
      new Set(
        rawFeatures
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter(Boolean),
      ),
    );

    if (featureIds.length > 0) {
      const existingFeatures = await this.prisma.carFeatureOption.findMany({
        where: { id: { in: featureIds } },
        select: { id: true },
      });
      const existingFeatureIds = new Set(existingFeatures.map((f) => f.id));
      const missingFeatures = featureIds.filter(
        (id) => !existingFeatureIds.has(id),
      );
      if (missingFeatures.length > 0) {
        throw new BadRequestException(
          `Invalid feature ID(s) provided: ${missingFeatures.join(', ')}.`,
        );
      }
    }

    // Deduplicate and validate tags
    const rawTags = Array.isArray(rest.tags) ? rest.tags : [];
    const tagIds = Array.from(
      new Set(
        rawTags
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter(Boolean),
      ),
    );

    if (tagIds.length > 0) {
      const existingTags = await this.prisma.carTagOption.findMany({
        where: { id: { in: tagIds } },
        select: { id: true },
      });
      const existingTagIds = new Set(existingTags.map((t) => t.id));
      const missingTags = tagIds.filter((id) => !existingTagIds.has(id));
      if (missingTags.length > 0) {
        throw new BadRequestException(
          `Invalid tag ID(s) provided: ${missingTags.join(', ')}.`,
        );
      }
    }

    // Every listing goes straight into the review queue regardless of free/paid status —
    // free-quota eligibility and payment are only decided once admin/moderator *approves*
    // the content (see `approve()`), so nobody's quota is spent or charged on a submission
    // that might get rejected.
    const listing = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.carListing.create({
          data: {
            title: rest.title,
            referenceCode,
            slug,
            description: rest.description ?? null,
            purpose: rest.purpose,
            modelId: rest.modelId,
            latitude: rest.latitude ?? null,
            longitude: rest.longitude ?? null,
            isPotentialDuplicate,
            duplicateOfId,
            modelYear: rest.modelYear ?? null,
            mileage: rest.mileage ?? null,
            transmission: rest.transmission ?? null,
            fuelType: rest.fuelType ?? null,
            condition: rest.condition ?? undefined,
            exteriorColor: rest.exteriorColor ?? null,
            interiorColor: rest.interiorColor ?? null,
            cylinders: rest.cylinders ?? null,
            doors: rest.doors ?? null,
            vin: rest.vin?.trim() || null,
            carTypeId: parsedCarTypeId,
            extraProperties:
              (rest.extraProperties as Prisma.InputJsonValue) ??
              Prisma.JsonNull,
            price: rest.price,
            priceNegotiable: rest.priceNegotiable ?? false,
            addressLine1: rest.addressLine1 ?? null,
            addressLine2: rest.addressLine2 ?? null,
            areaName: rest.areaName ?? null,
            brandId: rest.brandId,
            contactPhone: rest.contactPhone ?? null,
            contactWhatsapp: rest.contactWhatsapp ?? null,
            contactVerified,
            features: {
              connect: featureIds.map((id) => ({ id })),
            },
            tags: {
              connect: tagIds.map((id) => ({ id })),
            },
            otherFeatures: rest.otherFeatures ?? null,
            createdById: userId,
          },
          select: LISTING_SELECT,
        });

        // Save photos
        if (photos && photos.length > 0) {
          await tx.carListingPhoto.createMany({
            data: photos.map((p) => ({
              listingId: created.id,
              url: p.url,
              minioKey: p.minioKey ?? null,
              caption: p.caption ?? null,
              sortOrder: p.sortOrder,
            })),
          });
        }

        await tx.carListingReview.create({
          data: {
            listingId: created.id,
            action: ListingReviewAction.SUBMITTED,
            message: 'Listing submitted for review',
            reviewedById: userId,
          },
        });

        return created;
      })
      .catch((error: any) => {
        if (
          error instanceof BadRequestException ||
          error instanceof NotFoundException
        ) {
          throw error;
        }
        if (error && error.code === 'P2002') {
          const target = Array.isArray(error.meta?.target)
            ? error.meta.target.join(', ')
            : error.meta?.target || 'field';
          throw new BadRequestException(
            `A listing with this ${target} already exists.`,
          );
        }
        if (error && error.code === 'P2003') {
          throw new BadRequestException(
            'Invalid reference ID provided (e.g., brandId, modelId, or carTypeId does not exist).',
          );
        }
        if (error && error.code === 'P2025') {
          throw new BadRequestException(
            'One or more referenced records (e.g., features, tags, or options) were not found.',
          );
        }
        throw new BadRequestException(
          error?.message || 'Failed to create listing due to invalid data.',
        );
      });

    if (draftId) {
      await this.listingDrafts.markDraftUsed(draftId, listing.id);
    }

    return listing;
  }

  /**
   * When `dto.draftId` is set, loads that ListingDraft's parsed data as the base and overlays
   * any fields explicitly present in `dto` on top of it (request wins). Otherwise returns `dto`
   * unchanged. Also enforces the four fields that are conditionally-optional on the DTO
   * (`title`/`purpose`/`modelId`/`price`) are present once merged.
   */
  private async resolveEffectiveCreateDto(
    dto: CreateListingDto,
    userId: string,
  ): Promise<CreateListingDto> {
    if (!dto.draftId) return dto;

    const draftData = await this.listingDrafts.consumeDraftData(
      dto.draftId,
      userId,
    );

    const overrides: Record<string, unknown> = { ...dto };
    delete overrides.draftId;
    Object.keys(overrides).forEach(
      (k) => overrides[k] === undefined && delete overrides[k],
    );

    const merged = {
      ...draftData,
      ...overrides,
      draftId: dto.draftId,
    } as CreateListingDto;

    const missing = (
      ['title', 'purpose', 'modelId', 'price'] as const
    ).filter((k) => !merged[k]);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Draft is missing required field(s): ${missing.join(', ')} — provide them in the request or fix the draft first`,
      );
    }

    return merged;
  }

  // ─── Pay for a listing pending payment ─────────────────────────────────────

  /**
   * Pays for (or re-checks free eligibility on) a listing sitting in PENDING_PAYMENT.
   * Reaching this state already means admin/moderator approved the *content* — this step
   * only gates whether it goes live, so success activates it directly (no further review).
   * Works identically for USER and DEALER (or DEALER_STAFF) listings:
   *  - If free quota is available *now* (e.g. a dealer just subscribed), the listing is
   *    activated immediately at no charge.
   *  - Otherwise, creates (or re-creates) a Stripe Checkout Session and returns the price,
   *    session ID, hosted payment URL, and a payment-intent client secret for mobile.
   */
  async makePayment(
    listingId: string,
    userId: string,
    successUrl?: string,
    failedUrl?: string,
  ) {
    const listing = await this.prisma.carListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    await this.assertCanPayForListing(listing.createdById, userId);

    if (listing.status !== ListingStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        'This listing does not require payment (it must be approved by admin/moderator first)',
      );
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: listing.createdById },
      select: { role: true, freeListingsUsed: true },
    });
    const agencyDealerProfile = await this.resolveAgencyDealerProfile(
      listing.createdById,
      creator?.role,
    );
    const now = new Date();

    // Free quota may now be available — activate without charging.
    if (agencyDealerProfile) {
      const isValid =
        agencyDealerProfile.subscriptionValidUntil &&
        agencyDealerProfile.subscriptionValidUntil > now;
      if (isValid && agencyDealerProfile.availableFreeListings > 0) {
        return this.activateListingForFree(
          listing.createdById,
          listingId,
          async (tx) => {
            await tx.dealerProfile.update({
              where: { id: agencyDealerProfile.id },
              data: { availableFreeListings: { decrement: 1 } },
            });
          },
        );
      }
    } else if (creator?.role === UserRole.USER) {
      const freeLimit = await this.getUserFreeListingsLimit();
      if ((creator.freeListingsUsed ?? 0) < freeLimit) {
        return this.activateListingForFree(
          listing.createdById,
          listingId,
          async (tx) => {
            await tx.user.update({
              where: { id: listing.createdById },
              data: { freeListingsUsed: { increment: 1 } },
            });
          },
        );
      }
    }

    const { price } = await this.getListingPricing(agencyDealerProfile);
    if (price <= 0) {
      return this.activateListingForFree(
        listing.createdById,
        listingId,
        async () => {},
      );
    }

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const amount = Math.round(price * 100);

    // A Checkout Session's own PaymentIntent isn't reliably attached until the customer
    // reaches the payment step — expanding it right after `.create()` frequently comes back
    // null. For a client_secret that's usable *immediately* (mobile native PaymentSheet), we
    // create a standalone PaymentIntent instead, and cross-link it with the Checkout Session
    // (for the web hosted-redirect flow) so the webhook can reconcile whichever one gets paid.
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: 'qar',
      automatic_payment_methods: { enabled: true },
      description: `Listing Submission: ${listing.title}`,
      metadata: { listingId, type: 'LISTING_PAYMENT' },
    });

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'qar',
            unit_amount: amount,
            product_data: {
              name: `Listing Submission: ${listing.title}`,
              description: 'Pay-per-listing charge',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        listingId,
        type: 'LISTING_PAYMENT',
        linkedPaymentIntentId: paymentIntent.id,
      },
      success_url: this.appendSessionIdParam(
        successUrl ?? `${frontendUrl}/dealer/listings/success`,
      ),
      cancel_url: failedUrl ?? `${frontendUrl}/dealer/listings/cancel`,
    });

    // Cross-link so the webhook can cancel/expire whichever path *wasn't* used
    await this.stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        listingId,
        type: 'LISTING_PAYMENT',
        linkedSessionId: session.id,
      },
    });

    await this.prisma.carListing.update({
      where: { id: listingId },
      data: {
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntent.id,
      },
    });

    return {
      activated: false,
      listingId,
      price,
      stripeSessionId: session.id,
      paymentUrl: session.url,
      paymentIntentClientSecret: paymentIntent.client_secret,
    };
  }

  /** Verifies the requester is the listing's creator, or a dealer/staff of the same agency. */
  private async assertCanPayForListing(creatorId: string, requesterId: string) {
    if (creatorId === requesterId) return;

    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });

    let agencyUserIds: string[] = [];
    if (requester?.role === UserRole.DEALER) {
      const staff = await this.prisma.dealerStaff.findMany({
        where: { dealerUserId: requesterId, isActive: true },
        select: { staffUserId: true },
      });
      agencyUserIds = [requesterId, ...staff.map((s) => s.staffUserId)];
    } else if (requester?.role === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: requesterId },
        select: { dealerUserId: true, isActive: true },
      });
      if (staffRecord?.isActive) {
        const staff = await this.prisma.dealerStaff.findMany({
          where: { dealerUserId: staffRecord.dealerUserId, isActive: true },
          select: { staffUserId: true },
        });
        agencyUserIds = [
          staffRecord.dealerUserId,
          ...staff.map((s) => s.staffUserId),
        ];
      }
    }

    if (!agencyUserIds.includes(creatorId)) {
      throw new ForbiddenException(
        'You do not have permission to pay for this listing',
      );
    }
  }

  /** Activates an already-approved PENDING_PAYMENT listing at no charge (free quota applied). */
  private async activateListingForFree(
    creatorId: string,
    listingId: string,
    consumeQuota: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await consumeQuota(tx);
      const result = await tx.carListing.update({
        where: { id: listingId },
        data: {
          status: ListingStatus.ACTIVE,
          paymentStatus: ListingPaymentStatus.FREE,
        },
        select: LISTING_SELECT,
      });
      await tx.carListingReview.create({
        data: {
          listingId,
          action: ListingReviewAction.APPROVED,
          message: 'Listing is now live (free quota applied)',
          reviewedById: creatorId,
        },
      });
      return result;
    });

    this.notifications
      .sendToUser(creatorId, {
        title: 'Listing is now live 🎉',
        body: `"${updated.title}" is now live on CarSaudi — no payment was needed.`,
        data: { type: 'LISTING_APPROVED', listingId },
      })
      .catch(() => {});

    this.invoices
      .createForTransaction({
        type: InvoiceType.LISTING_PAYMENT,
        referenceId: listingId,
        billedToId: creatorId,
        description: `Listing Publication — ${updated.title}`,
        lineItems: [
          {
            description:
              'Pay-per-listing publication charge (free quota applied)',
            quantity: 1,
            unitPrice: 0,
            amount: 0,
          },
        ],
        subtotal: 0,
        status: InvoiceStatus.FREE,
      })
      .catch(() => {});

    return {
      activated: true,
      message: 'Free quota available — listing is now live, no payment needed.',
      listing: updated,
    };
  }

  /** Resolves the dealer profile governing free-quota/discount for a creator (self, or via staff → parent dealer). */
  private async resolveAgencyDealerProfile(
    userId: string,
    role: UserRole | undefined,
  ): Promise<DealerProfile | null> {
    if (role === UserRole.DEALER) {
      return this.prisma.dealerProfile.findUnique({ where: { userId } });
    }
    if (role === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: userId },
        select: { dealerUserId: true, isActive: true },
      });
      if (staffRecord?.isActive) {
        return this.prisma.dealerProfile.findUnique({
          where: { userId: staffRecord.dealerUserId },
        });
      }
    }
    return null;
  }

  /** Admin-configured free-listing count for regular (non-dealer) USER accounts. */
  private async getUserFreeListingsLimit(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'USER_FREE_LISTINGS_LIMIT' },
    });
    return setting ? parseInt(setting.value, 10) || 0 : 0;
  }

  /** Base per-listing charge minus the dealer's active subscription discount, if any. */
  private async getListingPricing(dealerProfile: DealerProfile | null) {
    const defaultChargeSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'DEFAULT_LISTING_CHARGE' },
    });
    const basePrice = defaultChargeSetting
      ? parseFloat(defaultChargeSetting.value) || 0
      : 0;

    const now = new Date();
    const isValid =
      dealerProfile?.subscriptionValidUntil &&
      dealerProfile.subscriptionValidUntil > now;
    const discountPercent =
      isValid && dealerProfile
        ? dealerProfile.currentListingDiscountPercent
        : 0;
    const price =
      discountPercent > 0
        ? Math.max(0, basePrice * (1 - discountPercent / 100))
        : basePrice;

    return { basePrice, price, discountPercent };
  }

  /** Appends Stripe's `{CHECKOUT_SESSION_ID}` template as a `session_id` query param, whatever the URL already has. */
  private appendSessionIdParam(url: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}session_id={CHECKOUT_SESSION_ID}`;
  }

  // ─── Public List ───────────────────────────────────────────────────────────

  async findAll(query: QueryListingDto, deviceId: string, userId?: string) {
    const where = await this.buildWhereClause(query, true);
    const result = await this.paginate(where, query, userId);

    // Queue impressions for all returned listings
    if (result.data.length > 0 && deviceId) {
      result.data.forEach((listing) => {
        this.trackingQueue.add('impression', {
          type: TrackingLogType.IMPRESSION,
          listingId: listing.id,
          deviceId,
        });
      });
    }

    return result;
  }

  // ─── Public Sitemap ─────────────────────────────────────────────────────────

  /**
   * Lightweight feed of every publicly visible listing for sitemap/SEO generation.
   * No pagination — callers (sitemap builders, crawlers) need the full set.
   */
  async getSitemapEntries() {
    const listings = await this.prisma.carListing.findMany({
      where: {
        slug: { not: null },
        status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLD] },
      },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    return listings.map((l) => ({
      slug: l.slug as string,
      updatedAt: l.updatedAt,
    }));
  }

  // ─── Admin List ────────────────────────────────────────────────────────────

  async findAllAdmin(query: QueryListingDto) {
    const where = await this.buildWhereClause(query, false);
    return this.paginate(where, query, undefined, true);
  }

  // ─── My Listings ───────────────────────────────────────────────────────────

  async findMyListings(userId: string, query: QueryListingDto) {
    const where = await this.buildWhereClause(
      { ...query, createdById: userId },
      false,
    );
    return this.paginate(where, query, userId, true);
  }

  // ─── Dealer / Staff Listings ────────────────────────────────────────────────

  /**
   * Returns all listings created by a dealer + all their staff members.
   * If the requester is DEALER_STAFF, we first resolve their parent dealer, then show all listings under that dealer.
   */
  async findDealerListings(
    requestingUserId: string,
    requestingUserRole: UserRole,
    query: QueryListingDto,
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
    } else if (
      requestingUserRole === UserRole.SUPER_ADMIN ||
      requestingUserRole === UserRole.MODERATOR
    ) {
      // Admin can pass createdById in query to filter by a specific dealer
      // or if no dealerId passed in query, we just show all (delegated to findAllAdmin)
      const where = await this.buildWhereClause(query, false);
      return this.paginate(where, query, undefined, true);
    } else {
      throw new ForbiddenException('Not authorized');
    }

    // Collect all user IDs whose listings belong to this dealer
    const staffMembers = await this.prisma.dealerStaff.findMany({
      where: { dealerUserId, isActive: true },
      select: { staffUserId: true },
    });
    const staffIds = staffMembers.map((s) => s.staffUserId);
    const allCreatorIds = [dealerUserId, ...staffIds];

    const where: Prisma.CarListingWhereInput = {
      ...(await this.buildWhereClause(query, false)),
      createdById: { in: allCreatorIds },
    };

    // Override any external createdById filter
    return this.paginate(where, query, requestingUserId, true);
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  async findOne(
    idOrSlug: string,
    deviceId: string,
    requestingUserRole?: UserRole,
    requestingUserId?: string,
    analyticsQuery?: ListingAnalyticsQueryDto,
  ) {
    const now = new Date();
    const listing = await this.prisma.carListing.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: {
        ...LISTING_SELECT,
        reviews: {
          select: {
            id: true,
            action: true,
            message: true,
            reviewedAt: true,
            reviewedBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { reviewedAt: 'desc' },
        },
        ...(requestingUserId
          ? {
              wishlistedBy: {
                where: { userId: requestingUserId },
                select: { id: true },
              },
            }
          : {}),
        featuredSubscriptions: {
          select: {
            id: true,
            location: true,
            startDate: true,
            endDate: true,
            paymentStatus: true,
            paidAmount: true,
            discountApplied: true,
            createdAt: true,
            plan: {
              select: {
                id: true,
                name: true,
                durationDays: true,
                price: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException(`Listing "${idOrSlug}" not found`);
    }

    const isAdmin = requestingUserRole && this.isAdminRole(requestingUserRole);
    const isOwner =
      requestingUserId && listing.createdBy.id === requestingUserId;

    // Check if the requester is a DEALER_STAFF member of the listing's creator dealer
    let isStaffOfOwner = false;
    if (
      !isOwner &&
      requestingUserId &&
      requestingUserRole === UserRole.DEALER_STAFF
    ) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: requestingUserId },
        select: { dealerUserId: true, isActive: true },
      });
      if (
        staffRecord?.isActive &&
        staffRecord.dealerUserId === listing.createdBy.id
      ) {
        isStaffOfOwner = true;
      }
    }

    const hasAccess = isAdmin || isOwner || isStaffOfOwner;

    // Non-admin / non-owner / non-staff users can only see ACTIVE or SOLD listings
    if (
      !hasAccess &&
      listing.status !== ListingStatus.ACTIVE &&
      listing.status !== ListingStatus.SOLD
    ) {
      throw new NotFoundException(`Listing "${idOrSlug}" not found`);
    }

    const isWishlisted = (listing as any).wishlistedBy
      ? (listing as any).wishlistedBy.length > 0
      : false;
    const isFeatured =
      (listing as any).featuredSubscriptions?.some(
        (sub: any) =>
          (sub.paymentStatus === 'PAID' || sub.paymentStatus === 'FREE') &&
          sub.startDate <= now &&
          sub.endDate >= now,
      ) ?? false;

    const reviews = listing.reviews || [];
    const latestReview = reviews.length > 0 ? reviews[0] : null;
    const rejectionReason =
      reviews.find((r: any) => r.action === 'REJECTED')?.message || null;

    // Owner/staff-of-owner/admin only: view/reach/chat/WhatsApp analytics + views trend & growth %
    const analytics = hasAccess
      ? await this.buildListingAnalytics(listing.id, analyticsQuery)
      : null;

    const { wishlistedBy, ...cleanListing } = listing as any;
    const result = {
      ...cleanListing,
      isWishlisted,
      isFeatured,
      isOwner: Boolean(isOwner),
      ...(hasAccess
        ? { reviews, latestReview, rejectionReason, analytics }
        : {}),
    };

    // Non-admins don't see the spam flags
    // Queue the view tracking job
    if (deviceId && listing.id) {
      this.trackingQueue.add('view', {
        type: TrackingLogType.VIEW,
        listingId: listing.id,
        deviceId,
      });
    }

    if (!isAdmin) {
      const { isPotentialDuplicate: _d, duplicateOfId: _di, ...safe } = result;
      return safe;
    }

    return result;
  }

  // ─── Per-Listing Owner Analytics ────────────────────────────────────────────

  /**
   * Dedicated per-listing analytics endpoint — same data as the `analytics` block attached
   * to GET /listings/:id, but standalone (no need to fetch the full listing payload).
   * Accessible to: admin/moderator (any listing), the listing's owner, dealer staff of the
   * owning dealer, or the dealer whose staff created it.
   */
  async getListingAnalytics(
    idOrSlug: string,
    requestingUserRole: UserRole | undefined,
    requestingUserId: string | undefined,
    analyticsQuery?: ListingAnalyticsQueryDto,
  ) {
    const listing = await this.prisma.carListing.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
    if (!listing)
      throw new NotFoundException(`Listing "${idOrSlug}" not found`);

    const isAdmin = requestingUserRole && this.isAdminRole(requestingUserRole);
    const isOwner =
      requestingUserId && listing.createdBy.id === requestingUserId;

    let isStaffOfOwner = false;
    if (
      !isOwner &&
      requestingUserId &&
      requestingUserRole === UserRole.DEALER_STAFF
    ) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: requestingUserId },
        select: { dealerUserId: true, isActive: true },
      });
      if (
        staffRecord?.isActive &&
        staffRecord.dealerUserId === listing.createdBy.id
      ) {
        isStaffOfOwner = true;
      }
    }
    // A dealer viewing a listing created by one of their own staff members
    let isDealerOfStaffOwner = false;
    if (
      !isOwner &&
      !isStaffOfOwner &&
      requestingUserId &&
      requestingUserRole === UserRole.DEALER &&
      listing.createdBy.role === UserRole.DEALER_STAFF
    ) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: listing.createdBy.id },
        select: { dealerUserId: true, isActive: true },
      });
      if (
        staffRecord?.isActive &&
        staffRecord.dealerUserId === requestingUserId
      ) {
        isDealerOfStaffOwner = true;
      }
    }

    if (!isAdmin && !isOwner && !isStaffOfOwner && !isDealerOfStaffOwner) {
      throw new ForbiddenException(
        "You do not have access to this listing's analytics",
      );
    }

    const analytics = await this.buildListingAnalytics(
      listing.id,
      analyticsQuery,
    );

    return {
      listingId: listing.id,
      title: listing.title,
      slug: listing.slug,
      status: listing.status,
      owner: listing.createdBy,
      ...analytics,
    };
  }

  /**
   * Owner-only analytics block attached to the listing detail response: total + period
   * views/reach/impressions/WhatsApp-clicks, messages started, distinct users engaged
   * (chatted, requested a visit, or wishlisted), a views trend bucketed by the requested
   * granularity, and the views growth % vs the immediately preceding period of equal length.
   */
  private async buildListingAnalytics(
    listingId: string,
    query?: ListingAnalyticsQueryDto,
  ) {
    const { start, end, normalizedGranularity } = resolveDashboardDateRange(
      query?.startDate ?? query?.from ?? query?.start,
      query?.endDate ?? query?.to ?? query?.end,
      query?.granularity,
    );
    const granularity = normalizedGranularity;
    const { start: prevStart, end: prevEnd } = getPreviousPeriodRange(
      start,
      end,
    );
    const periodFilter: Prisma.DateTimeFilter = { gte: start, lte: end };
    const prevFilter: Prisma.DateTimeFilter = { gte: prevStart, lte: prevEnd };

    const [
      totals,
      periodViews,
      prevViews,
      periodReachGroups,
      periodWhatsappClicks,
      totalConversations,
      periodConversations,
      totalVisitRequests,
      periodVisitRequests,
      chatUsers,
      visitUsers,
      wishlistUsers,
      periodChatUsers,
      periodVisitUsers,
      periodWishlistUsers,
      viewLogs,
    ] = await Promise.all([
      this.prisma.carListing.findUnique({
        where: { id: listingId },
        select: {
          viewsCount: true,
          reachCount: true,
          impressionsCount: true,
          whatsappClicksCount: true,
        },
      }),
      this.prisma.carListingTrackingLog.count({
        where: {
          listingId,
          type: TrackingLogType.VIEW,
          createdAt: periodFilter,
        },
      }),
      this.prisma.carListingTrackingLog.count({
        where: { listingId, type: TrackingLogType.VIEW, createdAt: prevFilter },
      }),
      this.prisma.carListingTrackingLog.groupBy({
        by: ['deviceId'],
        where: {
          listingId,
          type: TrackingLogType.VIEW,
          createdAt: periodFilter,
        },
      }),
      this.prisma.carListingTrackingLog.count({
        where: {
          listingId,
          type: TrackingLogType.WHATSAPP_CLICK,
          createdAt: periodFilter,
        },
      }),
      this.prisma.chatConversation.count({ where: { listingId } }),
      this.prisma.chatConversation.count({
        where: { listingId, createdAt: periodFilter },
      }),
      this.prisma.carVisit.count({ where: { listingId } }),
      this.prisma.carVisit.count({
        where: { listingId, createdAt: periodFilter },
      }),
      this.prisma.chatConversation.findMany({
        where: { listingId },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.carVisit.findMany({
        where: { listingId },
        select: { visitorId: true },
        distinct: ['visitorId'],
      }),
      this.prisma.wishlist.findMany({
        where: { listingId },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.chatConversation.findMany({
        where: { listingId, createdAt: periodFilter },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.carVisit.findMany({
        where: { listingId, createdAt: periodFilter },
        select: { visitorId: true },
        distinct: ['visitorId'],
      }),
      this.prisma.wishlist.findMany({
        where: { listingId, createdAt: periodFilter },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.carListingTrackingLog.findMany({
        where: {
          listingId,
          type: TrackingLogType.VIEW,
          createdAt: periodFilter,
        },
        select: { createdAt: true },
      }),
    ]);

    const usersEngagedTotal = new Set([
      ...chatUsers.map((u) => u.userId),
      ...visitUsers.map((u) => u.visitorId),
      ...wishlistUsers.map((u) => u.userId),
    ]).size;

    const usersEngagedPeriod = new Set([
      ...periodChatUsers.map((u) => u.userId),
      ...periodVisitUsers.map((u) => u.visitorId),
      ...periodWishlistUsers.map((u) => u.userId),
    ]).size;

    // Views trend bucketed by the requested granularity
    const bucketKeys = buildDashboardBucketKeys(start, end, granularity);
    const bucketIndex = new Map(bucketKeys.map((key, i) => [key, i]));
    const trend = bucketKeys.map((period) => ({ period, views: 0 }));
    for (const log of viewLogs) {
      const idx = bucketIndex.get(
        getDashboardBucketKey(log.createdAt, granularity),
      );
      if (idx !== undefined) trend[idx].views += 1;
    }

    return {
      filtersApplied: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        granularity,
      },
      granularity,
      range: { startDate: start.toISOString(), endDate: end.toISOString() },
      totals: {
        views: totals?.viewsCount ?? 0,
        reach: totals?.reachCount ?? 0,
        impressions: totals?.impressionsCount ?? 0,
        whatsappClicks: totals?.whatsappClicksCount ?? 0,
        messagesStarted: totalConversations,
        usersEngaged: usersEngagedTotal,
        visitRequests: totalVisitRequests,
      },
      period: {
        views: periodViews,
        reach: periodReachGroups.length,
        whatsappClicks: periodWhatsappClicks,
        messagesStarted: periodConversations,
        usersEngaged: usersEngagedPeriod,
        visitRequests: periodVisitRequests,
        previousPeriodViews: prevViews,
        viewsGrowthPercent: computeGrowthPercent(periodViews, prevViews),
      },
      trend,
    };
  }

  // ─── WhatsApp Click Tracking (user side) ───────────────────────────────────

  /**
   * Called by the client when a user taps "Chat on WhatsApp" for a listing.
   * Mirrors the impression/view tracking flow (queued job, 10-min per-device cooldown)
   * so dealers can see how many chats their listings generate via WhatsApp.
   */
  async trackWhatsappClick(idOrSlug: string, deviceId: string) {
    const listing = await this.prisma.carListing.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true },
    });

    if (!listing) {
      throw new NotFoundException(`Listing "${idOrSlug}" not found`);
    }

    if (deviceId) {
      this.trackingQueue.add('whatsapp-click', {
        type: TrackingLogType.WHATSAPP_CLICK,
        listingId: listing.id,
        deviceId,
      });
    }

    return { status: 'queued', listingId: listing.id };
  }

  // ─── Rejection History (admin/moderator) ───────────────────────────────────

  async getReviewHistory(id: string) {
    const listing = await this.prisma.carListing.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!listing)
      throw new NotFoundException(`Listing with ID "${id}" not found`);

    const history = await this.prisma.carListingReview.findMany({
      where: { listingId: id },
      select: {
        id: true,
        action: true,
        message: true,
        snapshot: true,
        reviewedAt: true,
        reviewedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { reviewedAt: 'desc' },
    });

    return { listingId: id, title: listing.title, history };
  }

  // ─── Update (Owner / Admin) ────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateListingDto,
    userId: string,
    userRole: UserRole,
  ) {
    const listing = await this.prisma.carListing.findUnique({ where: { id } });
    if (!listing)
      throw new NotFoundException(`Listing with ID "${id}" not found`);

    const isAdmin = this.isAdminRole(userRole);
    const isOwner = listing.createdById === userId;

    // Allow dealer staff to edit listings belonging to their dealer
    let isStaffOfOwner = false;
    if (!isAdmin && !isOwner && userRole === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: userId },
        select: { dealerUserId: true, isActive: true },
      });
      if (
        staffRecord?.isActive &&
        staffRecord.dealerUserId === listing.createdById
      ) {
        isStaffOfOwner = true;
      }
    }

    if (!isAdmin && !isOwner && !isStaffOfOwner) {
      throw new ForbiddenException(
        'You do not have permission to edit this listing',
      );
    }

    // Owners cannot set contactVerified — only admins
    if (!isAdmin && dto.contactVerified === true) {
      throw new ForbiddenException('Only admins can verify contact details');
    }

    // If owner edits a REJECTED listing → becomes RESUBMITTED
    const shouldResubmit =
      (isOwner || isStaffOfOwner) &&
      !isAdmin &&
      listing.status === ListingStatus.REJECTED;

    // Run spam check if lat/lng changed
    let isPotentialDuplicate = listing.isPotentialDuplicate;
    let duplicateOfId = listing.duplicateOfId;
    const newLat = dto.latitude ?? listing.latitude;
    const newLon = dto.longitude ?? listing.longitude;
    const newName = dto.title ?? listing.title;

    if (newLat != null && newLon != null) {
      const foundDup = await this.findNearbyDuplicate(
        newName,
        newLat,
        newLon,
        id,
      );
      isPotentialDuplicate = !!foundDup;
      duplicateOfId = foundDup;
    }

    const { photos, ...rest } = dto;

    // Validate brand existence if updated
    if (rest.brandId !== undefined) {
      const brand = await this.prisma.carBrandOption.findUnique({
        where: { id: rest.brandId },
        select: { id: true },
      });
      if (!brand) {
        throw new BadRequestException(
          `Brand with ID "${rest.brandId}" does not exist.`,
        );
      }
    }

    // Validate model existence if updated
    if (rest.modelId !== undefined) {
      const model = await this.prisma.carModelOption.findUnique({
        where: { id: rest.modelId },
        select: { id: true },
      });
      if (!model) {
        throw new BadRequestException(
          `Model with ID "${rest.modelId}" does not exist.`,
        );
      }
    }

    // Validate car body type existence if updated
    const parsedCarTypeId =
      rest.carTypeId !== undefined ? parseRelationId(rest.carTypeId) : undefined;
    if (parsedCarTypeId) {
      const carType = await this.prisma.carTypeOption.findUnique({
        where: { id: parsedCarTypeId },
        select: { id: true },
      });
      if (!carType) {
        throw new BadRequestException(
          `Car body type with ID "${parsedCarTypeId}" does not exist.`,
        );
      }
    }

    // Validate VIN uniqueness if updated
    if (rest.vin !== undefined && typeof rest.vin === 'string' && rest.vin.trim()) {
      const trimmedVin = rest.vin.trim();
      const existingVin = await this.prisma.carListing.findFirst({
        where: { vin: trimmedVin, id: { not: id } },
        select: { id: true },
      });
      if (existingVin) {
        throw new BadRequestException(
          `A car listing with VIN "${trimmedVin}" already exists.`,
        );
      }
    }

    // Deduplicate and validate features if updated
    let featureIds: string[] | undefined;
    if (rest.features !== undefined) {
      const rawFeatures = Array.isArray(rest.features) ? rest.features : [];
      featureIds = Array.from(
        new Set(
          rawFeatures
            .map((fid) => (typeof fid === 'string' ? fid.trim() : ''))
            .filter(Boolean),
        ),
      );
      if (featureIds.length > 0) {
        const existingFeatures = await this.prisma.carFeatureOption.findMany({
          where: { id: { in: featureIds } },
          select: { id: true },
        });
        const existingFeatureIds = new Set(existingFeatures.map((f) => f.id));
        const missingFeatures = featureIds.filter(
          (fid) => !existingFeatureIds.has(fid),
        );
        if (missingFeatures.length > 0) {
          throw new BadRequestException(
            `Invalid feature ID(s) provided: ${missingFeatures.join(', ')}.`,
          );
        }
      }
    }

    // Deduplicate and validate tags if updated
    let tagIds: string[] | undefined;
    if (rest.tags !== undefined) {
      const rawTags = Array.isArray(rest.tags) ? rest.tags : [];
      tagIds = Array.from(
        new Set(
          rawTags
            .map((tid) => (typeof tid === 'string' ? tid.trim() : ''))
            .filter(Boolean),
        ),
      );
      if (tagIds.length > 0) {
        const existingTags = await this.prisma.carTagOption.findMany({
          where: { id: { in: tagIds } },
          select: { id: true },
        });
        const existingTagIds = new Set(existingTags.map((t) => t.id));
        const missingTags = tagIds.filter((tid) => !existingTagIds.has(tid));
        if (missingTags.length > 0) {
          throw new BadRequestException(
            `Invalid tag ID(s) provided: ${missingTags.join(', ')}.`,
          );
        }
      }
    }

    const updated = await this.prisma
      .$transaction(async (tx) => {
        const result = await tx.carListing.update({
          where: { id },
          data: {
            ...(rest.title !== undefined && {
              title: rest.title,
            }),
            ...(rest.description !== undefined && {
              description: rest.description,
            }),
            ...(rest.purpose !== undefined && { purpose: rest.purpose }),
            ...(rest.modelId !== undefined && { modelId: rest.modelId }),
            ...(rest.latitude !== undefined && { latitude: rest.latitude }),
            ...(rest.longitude !== undefined && { longitude: rest.longitude }),
            isPotentialDuplicate,
            duplicateOfId,
            ...(rest.modelYear !== undefined && { modelYear: rest.modelYear }),
            ...(rest.mileage !== undefined && { mileage: rest.mileage }),
            ...(rest.transmission !== undefined && {
              transmission: rest.transmission,
            }),
            ...(rest.fuelType !== undefined && { fuelType: rest.fuelType }),
            ...(rest.condition !== undefined && { condition: rest.condition }),
            ...(rest.exteriorColor !== undefined && {
              exteriorColor: rest.exteriorColor,
            }),
            ...(rest.interiorColor !== undefined && {
              interiorColor: rest.interiorColor,
            }),
            ...(rest.cylinders !== undefined && { cylinders: rest.cylinders }),
            ...(rest.doors !== undefined && { doors: rest.doors }),
            ...(rest.vin !== undefined && {
              vin: rest.vin?.trim() || null,
            }),
            ...(rest.carTypeId !== undefined && {
              carTypeId: parsedCarTypeId ?? null,
            }),
            ...(rest.extraProperties !== undefined && {
              extraProperties: rest.extraProperties as Prisma.InputJsonValue,
            }),
            ...(rest.price !== undefined && { price: rest.price }),
            ...(rest.priceNegotiable !== undefined && {
              priceNegotiable: rest.priceNegotiable,
            }),
            ...(rest.addressLine1 !== undefined && {
              addressLine1: rest.addressLine1,
            }),
            ...(rest.addressLine2 !== undefined && {
              addressLine2: rest.addressLine2,
            }),
            ...(rest.areaName !== undefined && { areaName: rest.areaName }),
            ...(rest.brandId !== undefined && {
              brandId: rest.brandId,
            }),
            ...(rest.contactPhone !== undefined && {
              contactPhone: rest.contactPhone,
            }),
            ...(rest.contactWhatsapp !== undefined && {
              contactWhatsapp: rest.contactWhatsapp,
            }),
            ...(isAdmin &&
              rest.contactVerified !== undefined && {
                contactVerified: rest.contactVerified,
              }),
            ...(featureIds !== undefined && {
              features: { set: featureIds.map((fid) => ({ id: fid })) },
            }),
            ...(tagIds !== undefined && {
              tags: { set: tagIds.map((tid) => ({ id: tid })) },
            }),
            ...(rest.otherFeatures !== undefined && {
              otherFeatures: rest.otherFeatures,
            }),
            ...(shouldResubmit && {
              status: ListingStatus.RESUBMITTED,
              submissionCount: { increment: 1 },
            }),
          },
          select: LISTING_SELECT,
        });

        // Replace photos if provided
        if (photos !== undefined) {
          await this.replacePhotos(tx, id, photos);
        }

        // Log audit event
        await tx.carListingReview.create({
          data: {
            listingId: id,
            action: shouldResubmit
              ? ListingReviewAction.RESUBMITTED
              : isAdmin
                ? ListingReviewAction.EDITED_BY_ADMIN
                : ListingReviewAction.RESUBMITTED,
            message: shouldResubmit
              ? 'Owner updated and resubmitted listing for review'
              : isAdmin
                ? 'Admin edited listing details'
                : 'Owner updated listing details',
            reviewedById: userId,
          },
        });

        return result;
      })
      .catch((error: any) => {
        if (
          error instanceof BadRequestException ||
          error instanceof NotFoundException ||
          error instanceof ForbiddenException
        ) {
          throw error;
        }
        if (error && error.code === 'P2002') {
          const target = Array.isArray(error.meta?.target)
            ? error.meta.target.join(', ')
            : error.meta?.target || 'field';
          throw new BadRequestException(
            `A listing with this ${target} already exists.`,
          );
        }
        if (error && error.code === 'P2003') {
          throw new BadRequestException(
            'Invalid reference ID provided (e.g., carTypeId, brandId, or modelId).',
          );
        }
        if (error && error.code === 'P2025') {
          throw new BadRequestException(
            'One or more referenced records (e.g. features or tags) do not exist.',
          );
        }
        throw new BadRequestException(
          error?.message || 'Failed to update listing due to invalid data.',
        );
      });

    return updated;
  }

  // ─── Admin Edit (full override) ────────────────────────────────────────────

  async adminUpdate(id: string, dto: UpdateListingDto, reviewerId: string) {
    // Calls regular update but bypasses owner check via SUPER_ADMIN role
    return this.update(id, dto, reviewerId, UserRole.SUPER_ADMIN);
  }

  // ─── Approve ───────────────────────────────────────────────────────────────

  /**
   * Approves a listing's content. Free-quota eligibility is decided *here*, not at
   * submission time, so nothing is charged/consumed until the content actually clears
   * review:
   *  - Free quota available (dealer subscription, or the user's admin-set free count) →
   *    consumed now, listing goes straight to ACTIVE.
   *  - Otherwise → listing moves to PENDING_PAYMENT (approved, but not live yet) and the
   *    owner is notified to pay via POST /listings/make-payment; paying activates it
   *    immediately (no further review needed).
   */
  async approve(id: string, reviewerId: string) {
    const listing = await this.prisma.carListing.findUnique({ where: { id } });
    if (!listing)
      throw new NotFoundException(`Listing with ID "${id}" not found`);

    if (listing.status === ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing is already active');
    }
    if (listing.status === ListingStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        'Listing has already been approved and is awaiting payment',
      );
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: listing.createdById },
      select: { role: true, freeListingsUsed: true },
    });
    const agencyDealerProfile = await this.resolveAgencyDealerProfile(
      listing.createdById,
      creator?.role,
    );

    let isFree = true; // SUPER_ADMIN/MODERATOR-owned listings (edge case) stay free
    if (agencyDealerProfile) {
      const now = new Date();
      const isValid =
        agencyDealerProfile.subscriptionValidUntil &&
        agencyDealerProfile.subscriptionValidUntil > now;
      isFree = Boolean(
        isValid && agencyDealerProfile.availableFreeListings > 0,
      );
    } else if (creator?.role === UserRole.USER) {
      const freeLimit = await this.getUserFreeListingsLimit();
      isFree = (creator.freeListingsUsed ?? 0) < freeLimit;
    }

    if (isFree) {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (agencyDealerProfile) {
          await tx.dealerProfile.update({
            where: { id: agencyDealerProfile.id },
            data: { availableFreeListings: { decrement: 1 } },
          });
        } else if (creator?.role === UserRole.USER) {
          await tx.user.update({
            where: { id: listing.createdById },
            data: { freeListingsUsed: { increment: 1 } },
          });
        }

        const result = await tx.carListing.update({
          where: { id },
          data: {
            status: ListingStatus.ACTIVE,
            paymentStatus: ListingPaymentStatus.FREE,
          },
          select: LISTING_SELECT,
        });

        await tx.carListingReview.create({
          data: {
            listingId: id,
            action: ListingReviewAction.APPROVED,
            message: 'Listing approved and is now live',
            reviewedById: reviewerId,
            snapshot: { previousStatus: listing.status },
          },
        });

        return result;
      });

      const owner = (updated as any).createdBy;
      if (owner?.email) {
        this.mail.sendListingApprovedEmail(
          owner.email,
          owner.name ?? 'there',
          updated.title,
          updated.slug ?? updated.id,
        );
      }
      this.notifications
        .sendToUser(owner.id, {
          title: 'Listing approved 🎉',
          body: `"${updated.title}" is now live on CarSaudi.`,
          data: { type: 'LISTING_APPROVED', listingId: id },
        })
        .catch(() => {});

      this.invoices
        .createForTransaction({
          type: InvoiceType.LISTING_PAYMENT,
          referenceId: id,
          billedToId: listing.createdById,
          description: `Listing Publication — ${updated.title}`,
          lineItems: [
            {
              description:
                'Pay-per-listing publication charge (free quota applied)',
              quantity: 1,
              unitPrice: 0,
              amount: 0,
            },
          ],
          subtotal: 0,
          status: InvoiceStatus.FREE,
        })
        .catch(() => {});

      return { ...updated, paymentRequired: false };
    }

    // Content approved, but outside free quota — hold for payment before going live
    const { price } = await this.getListingPricing(agencyDealerProfile);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.carListing.update({
        where: { id },
        data: {
          status: ListingStatus.PENDING_PAYMENT,
          paymentStatus: ListingPaymentStatus.PENDING,
        },
        select: LISTING_SELECT,
      });

      await tx.carListingReview.create({
        data: {
          listingId: id,
          action: ListingReviewAction.APPROVED,
          message: `Listing approved — payment of SAR ${price.toFixed(2)} required before it goes live`,
          reviewedById: reviewerId,
          snapshot: { previousStatus: listing.status },
        },
      });

      return result;
    });

    const owner = (updated as any).createdBy;
    if (owner?.email) {
      this.mail.sendListingApprovalPaymentRequiredEmail(
        owner.email,
        owner.name ?? 'there',
        updated.title,
        price,
      );
    }
    this.notifications
      .sendToUser(owner.id, {
        title: 'Listing approved — payment required',
        body: `"${updated.title}" was approved! Pay SAR ${price.toFixed(2)} to publish it.`,
        data: {
          type: 'LISTING_APPROVED_PAYMENT_REQUIRED',
          listingId: id,
          price: String(price),
        },
      })
      .catch(() => {});

    return { ...updated, paymentRequired: true, price };
  }

  // ─── Reject ────────────────────────────────────────────────────────────────

  async reject(id: string, dto: RejectListingDto, reviewerId: string) {
    const listing = await this.prisma.carListing.findUnique({ where: { id } });
    if (!listing)
      throw new NotFoundException(`Listing with ID "${id}" not found`);

    if (listing.status === ListingStatus.REJECTED) {
      throw new BadRequestException('Listing is already rejected');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.carListing.update({
        where: { id },
        data: { status: ListingStatus.REJECTED },
        select: LISTING_SELECT,
      });

      await tx.carListingReview.create({
        data: {
          listingId: id,
          action: ListingReviewAction.REJECTED,
          message: dto.message,
          reviewedById: reviewerId,
          snapshot: { previousStatus: listing.status },
        },
      });

      return result;
    });

    const owner = (updated as any).createdBy;
    if (owner?.email) {
      this.mail.sendListingRejectedEmail(
        owner.email,
        owner.name ?? 'there',
        updated.title,
        dto.message,
      );
    }
    this.notifications
      .sendToUser(owner.id, {
        title: 'Listing needs changes',
        body: `"${updated.title}" wasn't approved as submitted — tap for details.`,
        data: { type: 'LISTING_REJECTED', listingId: id },
      })
      .catch(() => {});

    return updated;
  }

  // ─── Mark as SOLD ──────────────────────────────────────────────────────────

  async markSold(id: string, userId: string, userRole: UserRole) {
    const listing = await this.prisma.carListing.findUnique({ where: { id } });
    if (!listing)
      throw new NotFoundException(`Listing with ID "${id}" not found`);

    const isAdmin = this.isAdminRole(userRole);
    const isOwner = listing.createdById === userId;

    // Allow dealer staff to mark their dealer's listings as sold
    let isStaffOfOwner = false;
    if (!isAdmin && !isOwner && userRole === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: userId },
        select: { dealerUserId: true, isActive: true },
      });
      if (
        staffRecord?.isActive &&
        staffRecord.dealerUserId === listing.createdById
      ) {
        isStaffOfOwner = true;
      }
    }

    if (!isAdmin && !isOwner && !isStaffOfOwner) {
      throw new ForbiddenException(
        'You do not have permission to mark this listing as sold',
      );
    }

    if (listing.status === ListingStatus.SOLD) {
      throw new BadRequestException('Listing is already marked as sold');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.carListing.update({
        where: { id },
        data: { status: ListingStatus.SOLD, soldAt: new Date() },
        select: LISTING_SELECT,
      });

      await tx.carListingReview.create({
        data: {
          listingId: id,
          action: ListingReviewAction.APPROVED,
          message: 'Listing marked as SOLD',
          reviewedById: userId,
          snapshot: { previousStatus: listing.status },
        },
      });

      // Clear tracking logs to save space
      await tx.carListingTrackingLog.deleteMany({ where: { listingId: id } });

      return result;
    });

    return updated;
  }

  // ─── Resubmit (explicit endpoint, owner only) ─────────────────────────────

  async resubmit(id: string, userId: string) {
    const listing = await this.prisma.carListing.findUnique({ where: { id } });
    if (!listing)
      throw new NotFoundException(`Listing with ID "${id}" not found`);

    if (listing.createdById !== userId) {
      throw new ForbiddenException('Only the listing owner can resubmit');
    }

    if (listing.status !== ListingStatus.REJECTED) {
      throw new BadRequestException(
        'Only REJECTED listings can be resubmitted',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.carListing.update({
        where: { id },
        data: {
          status: ListingStatus.RESUBMITTED,
          submissionCount: { increment: 1 },
        },
        select: LISTING_SELECT,
      });

      await tx.carListingReview.create({
        data: {
          listingId: id,
          action: ListingReviewAction.RESUBMITTED,
          message: 'Owner resubmitted listing for review',
          reviewedById: userId,
        },
      });

      return result;
    });

    return updated;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(id: string, userId: string, userRole: UserRole) {
    const listing = await this.prisma.carListing.findUnique({ where: { id } });
    if (!listing)
      throw new NotFoundException(`Listing with ID "${id}" not found`);

    const isAdmin = this.isAdminRole(userRole);
    const isOwner = listing.createdById === userId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'You do not have permission to delete this listing',
      );
    }

    await this.prisma.carListing.delete({ where: { id } });
    return {
      message: `Listing "${listing.title}" deleted successfully`,
    };
  }

  // ─── Features & Tags Options ────────────────────────────────────────────────

  async getOptions() {
    const features = await this.prisma.carFeatureOption.findMany({
      select: { id: true, title: true, image: true },
    });
    const tags = await this.prisma.carTagOption.findMany({
      select: { id: true, title: true, image: true },
    });
    const carTypes = await this.prisma.carTypeOption.findMany({
      select: { id: true, title: true },
    });

    const carModelsRaw = await this.prisma.carModelOption.findMany({
      select: {
        id: true,
        title: true,
        image: true,
        _count: {
          select: {
            listings: {
              where: { status: ListingStatus.ACTIVE },
            },
          },
        },
      },
    });

    const carModels = carModelsRaw.map((model) => {
      const { _count, ...rest } = model;
      return { ...rest, listingCount: _count.listings };
    });

    const brandsRaw = await this.prisma.carBrandOption.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        image: true,
        isPopular: true,
        _count: {
          select: {
            listings: {
              where: { status: ListingStatus.ACTIVE },
            },
          },
        },
        listings: {
          where: { status: ListingStatus.ACTIVE },
          orderBy: { price: 'asc' },
          take: 1,
          select: { price: true },
        },
      },
    });

    const brands = brandsRaw.map((brand) => {
      const { _count, listings, ...rest } = brand;
      return {
        ...rest,
        listingCount: _count.listings,
        cheapestListingPrice: listings.length > 0 ? listings[0].price : null,
      };
    });

    return {
      features,
      tags,
      carTypes,
      carModels,
      brands,
    };
  }

  // ─── Popular Brands ─────────────────────────────────────────────────────────

  async getPopularBrands() {
    const popularBrands = await this.prisma.carBrandOption.findMany({
      where: {
        isPopular: true,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        image: true,
        isPopular: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            listings: {
              where: {
                status: ListingStatus.ACTIVE,
              },
            },
          },
        },
      },
    });

    const data = popularBrands.map((brand) => {
      const { _count, ...rest } = brand;
      return {
        ...rest,
        activeListingsCount: _count.listings,
      };
    });

    const totalActiveBrandsCount = data.filter(
      (b) => b.activeListingsCount > 0,
    ).length;

    return {
      data,
      totalPopularBrandsCount: data.length,
      totalActiveBrandsCount,
    };
  }

  // ─── Nearby Listings ───────────────────────────────────────────────────────

  async findNearbyListings(
    query: QueryNearbyListingsDto,
    deviceId: string,
    userId?: string,
  ) {
    const { latitude, longitude, radiusKm = 10, page = 1, limit = 12 } = query;

    const candidateWhere: Prisma.CarListingWhereInput = {
      status: ListingStatus.ACTIVE,
      latitude: { not: null },
      longitude: { not: null },
    };

    const listings = await this.prisma.carListing.findMany({
      where: candidateWhere,
      select: {
        ...LISTING_SELECT,
        ...(userId
          ? { wishlistedBy: { where: { userId }, select: { id: true } } }
          : {}),
        ...buildFeaturedSelect(),
      },
    });

    const radiusMetres = radiusKm * 1000;
    const now = new Date();

    const withDistance = listings
      .map((listing) => {
        const distMetres = haversineMetres(
          latitude,
          longitude,
          listing.latitude!,
          listing.longitude!,
        );
        const isWishlisted = (listing as any).wishlistedBy
          ? (listing as any).wishlistedBy.length > 0
          : false;
        const isFeatured =
          (listing as any).featuredSubscriptions?.some(
            (sub: any) =>
              (sub.paymentStatus === 'PAID' || sub.paymentStatus === 'FREE') &&
              sub.startDate <= now &&
              sub.endDate >= now,
          ) ?? false;

        const { wishlistedBy, ...cleanListing } = listing as any;

        return {
          ...cleanListing,
          isWishlisted,
          isFeatured,
          distanceMetres: Math.round(distMetres),
          distanceKm: parseFloat((distMetres / 1000).toFixed(2)),
        };
      })
      .filter((listing) => listing.distanceMetres <= radiusMetres)
      .sort((a, b) => a.distanceMetres - b.distanceMetres);

    const total = withDistance.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const skip = (page - 1) * limit;
    const paginated = withDistance.slice(skip, skip + limit);

    if (paginated.length > 0 && deviceId) {
      paginated.forEach((listing) => {
        this.trackingQueue.add('impression', {
          type: TrackingLogType.IMPRESSION,
          listingId: listing.id,
          deviceId,
        });
      });
    }

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      totalActiveNearbyListingsCount: total,
    };
  }

  // ─── Geocode Location (Google Maps API + DB Cache) ──────────────────────────

  async geocodeLocation(dto: GeocodeLocationDto) {
    const rawSearch = dto.location.trim();
    const normalizedKeyword = rawSearch.toLowerCase();

    // 1. Partial/Like match in DB Cache table (GeocodeCache) for optimized lookup
    const cachedEntry = await this.prisma.geocodeCache.findFirst({
      where: {
        OR: [
          { keyword: { contains: normalizedKeyword, mode: 'insensitive' } },
          { title: { contains: normalizedKeyword, mode: 'insensitive' } },
        ],
      },
    });

    if (cachedEntry) {
      return {
        cached: true,
        keyword: cachedEntry.keyword,
        title: cachedEntry.title,
        data: cachedEntry.data,
      };
    }

    // 2. Fallback to Google Maps Geocoding API if not found in DB
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const query = rawSearch.toLowerCase().includes('saudi')
      ? rawSearch
      : `${rawSearch}, Saudi Arabia`;

    let googleData: any = null;
    let title = rawSearch;
    let latitude: number | null = null;
    let longitude: number | null = null;
    let areaName: string = rawSearch;

    if (apiKey && apiKey !== 'your-google-maps-api-key-here') {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
        const res = await fetch(url);
        googleData = await res.json();

        if (
          googleData.status === 'OK' &&
          googleData.results &&
          googleData.results.length > 0
        ) {
          const firstResult = googleData.results[0];
          title = firstResult.formatted_address;
          latitude = firstResult.geometry.location.lat;
          longitude = firstResult.geometry.location.lng;

          const localityComp = firstResult.address_components.find(
            (c: any) =>
              c.types.includes('locality') ||
              c.types.includes('sublocality') ||
              c.types.includes('neighborhood'),
          );
          if (localityComp) {
            areaName = localityComp.long_name;
          }
        }
      } catch (err) {
        // Silently catch network errors
      }
    }

    // Fallback to Nominatim if Google API fails or is not set
    if (!latitude || !longitude) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=sa`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'CarSaudiBackend/1.0' },
        });
        const nominatimResults = await res.json();
        if (nominatimResults && nominatimResults.length > 0) {
          const item = nominatimResults[0];
          title = item.display_name;
          latitude = parseFloat(item.lat);
          longitude = parseFloat(item.lon);
        }
      } catch (err) {
        // Fallback
      }
    }

    const payload = {
      title,
      latitude,
      longitude,
      areaName,
      formattedAddress: title,
      googleData: googleData ?? undefined,
    };

    // 3. Save result in DB Cache for instant future lookups
    const savedCache = await this.prisma.geocodeCache.create({
      data: {
        keyword: normalizedKeyword,
        title,
        data: payload as any,
      },
    });

    return {
      cached: false,
      keyword: savedCache.keyword,
      title: savedCache.title,
      data: savedCache.data,
    };
  }

  // ─── Reverse Geocode Location (Google Maps API + DB Cache) ──────────────────

  async reverseGeocodeLocation(dto: ReverseGeocodeLocationDto) {
    const latitude = Number(dto.latitude);
    const longitude = Number(dto.longitude);
    // We can use a rounded lat/lng as keyword for basic caching (4 decimals ~ 11m precision)
    const latRounded = latitude.toFixed(4);
    const lngRounded = longitude.toFixed(4);
    const keyword = `rev-${latRounded},${lngRounded}`;

    const cachedEntry = await this.prisma.geocodeCache.findUnique({
      where: { keyword },
    });

    if (cachedEntry) {
      return {
        cached: true,
        keyword: cachedEntry.keyword,
        title: cachedEntry.title,
        data: cachedEntry.data,
      };
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    let googleData: any = null;
    let title = `${latitude}, ${longitude}`;
    let areaName = 'Unknown Area';

    if (apiKey && apiKey !== 'your-google-maps-api-key-here') {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
        const res = await fetch(url);
        googleData = await res.json();

        if (
          googleData.status === 'OK' &&
          googleData.results &&
          googleData.results.length > 0
        ) {
          const firstResult = googleData.results[0];
          title = firstResult.formatted_address;

          const localityComp = firstResult.address_components.find(
            (c: any) =>
              c.types.includes('locality') ||
              c.types.includes('sublocality') ||
              c.types.includes('neighborhood'),
          );
          if (localityComp) {
            areaName = localityComp.long_name;
          }
        }
      } catch (err) {
        // Silently catch network errors
      }
    }

    // Fallback to Nominatim if Google API fails or is not set
    if (areaName === 'Unknown Area') {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'CarSaudiBackend/1.0' },
        });
        const nominatimResult = await res.json();
        if (nominatimResult && !nominatimResult.error) {
          title = nominatimResult.display_name;
          areaName =
            nominatimResult.address?.suburb ||
            nominatimResult.address?.city ||
            nominatimResult.address?.town ||
            nominatimResult.address?.village ||
            'Unknown Area';
        }
      } catch (err) {
        // Fallback
      }
    }

    const payload = {
      title,
      latitude,
      longitude,
      areaName,
      formattedAddress: title,
      googleData: googleData ?? undefined,
    };

    const savedCache = await this.prisma.geocodeCache.create({
      data: {
        keyword,
        title,
        data: payload as any,
      },
    });

    return {
      cached: false,
      keyword: savedCache.keyword,
      title: savedCache.title,
      data: savedCache.data,
    };
  }

  // ─── Price Estimation ──────────────────────────────────────────────────────

  async estimatePrice(dto: PriceEstimationDto) {
    if (
      !process.env.GROQ_API_KEY ||
      process.env.GROQ_API_KEY === 'your-groq-api-key-here'
    ) {
      throw new BadRequestException(
        'GROQ_API_KEY is not configured on the server.',
      );
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const prompt = `
You are an expert car valuation specialist in Saudi Arabia.
Estimate the car price in SAR (Saudi Riyal) for the following car:
- Brand: ${dto.brand}
- Model: ${dto.carModel}
- Model Year: ${dto.modelYear}
- Mileage: ${dto.mileage} km
${dto.carType ? `- Car Type: ${dto.carType}` : ''}
${dto.condition ? `- Condition: ${dto.condition}` : ''}
${dto.fuelType ? `- Fuel Type: ${dto.fuelType}` : ''}
${dto.transmission ? `- Transmission: ${dto.transmission}` : ''}
${dto.highlights ? `- Highlights: ${dto.highlights}` : ''}
${dto.features && dto.features.length > 0 ? `- Features: ${dto.features.join(', ')}` : ''}

Return ONLY a JSON object exactly matching this format:
{
  "minPrice": number,
  "maxPrice": number,
  "averagePrice": number
}
`;

    console.log(prompt);
    console.log(process.env.GROQ_API_KEY);
    console.log(process.env.GROQ_API_MODEL);
    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: process.env.GROQ_API_MODEL || 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from AI model');
      }

      return JSON.parse(responseContent);
    } catch (error) {
      console.error('Groq API Error:', error);
      throw new BadRequestException('Failed to estimate price');
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async buildWhereClause(
    query: QueryListingDto,
    publicOnly: boolean,
  ): Promise<Prisma.CarListingWhereInput> {
    const {
      modelId,
      purpose,
      status,
      brandId,
      areaName,
      minPrice,
      maxPrice,
      priceNegotiable,
      minModelYear,
      maxModelYear,
      minMileage,
      maxMileage,
      fuelType,
      transmission,
      condition,
      carTypeId,
      featureId,
      tagId,
      isPotentialDuplicate,
      createdById,
      userId,
      referenceCode,
      search,
      latitude,
      longitude,
      radius,
    } = query;

    let idIn: string[] | undefined = undefined;

    if (latitude != null && longitude != null && radius != null) {
      // Find listings within radius using Haversine formula directly in DB
      const result = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM car_listings
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND (
            6371000 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS(latitude - ${latitude}::float) / 2), 2) +
              COS(RADIANS(${latitude}::float)) * COS(RADIANS(latitude)) *
              POWER(SIN(RADIANS(longitude - ${longitude}::float) / 2), 2)
            ))
          ) <= ${radius}::float
      `;
      idIn = result.map((r) => r.id);
    }

    const parseArray = <T = string>(val: any): T[] | undefined => {
      if (val === undefined || val === null || val === '') return undefined;
      if (Array.isArray(val)) {
        const flat = val
          .flatMap((v) => (typeof v === 'string' ? v.split(',') : v))
          .map((v) => String(v).trim())
          .filter(Boolean);
        return flat.length > 0 ? (flat as T[]) : undefined;
      }
      if (typeof val === 'string') {
        const split = val
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        return split.length > 0 ? (split as T[]) : undefined;
      }
      return [val as T];
    };

    // Resolve owner filter (support both createdById and userId)
    const ownerId = userId || createdById;

    const modelIds = parseArray<string>(modelId);
    const purposes = parseArray<ListingPurpose>(purpose);
    const statuses = parseArray<ListingStatus>(status);
    const brandIds = parseArray<string>(brandId);
    const areaNames = parseArray<string>(areaName);
    const carTypeIds = parseArray<string>(carTypeId);
    const featureIds = parseArray<string>(featureId);
    const tagIds = parseArray<string>(tagId);

    const where: Prisma.CarListingWhereInput = {
      ...(idIn !== undefined && { id: { in: idIn } }),
      ...(publicOnly && {
        status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLD] },
      }),
      ...(!publicOnly &&
        statuses &&
        statuses.length > 0 && {
          status: statuses.length === 1 ? statuses[0] : { in: statuses },
        }),
      ...(modelIds &&
        modelIds.length > 0 && {
          modelId: modelIds.length === 1 ? modelIds[0] : { in: modelIds },
        }),
      ...(purposes &&
        purposes.length > 0 && {
          purpose: purposes.length === 1 ? purposes[0] : { in: purposes },
        }),
      ...(brandIds &&
        brandIds.length > 0 && {
          brandId:
            brandIds.length === 1
              ? brandIds[0]
              : { in: brandIds },
        }),
      ...(carTypeIds &&
        carTypeIds.length > 0 && {
          carTypeId:
            carTypeIds.length === 1
              ? carTypeIds[0]
              : { in: carTypeIds },
        }),
      ...(featureIds &&
        featureIds.length > 0 && {
          features: { some: { id: { in: featureIds } } },
        }),
      ...(tagIds &&
        tagIds.length > 0 && {
          tags: { some: { id: { in: tagIds } } },
        }),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? {
            price: {
              ...(minPrice !== undefined && { gte: minPrice }),
              ...(maxPrice !== undefined && { lte: maxPrice }),
            },
          }
        : {}),
      ...(priceNegotiable !== undefined && { priceNegotiable }),
      ...(minModelYear !== undefined || maxModelYear !== undefined
        ? {
            modelYear: {
              ...(minModelYear !== undefined && { gte: minModelYear }),
              ...(maxModelYear !== undefined && { lte: maxModelYear }),
            },
          }
        : {}),
      ...(minMileage !== undefined || maxMileage !== undefined
        ? {
            mileage: {
              ...(minMileage !== undefined && { gte: minMileage }),
              ...(maxMileage !== undefined && { lte: maxMileage }),
            },
          }
        : {}),
      ...(fuelType !== undefined && { fuelType }),
      ...(transmission !== undefined && { transmission }),
      ...(condition !== undefined && { condition }),
      ...(isPotentialDuplicate !== undefined &&
        !publicOnly && { isPotentialDuplicate }),
      ...(ownerId && { createdById: ownerId }),
      ...(referenceCode && {
        referenceCode: {
          contains: referenceCode,
          mode: 'insensitive' as const,
        },
      }),
    };

    // Area name search (single or multiple)
    if (areaNames && areaNames.length > 0) {
      if (areaNames.length === 1) {
        where.areaName = { contains: areaNames[0], mode: 'insensitive' };
      } else {
        where.OR = [
          ...((where.OR as any[]) || []),
          ...areaNames.map((name) => ({
            areaName: { contains: name, mode: 'insensitive' as const },
          })),
        ];
      }
    }

    // Text search
    if (search) {
      const searchConditions = [
        { referenceCode: { contains: search, mode: 'insensitive' as const } },
        { title: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
        { areaName: { contains: search, mode: 'insensitive' as const } },
        { addressLine1: { contains: search, mode: 'insensitive' as const } },
        { otherFeatures: { contains: search, mode: 'insensitive' as const } },
      ];
      if (where.OR) {
        where.AND = [
          ...((where.AND as any[]) || []),
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    return where;
  }

  private async paginate(
    where: Prisma.CarListingWhereInput,
    query: QueryListingDto,
    userId?: string,
    includeReviews = false,
  ) {
    const {
      page = 1,
      limit = 12,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const orderBy: Prisma.CarListingOrderByWithRelationInput =
      sortBy === 'price'
        ? { price: sortOrder }
        : sortBy === 'mileage'
          ? { mileage: sortOrder }
          : sortBy === 'modelYear'
            ? { modelYear: sortOrder }
            : { createdAt: sortOrder };

    const now = new Date();

    const [listings, total] = await Promise.all([
      this.prisma.carListing.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          ...LISTING_SELECT,
          ...(userId
            ? { wishlistedBy: { where: { userId }, select: { id: true } } }
            : {}),
          ...(includeReviews
            ? {
                reviews: {
                  select: {
                    id: true,
                    action: true,
                    message: true,
                    reviewedAt: true,
                    reviewedBy: {
                      select: { id: true, name: true, role: true },
                    },
                  },
                  orderBy: { reviewedAt: 'desc' },
                },
              }
            : {}),
          featuredSubscriptions: {
            where: {
              paymentStatus: { in: ['PAID', 'FREE'] as any },
              startDate: { lte: now },
              endDate: { gte: now },
            },
            select: { id: true },
            take: 1,
          },
        },
      }),
      this.prisma.carListing.count({ where }),
    ]);

    const mappedListings = listings.map((l) => {
      const isWishlisted = (l as any).wishlistedBy
        ? (l as any).wishlistedBy.length > 0
        : false;
      const isFeatured = (l as any).featuredSubscriptions
        ? (l as any).featuredSubscriptions.length > 0
        : false;
      const reviews = (l as any).reviews || [];
      const latestReview = reviews.length > 0 ? reviews[0] : null;
      const rejectionReason =
        reviews.find((r: any) => r.action === 'REJECTED')?.message || null;
      const { wishlistedBy, featuredSubscriptions, ...rest } = l as any;
      return {
        ...rest,
        isWishlisted,
        isFeatured,
        ...(includeReviews ? { reviews, latestReview, rejectionReason } : {}),
      };
    });

    return {
      data: mappedListings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Contact Phone Verification Methods ────────────────────────────────────

  private normalizePhone(phone: string): { formatted: string; clean: string } {
    const clean = phone.replace(/\D/g, '');
    const formatted = clean ? `+${clean}` : phone;
    return { formatted, clean };
  }

  /**
   * Check if a contact phone number for a listing is already verified.
   * Phone is verified if:
   * 1. An active user with this phone exists, OR
   * 2. A verified OTP record for this phone exists.
   */
  async checkListingPhoneVerification(rawPhone: string) {
    if (!rawPhone) {
      throw new BadRequestException('Phone number is required');
    }

    const { formatted, clean } = this.normalizePhone(rawPhone);

    const matchingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: formatted },
          { phone: clean },
          { phone: `+${clean}` },
          { phone: rawPhone },
        ],
      },
      select: { id: true },
    });

    if (matchingUser) {
      return {
        isVerified: true,
        phone: formatted,
        message: 'Phone number is verified via registered user account.',
      };
    }

    const verifiedOtp = await this.prisma.otpRecord.findFirst({
      where: {
        OR: [
          { phone: formatted },
          { phone: clean },
          { phone: `+${clean}` },
          { phone: rawPhone },
        ],
        verified: true,
      },
    });

    if (verifiedOtp) {
      return {
        isVerified: true,
        phone: formatted,
        message: 'Phone number is verified via WhatsApp OTP.',
      };
    }

    return {
      isVerified: false,
      phone: formatted,
      message: 'Phone number requires WhatsApp OTP verification.',
    };
  }

  /** Send WhatsApp OTP to verify listing contact phone */
  async sendListingPhoneOtp(rawPhone: string) {
    if (!rawPhone) {
      throw new BadRequestException('Phone number is required');
    }
    const { formatted } = this.normalizePhone(rawPhone);
    return this.otpService.sendOtp(formatted);
  }

  /** Verify WhatsApp OTP for listing contact phone */
  async verifyListingPhoneOtp(rawPhone: string, otp: string) {
    if (!rawPhone || !otp) {
      throw new BadRequestException('Phone number and OTP are required');
    }
    const { formatted } = this.normalizePhone(rawPhone);
    await this.otpService.verifyOtp(formatted, otp);

    return {
      isVerified: true,
      phone: formatted,
      message: 'Phone number verified successfully.',
    };
  }
}
