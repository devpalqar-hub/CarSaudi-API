import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  MinLength,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FuelType,
  TransmissionType,
  BodyType,
  ConditionType,
} from '@prisma/client';

export class ListingImageDto {
  @ApiProperty({ description: 'Image URL', example: 'https://cdn.example.com/car1.jpg' })
  @IsString()
  url: string;

  @ApiPropertyOptional({ description: 'Alt text for the image' })
  @IsOptional()
  @IsString()
  alt?: string;

  @ApiPropertyOptional({ description: 'Sort order (lower = first)', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateListingDto {
  @ApiProperty({ description: 'Listing title', example: '2023 Toyota Camry LE' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Detailed description of the vehicle' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ description: 'Vehicle make/brand', example: 'Toyota' })
  @IsString()
  @MaxLength(100)
  make: string;

  @ApiProperty({ description: 'Vehicle model', example: 'Camry' })
  @IsString()
  @MaxLength(100)
  model: string;

  @ApiProperty({ description: 'Manufacturing year', example: 2023 })
  @IsInt()
  @Min(1900)
  @Max(2030)
  year: number;

  @ApiProperty({ description: 'Mileage in kilometers', example: 25000 })
  @IsInt()
  @Min(0)
  mileage: number;

  @ApiProperty({ description: 'Listing price', example: 85000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'SAR', example: 'SAR' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  currency?: string;

  @ApiPropertyOptional({ description: 'Is the price negotiable?', default: false })
  @IsOptional()
  @IsBoolean()
  negotiable?: boolean;

  @ApiPropertyOptional({ description: 'Fuel type', enum: FuelType })
  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @ApiPropertyOptional({ description: 'Transmission type', enum: TransmissionType })
  @IsOptional()
  @IsEnum(TransmissionType)
  transmission?: TransmissionType;

  @ApiPropertyOptional({ description: 'Body type', enum: BodyType })
  @IsOptional()
  @IsEnum(BodyType)
  bodyType?: BodyType;

  @ApiPropertyOptional({ description: 'Vehicle condition', enum: ConditionType, default: 'USED' })
  @IsOptional()
  @IsEnum(ConditionType)
  condition?: ConditionType;

  @ApiPropertyOptional({ description: 'Exterior color', example: 'Silver' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @ApiPropertyOptional({ description: 'Engine size (e.g., "2.5L")', example: '2.5L' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  engineSize?: string;

  @ApiPropertyOptional({ description: 'Horsepower', example: 203 })
  @IsOptional()
  @IsInt()
  @Min(0)
  horsepower?: number;

  @ApiPropertyOptional({ description: 'Number of doors', example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  doors?: number;

  @ApiPropertyOptional({ description: 'Number of cylinders', example: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cylinders?: number;

  @ApiPropertyOptional({ description: 'Vehicle Identification Number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vin?: string;

  @ApiPropertyOptional({ description: 'City where vehicle is located', example: 'Riyadh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'Region / Province', example: 'Riyadh Region' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ description: 'Vehicle images', type: [ListingImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListingImageDto)
  images?: ListingImageDto[];
}
