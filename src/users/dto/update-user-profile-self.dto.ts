import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class UpdateUserProfileSelfDto {
  @ApiPropertyOptional({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Phone number in E.164 format',
    example: '+96612345678',
  })
  @IsOptional()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'Please provide a valid phone number with country code',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'New password (minimum 8 characters)',
    example: 'StrongPass@123',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password?: string;
}
