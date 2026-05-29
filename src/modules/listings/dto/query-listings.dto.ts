import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsNumber, Min, IsInt, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import {
  FuelType,
  TransmissionType,
  BodyType,
  ConditionType,
} from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryListingsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by make/brand', example: 'Toyota' })
  @IsOptional()
  @IsString()
  make?: string;

  @ApiPropertyOptional({ description: 'Filter by model', example: 'Camry' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Minimum year', example: 2020 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  yearMin?: number;

  @ApiPropertyOptional({ description: 'Maximum year', example: 2024 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  yearMax?: number;

  @ApiPropertyOptional({ description: 'Minimum price', example: 30000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @ApiPropertyOptional({ description: 'Maximum price', example: 150000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @ApiPropertyOptional({ description: 'Filter by fuel type', enum: FuelType })
  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @ApiPropertyOptional({ description: 'Filter by transmission', enum: TransmissionType })
  @IsOptional()
  @IsEnum(TransmissionType)
  transmission?: TransmissionType;

  @ApiPropertyOptional({ description: 'Filter by body type', enum: BodyType })
  @IsOptional()
  @IsEnum(BodyType)
  bodyType?: BodyType;

  @ApiPropertyOptional({ description: 'Filter by condition', enum: ConditionType })
  @IsOptional()
  @IsEnum(ConditionType)
  condition?: ConditionType;

  @ApiPropertyOptional({ description: 'Filter by city', example: 'Riyadh' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by region', example: 'Riyadh Region' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Show only featured listings' })
  @IsOptional()
  @IsString()
  isFeatured?: string;

  @ApiPropertyOptional({ description: 'Filter by seller ID' })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional({ description: 'Filter by dealer ID' })
  @IsOptional()
  @IsString()
  dealerId?: string;
}
