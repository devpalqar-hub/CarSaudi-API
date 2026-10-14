import { ApiPropertyOptional } from '@nestjs/swagger';
import { ListingPurpose, ListingStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { DashboardGranularity } from '../../shared/utils/dashboard-bucket.util';

export { DashboardGranularity };

export class GetDealerDashboardDto {
  // ── Date range ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Start date filter (ISO date string, e.g. 2026-01-01). Applies to all period metrics and the trend graph. ' +
      'Defaults to a sensible look-back window based on `granularity` when omitted.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'End date filter (ISO date string, e.g. 2026-12-31). Defaults to today when omitted.',
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

  @ApiPropertyOptional({
    enum: DashboardGranularity,
    description: 'Bucket size for the visits vs views vs chats trend graph',
    default: DashboardGranularity.DAILY,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.toLowerCase().trim() : value;
  })
  @IsEnum(DashboardGranularity)
  granularity?: DashboardGranularity = DashboardGranularity.DAILY;

  // ── Scope filters ───────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Restrict all metrics to a single listing (listing CUID or slug)',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  listingId?: string;

  @ApiPropertyOptional({
    description:
      'Restrict all metrics to listings created by one staff member (User CUID). ' +
      'Must be an active staff member of the requesting dealer agency.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  staffUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by car model ID' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({
    enum: ListingPurpose,
    description: 'Filter by purpose (SALE or RENT)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.toUpperCase().trim() : value;
  })
  @IsEnum(ListingPurpose)
  purpose?: ListingPurpose;

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

  @ApiPropertyOptional({ description: 'Filter by brand ID (location)' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by area name, partial match (location), e.g. "The Pearl"',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  areaName?: string;
}
