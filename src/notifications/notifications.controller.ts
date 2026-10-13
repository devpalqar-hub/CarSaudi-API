import {
  Controller,
  Get,
  Param,
  Patch,
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
import { QueryNotificationDto } from './dto/query-notification.dto';
import { NotificationsService } from './notifications.service';

// ─────────────────────────────────────────────────────────────────────────────
// In-app notification feed — dealer / dealer-staff facing.
// Every push notification sent via NotificationsService.sendToUser(s)() also lands
// here (see NotificationsService.persistInApp), so this is the durable, mark-as-read
// list behind the app's notification bell.
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
@ApiBearerAuth('JWT-auth')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Dealer: List my in-app notifications',
    description:
      'Paginated, newest first. Filter by `isRead` to view only read/unread notifications.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated notification list, includes `unreadCount`',
  })
  list(
    @CurrentUser('id') userId: string,
    @Query() query: QueryNotificationDto,
  ) {
    return this.notificationsService.listForUser(userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Dealer: Get my unread notification count' })
  @ApiResponse({
    status: 200,
    description: 'Unread count',
    schema: { example: { count: 3 } },
  })
  unreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.unreadCount(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Dealer: Mark a single notification as read' })
  @ApiParam({ name: 'id', description: 'Notification CUID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  markAsRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notificationsService.markAsRead(userId, id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Dealer: Mark all my notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }
}
