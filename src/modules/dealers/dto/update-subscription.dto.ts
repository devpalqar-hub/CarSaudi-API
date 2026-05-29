import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsDateString, IsInt, Min } from 'class-validator';
import { SubscriptionTier } from '@prisma/client';

export class UpdateSubscriptionDto {
  @ApiProperty({ description: 'Subscription tier to assign', enum: SubscriptionTier })
  @IsEnum(SubscriptionTier)
  tier: SubscriptionTier;

  @ApiPropertyOptional({
    description: 'Subscription expiration date (ISO format)',
    example: '2025-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of listings allowed',
    example: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxListings?: number;
}
