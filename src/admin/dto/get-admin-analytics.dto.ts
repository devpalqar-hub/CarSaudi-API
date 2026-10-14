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

export enum AdminAnalyticsSortBy {
  VIEWS_COUNT = 'viewsCount',
  IMPRESSIONS_COUNT = 'impressionsCount',
  REACH_COUNT = 'reachCount',
  CREATED_AT = 'createdAt',
}

export class GetAdminAnalyticsDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100)',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Search term for listing title or slug',
    example: 'camry',
  })
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

  @ApiPropertyOptional({ description: 'Filter by listing type option ID' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({ description: 'Filter by dealer/creator user ID' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  dealerId?: string;

  @ApiPropertyOptional({
    description: 'Sort metric field',
    enum: AdminAnalyticsSortBy,
    default: AdminAnalyticsSortBy.VIEWS_COUNT,
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsEnum(AdminAnalyticsSortBy)
  sortBy?: AdminAnalyticsSortBy = AdminAnalyticsSortBy.VIEWS_COUNT;

  @ApiPropertyOptional({
    description: 'Sort direction (asc or desc)',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.toLowerCase().trim() : value;
  })
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description:
      'Start date filter (ISO string, e.g. 2026-01-01T00:00:00.000Z)',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date filter (ISO string, e.g. 2026-12-31T23:59:59.999Z)',
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
}
