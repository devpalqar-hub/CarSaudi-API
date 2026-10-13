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
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DealerSubscriptionsService } from './dealer-subscriptions.service';
import { AssignDealerPlanDto } from './dto/assign-dealer-plan.dto';
import { CheckoutDealerPlanDto } from './dto/checkout-dealer-plan.dto';
import { CreateDealerPlanDto } from './dto/create-dealer-plan.dto';
import { QueryDealerPlanDto } from './dto/query-dealer-plan.dto';
import { UpdateDealerPlanDto } from './dto/update-dealer-plan.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Dealer Subscription Plans (Admin management)
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Dealer Subscription Plans')
@Controller('dealer-subscription-plans')
export class DealerSubscriptionPlansController {
  constructor(private readonly service: DealerSubscriptionsService) {}

  // ─── Public/Dealer: List plans ─────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List dealer subscription plans',
    description:
      'Returns active dealer subscription plans. Pass `includeInactive=true` to see all plans. ' +
      'Supports pagination and search by plan name.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of dealer subscription plans',
  })
  listPlans(@Query() query: QueryDealerPlanDto) {
    return this.service.listPlans(query, query.includeInactive);
  }

  // ─── Public/Dealer: Get plan by ID ──────────────────────────────────────────

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get a dealer subscription plan by ID',
    description:
      'Returns a single dealer subscription plan by its ID. When called by an authenticated ' +
      "DEALER, the response also includes `counts` — how many of that dealer's own " +
      'subscriptions to this specific plan are still active.',
  })
  @ApiParam({ name: 'id', description: 'Dealer subscription plan CUID' })
  @ApiResponse({ status: 200, description: 'Dealer subscription plan details' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  getPlanById(@Param('id') id: string, @CurrentUser() user?: any) {
    return this.service.getPlanById(id, user ?? undefined);
  }

// Super Admin routes moved to dealer-subscription-plans-admin.controller.ts
}

// ─────────────────────────────────────────────────────────────────────────────
// Dealer Subscriptions (dealer self-service + admin view)
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Dealer Subscriptions')
@Controller('dealer-subscriptions')
export class DealerSubscriptionsController {
  constructor(private readonly service: DealerSubscriptionsService) {}

  // ─── Dealer: Checkout (purchase plan) ────────────────────────────────────

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Dealer: Purchase a subscription plan via Stripe',
    description:
      'Creates a Stripe Checkout Session for the dealer to pay for a subscription plan. ' +
      'If the plan price is **0** (free plan), the subscription is activated immediately without Stripe. ' +
      'On successful payment, the webhook activates the subscription.',
  })
  @ApiResponse({
    status: 201,
    description: 'Checkout session created (or free plan activated)',
  })
  @ApiResponse({
    status: 400,
    description: 'Already has an active subscription',
  })
  @ApiResponse({
    status: 403,
    description: 'Only DEALER accounts can purchase plans',
  })
  createCheckout(
    @Body() dto: CheckoutDealerPlanDto,
    @CurrentUser('id') dealerId: string,
  ) {
    return this.service.createCheckout(dto, dealerId);
  }

  // ─── Stripe Webhook ────────────────────────────────────────────────────────

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stripe webhook for dealer subscription payments',
    description:
      'Receives Stripe webhook events for dealer subscription payments. ' +
      'On `checkout.session.completed` → activates the DealerSubscription.',
  })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.service.handleStripeWebhook(req.rawBody!, signature);
  }

  // ─── Dealer: My Subscriptions ─────────────────────────────────────────────

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Dealer: Get my subscription history',
    description:
      'Returns all subscription records for the authenticated dealer, including plan details.',
  })
  @ApiResponse({ status: 200, description: 'Dealer subscription history' })
  getMySubscriptions(@CurrentUser('id') dealerId: string) {
    return this.service.getMySubscriptions(dealerId);
  }

  // Super Admin routes moved to dealer-subscriptions-admin.controller.ts
}
