import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permission, UserRole } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminAddFeaturedDto } from './dto/admin-add-featured.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { DealerAddFeaturedDto } from './dto/dealer-add-featured.dto';
import { QueryFeaturedDto } from './dto/query-featured.dto';
import { FeaturedService } from './featured.service';
import { DealerSubscriptionsService } from '../dealer-subscriptions/dealer-subscriptions.service';
import { FeaturedPlacementLocation } from '@prisma/client';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { ApiQuery } from '@nestjs/swagger';

@ApiTags('Featured Listings')
@Controller('featured')
export class FeaturedController {
  constructor(
    private readonly featuredService: FeaturedService,
    private readonly dealerSubscriptionsService: DealerSubscriptionsService,
  ) {}

  // ─── Public: Get featured listings by location ─────────────────────────────

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get featured listings for a specific placement location',
    description:
      'Returns a **randomly shuffled**, paginated pool of currently active featured car listings for the given location. ' +
      'Each API call yields a different order — no listing is always shown first.\n\n' +
      '**Locations**: `HOME_PAGE` | `LISTING_PAGE` | `CAR_DETAIL_PAGE`\n\n' +
      'Supports `search` for text-based filtering of listing titles and areas. ' +
      'Includes `isWishlisted` flag if user is authenticated.',
  })
  @ApiQuery({
    name: 'location',
    enum: FeaturedPlacementLocation,
    required: true,
    description: 'Placement location to retrieve featured listings for',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max results per page (default 8, max 50)',
    example: 8,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by listing title, area name, or description',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated, randomized list of active featured listings',
  })
  @ApiResponse({ status: 400, description: 'Invalid location value' })
  getFeatured(
    @Query('location') location: FeaturedPlacementLocation,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.featuredService.getFeaturedByLocation(
      location,
      page ? Math.max(1, parseInt(page, 10)) : 1,
      limit ? Math.min(parseInt(limit, 10), 50) : 8,
      search,
      userId,
    );
  }

  // ─── User: Create Stripe checkout session ──────────────────────────────────

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a Stripe checkout to feature a listing',
    description:
      'Creates a Stripe Checkout Session for the authenticated user to pay for a featured plan. ' +
      'Returns a `url` to redirect the user to Stripe (web) and a `paymentIntentClientSecret` for ' +
      "mobile apps to complete payment natively via Stripe's mobile SDK (PaymentSheet) instead of " +
      'the hosted redirect. Optionally pass `successUrl` / `failedUrl` (web URLs or app deep links) ' +
      'to override the default redirect targets — `successUrl` gets `?session_id={CHECKOUT_SESSION_ID}` ' +
      'appended automatically. On successful payment, the Stripe webhook automatically activates the ' +
      'subscription (fully-discounted/free plans activate instantly, without Stripe).',
  })
  @ApiResponse({
    status: 201,
    description: 'Stripe checkout session created with url and sessionId',
  })
  @ApiResponse({
    status: 400,
    description: 'Listing not active or already featured at this location',
  })
  @ApiResponse({
    status: 403,
    description: 'Listing does not belong to the authenticated user',
  })
  @ApiResponse({ status: 404, description: 'Listing or plan not found' })
  createCheckout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.featuredService.createCheckout(dto, userId);
  }

  // ─── Stripe Webhook ────────────────────────────────────────────────────────

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Stripe webhook receiver (canonical — configure your Stripe webhook to send here)',
    description:
      'Receives and verifies **every** Stripe payment webhook for this app — featured-listing ' +
      'boosts, pay-per-listing charges (incl. the standalone PaymentIntent used for mobile native ' +
      'payment), and dealer subscription plans — not just featured payments, despite the URL. ' +
      'On `checkout.session.completed` → activates the relevant FeaturedSubscription / Listing / ' +
      'DealerSubscription. On `payment_intent.succeeded` → activates a listing paid via the mobile ' +
      'PaymentIntent flow. On `checkout.session.expired` → marks the relevant record FAILED. ' +
      '**Note**: This endpoint requires the raw request body (not JSON-parsed).',
  })
  @ApiResponse({ status: 200, description: 'Webhook received and processed' })
  @ApiResponse({ status: 400, description: 'Invalid Stripe signature' })
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.dealerSubscriptionsService.handleStripeWebhook(
      req.rawBody!,
      signature,
    );
  }

  // ─── User: My subscriptions ────────────────────────────────────────────────

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Get the current user's featured subscriptions",
    description:
      'Returns all featured subscriptions created by the authenticated user, including plan details and listing info.',
  })
  @ApiResponse({
    status: 200,
    description: "List of user's featured subscriptions",
  })
  getMySubscriptions(@CurrentUser('id') userId: string) {
    return this.featuredService.getMySubscriptions(userId);
  }

  // ─── User: Cancel pending subscription ────────────────────────────────────

  @Delete('my/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Cancel a PENDING featured subscription (before payment)',
    description:
      'Allows a user to cancel a subscription that has not yet been paid.',
  })
  @ApiParam({ name: 'id', description: 'Featured subscription CUID' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled' })
  @ApiResponse({
    status: 400,
    description: 'Can only cancel PENDING subscriptions',
  })
  @ApiResponse({ status: 403, description: 'Not your subscription' })
  cancelMySubscription(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.featuredService.cancelMySubscription(id, userId);
  }

  // ─── Admin: Direct add ────────────────────────────────────────────────────

  @Post('admin-add')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.FEATURED_CARS_VIEW)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Admin: Directly add a listing to featured (bypass Stripe)',
    description:
      'Allows an admin/moderator with `MANAGE_FEATURED` permission to instantly feature any listing. ' +
      'Payment status defaults to FREE. Optionally set `paidAmount` if payment was received offline.',
  })
  @ApiResponse({
    status: 201,
    description: 'Featured subscription created by admin',
  })
  @ApiResponse({ status: 404, description: 'Listing or plan not found' })
  adminAddFeatured(
    @Body() dto: AdminAddFeaturedDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.featuredService.adminAddFeatured(dto, adminId);
  }

  // ─── Admin: All subscriptions ──────────────────────────────────────────────

  @Get('admin')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.FEATURED_CARS_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: List all featured subscriptions',
    description:
      'Paginated list of all featured subscriptions. Filter by `location`, `paymentStatus`, or `listingId`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of featured subscriptions',
  })
  getAllAdmin(@Query() query: QueryFeaturedDto) {
    return this.featuredService.getAllSubscriptionsAdmin(query);
  }

  // ─── Admin: Remove / expire subscription ──────────────────────────────────

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.FEATURED_CARS_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Remove (expire) a featured subscription immediately',
    description:
      'Sets the `endDate` to now, immediately removing the listing from the featured pool.',
  })
  @ApiParam({ name: 'id', description: 'Featured subscription CUID' })
  @ApiResponse({ status: 200, description: 'Subscription expired/removed' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  removeSubscription(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.featuredService.removeSubscription(id, adminId);
  }

  // ─── Dealer: Make listing featured directly (bypasses payment for now) ─────

  @Post('dealer-feature')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.DEALER,
    UserRole.DEALER_STAFF,
    UserRole.SUPER_ADMIN,
    UserRole.MODERATOR,
  )
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Dealer: Directly feature a listing (bypasses payment for now)',
    description:
      'Allows a dealer (or dealer staff) to feature an active car listing directly without Stripe checkout. ' +
      'Creates active featured subscriptions for the placement locations and duration specified in the chosen plan.',
  })
  @ApiResponse({ status: 201, description: 'Listing featured successfully' })
  @ApiResponse({
    status: 400,
    description: 'Listing not active or already featured',
  })
  @ApiResponse({
    status: 403,
    description: 'Listing does not belong to your agency',
  })
  @ApiResponse({ status: 404, description: 'Listing or plan not found' })
  dealerAddFeatured(
    @Body() dto: DealerAddFeaturedDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.featuredService.dealerAddFeatured(dto, userId, userRole);
  }
}
