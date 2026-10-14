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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DealerSubscriptionsService } from './dealer-subscriptions.service';
import { AssignDealerPlanDto } from './dto/assign-dealer-plan.dto';
import { CreateDealerPlanDto } from './dto/create-dealer-plan.dto';
import { QueryDealerPlanDto } from './dto/query-dealer-plan.dto';
import { UpdateDealerPlanDto } from './dto/update-dealer-plan.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Dealer Subscription Plans (Admin management)
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Dealer Subscription Plans — Admin')
@Controller('protected/carsaudi/admin/dealer-subscription-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@ApiBearerAuth('JWT-auth')
export class DealerSubscriptionPlansAdminController {
  constructor(private readonly service: DealerSubscriptionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Super Admin: Create a dealer subscription plan',
    description:
      'Creates a new dealer agency subscription plan. Plans define:\n' +
      '- `maxListings`: max active listings allowed (0 = unlimited)\n' +
      '- `validityDays`: plan duration in days\n' +
      '- `price`: plan cost in SAR (0 = free, activated without Stripe)\n' +
      '- `boostDiscountPercent`: discount applied when dealer requests a featured listing boost',
  })
  @ApiResponse({ status: 201, description: 'Dealer subscription plan created' })
  @ApiResponse({ status: 403, description: 'SUPER_ADMIN required' })
  createPlan(@Body() dto: CreateDealerPlanDto) {
    return this.service.createPlan(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Super Admin: Update a dealer subscription plan',
    description: 'Update any field of an existing dealer subscription plan.',
  })
  @ApiParam({ name: 'id', description: 'Dealer subscription plan CUID' })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  updatePlan(@Param('id') id: string, @Body() dto: UpdateDealerPlanDto) {
    return this.service.updatePlan(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Super Admin: Deactivate a dealer subscription plan',
    description:
      'Soft-deletes a plan by setting `isActive = false`. Existing active subscriptions are NOT affected.',
  })
  @ApiParam({ name: 'id', description: 'Dealer subscription plan CUID' })
  @ApiResponse({ status: 200, description: 'Plan deactivated' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  deletePlan(@Param('id') id: string) {
    return this.service.deletePlan(id);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Super Admin: Assign a plan to a dealer (bypasses Stripe)',
    description:
      'Directly assigns a dealer subscription plan to a dealer account without going through Stripe. ' +
      "The subscription is activated immediately (`paymentStatus: PAID`) for the plan's `validityDays` " +
      'duration, and records the plan\'s real price as `paidAmount` — it does not show as "Free"; the ' +
      'gateway is simply bypassed. Useful for onboarding, trials, or promotional assignments.',
  })
  @ApiParam({ name: 'id', description: 'Dealer subscription plan CUID' })
  @ApiResponse({
    status: 201,
    description: 'Plan assigned to dealer (activated, no gateway involved)',
  })
  @ApiResponse({ status: 400, description: 'Dealer account inactive' })
  @ApiResponse({ status: 404, description: 'Plan or dealer not found' })
  assignPlan(
    @Param('id') planId: string,
    @Body() dto: AssignDealerPlanDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.assignPlanToDealer(planId, dto, adminId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dealer Subscriptions (Admin view)
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Dealer Subscriptions — Admin')
@Controller('protected/carsaudi/admin/dealer-subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@ApiBearerAuth('JWT-auth')
export class DealerSubscriptionsAdminController {
  constructor(private readonly service: DealerSubscriptionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Super Admin: List all dealer subscriptions',
    description:
      'Returns all dealer subscription records across all dealers, paginated and searchable.',
  })
  @ApiResponse({
    status: 200,
    description: 'All dealer subscriptions (paginated)',
  })
  getAllAdmin(@Query() query: QueryDealerPlanDto) {
    return this.service.getAllSubscriptionsAdmin(query);
  }
}
