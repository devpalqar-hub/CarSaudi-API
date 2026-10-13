import { ApiProperty } from '@nestjs/swagger';
import {
  FeaturedPlacementLocation,
  FeaturedPlanDuration,
} from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';

export class CreateFeaturedPlanDto {
  @ApiProperty({
    description: 'Display name for the plan',
    example: '7-Day Multi-Location Boost',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    type: [String],
    enum: FeaturedPlacementLocation,
    isArray: true,
    description:
      'One or more placement locations where the featured listing will appear',
    example: [
      FeaturedPlacementLocation.HOME_PAGE,
      FeaturedPlacementLocation.LISTING_PAGE,
    ],
  })
  @IsArray()
  @IsEnum(FeaturedPlacementLocation, { each: true })
  locations: FeaturedPlacementLocation[];

  @ApiProperty({
    enum: FeaturedPlanDuration,
    description: 'Duration tier: SEVEN_DAYS | TWENTY_DAYS | THIRTY_DAYS',
    example: FeaturedPlanDuration.SEVEN_DAYS,
  })
  @IsEnum(FeaturedPlanDuration)
  duration: FeaturedPlanDuration;

  @ApiProperty({ description: 'Plan price in QAR (0 = free)', example: 150 })
  @IsNumber()
  @Min(0)
  price: number;
}
