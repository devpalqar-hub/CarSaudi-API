import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TicketCategory, TicketStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../shared/mail.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';

/** Lightweight submitter fields reused across queries */
const SUBMITTER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
};

/** Lightweight reply author fields */
const REPLY_AUTHOR_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
};

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // User-facing methods
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new support ticket.
   * Validates that category-specific reference fields are provided.
   */
  async createTicket(submitterId: string, dto: CreateTicketDto) {
    // Double-check category-specific fields (guard beyond DTO validation)
    if (dto.category === TicketCategory.REPORT_LISTING && !dto.listingId) {
      throw new BadRequestException(
        'listingId is required for REPORT_LISTING tickets',
      );
    }
    if (dto.category === TicketCategory.REPORT_USER && !dto.reportedUserId) {
      throw new BadRequestException(
        'reportedUserId is required for REPORT_USER tickets',
      );
    }

    // If reportedUserId is provided, verify the user exists
    if (dto.reportedUserId) {
      const reportedUser = await this.prisma.user.findUnique({
        where: { id: dto.reportedUserId },
        select: { id: true },
      });
      if (!reportedUser) {
        throw new NotFoundException(
          `Reported user with id "${dto.reportedUserId}" not found`,
        );
      }
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        submitterId,
        category: dto.category,
        subject: dto.subject,
        message: dto.message,
        listingId: dto.listingId ?? null,
        reportedUserId: dto.reportedUserId ?? null,
        status: TicketStatus.OPEN,
      },
      select: {
        id: true,
        category: true,
        subject: true,
        message: true,
        status: true,
        listingId: true,
        reportedUserId: true,
        createdAt: true,
        submitter: { select: SUBMITTER_SELECT },
      },
    });

    this.logger.log(
      `[SupportService] Ticket created: id=${ticket.id} | category=${ticket.category} | submitter=${ticket.submitter.email}`,
    );

    return ticket;
  }

  /**
   * Return paginated list of tickets submitted by the calling user.
   */
  async getMyTickets(submitterId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where: { submitterId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          category: true,
          subject: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { replies: true } },
        },
      }),
      this.prisma.supportTicket.count({ where: { submitterId } }),
    ]);

    return {
      data: tickets,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Return full ticket + replies — only accessible by the ticket owner.
   */
  async getMyTicket(submitterId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        category: true,
        subject: true,
        message: true,
        status: true,
        listingId: true,
        reportedUserId: true,
        createdAt: true,
        updatedAt: true,
        submitter: { select: SUBMITTER_SELECT },
        assignedTo: { select: { id: true, name: true, email: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            message: true,
            isAdmin: true,
            createdAt: true,
            author: { select: REPLY_AUTHOR_SELECT },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket "${ticketId}" not found`);
    }

    if (ticket.submitter.id !== submitterId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    return ticket;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Admin / Moderator methods
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Return all tickets with optional status/category filters (admin view).
   */
  async getAllTickets(filters: ListTicketsDto) {
    const { page = 1, limit = 20, status, category } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          category: true,
          subject: true,
          status: true,
          listingId: true,
          reportedUserId: true,
          createdAt: true,
          updatedAt: true,
          submitter: { select: SUBMITTER_SELECT },
          assignedTo: { select: { id: true, name: true, email: true } },
          _count: { select: { replies: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      data: tickets,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Return full ticket detail with all replies (admin view).
   */
  async getTicketDetail(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        category: true,
        subject: true,
        message: true,
        status: true,
        listingId: true,
        reportedUserId: true,
        createdAt: true,
        updatedAt: true,
        submitter: { select: { ...SUBMITTER_SELECT, phone: true } },
        reportedUser: {
          select: { id: true, name: true, email: true, role: true },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            message: true,
            isAdmin: true,
            createdAt: true,
            author: { select: REPLY_AUTHOR_SELECT },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket "${ticketId}" not found`);
    }

    return ticket;
  }

  /**
   * Admin/moderator replies to a ticket.
   * - Persists the reply with isAdmin = true
   * - Auto-advances status from OPEN → IN_PROGRESS
   * - Sends reply notification email to the submitter
   */
  async replyToTicket(adminId: string, ticketId: string, dto: ReplyTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        message: true,
        status: true,
        submitter: { select: SUBMITTER_SELECT },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket "${ticketId}" not found`);
    }

    // Determine status update
    const newStatus =
      ticket.status === TicketStatus.OPEN
        ? TicketStatus.IN_PROGRESS
        : ticket.status;

    const [reply] = await this.prisma.$transaction([
      // Save the reply
      this.prisma.ticketReply.create({
        data: {
          ticketId,
          authorId: adminId,
          message: dto.message,
          isAdmin: true,
        },
        select: {
          id: true,
          message: true,
          isAdmin: true,
          createdAt: true,
          author: { select: REPLY_AUTHOR_SELECT },
        },
      }),
      // Update ticket status and updatedAt
      this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: newStatus, updatedAt: new Date() },
      }),
    ]);

    this.logger.log(
      `[SupportService] Admin replied to ticket ${ticketId} | status: ${ticket.status} → ${newStatus}`,
    );

    // Send email notification to submitter (fire-and-forget)
    if (ticket.submitter.email) {
      this.mail.sendTicketReplyEmail(
        ticket.submitter.email,
        ticket.submitter.name ?? 'Customer',
        ticket.subject,
        dto.message,
        ticketId,
        newStatus,
      );
    }

    return {
      reply,
      ticketStatus: newStatus,
    };
  }

  /**
   * Update ticket status and/or assignee (admin-only).
   */
  async updateStatus(ticketId: string, dto: UpdateTicketStatusDto) {
    const exists = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Ticket "${ticketId}" not found`);
    }

    const updateData: any = { updatedAt: new Date() };
    if (dto.status) updateData.status = dto.status;
    if (dto.assignedToId !== undefined) {
      updateData.assignedToId = dto.assignedToId || null;
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    this.logger.log(
      `[SupportService] Ticket ${ticketId} status updated to: ${updated.status}`,
    );

    return updated;
  }
}
