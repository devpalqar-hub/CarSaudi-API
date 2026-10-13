import {
  Body,
  Controller,
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

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';

// ─────────────────────────────────────────────────────────────────────────────
// User-facing routes  (/support/tickets/*)
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Support')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Raise a support ticket',
    description:
      'Any authenticated user, dealer, or dealer-staff can submit a support ticket.\n\n' +
      '**Category rules:**\n' +
      '- `REPORT_LISTING` → `listingId` is **required**\n' +
      '- `REPORT_USER` → `reportedUserId` is **required**\n' +
      '- `PAYMENT` / `GENERAL` → no reference field required',
  })
  @ApiResponse({ status: 201, description: 'Ticket created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation error (missing required reference field)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(userId, dto);
  }

  // ── List own tickets ────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List my support tickets (paginated)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({
    status: 200,
    description: "Paginated list of the calling user's tickets",
  })
  getMyTickets(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.supportService.getMyTickets(userId, +page, +limit);
  }

  // ── Single ticket (own) ─────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Get a support ticket I submitted (includes replies)',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Full ticket with replies' })
  @ApiResponse({ status: 403, description: 'Not your ticket' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  getMyTicket(
    @CurrentUser('id') userId: string,
    @Param('id') ticketId: string,
  ) {
    return this.supportService.getMyTicket(userId, ticketId);
  }
}

// Admin routes moved to support-admin.controller.ts
