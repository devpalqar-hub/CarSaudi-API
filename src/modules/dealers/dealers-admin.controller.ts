import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { DealersService } from './dealers.service';
import { QueryDealersDto } from './dto/query-dealers.dto';
import { RejectDealerDto } from './dto/reject-dealer.dto';
import { SuspendDealerDto } from './dto/suspend-dealer.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin Dealers')
@ApiBearerAuth('bearer')
@Controller('admin/dealers')
export class DealersAdminController {
  constructor(private readonly dealersService: DealersService) {}

  // ─── List All Dealers ─────────────────────────────────

  @Get()
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'List all dealers with filters' })
  @ApiResponse({ status: 200, description: 'Paginated dealer list' })
  async findAll(@Query() query: QueryDealersDto) {
    return this.dealersService.adminFindAll(query);
  }

  // ─── Export to XLSX ───────────────────────────────────

  @Get('export')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Export dealers to XLSX file' })
  @ApiResponse({
    status: 200,
    description: 'XLSX file download',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
    },
  })
  async exportToXlsx(
    @Query() query: QueryDealersDto,
    @Res() res: Response,
  ) {
    const buffer = await this.dealersService.exportToXlsx(query);
    const filename = `dealers_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  // ─── Get Dealer Details ───────────────────────────────

  @Get(':id')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'View dealer details with recent listings' })
  @ApiParam({ name: 'id', description: 'Dealer UUID' })
  @ApiResponse({ status: 200, description: 'Dealer details' })
  @ApiResponse({ status: 404, description: 'Dealer not found' })
  async findOne(@Param('id') id: string) {
    return this.dealersService.adminFindOne(id);
  }

  // ─── Dealer Analytics ────────────────────────────────

  @Get(':id/analytics')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'View dealer performance analytics' })
  @ApiParam({ name: 'id', description: 'Dealer UUID' })
  @ApiResponse({ status: 200, description: 'Dealer analytics' })
  async getAnalytics(@Param('id') id: string) {
    return this.dealersService.getDealerAnalytics(id);
  }

  // ─── Verify Dealer ───────────────────────────────────

  @Patch(':id/verify')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Approve dealer application and assign DEALER role' })
  @ApiParam({ name: 'id', description: 'Dealer UUID' })
  @ApiResponse({ status: 200, description: 'Dealer verified' })
  async verify(@Param('id') id: string) {
    return this.dealersService.verifyDealer(id);
  }

  // ─── Reject Dealer ───────────────────────────────────

  @Patch(':id/reject')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Reject dealer application with reason' })
  @ApiParam({ name: 'id', description: 'Dealer UUID' })
  @ApiResponse({ status: 200, description: 'Dealer rejected' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectDealerDto,
  ) {
    return this.dealersService.rejectDealer(id, dto);
  }

  // ─── Suspend Dealer ──────────────────────────────────

  @Patch(':id/suspend')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Suspend dealer account (pauses all listings)' })
  @ApiParam({ name: 'id', description: 'Dealer UUID' })
  @ApiResponse({ status: 200, description: 'Dealer suspended' })
  async suspend(
    @Param('id') id: string,
    @Body() dto: SuspendDealerDto,
  ) {
    return this.dealersService.suspendDealer(id, dto);
  }

  // ─── Reactivate Dealer ────────────────────────────────

  @Patch(':id/reactivate')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Reactivate a suspended dealer account' })
  @ApiParam({ name: 'id', description: 'Dealer UUID' })
  @ApiResponse({ status: 200, description: 'Dealer reactivated' })
  async reactivate(@Param('id') id: string) {
    return this.dealersService.reactivateDealer(id);
  }

  // ─── Update Subscription ─────────────────────────────

  @Patch(':id/subscription')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Update dealer subscription tier and limits' })
  @ApiParam({ name: 'id', description: 'Dealer UUID' })
  @ApiResponse({ status: 200, description: 'Subscription updated' })
  async updateSubscription(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.dealersService.updateSubscription(id, dto);
  }
}
