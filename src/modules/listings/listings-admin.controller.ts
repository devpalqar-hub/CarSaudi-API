import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ListingsService } from './listings.service';
import { AdminQueryListingsDto } from './dto/admin-query-listings.dto';
import { RejectListingDto } from './dto/reject-listing.dto';
import { BulkActionDto } from './dto/bulk-action.dto';
import { FeatureListingDto } from './dto/feature-listing.dto';
import { ModerateFlagDto } from './dto/moderate-flag.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FlagStatus } from '@prisma/client';

@ApiTags('Admin Listings')
@ApiBearerAuth('bearer')
@Controller('admin/listings')
export class ListingsAdminController {
  constructor(private readonly listingsService: ListingsService) {}

  // ─── List All Listings ─────────────────────────────────

  @Get()
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'List all listings with admin filters (status, flagged, date range)' })
  @ApiResponse({ status: 200, description: 'Paginated listings for admin' })
  async findAll(@Query() query: AdminQueryListingsDto) {
    return this.listingsService.adminFindAll(query);
  }

  // ─── Platform Analytics ────────────────────────────────

  @Get('analytics')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Platform-wide listing analytics and insights' })
  @ApiResponse({ status: 200, description: 'Analytics data' })
  async getAnalytics() {
    return this.listingsService.getPlatformAnalytics();
  }

  // ─── Export to XLSX ────────────────────────────────────

  @Get('export')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Export listings to XLSX file' })
  @ApiResponse({
    status: 200,
    description: 'XLSX file download',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
    },
  })
  async exportToXlsx(
    @Query() query: AdminQueryListingsDto,
    @Res() res: Response,
  ) {
    const buffer = await this.listingsService.exportToXlsx(query);
    const filename = `listings_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  // ─── List All Flags ────────────────────────────────────

  @Get('flags')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'List all listing flags for moderation' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: FlagStatus })
  @ApiResponse({ status: 200, description: 'Paginated flags' })
  async findAllFlags(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: FlagStatus,
  ) {
    return this.listingsService.findAllFlags({
      page: page ? +page : 1,
      limit: limit ? +limit : 10,
      status,
    });
  }

  // ─── Approve Listing ──────────────────────────────────

  @Patch(':id/approve')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Approve a pending listing for publication' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 200, description: 'Listing approved' })
  async approve(@Param('id') id: string) {
    return this.listingsService.approveListing(id);
  }

  // ─── Reject Listing ───────────────────────────────────

  @Patch(':id/reject')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Reject a listing with reason' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 200, description: 'Listing rejected' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectListingDto,
  ) {
    return this.listingsService.rejectListing(id, dto);
  }

  // ─── Bulk Approve ─────────────────────────────────────

  @Post('bulk-approve')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk approve multiple pending listings' })
  @ApiResponse({ status: 200, description: 'Bulk approval result' })
  async bulkApprove(@Body() dto: BulkActionDto) {
    return this.listingsService.bulkApprove(dto);
  }

  // ─── Bulk Reject ──────────────────────────────────────

  @Post('bulk-reject')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk reject multiple listings with reason' })
  @ApiResponse({ status: 200, description: 'Bulk rejection result' })
  async bulkReject(@Body() dto: BulkActionDto) {
    return this.listingsService.bulkReject(dto);
  }

  // ─── Feature Listing ──────────────────────────────────

  @Patch(':id/feature')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Toggle featured status for a listing' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 200, description: 'Featured status updated' })
  async feature(
    @Param('id') id: string,
    @Body() dto: FeatureListingDto,
  ) {
    return this.listingsService.featureListing(id, dto);
  }

  // ─── Force Delete ─────────────────────────────────────

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Permanently delete a listing (admin)' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 200, description: 'Listing permanently deleted' })
  async remove(@Param('id') id: string) {
    return this.listingsService.adminDelete(id);
  }

  // ─── Resolve/Dismiss Flag ────────────────────────────

  @Patch('flags/:id/resolve')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN', 'MODERATOR')
  @ApiOperation({ summary: 'Resolve or dismiss a listing flag' })
  @ApiParam({ name: 'id', description: 'Flag UUID' })
  @ApiResponse({ status: 200, description: 'Flag moderated' })
  async moderateFlag(
    @Param('id') flagId: string,
    @Body() dto: ModerateFlagDto,
    @CurrentUser('id') moderatorId: string,
  ) {
    return this.listingsService.moderateFlag(flagId, dto, moderatorId);
  }

  // ─── Trigger Expiry Check ─────────────────────────────

  @Post('expire-check')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger expiry check on all listings' })
  @ApiResponse({ status: 200, description: 'Expiry check result' })
  async expireCheck() {
    return this.listingsService.expireListings();
  }
}
