import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permission, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateListingDto } from './dto/create-listing.dto';
import { QueryListingDto } from './dto/query-listing.dto';
import { QueryNearbyListingsDto } from './dto/query-nearby-listings.dto';
import { GeocodeLocationDto } from './dto/geocode-location.dto';
import { ReverseGeocodeLocationDto } from './dto/reverse-geocode-location.dto';
import { RejectListingDto } from './dto/reject-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { PriceEstimationDto } from './dto/price-estimation.dto';
import {
  CheckListingPhoneDto,
  VerifyListingPhoneOtpDto,
} from './dto/verify-listing-phone.dto';
import { ListingAnalyticsQueryDto } from './dto/listing-analytics-query.dto';
import { MakePaymentDto } from './dto/make-payment.dto';
import { ListingsService } from './listings.service';
import { DeviceId } from '../shared/decorators/device-id.decorator';

@ApiTags('Listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  // ─── Options (brands / models / car types / features / tags lists) ───────

  @Get('options')
  @ApiOperation({
    summary: 'Get predefined option lists',
    description:
      'Returns the full lists of car brands, car models, car types, features, tags, and Saudi Arabia area ' +
      'suggestions for use in listing creation forms.',
  })
  @ApiResponse({ status: 200, description: 'Option lists returned' })
  async getOptions() {
    return this.listingsService.getOptions();
  }

  // ─── Popular Brands ────────────────────────────────────────────────────────

  @Get('popular-brands')
  @ApiOperation({
    summary: 'Get popular car brands',
    description:
      'Returns active popular car brands in Saudi Arabia with total active listings count for each brand.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of popular car brands with active listing counts',
  })
  getPopularBrands() {
    return this.listingsService.getPopularBrands();
  }

  // ─── Nearby Listings ───────────────────────────────────────────────────────

  @Get('nearby')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Find nearby active car listings by coordinates',
    description:
      'Returns active car listings sorted by straight-line distance from user coordinates.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of nearby listings with distance details',
  })
  findNearby(
    @Query() query: QueryNearbyListingsDto,
    @DeviceId() deviceId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.listingsService.findNearbyListings(query, deviceId, userId);
  }

  // ─── Geocode Location ──────────────────────────────────────────────────────

  @Get('geocode')
  @ApiOperation({
    summary: 'Convert a location/area string in Saudi Arabia to GPS coordinates',
    description:
      'Searches DB cache first using partial/like matching. ' +
      'If not found, calls Google Maps Geocoding API, caches the result in DB, and returns JSON payload.',
  })
  @ApiResponse({ status: 200, description: 'Geocoding result payload' })
  geocodeLocation(@Query() dto: GeocodeLocationDto) {
    return this.listingsService.geocodeLocation(dto);
  }

  @Get('reverse-geocode')
  @ApiOperation({
    summary: 'Convert GPS coordinates to a location/area string',
    description:
      'Given a latitude and longitude, returns the formatted address and area name. ' +
      'Uses DB cache first, falls back to Google Maps Geocoding API.',
  })
  @ApiResponse({ status: 200, description: 'Reverse geocoding result payload' })
  reverseGeocodeLocation(@Query() dto: ReverseGeocodeLocationDto) {
    return this.listingsService.reverseGeocodeLocation(dto);
  }

  // ─── Price Estimation ──────────────────────────────────────────────────────

  @Post('estimate-price')
  @ApiOperation({
    summary: 'Estimate car price using AI',
    description:
      'Returns an AI-estimated min, max, and average price range based on the provided car details.',
  })
  @ApiResponse({
    status: 200,
    description: 'Price estimation returned successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or missing Groq configuration',
  })
  @HttpCode(HttpStatus.OK)
  estimatePrice(@Body() dto: PriceEstimationDto) {
    return this.listingsService.estimatePrice(dto);
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new car listing',
    description:
      'Any authenticated user (individual or dealer) can create a listing. A 50-metre spam check ' +
      'runs automatically on the provided coordinates. Always created with status `PENDING` and goes ' +
      'straight into the admin/moderator review queue — free-quota eligibility and payment are only ' +
      'decided once it is approved (see `POST /listings/:id/approve`), so nothing is charged or spent ' +
      'on a submission that might get rejected.',
  })
  @ApiResponse({
    status: 201,
    description: 'Listing created — PENDING, awaiting admin/moderator review',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(@Body() dto: CreateListingDto, @CurrentUser('id') userId: string) {
    try {
      return await this.listingsService.create(dto, userId);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message ||
          'Failed to create car listing. Please check the provided data.',
      );
    }
  }

  // ─── Pay for a listing pending payment ─────────────────────────────────────

  @Post('make-payment')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Pay for an approved listing awaiting payment (works for USER and DEALER listings alike)',
    description:
      'A listing only reaches `PENDING_PAYMENT` after admin/moderator has already approved its ' +
      'content — this is purely the gate for going live. Callable by the listing creator, or (for ' +
      'dealer listings) any active member of the same dealer agency. If free quota has since become ' +
      "available (e.g. a dealer just subscribed, or a user's admin-set free count wasn't used up), " +
      'the listing is activated live immediately at no charge (`activated: true`). Otherwise creates a ' +
      'Stripe Checkout Session and returns `price`, `stripeSessionId`, `paymentUrl` (web redirect), and ' +
      '`paymentIntentClientSecret` (mobile native payment) — paying activates it immediately, no ' +
      'further review needed. Optional `successUrl` / `failedUrl` override the default redirect ' +
      'targets — same mechanics as `POST /featured/checkout`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Either activated live for free, or a Stripe checkout session',
  })
  @ApiResponse({
    status: 400,
    description: 'Listing has not been approved / does not require payment',
  })
  @ApiResponse({
    status: 403,
    description: 'Not the listing owner or a member of the same dealer agency',
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  makePayment(@Body() dto: MakePaymentDto, @CurrentUser('id') userId: string) {
    return this.listingsService.makePayment(
      dto.listingId,
      userId,
      dto.successUrl,
      dto.failedUrl,
    );
  }

  // ─── Public List ───────────────────────────────────────────────────────────

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Browse active car listings (public)',
    description:
      'Returns ACTIVE and SOLD listings. Supports rich filtering: ' +
      'model, purpose, brand, areaName, price range, modelYear, mileage, fuelType, transmission, ' +
      'condition, carType, feature, tag, search text, and sortBy / sortOrder. ' +
      'Each listing includes `isWishlisted` and `isFeatured` boolean flags.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of active listings',
  })
  findAll(
    @Query() query: QueryListingDto,
    @DeviceId() deviceId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.listingsService.findAll(query, deviceId, userId);
  }

  // ─── My Listings ───────────────────────────────────────────────────────────

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Get the current user's listings",
    description:
      'Returns all listings created by the authenticated user, regardless of status. ' +
      'Includes rejection reasons so the user knows why a listing was rejected.',
  })
  @ApiResponse({ status: 200, description: "User's listings (all statuses)" })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findMyListings(
    @CurrentUser('id') userId: string,
    @Query() query: QueryListingDto,
  ) {
    return this.listingsService.findMyListings(userId, query);
  }

  // ─── Dealer / Staff Listings ────────────────────────────────────────────────

  @Get('dealer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Dealer/Staff: List all listings under this dealer agency',
    description:
      'Returns all listings created by the authenticated dealer **and** all their staff members. ' +
      'If the requester is `DEALER_STAFF`, the parent dealer is resolved automatically. ' +
      'Admins/Moderators can also call this to get all listings (with optional filtering). ' +
      'Supports the same filters as the public listing endpoint.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of dealer + staff listings',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a dealer or staff member' })
  findDealerListings(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
    @Query() query: QueryListingDto,
  ) {
    return this.listingsService.findDealerListings(userId, userRole, query);
  }

  // ─── Admin List ────────────────────────────────────────────────────────────

  @Get('admin')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CARS_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Browse all listings (all statuses)',
    description:
      'Full filter set + status, isPotentialDuplicate, createdById. ' +
      '**Required**: SUPER_ADMIN role **or** MODERATOR with `MANAGE_LISTINGS` permission.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of all listings' })
  @ApiResponse({
    status: 403,
    description: 'Missing MANAGE_LISTINGS permission',
  })
  findAllAdmin(@Query() query: QueryListingDto) {
    return this.listingsService.findAllAdmin(query);
  }

  // ─── Public Sitemap ─────────────────────────────────────────────────────────

  @Get('sitemap')
  @ApiOperation({
    summary: 'Public: Sitemap feed for all publicly visible listings',
    description:
      'Returns every ACTIVE or SOLD listing as `{ slug, updatedAt }`, ordered by most recently ' +
      'updated first. No pagination or authentication — intended for generating an XML sitemap or ' +
      'triggering a search-engine re-crawl. Listings without a `slug` are omitted.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sitemap entries',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string', example: '2022-toyota-camry-se-a1b2c3' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  getSitemap() {
    return this.listingsService.getSitemapEntries();
  }

  // ─── Detail View ───────────────────────────────────────────────────────────

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get a listing by ID',
    description:
      'Public users can only view ACTIVE or SOLD listings. ' +
      'Authenticated owners, dealer staff, and admins/moderators can view their own listings at any status. ' +
      'Admins/Moderators also see the full review history and spam flags. ' +
      'Response includes `isWishlisted` and `isFeatured` boolean flags, plus `isOwner`: true only when ' +
      'the authenticated caller (via JWT) is the exact user who created the listing. ' +
      "If the listing belongs to the authenticated requester (owner, their dealer's staff, or admin), the " +
      'response also includes an `analytics` block: total + period views, reach, impressions, WhatsApp ' +
      'clicks, messages started, distinct users engaged, a views trend bucketed by `granularity` ' +
      '(daily/weekly/monthly/yearly), and the views growth % vs the preceding period of equal length. ' +
      'Analytics is omitted entirely for non-owners.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID or Slug' })
  @ApiResponse({ status: 200, description: 'Listing details' })
  @ApiResponse({
    status: 404,
    description: 'Listing not found or not accessible',
  })
  findOne(
    @Param('id') id: string,
    @DeviceId() deviceId: string,
    @CurrentUser('role') userRole: UserRole | undefined,
    @CurrentUser('id') userId: string | undefined,
    @Query() analyticsQuery: ListingAnalyticsQueryDto,
  ) {
    return this.listingsService.findOne(
      id,
      deviceId,
      userRole,
      userId,
      analyticsQuery,
    );
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get a listing by Slug',
    description:
      'Fetch listing by its unique slug. Response includes `isOwner`: true only when the authenticated ' +
      'caller (via JWT) is the exact user who created the listing. ' +
      "If the listing belongs to the authenticated requester (owner, their dealer's staff, or admin), the " +
      'response also includes an owner-only `analytics` block — see GET /listings/:id for details. ' +
      'Optional `startDate` / `endDate` / `granularity` query params control the analytics window and ' +
      'trend bucket size.',
  })
  @ApiParam({ name: 'slug', description: 'Listing Slug' })
  @ApiResponse({ status: 200, description: 'Listing details' })
  @ApiResponse({
    status: 404,
    description: 'Listing not found or not accessible',
  })
  findBySlug(
    @Param('slug') slug: string,
    @DeviceId() deviceId: string,
    @CurrentUser('role') userRole: UserRole | undefined,
    @CurrentUser('id') userId: string | undefined,
    @Query() analyticsQuery: ListingAnalyticsQueryDto,
  ) {
    return this.listingsService.findOne(
      slug,
      deviceId,
      userRole,
      userId,
      analyticsQuery,
    );
  }

  // ─── WhatsApp Click Tracking (user side) ───────────────────────────────────

  @Post(':id/track/whatsapp-click')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Track a "Chat on WhatsApp" click (user side)',
    description:
      'Call this from the client whenever a user taps the "Chat on WhatsApp" button on a listing. ' +
      "Feeds the dealer analytics dashboard's WhatsApp chat-initiation count. " +
      'Rate-limited per device with the same 10-minute cooldown used for view/impression tracking.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID or Slug' })
  @ApiResponse({
    status: 200,
    description: 'WhatsApp click queued for tracking',
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  trackWhatsappClick(@Param('id') id: string, @DeviceId() deviceId: string) {
    return this.listingsService.trackWhatsappClick(id, deviceId);
  }

  // ─── Per-Listing Analytics (admin + dealer) ────────────────────────────────

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Listing analytics (admin: any listing; dealer/owner: their own)',
    description:
      'Dedicated per-listing analytics — same data as the `analytics` block on ' +
      'GET /listings/:id, but standalone so a dashboard can fetch just this. ' +
      'Admins/moderators can view any listing. Dealers/dealer staff can view listings ' +
      "belonging to their own agency (including a dealer viewing their staff's listings and " +
      'vice-versa). Regular users can view their own listings. Returns total + period ' +
      'views, reach, impressions, WhatsApp clicks, messages started, distinct users engaged, ' +
      'a views trend bucketed by `granularity` (daily/weekly/monthly/yearly), and the views ' +
      'growth % vs the preceding period of equal length.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID or Slug' })
  @ApiResponse({ status: 200, description: 'Listing analytics' })
  @ApiResponse({
    status: 403,
    description: "No access to this listing's analytics",
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  getListingAnalytics(
    @Param('id') id: string,
    @CurrentUser('role') userRole: UserRole,
    @CurrentUser('id') userId: string,
    @Query() analyticsQuery: ListingAnalyticsQueryDto,
  ) {
    return this.listingsService.getListingAnalytics(
      id,
      userRole,
      userId,
      analyticsQuery,
    );
  }

  // ─── Review / Rejection History (admin) ────────────────────────────────────

  @Get(':id/history')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CARS_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Get full review / rejection history for a listing',
    description:
      'Returns every approve, reject, resubmit, and admin-edit event for the listing with timestamps, reviewer info, and messages.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID' })
  @ApiResponse({ status: 200, description: 'Review history entries' })
  @ApiResponse({
    status: 403,
    description: 'Missing MANAGE_LISTINGS permission',
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  getReviewHistory(@Param('id') id: string) {
    return this.listingsService.getReviewHistory(id);
  }

  // ─── Update (Owner / Admin) ────────────────────────────────────────────────

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update listing details',
    description:
      'Listing owner, dealer staff (of the owner), or admin can update details. ' +
      'If an owner edits a REJECTED listing, the status automatically resets to RESUBMITTED for re-review. ' +
      'Only admins can set `contactVerified = true`.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID' })
  @ApiResponse({ status: 200, description: 'Listing updated' })
  @ApiResponse({
    status: 403,
    description: 'Not the owner or insufficient role',
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.listingsService.update(id, dto, userId, userRole);
  }

  // ─── Admin Edit ────────────────────────────────────────────────────────────

  @Patch(':id/admin-edit')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CARS_MANAGE)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Edit any field of a listing',
    description:
      'Super admin or moderator with MANAGE_LISTINGS can override any listing field. ' +
      'This does NOT change the listing status. ' +
      'All admin edits are logged in the listing review history.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID' })
  @ApiResponse({ status: 200, description: 'Listing updated by admin' })
  @ApiResponse({
    status: 403,
    description: 'Missing MANAGE_LISTINGS permission',
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  adminUpdate(
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
    @CurrentUser('id') reviewerId: string,
  ) {
    return this.listingsService.adminUpdate(id, dto, reviewerId);
  }

  // ─── Mark as SOLD ──────────────────────────────────────────────────────────

  @Post(':id/sold')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a listing as SOLD',
    description:
      'Listing owner, dealer staff, or admin/moderator can mark a listing as SOLD. ' +
      'SOLD listings remain visible to the public with a SOLD badge. ' +
      'The action is logged in the review history.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID' })
  @ApiResponse({ status: 200, description: 'Listing marked as SOLD' })
  @ApiResponse({ status: 400, description: 'Already marked as sold' })
  @ApiResponse({
    status: 403,
    description: 'Not the owner or insufficient role',
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  markSold(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.listingsService.markSold(id, userId, userRole);
  }

  // ─── Approve ───────────────────────────────────────────────────────────────

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CARS_REVIEW)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin: Approve a listing',
    description:
      'Approves the listing content, then decides free-vs-paid: if the owner (dealer subscription ' +
      "quota, or a regular user's admin-configured free count) has free quota available, it's consumed " +
      'now and the listing goes straight to `ACTIVE` (`paymentRequired: false`). Otherwise the listing ' +
      'moves to `PENDING_PAYMENT` (`paymentRequired: true` + `price` in the response) — the owner is ' +
      'emailed and push-notified to pay via `POST /listings/make-payment`; paying activates it ' +
      'immediately with no further review. ' +
      'If `isPotentialDuplicate` is set, moderator should resolve it before approving.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID' })
  @ApiResponse({
    status: 200,
    description:
      'Listing approved — ACTIVE (live) or PENDING_PAYMENT (payment required)',
  })
  @ApiResponse({
    status: 400,
    description: 'Already active or already approved & awaiting payment',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing MANAGE_LISTINGS permission',
  })
  approve(@Param('id') id: string, @CurrentUser('id') reviewerId: string) {
    return this.listingsService.approve(id, reviewerId);
  }

  // ─── Reject ────────────────────────────────────────────────────────────────

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CARS_REVIEW)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin: Reject a listing with a message',
    description:
      'Sets listing status to REJECTED. The rejection message is stored in the review history ' +
      'and is visible to the listing owner so they know what to fix before resubmitting.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID' })
  @ApiResponse({ status: 200, description: 'Listing rejected' })
  @ApiResponse({ status: 400, description: 'Already rejected' })
  @ApiResponse({
    status: 403,
    description: 'Missing MANAGE_LISTINGS permission',
  })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectListingDto,
    @CurrentUser('id') reviewerId: string,
  ) {
    return this.listingsService.reject(id, dto, reviewerId);
  }

  // ─── Resubmit ──────────────────────────────────────────────────────────────

  @Post(':id/resubmit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Owner: Resubmit a rejected listing for review',
    description:
      'Moves a REJECTED listing back to RESUBMITTED status, incrementing the submission count. ' +
      'Use PATCH /:id first to update the listing content, then call this endpoint. ' +
      'Only the listing owner can resubmit.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID' })
  @ApiResponse({
    status: 200,
    description: 'Listing resubmitted (status: RESUBMITTED)',
  })
  @ApiResponse({
    status: 400,
    description: 'Listing is not in REJECTED status',
  })
  @ApiResponse({ status: 403, description: 'Not the listing owner' })
  resubmit(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.listingsService.resubmit(id, userId);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete a listing',
    description:
      'Listing owner or admin/moderator can delete. Cascades to all photos and review history.',
  })
  @ApiParam({ name: 'id', description: 'Listing CUID' })
  @ApiResponse({ status: 200, description: 'Listing deleted' })
  @ApiResponse({
    status: 403,
    description: 'Not the owner or insufficient role',
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.listingsService.remove(id, userId, userRole);
  }

  // ─── Contact Phone Verification ────────────────────────────────────────────

  @Post('verify-phone/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check if listing contact phone number is verified',
    description:
      'Checks whether the phone number added for a listing is already verified. ' +
      'Returns `isVerified: true` if registered to an active user or previously verified via OTP.',
  })
  @ApiResponse({ status: 200, description: 'Verification status check result' })
  @ApiResponse({ status: 400, description: 'Invalid phone number format' })
  checkPhoneVerification(@Body() dto: CheckListingPhoneDto) {
    return this.listingsService.checkListingPhoneVerification(dto.phone);
  }

  @Post('verify-phone/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send WhatsApp OTP to verify listing contact phone',
    description:
      'Sends a 6-digit WhatsApp OTP to the specified contact phone number.',
  })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid phone number or cooldown active',
  })
  sendPhoneOtp(@Body() dto: CheckListingPhoneDto) {
    return this.listingsService.sendListingPhoneOtp(dto.phone);
  }

  @Post('verify-phone/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify WhatsApp OTP for listing contact phone',
    description:
      'Verifies the OTP code sent to the contact phone number and marks it as verified.',
  })
  @ApiResponse({
    status: 200,
    description: 'Phone number verified successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  verifyPhoneOtp(@Body() dto: VerifyListingPhoneOtpDto) {
    return this.listingsService.verifyListingPhoneOtp(dto.phone, dto.otp);
  }
}
