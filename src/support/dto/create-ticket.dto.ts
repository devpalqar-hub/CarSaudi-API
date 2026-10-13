import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketCategory } from '@prisma/client';

export class CreateTicketDto {
  @ApiProperty({
    enum: TicketCategory,
    description: 'Category of the support request',
    example: TicketCategory.REPORT_LISTING,
  })
  @IsEnum(TicketCategory)
  category: TicketCategory;

  @ApiProperty({
    description: 'Short subject / title of the ticket',
    maxLength: 150,
    example: 'Incorrect listing information',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  subject: string;

  @ApiProperty({
    description: 'Detailed description of the issue',
    example: 'The listing shows wrong price and outdated photos.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  // ── REPORT_LISTING ─────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Listing ID being reported (required when category = REPORT_LISTING)',
    example: 'clxyz1234',
  })
  @ValidateIf((o) => o.category === TicketCategory.REPORT_LISTING)
  @IsString()
  @IsNotEmpty({ message: 'listingId is required for REPORT_LISTING tickets' })
  listingId?: string;

  // ── REPORT_USER ────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'User ID being reported (required when category = REPORT_USER)',
    example: 'clxyz5678',
  })
  @ValidateIf((o) => o.category === TicketCategory.REPORT_USER)
  @IsString()
  @IsNotEmpty({ message: 'reportedUserId is required for REPORT_USER tickets' })
  reportedUserId?: string;

  // ── Optional context for PAYMENT / GENERAL ─────────────────────────────────

  @ApiPropertyOptional({
    description: 'Optional reference ID (e.g. payment transaction ID)',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;
}
