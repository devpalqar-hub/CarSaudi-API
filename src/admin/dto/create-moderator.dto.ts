import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Permission } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateModeratorDto {
  @ApiProperty({
    description: 'Full name of the moderator',
    example: 'Jane Smith',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Email address for login',
    example: 'moderator@villasqatar.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Login password (min 8 chars, 1 uppercase, 1 number)',
    example: 'Mod@SecurePass1',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[A-Z])(?=.*[0-9])/, {
    message:
      'Password must contain at least one uppercase letter and one number',
  })
  password: string;

  @ApiProperty({
    description: 'List of permissions to grant to this moderator',
    enum: Permission,
    isArray: true,
    example: [Permission.PROPERTIES_MANAGE, Permission.USERS_VIEW],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one permission must be assigned' })
  @IsEnum(Permission, { each: true, message: 'Invalid permission value' })
  permissions: Permission[];

  @ApiPropertyOptional({
    description: 'Phone number of the moderator',
    example: '+97455512345',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description:
      'Internal notes about this moderator (visible to super admins only)',
    example: 'Handles Qatar region listings',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
