import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class PriceEstimationDto {
  @ApiProperty({
    description: 'The location/area in Qatar',
    example: 'The Pearl',
  })
  @IsString()
  areaName: string;

  @ApiProperty({
    description: 'Size of the property in square feet',
    example: 1200,
  })
  @Type(() => Number)
  @IsNumber()
  areaSqft: number;

  @ApiProperty({ description: 'Type of property', example: 'Apartment' })
  @IsString()
  propertyType: string;

  @ApiPropertyOptional({ description: 'Number of bedrooms (BHK)', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bhk?: number;

  @ApiPropertyOptional({ description: 'Number of bathrooms', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bathrooms?: number;

  @ApiPropertyOptional({
    description: 'Furnishing status',
    example: 'Furnished',
  })
  @IsOptional()
  @IsString()
  furnishingStatus?: string;

  @ApiPropertyOptional({
    description: 'Which floor the property is on',
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floorAbove?: number;

  @ApiPropertyOptional({
    description: 'Total floors in the building',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  totalFloors?: number;

  @ApiPropertyOptional({
    description: 'Whether parking is available',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  parkingAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'Optional highlights/features',
    example: 'balcony with a sea view',
  })
  @IsOptional()
  @IsString()
  highlights?: string;

  @ApiPropertyOptional({
    description: 'Array of amenities or features available',
    example: [
      'Swimming Pool',
      'Gym / Fitness Center',
      'Central A/C',
      'Balcony',
    ],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];
}
