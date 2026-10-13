import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  FeaturedPaymentStatus,
  FeaturedPlacementLocation,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryFeaturedDto {
  @ApiPropertyOptional({
    enum: FeaturedPlacementLocation,
    description: 'Filter by placement location',
    example: FeaturedPlacementLocation.HOME_PAGE,
  })
  @IsOptional()
  @IsEnum(FeaturedPlacementLocation)
  location?: FeaturedPlacementLocation;

  @ApiPropertyOptional({
    enum: FeaturedPaymentStatus,
    description: 'Admin: filter by payment status',
  })
  @IsOptional()
  @IsEnum(FeaturedPaymentStatus)
  paymentStatus?: FeaturedPaymentStatus;

  @ApiPropertyOptional({ description: 'Filter by listing ID' })
  @IsOptional()
  @IsString()
  listingId?: string;

  @ApiPropertyOptional({
    description: 'Search by property name, area name, or description',
    example: 'Pearl villa',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Max number of results to return (for public endpoint)',
    default: 8,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 8;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
}
