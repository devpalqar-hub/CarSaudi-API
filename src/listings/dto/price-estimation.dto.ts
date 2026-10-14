import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class PriceEstimationDto {
  @ApiProperty({
    description: 'The car brand',
    example: 'Toyota',
  })
  @IsString()
  brand: string;

  @ApiProperty({
    description: 'The car model',
    example: 'Camry',
  })
  @IsString()
  carModel: string;

  @ApiProperty({
    description: 'Year the car was manufactured',
    example: 2021,
  })
  @Type(() => Number)
  @IsInt()
  modelYear: number;

  @ApiProperty({
    description: 'Mileage driven, in kilometres',
    example: 45000,
  })
  @Type(() => Number)
  @IsNumber()
  mileage: number;

  @ApiPropertyOptional({
    description: 'Car type (body style)',
    example: 'Sedan',
  })
  @IsOptional()
  @IsString()
  carType?: string;

  @ApiPropertyOptional({
    description: 'Car condition',
    example: 'Used',
  })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({
    description: 'Fuel type',
    example: 'Petrol',
  })
  @IsOptional()
  @IsString()
  fuelType?: string;

  @ApiPropertyOptional({
    description: 'Transmission type',
    example: 'Automatic',
  })
  @IsOptional()
  @IsString()
  transmission?: string;

  @ApiPropertyOptional({
    description: 'Optional highlights/notes',
    example: 'single owner, accident-free',
  })
  @IsOptional()
  @IsString()
  highlights?: string;

  @ApiPropertyOptional({
    description: 'Array of notable features',
    example: ['Sunroof', 'Leather Seats', 'Navigation System'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
