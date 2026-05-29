import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { DealerStatus, SubscriptionTier } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryDealersDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by dealer status', enum: DealerStatus })
  @IsOptional()
  @IsEnum(DealerStatus)
  status?: DealerStatus;

  @ApiPropertyOptional({ description: 'Filter by subscription tier', enum: SubscriptionTier })
  @IsOptional()
  @IsEnum(SubscriptionTier)
  subscriptionTier?: SubscriptionTier;

  @ApiPropertyOptional({ description: 'Filter by city', example: 'Riyadh' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by region', example: 'Riyadh Region' })
  @IsOptional()
  @IsString()
  region?: string;
}
