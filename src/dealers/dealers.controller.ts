import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permission, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DealersService } from './dealers.service';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { UpdateDealerProfileSelfDto } from './dto/update-dealer-profile-self.dto';
import { GetDealerAnalyticsDto } from './dto/get-dealer-analytics.dto';
import { GetDealerDashboardDto } from './dto/get-dealer-dashboard.dto';

@ApiTags('Dealers')
@Controller('dealers')
export class DealersController {
  constructor(private readonly dealersService: DealersService) {}

  // ─── Dealer: Self Profile ───────────────────────────────────────────────────

  @Get('profile/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Dealer: Get own profile',
    description:
      "Full profile for the dealer's own page: `coverImage` and `logoImage`, contact info, " +
      '`links` (website/facebook/youtube/whatsapp/instagram), `stats` (sold + active property ' +
      'counts across the whole agency incl. staff, staff count), `quota` (remaining free listings ' +
      '/ featured slots), and `plan` (current subscription — name, discounts, expiry date, days ' +
      "remaining). Dealer staff get their agency's profile.",
  })
  @ApiResponse({ status: 200, description: 'Dealer profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — Requires DEALER or DEALER_STAFF role',
  })
  @ApiResponse({ status: 404, description: 'Dealer profile not found' })
  getMyProfile(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.dealersService.getMyProfile(userId, userRole);
  }

  @Patch('profile/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Dealer: Update own profile',
    description:
      'Allows an authenticated dealer to update their public profile: ' +
      '`dealerName`, `contactPhone`, `tagline`, `coverImage`, `logoImage`, `website`, `description`, ' +
      '`address`, `city`, and social links. ' +
      'Sensitive fields (tradeNumber, reraNumber, email) require admin action.',
  })
  @ApiResponse({ status: 200, description: 'Dealer profile updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Only DEALER role can call this endpoint',
  })
  updateMyProfile(
    @CurrentUser('id') dealerId: string,
    @Body() dto: UpdateDealerProfileSelfDto,
  ) {
    return this.dealersService.updateMyProfile(dealerId, dto);
  }

  // ─── Dealer: Web Analytics ─────────────────────────────────────────────────

  @Get('analytics/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Dealer Web Analytics',
    description:
      'Returns aggregate analytics for a dealer web application (agency overview totals, ' +
      'views, impressions, reach count, staff members count, property inquiries/visits count, ' +
      'and paginated listing performance breakdown). Can filter by date range, search, status, and purpose.',
  })
  @ApiResponse({ status: 200, description: 'Dealer web analytics data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — Requires DEALER or DEALER_STAFF role',
  })
  getDealerAnalytics(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
    @Query() dto: GetDealerAnalyticsDto,
  ) {
    return this.dealersService.getDealerAnalytics(userId, userRole, dto);
  }

  // ─── Dealer: Full Analytics Dashboard ──────────────────────────────────────

  @Get('analytics/dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Dealer: Full Analytics Dashboard',
    description:
      'Single all-in-one analytics dashboard for a dealer agency (dealer + all dealer staff). Returns: ' +
      'listing status counts including number of open/live listings, views/impressions/reach, ' +
      'in-app chat counts (conversations + distinct users who started a chat), WhatsApp chat-initiation ' +
      'click counts, scheduled property visits by status, remaining free listing/featured quota, active ' +
      'subscription plan expiry date and days remaining, total property sales (count + value), a ' +
      'visits-vs-views-vs-chats trend graph bucketed by day/week/month/year, and the top 5 performing ' +
      'listings. All filters are optional: date range, graph granularity, single property, staff member, ' +
      'property type, purpose (sale/rent), status, and location (municipality / area name).',
  })
  @ApiResponse({
    status: 200,
    description: 'Full dealer analytics dashboard data',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — Requires DEALER or DEALER_STAFF role',
  })
  @ApiResponse({
    status: 404,
    description: 'Staff member or property not found in this agency',
  })
  getDealerDashboard(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
    @Query() dto: GetDealerDashboardDto,
  ) {
    return this.dealersService.getDealerDashboard(userId, userRole, dto);
  }

  // ─── Admin: Create dealer ──────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEALERS_MANAGE)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[Admin] Directly create a dealer account',
    description:
      'Creates a dealer account without going through the onboarding flow. ' +
      'Sends a welcome email with the temporary password.',
  })
  @ApiResponse({ status: 201, description: 'Dealer account created' })
  @ApiResponse({ status: 409, description: 'Email or phone already in use' })
  create(@Body() dto: CreateDealerDto) {
    return this.dealersService.create(dto);
  }

  @Get()
  // @UseGuards(JwtAuthGuard)
  // @RequirePermissions(Permission.DEALERS_MANAGE)
  // @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '[Admin] List all active dealer accounts (paginated)',
    description:
      'Each dealer includes `activePropertiesCount` — the number of currently ACTIVE (unsold) ' +
      'listings across the dealer and their staff.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name, email, or dealer name',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of dealers' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.dealersService.findAll(+page, +limit, search);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get dealer details and listings',
    description:
      'Returns dealer profile, active subscription status, and all property listings. Includes ' +
      '`activePropertiesCount` — the number of currently ACTIVE (unsold) listings across the dealer ' +
      'and their staff.',
  })
  @ApiParam({ name: 'id', description: 'User CUID of the dealer' })
  @ApiResponse({ status: 200, description: 'Dealer details with listings' })
  @ApiResponse({ status: 404, description: 'Dealer not found' })
  findOne(@Param('id') id: string) {
    return this.dealersService.findOne(id);
  }

  // ─── Admin: Dealer Full Analytics Dashboard ────────────────────────────────

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.DEALER_ANALYTICS_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "[Admin] Get a specific dealer's full analytics dashboard",
    description:
      'Same data a dealer sees about themselves via GET /dealers/analytics/dashboard — open ' +
      'properties, reach/views, in-app chats, WhatsApp chat-initiation clicks, a visits-vs-views-vs-' +
      'chats trend graph, remaining free listing/featured quota, subscription plan expiry, and total ' +
      "property sales — scoped to whichever dealer's `id` you pass. Supports the same optional " +
      'filters: date range, graph granularity, single property, staff member, property type, purpose, ' +
      'status, and location. Requires SUPER_ADMIN role or MODERATOR with `VIEW_ANALYTICS` permission.',
  })
  @ApiParam({ name: 'id', description: 'User CUID of the dealer' })
  @ApiResponse({
    status: 200,
    description: "The dealer's full analytics dashboard",
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — insufficient role/permission',
  })
  @ApiResponse({ status: 404, description: 'Dealer not found' })
  getDealerDashboardForAdmin(
    @Param('id') id: string,
    @Query() dto: GetDealerDashboardDto,
  ) {
    return this.dealersService.getDealerDashboardForAdmin(id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEALERS_MANAGE)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: '[Admin] Update dealer account and profile' })
  @ApiParam({ name: 'id', description: 'User CUID of the dealer' })
  @ApiResponse({ status: 200, description: 'Dealer updated' })
  @ApiResponse({ status: 404, description: 'Dealer not found' })
  update(@Param('id') id: string, @Body() dto: UpdateDealerDto) {
    return this.dealersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEALERS_MANAGE)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '[Admin] Deactivate a dealer account',
    description: 'Soft-deletes the dealer by setting isActive = false.',
  })
  @ApiParam({ name: 'id', description: 'User CUID of the dealer' })
  @ApiResponse({ status: 200, description: 'Dealer deactivated' })
  @ApiResponse({ status: 404, description: 'Dealer not found' })
  remove(@Param('id') id: string) {
    return this.dealersService.remove(id);
  }
}
