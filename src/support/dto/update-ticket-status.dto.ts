import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus } from '@prisma/client';

export class UpdateTicketStatusDto {
  @ApiPropertyOptional({
    enum: TicketStatus,
    description: 'New status for the ticket',
    example: TicketStatus.IN_PROGRESS,
  })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({
    description: 'User ID of the moderator / admin to assign this ticket to',
    example: 'clxyz1234',
  })
  @IsOptional()
  @IsString()
  assignedToId?: string;
}
