import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CarCondition,
  FuelType,
  ListingPurpose,
  ListingStatus,
  TransmissionType,
} from '@prisma/client';
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

  // ── Car Model & Purpose ──────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Filter by car model ID or IDs (comma-separated or array)',
    example: 'cuid1,cuid2',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  modelId?: string | string[];

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

  // ── Brand & Location ─────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Filter by car brand ID or IDs (comma-separated or array)',
    example: 'cuid1,cuid2',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  brandId?: string | string[];

  @ApiPropertyOptional({
    description: 'Filter by area name or names (comma-separated or array)',
    example: 'Al Olaya,King Fahd Road',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  areaName?: string | string[];

  @ApiPropertyOptional({
    description: 'Latitude for nearby search',
    example: 24.7136,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude for nearby search',
    example: 46.6753,
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

  @ApiPropertyOptional({ description: 'Minimum price in SAR', example: 20000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum price in SAR',
    example: 200000,
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

  // ── Model Year ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Minimum model year',
    example: 2015,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  minModelYear?: number;

  @ApiPropertyOptional({
    description: 'Maximum model year',
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  maxModelYear?: number;

  // ── Mileage ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Minimum mileage in km', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minMileage?: number;

  @ApiPropertyOptional({
    description: 'Maximum mileage in km',
    example: 100000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxMileage?: number;

  // ── Car Specs ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ enum: FuelType, description: 'Filter by fuel type' })
  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @ApiPropertyOptional({
    enum: TransmissionType,
    description: 'Filter by transmission type',
  })
  @IsOptional()
  @IsEnum(TransmissionType)
  transmission?: TransmissionType;

  @ApiPropertyOptional({
    enum: CarCondition,
    description: 'Filter by car condition',
  })
  @IsOptional()
  @IsEnum(CarCondition)
  condition?: CarCondition;

  // ── Car Type, Features & Tags ───────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Filter by car type ID or IDs (comma-separated or array)',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  carTypeId?: string | string[];

  @ApiPropertyOptional({
    description: 'Filter by feature ID or IDs (comma-separated or array)',
    example: 'cuid1,cuid2',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  featureId?: string | string[];

  @ApiPropertyOptional({
    description: 'Filter by tag ID or IDs (comma-separated or array)',
    example: 'cuid1,cuid2',
  })
  @IsOptional()
  @Transform(({ value }) => transformToArray(value))
  @IsArray()
  @IsString({ each: true })
  tagId?: string | string[];

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
      'Full-text search across title, description, area name, reference code',
    example: 'toyota camry sedan',
  })
  @IsOptional()
  @IsString()
  search?: string;

  // ── Sorting ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'price', 'mileage', 'modelYear'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'price', 'mileage', 'modelYear'])
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
