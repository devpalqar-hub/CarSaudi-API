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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { SupportService } from './support.service';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Admin / Moderator routes
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Support — Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
@Controller('protected/carsaudi/admin/support/tickets')
export class SupportAdminController {
  constructor(private readonly supportService: SupportService) {}

  // ── List all tickets ────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List all support tickets (admin)',
    description:
      'Paginated list of all tickets. Optionally filter by `status` and/or `category`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated ticket list with submitter info',
  })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  getAllTickets(@Query() query: ListTicketsDto) {
    return this.supportService.getAllTickets(query);
  }

  // ── Single ticket detail ────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get full ticket detail (admin)' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({
    status: 200,
    description: 'Full ticket with replies and submitter info',
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  getTicketDetail(@Param('id') ticketId: string) {
    return this.supportService.getTicketDetail(ticketId);
  }

  // ── Reply to ticket ─────────────────────────────────────────────────────────

  @Post(':id/reply')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Reply to a support ticket (admin)',
    description:
      'Saves the admin reply, auto-advances status from OPEN → IN_PROGRESS, ' +
      'and sends a reply notification email to the ticket submitter.',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({
    status: 201,
    description: 'Reply saved; email sent to submitter',
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  replyToTicket(
    @CurrentUser('id') adminId: string,
    @Param('id') ticketId: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.supportService.replyToTicket(adminId, ticketId, dto);
  }

  // ── Update status ───────────────────────────────────────────────────────────

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update ticket status / assignee (admin)',
    description:
      'Change ticket status (`OPEN`, `IN_PROGRESS`, `ATTENDED`, `CLOSED`) ' +
      'and optionally assign a moderator.',
  })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  @ApiResponse({ status: 200, description: 'Ticket status updated' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  updateStatus(
    @Param('id') ticketId: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.supportService.updateStatus(ticketId, dto);
  }
}
