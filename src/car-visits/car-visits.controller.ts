import {
  Body,
  Controller,
  Get,
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
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsDate, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CarVisitsService } from './car-visits.service';

export class ScheduleVisitDto {
  @ApiProperty({
    example: '2026-07-20T10:00:00Z',
    description: 'Scheduled date and time',
  })
  @IsDate()
  @Type(() => Date)
  scheduledAt: Date;

  @ApiProperty({
    required: false,
    example: 'I want to take it for a test drive',
    description: 'Additional notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReconfirmVisitDto {
  @ApiProperty({
    example: '2026-07-21T14:00:00Z',
    description: 'Proposed new date and time',
  })
  @IsDate()
  @Type(() => Date)
  proposedAt: Date;
}

@ApiTags('Car Visits')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('car-visits')
export class CarVisitsController {
  constructor(private readonly carVisitsService: CarVisitsService) {}

  @Post(':listingId')
  @ApiOperation({ summary: 'Schedule a viewing/test-drive for a car listing' })
  @ApiParam({ name: 'listingId', description: 'ID of the listing' })
  @ApiResponse({ status: 201, description: 'Visit request created' })
  scheduleVisit(
    @CurrentUser('id') userId: string,
    @Param('listingId') listingId: string,
    @Body() dto: ScheduleVisitDto,
  ) {
    // Make sure we parse it as Date object if needed, but NestJS standard transforms can do this.
    // For simplicity, we just pass new Date(dto.scheduledAt)
    return this.carVisitsService.scheduleVisit(
      userId,
      listingId,
      new Date(dto.scheduledAt),
      dto.notes,
    );
  }

  @Get('as-visitor')
  @ApiOperation({ summary: 'Get all visits requested by the current user' })
  @ApiResponse({ status: 200, description: 'List of visits' })
  getVisitsAsVisitor(@CurrentUser('id') userId: string) {
    return this.carVisitsService.getVisitsAsVisitor(userId);
  }

  @Get('as-owner')
  @ApiOperation({
    summary:
      "Get all visits requested for the current user's car listings (paginated)",
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated list of visits' })
  getVisitsAsOwner(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.carVisitsService.getVisitsAsOwner(userId, +page, +limit);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Owner accepts the visit request' })
  @ApiParam({ name: 'id', description: 'Visit ID' })
  @ApiResponse({ status: 200, description: 'Visit accepted' })
  acceptVisit(@CurrentUser('id') userId: string, @Param('id') visitId: string) {
    return this.carVisitsService.acceptVisit(userId, visitId);
  }

  @Patch(':id/reconfirm')
  @ApiOperation({ summary: 'Owner proposes a new time (reconfirm)' })
  @ApiParam({ name: 'id', description: 'Visit ID' })
  @ApiResponse({ status: 200, description: 'Visit rescheduled' })
  reconfirmVisit(
    @CurrentUser('id') userId: string,
    @Param('id') visitId: string,
    @Body() dto: ReconfirmVisitDto,
  ) {
    return this.carVisitsService.reconfirmVisit(
      userId,
      visitId,
      new Date(dto.proposedAt),
    );
  }

  @Patch(':id/close')
  @ApiOperation({
    summary: 'Owner rejects or Visitor cancels the visit request',
  })
  @ApiParam({ name: 'id', description: 'Visit ID' })
  @ApiResponse({ status: 200, description: 'Visit closed' })
  closeVisit(@CurrentUser('id') userId: string, @Param('id') visitId: string) {
    return this.carVisitsService.closeVisit(userId, visitId);
  }
}
