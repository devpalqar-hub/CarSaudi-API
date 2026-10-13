import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { DashboardGranularity } from '../../shared/utils/dashboard-bucket.util';

export { DashboardGranularity };

/**
 * Optional query params controlling the owner-only `analytics` block returned by
 * GET /listings/:id and GET /listings/slug/:slug, and GET /listings/:id/analytics.
 */
export class ListingAnalyticsQueryDto {
  @ApiPropertyOptional({
    description:
      'Start date for the analytics window (ISO date string, e.g. 2026-07-01). ' +
      'Defaults to a look-back window sized to `granularity` when omitted.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'End date for the analytics window (ISO date string, e.g. 2026-08-01). Defaults to today.',
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
    description:
      'Trend graph bucket size for the views trend / growth-% comparison',
    default: DashboardGranularity.DAILY,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.toLowerCase().trim() : value;
  })
  @IsEnum(DashboardGranularity)
  granularity?: DashboardGranularity = DashboardGranularity.DAILY;
}
