import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permission, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { CreateModeratorDto } from './dto/create-moderator.dto';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import { UpdateModeratorDto } from './dto/update-moderator.dto';
import { GetAdminAnalyticsDto } from './dto/get-admin-analytics.dto';
import { GetAdminDashboardDto } from './dto/get-admin-dashboard.dto';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { UpdateListingSettingsDto } from './dto/update-listing-settings.dto';

@ApiTags('Admin')
@Controller('protected/villasqatar/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Super Admin ───────────────────────────────────────────────────────────

  @Post('super-admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a Super Admin',
    description:
      '**First super admin**: Pass `X-Setup-Key` header with the value of `SETUP_SECRET` from `.env`. No JWT needed.\n\n' +
      '**Subsequent super admins**: Requires JWT Bearer token of an existing SUPER_ADMIN.',
  })
  @ApiHeader({
    name: 'X-Setup-Key',
    description:
      'One-time setup key for creating the very first super admin (value = SETUP_SECRET in .env)',
    required: false,
  })
  @ApiResponse({ status: 201, description: 'Super Admin created successfully' })
  @ApiResponse({ status: 401, description: 'Invalid setup key or missing JWT' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  createSuperAdmin(
    @Body() dto: CreateSuperAdminDto,
    @Headers('x-setup-key') setupKey: string | undefined,
    @CurrentUser('id') requestingUserId: string | undefined,
  ) {
    return this.adminService.createSuperAdmin(dto, setupKey, requestingUserId);
  }

  // ─── Moderators ────────────────────────────────────────────────────────────

  @Post('moderators')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.MODERATORS_MANAGE)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a Moderator',
    description:
      'Creates a MODERATOR account and assigns permissions from the provided list.\n\n' +
      'Requires SUPER_ADMIN role or MODERATOR role with MODERATORS_MANAGE permission.',
  })
  @ApiResponse({
    status: 201,
    description: 'Moderator created with permissions',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient role/permission' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  createModerator(
    @Body() dto: CreateModeratorDto,
    @CurrentUser('id') requestingUserId: string,
  ) {
    return this.adminService.createModerator(dto, requestingUserId);
  }

  @Get('moderators')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.MODERATORS_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List all moderators (paginated)',
    description:
      'Requires SUPER_ADMIN role or MODERATOR role with MODERATORS_VIEW permission.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by moderator name or email',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of moderators with profiles',
  })
  getModerators(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.adminService.getModerators(+page, +limit, search);
  }

  @Get('moderators/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.MODERATORS_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get a moderator by user ID',
    description:
      'Requires SUPER_ADMIN role or MODERATOR role with MODERATORS_VIEW permission.',
  })
  @ApiParam({ name: 'userId', description: 'User CUID of the moderator' })
  @ApiResponse({
    status: 200,
    description: 'Moderator profile with permissions',
  })
  @ApiResponse({ status: 404, description: 'Moderator not found' })
  getModerator(@Param('userId') userId: string) {
    return this.adminService.getModerator(userId);
  }

  @Patch('moderators/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.MODERATORS_MANAGE)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a moderator',
    description:
      'Update name, permissions array, active status, or notes. ' +
      'Requires SUPER_ADMIN role or MODERATOR role with MODERATORS_MANAGE permission.',
  })
  @ApiParam({ name: 'userId', description: 'User CUID of the moderator' })
  @ApiResponse({ status: 200, description: 'Moderator updated successfully' })
  @ApiResponse({ status: 404, description: 'Moderator not found' })
  updateModerator(
    @Param('userId') userId: string,
    @Body() dto: UpdateModeratorDto,
  ) {
    return this.adminService.updateModerator(userId, dto);
  }

  @Delete('moderators/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.MODERATORS_MANAGE)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Deactivate a moderator',
    description:
      'Soft-deletes the moderator by setting isActive = false. ' +
      'Requires SUPER_ADMIN role or MODERATOR role with MODERATORS_MANAGE permission.',
  })
  @ApiParam({ name: 'userId', description: 'User CUID of the moderator' })
  @ApiResponse({ status: 200, description: 'Moderator deactivated' })
  @ApiResponse({ status: 404, description: 'Moderator not found' })
  deleteModerator(@Param('userId') userId: string) {
    return this.adminService.deleteModerator(userId);
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get Admin Analytics',
    description:
      'Returns aggregate analytics (total views, impressions, reach count, total listings) ' +
      'along with a paginated list of individual listings and their metrics. ' +
      'Supports filtering by search, status, purpose, typeId, dealerId, date range, and sorting. ' +
      'Requires SUPER_ADMIN role or MODERATOR role with VIEW_ANALYTICS permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics data retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  getAnalytics(@Query() query: GetAdminAnalyticsDto) {
    return this.adminService.getAdminAnalytics(query);
  }

  @Get('analytics/dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Full Platform Analytics Dashboard',
    description:
      'Single all-in-one platform-wide analytics dashboard. Returns: revenue broken down by source ' +
      '(dealer subscriptions paid, featured-listing boosts paid, pay-per-listing charges paid) plus a ' +
      'combined total — each with an all-time figure and a figure for the selected date range; listing ' +
      'counts including new properties added and total/new property sales (count + value); user growth ' +
      '(total/new users, total/new dealers, active dealers, dealer staff, moderators); platform-wide ' +
      'engagement (views, impressions, reach, WhatsApp clicks, chat conversations); active/expiring ' +
      'subscription and featured-boost counts; the top 5 revenue-generating dealers; and a revenue + ' +
      'growth trend graph bucketed by day/week/month/year. Date range and graph granularity are optional.',
  })
  @ApiResponse({
    status: 200,
    description: 'Full admin analytics dashboard data',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  getAdminDashboard(@Query() query: GetAdminDashboardDto) {
    return this.adminService.getAdminDashboard(query);
  }

  // ─── Listing Payment Settings ──────────────────────────────────────────────

  @Get('listing-settings')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.LISTING_SETTINGS_VIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Get listing payment settings',
    description:
      'Returns `pricePerListing` (QAR charged once a user/dealer is outside their free quota) and ' +
      '`userFreeListingsLimit` (free listings a non-dealer USER gets before payment is required). ' +
      'Dealer free-listing quota is managed separately via dealer subscription plans. ' +
      'Requires SUPER_ADMIN role or MODERATOR role with LISTING_SETTINGS_VIEW permission.',
  })
  @ApiResponse({ status: 200, description: 'Listing payment settings' })
  getListingSettings() {
    return this.adminService.getListingSettings();
  }

  @Patch('listing-settings')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @RequirePermissions(Permission.LISTING_SETTINGS_MANAGE)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Update listing payment settings',
    description:
      'Update the per-listing price and/or the free-listing count granted to regular USERS. ' +
      'Both fields are optional — only the ones provided are changed. ' +
      'Requires SUPER_ADMIN role or MODERATOR role with LISTING_SETTINGS_MANAGE permission.',
  })
  @ApiResponse({ status: 200, description: 'Updated listing payment settings' })
  updateListingSettings(@Body() dto: UpdateListingSettingsDto) {
    return this.adminService.updateListingSettings(dto);
  }

  // ─── System Settings ──────────────────────────────────────────────────────

  @Get('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all system settings' })
  @ApiResponse({ status: 200, description: 'List of all system settings' })
  getSystemSettings() {
    return this.adminService.getSystemSettings();
  }

  @Get('settings/:key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get a specific system setting by key' })
  @ApiParam({
    name: 'key',
    description: 'The setting key (e.g. DEFAULT_LISTING_CHARGE)',
  })
  @ApiResponse({ status: 200, description: 'The system setting' })
  getSystemSetting(@Param('key') key: string) {
    return this.adminService.getSystemSetting(key);
  }

  @Post('settings/:key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update or create a system setting' })
  @ApiParam({
    name: 'key',
    description: 'The setting key (e.g. DEFAULT_LISTING_CHARGE)',
  })
  @ApiResponse({ status: 200, description: 'The updated system setting' })
  updateSystemSetting(
    @Param('key') key: string,
    @Body() dto: UpdateSystemSettingDto,
  ) {
    return this.adminService.updateSystemSetting(key, dto.value);
  }
}
