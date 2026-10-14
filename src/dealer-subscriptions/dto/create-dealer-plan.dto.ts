import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateDealerPlanDto {
  @ApiProperty({
    description: 'Plan display name',
    example: 'Gold Agency Plan',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description:
      'Maximum number of ACTIVE listings allowed under this plan. 0 = unlimited.',
    example: 50,
  })
  @IsInt()
  @Min(0)
  maxListings: number;

  @ApiProperty({ description: 'Plan validity in days', example: 365 })
  @IsInt()
  @IsPositive()
  validityDays: number;

  @ApiProperty({
    description:
      'Plan price in SAR. Set to 0 for a free plan (no Stripe payment required).',
    example: 2500,
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({
    description: 'Number of free listings granted instantly upon purchase',
    example: 10,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  freeListings?: number = 0;

  @ApiProperty({
    description:
      'Number of free featured listings granted instantly upon purchase',
    example: 2,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  freeFeaturedListings?: number = 0;

  @ApiPropertyOptional({
    description:
      'Discount percentage (0–100) applied for normal listing creation when out of quota',
    example: 10,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  listingDiscountPercent?: number = 0;

  @ApiPropertyOptional({
    description:
      'Discount percentage (0–100) applied to featured boost price when dealer requests to feature a listing.',
    example: 20,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  boostDiscountPercent?: number = 0;
}
