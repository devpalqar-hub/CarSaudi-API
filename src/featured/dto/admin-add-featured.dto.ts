import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeaturedPaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class AdminAddFeaturedDto {
  @ApiProperty({ description: 'Listing ID to feature', example: 'clxyz123abc' })
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @ApiProperty({
    description: 'Featured plan ID to apply',
    example: 'clxyz456def',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiPropertyOptional({
    enum: FeaturedPaymentStatus,
    description:
      "Payment status to set. Defaults to PAID with the plan's own price (bypasses Stripe, but " +
      'still records the real amount instead of showing "Free"). Pass FREE explicitly to grant it ' +
      'as a genuinely free boost instead.',
    default: FeaturedPaymentStatus.PAID,
  })
  @IsOptional()
  @IsEnum(FeaturedPaymentStatus)
  paymentStatus?: FeaturedPaymentStatus;

  @ApiPropertyOptional({
    description:
      "Amount to record as paid (SAR). Defaults to the plan's own price.",
    example: 150,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  paidAmount?: number;
}
