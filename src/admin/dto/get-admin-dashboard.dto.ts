import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { DashboardGranularity } from '../../shared/utils/dashboard-bucket.util';

export { DashboardGranularity };

export class GetAdminDashboardDto {
  @ApiPropertyOptional({
    description:
      'Start date filter (ISO date string, e.g. 2026-01-01). Applies to all period figures — ' +
      'revenue, new users, new dealers, new listings, new sales — and the trend graph. ' +
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

  // ── Common frontend aliases for date range ──────────────────────────────
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
    description: 'Bucket size for the revenue / growth trend graph',
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
