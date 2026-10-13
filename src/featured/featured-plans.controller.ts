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
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateFeaturedPlanDto } from './dto/create-featured-plan.dto';
import { UpdateFeaturedPlanDto } from './dto/update-featured-plan.dto';
import { FeaturedService } from './featured.service';

@ApiTags('Featured Plans (Admin)')
@Controller('featured-plans')
export class FeaturedPlansController {
  constructor(private readonly featuredService: FeaturedService) {}

  // ─── Public: List active plans ─────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List all available featured plans',
    description:
      'Returns all active featured plans grouped by location and duration. ' +
      'These plans are presented to the user when they want to boost/feature a listing.',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Admin: include deactivated plans',
  })
  @ApiResponse({ status: 200, description: 'List of active featured plans' })
  listPlans(@Query('includeInactive') includeInactive?: string) {
    return this.featuredService.listPlans(includeInactive === 'true');
  }

  // ─── Dealer: List plans with subscription-aware pricing ───────────────────

  @Get('dealer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Dealer: List featured plans with actual/discounted price and free-quota status',
    description:
      'Same active plan catalog created by admin, but each plan is annotated for the requesting ' +
      "dealer agency: `actualPrice` (the plan's base price), `discountPercent` and `discountedPrice` " +
      "(from the dealer's active subscription boost discount, 0 when no active subscription), and " +
      '`isIncludedFree` + `availableFreeFeatured` (whether the dealer currently has free-featured ' +
      'quota on their subscription to activate this plan instantly at no charge). ' +
      "Dealer staff see their parent dealer's terms.",
  })
  @ApiResponse({
    status: 200,
    description: "Featured plans annotated with the dealer's pricing/quota",
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — Requires DEALER or DEALER_STAFF role',
  })
  listPlansForDealer(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.featuredService.listPlansForDealer(userId, userRole);
  }

  // ─── Admin: Create plan ────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Admin: Create a new featured plan',
    description:
      'Creates a featured plan with a location (HOME_PAGE, LISTING_PAGE, or PROPERTY_DETAIL_PAGE), ' +
      'a duration tier (SEVEN_DAYS, TWENTY_DAYS, or THIRTY_DAYS), and a price in QAR. ' +
      'The `durationDays` (7, 20, or 30) is derived automatically from the `duration` enum.',
  })
  @ApiResponse({ status: 201, description: 'Featured plan created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'SUPER_ADMIN required' })
  createPlan(@Body() dto: CreateFeaturedPlanDto) {
    return this.featuredService.createPlan(dto);
  }

  // ─── Admin: Update plan ────────────────────────────────────────────────────

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Update a featured plan',
    description:
      'Update the name, location, duration, price, or active status of a plan.',
  })
  @ApiParam({ name: 'id', description: 'Featured plan CUID' })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  updatePlan(@Param('id') id: string, @Body() dto: UpdateFeaturedPlanDto) {
    return this.featuredService.updatePlan(id, dto);
  }

  // ─── Admin: Deactivate plan ────────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Deactivate a featured plan',
    description:
      'Soft-deletes the plan by setting `isActive = false`. ' +
      'Existing active subscriptions using this plan are NOT affected.',
  })
  @ApiParam({ name: 'id', description: 'Featured plan CUID' })
  @ApiResponse({ status: 200, description: 'Plan deactivated' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  deletePlan(@Param('id') id: string) {
    return this.featuredService.deletePlan(id);
  }
}
