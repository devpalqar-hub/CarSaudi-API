import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DealerStaffPermission } from '@prisma/client';

export class CreateDealerStaffDto {
  // ── Account credentials ────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Staff member full name',
    example: 'Sara Al-Dosari',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Staff login email',
    example: 'sara@pearlrealestate.qa',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description:
      'Initial password (min 8 chars, 1 uppercase, 1 number). Staff should change on first login.',
    example: 'Staff@Pass1',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*[0-9])/, {
    message:
      'Password must contain at least one uppercase letter and one number',
  })
  password: string;

  @ApiPropertyOptional({
    description: 'Contact phone in E.164 format',
    example: '+97412345679',
  })
  @IsOptional()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'Phone must be in E.164 format, e.g. +97412345678',
  })
  phone?: string;

  // ── Staff profile ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Job title / position within the agency',
    example: 'Sales Agent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  // ── Permissions ────────────────────────────────────────────────────────────

  @ApiProperty({
    enum: DealerStaffPermission,
    isArray: true,
    description: 'List of permissions granted to this staff member',
    example: [
      DealerStaffPermission.PROPERTY_LISTINGS_VIEW,
      DealerStaffPermission.CHATS_MANAGE,
    ],
  })
  @IsArray()
  @IsEnum(DealerStaffPermission, { each: true })
  permissions: DealerStaffPermission[];
}
