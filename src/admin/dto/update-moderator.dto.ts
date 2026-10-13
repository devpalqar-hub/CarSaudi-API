import { ApiPropertyOptional } from '@nestjs/swagger';
import { Permission } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class UpdateModeratorDto {
  @ApiPropertyOptional({
    description: 'Updated full name',
    example: 'Jane Doe',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated phone number',
    example: '+97455512345',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description:
      'New password (min 8 chars, 1 uppercase, 1 number). Admin can reset the moderator password.',
    example: 'NewSecurePass1',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[A-Z])(?=.*[0-9])/, {
    message:
      'Password must contain at least one uppercase letter and one number',
  })
  password?: string;

  @ApiPropertyOptional({
    description: 'Updated permissions array',
    enum: Permission,
    isArray: true,
    example: [Permission.PROPERTIES_MANAGE, Permission.DEALERS_MANAGE],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one permission must remain assigned' })
  @IsEnum(Permission, { each: true })
  permissions?: Permission[];

  @ApiPropertyOptional({
    description: 'Activate or deactivate the moderator account',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Internal notes',
    example: 'Handles Doha region',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
