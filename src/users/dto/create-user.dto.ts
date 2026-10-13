import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AuthProvider, UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiPropertyOptional({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description: 'Email address (required if phone is not provided)',
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @ValidateIf((o) => !o.phone)
  email?: string;

  @ApiPropertyOptional({
    description:
      'Phone number in E.164 format (required if email is not provided)',
    example: '+97412345678',
  })
  @IsOptional()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'Please provide a valid phone number with country code',
  })
  @ValidateIf((o) => !o.email)
  phone?: string;

  @ApiPropertyOptional({
    description:
      'Password (minimum 8 characters). Required for LOCAL auth provider.',
    example: 'StrongPass@123',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password?: string;

  @ApiPropertyOptional({
    description: 'User role in the system',
    enum: UserRole,
    default: UserRole.USER,
    example: UserRole.USER,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Invalid user role' })
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Authentication provider',
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
    example: AuthProvider.LOCAL,
  })
  @IsOptional()
  @IsEnum(AuthProvider, { message: 'Invalid auth provider' })
  authProvider?: AuthProvider;
}
