import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateListingSettingsDto {
  @ApiPropertyOptional({
    description:
      'Price (QAR) charged per listing once a user/dealer is outside their free-listing quota. ' +
      "Dealers get this discounted by their active subscription's `currentListingDiscountPercent`.",
    example: 150,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerListing?: number;

  @ApiPropertyOptional({
    description:
      'Number of free listings a non-dealer USER may create before payment is required. ' +
      'Dealer free quota is managed separately via dealer subscription plans.',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  userFreeListingsLimit?: number;
}
