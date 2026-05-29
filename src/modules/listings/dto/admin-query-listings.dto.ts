import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ListingStatus } from '@prisma/client';
import { QueryListingsDto } from './query-listings.dto';

export class AdminQueryListingsDto extends QueryListingsDto {
  @ApiPropertyOptional({ description: 'Filter by listing status', enum: ListingStatus })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({
    description: 'Show only flagged listings (true/false)',
    example: 'true',
  })
  @IsOptional()
  @IsString()
  flagged?: string;

  @ApiPropertyOptional({ description: 'Filter by date range start (ISO)', example: '2024-01-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by date range end (ISO)', example: '2024-12-31' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
