import { ApiPropertyOptional } from '@nestjs/swagger';
import { CarListingDraftStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryListingDraftsDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter to a single upload batch' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({
    enum: CarListingDraftStatus,
    description: 'Filter by draft status',
  })
  @IsOptional()
  @IsEnum(CarListingDraftStatus)
  status?: CarListingDraftStatus;
}
