import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  FeaturedPlacementLocation,
  FeaturedPlanDuration,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateFeaturedPlanDto {
  @ApiPropertyOptional({ description: 'Display name for the plan' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: FeaturedPlacementLocation,
    isArray: true,
    description: 'Placement locations for this plan',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(FeaturedPlacementLocation, { each: true })
  locations?: FeaturedPlacementLocation[];

  @ApiPropertyOptional({ enum: FeaturedPlanDuration })
  @IsOptional()
  @IsEnum(FeaturedPlanDuration)
  duration?: FeaturedPlanDuration;

  @ApiPropertyOptional({ description: 'Price in QAR (0 = free)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    description: 'Whether the plan is available for purchase',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
