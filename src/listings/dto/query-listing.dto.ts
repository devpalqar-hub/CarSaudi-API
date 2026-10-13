import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListingPurpose, ListingStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

function transformToArray(value: any): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    const flattened = value
      .flatMap((v) => (typeof v === 'string' ? v.split(',') : v))
      .map((v) => String(v).trim())
      .filter(Boolean);
    return flattened.length > 0 ? flattened : undefined;
  }
  if (typeof value === 'string') {
    const split = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return split.length > 0 ? split : undefined;
  }
  return [String(value)];
}

function transformToNumberArray(value: any): number[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    const nums = value
      .flatMap((v) => (typeof v === 'string' ? v.split(',') : v))
      .map((v) => Number(v))
      .filter((n) => !isNaN(n));
    return nums.length > 0 ? nums : undefined;
  }
  if (typeof value === 'string') {
    const nums = value
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => !isNaN(n));
    return nums.length > 0 ? nums : undefined;
  }
  if (typeof value === 'number') return [value];
  return undefined;
}

export class QueryListingDto {
  // ── Pagination ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100)',
    default: 12,
    example: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 12;

  // ── Listing Type & Purpose ─────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Filter by property type ID or IDs (comma-separated or array)',
    example: 'cuid1,cuid2',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  typeId?: string | string[];

  @ApiPropertyOptional({
    enum: ListingPurpose,
    isArray: true,
    description: 'Filter by purpose (SALE or RENT or comma-separated/array)',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsEnum(ListingPurpose, { each: true })
  purpose?: ListingPurpose | ListingPurpose[];

  // ── Status (admin only) ────────────────────────────────────────────────────

  @ApiPropertyOptional({
    enum: ListingStatus,
    isArray: true,
    description: 'Filter by status (admin only)',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsEnum(ListingStatus, { each: true })
  status?: ListingStatus | ListingStatus[];

  // ── Location ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Filter by municipality ID or IDs (comma-separated or array)',
    example: 'cuid1,cuid2',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  municipalityId?: string | string[];

  @ApiPropertyOptional({
    description: 'Filter by area name or names (comma-separated or array)',
    example: 'The Pearl,Lusail',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  areaName?: string | string[];

  @ApiPropertyOptional({
    description: 'Latitude for nearby search',
    example: 25.2854,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude for nearby search',
    example: 51.531,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Search radius in metres',
    example: 5000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  radius?: number;

  // ── Price ──────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Minimum price in QAR', example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum price in QAR',
    example: 10000000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Show only negotiable-price listings',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  priceNegotiable?: boolean;

  // ── Rooms ──────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Specific bedroom count(s) (comma-separated or array, e.g. 1,2,3)',
    example: '2,3',
  })
  @IsOptional()
  @Transform(({ value }) => transformToNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  bedrooms?: number | number[];

  @ApiPropertyOptional({
    description: 'Minimum number of bedrooms',
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minBedrooms?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of bedrooms',
    example: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxBedrooms?: number;

  @ApiPropertyOptional({
    description:
      'Specific bathroom count(s) (comma-separated or array, e.g. 1,2,3)',
    example: '2,3',
  })
  @IsOptional()
  @Transform(({ value }) => transformToNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  bathrooms?: number | number[];

  @ApiPropertyOptional({
    description: 'Minimum number of bathrooms',
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minBathrooms?: number;

  // ── Area ───────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Minimum area in sqm', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  minArea?: number;

  @ApiPropertyOptional({ description: 'Maximum area in sqm', example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  maxArea?: number;

  // ── Features ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Filter by furnishing status ID or IDs (comma-separated or array)',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  furnishingId?: string | string[];

  @ApiPropertyOptional({
    description: 'Filter by amenity ID or IDs (comma-separated or array)',
    example: 'cuid1,cuid2',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  amenityId?: string | string[];

  @ApiPropertyOptional({
    description: 'Filter by nearby tag ID or IDs (comma-separated or array)',
    example: 'cuid1,cuid2',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  nearbyTagId?: string | string[];

  // ── Spam / Duplicate (admin only) ──────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Admin only: filter flagged duplicate listings',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPotentialDuplicate?: boolean;

  // ── Owner filter ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Filter listings by owner user ID (admin) or self (/my endpoint)',
  })
  @IsOptional()
  @IsString()
  createdById?: string;

  @ApiPropertyOptional({
    description: 'Filter listings by owner user ID (alias for createdById)',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by exact or partial reference code (e.g. UL1234 or DL5678)',
    example: 'DL1A2B',
  })
  @IsOptional()
  @IsString()
  referenceCode?: string;

  // ── Text Search ────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Full-text search across property name, description, area name, reference code',
    example: 'pearl villa pool',
  })
  @IsOptional()
  @IsString()
  search?: string;

  // ── Sorting ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'price', 'area', 'bedrooms'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'price', 'area', 'bedrooms'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
