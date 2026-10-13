import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListingPurpose, ListingStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum DealerAnalyticsSortBy {
  VIEWS_COUNT = 'viewsCount',
  IMPRESSIONS_COUNT = 'impressionsCount',
  REACH_COUNT = 'reachCount',
  CREATED_AT = 'createdAt',
  PRICE = 'price',
}

export class GetDealerAnalyticsDto {
  @ApiPropertyOptional({
    description:
      'Start date filter for analytics period (ISO date string, e.g. 2026-01-01)',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'End date filter for analytics period (ISO date string, e.g. 2026-12-31)',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Alias for startDate' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Alias for endDate' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Alias for startDate' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  start?: string;

  @ApiPropertyOptional({ description: 'Alias for endDate' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  end?: string;

  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Search term by property name or slug' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ListingStatus,
    description: 'Filter by listing status',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.toUpperCase().trim() : value;
  })
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({
    enum: ListingPurpose,
    description: 'Filter by listing purpose (SALE or RENT)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.toUpperCase().trim() : value;
  })
  @IsEnum(ListingPurpose)
  purpose?: ListingPurpose;

  @ApiPropertyOptional({
    description: 'Filter by specific listing CUID or slug',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  listingId?: string;

  @ApiPropertyOptional({
    description: 'Filter by staff user ID who created the listing',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  staffUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by property type ID' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  typeId?: string;

  @ApiPropertyOptional({ description: 'Filter by municipality ID' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  municipalityId?: string;

  @ApiPropertyOptional({ description: 'Filter by area name (e.g. "The Pearl")' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  areaName?: string;

  @ApiPropertyOptional({
    enum: DealerAnalyticsSortBy,
    description: 'Sort by field',
    default: DealerAnalyticsSortBy.VIEWS_COUNT,
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsEnum(DealerAnalyticsSortBy)
  sortBy?: DealerAnalyticsSortBy = DealerAnalyticsSortBy.VIEWS_COUNT;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description: 'Sort order',
    default: 'desc',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.toLowerCase().trim() : value;
  })
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
