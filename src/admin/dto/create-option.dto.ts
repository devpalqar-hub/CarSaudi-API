import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAmenityDto {
  @ApiProperty({
    example: 'Swimming Pool',
    description: 'The title of the amenity',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example: 'https://example.com/image.png',
    description: 'Optional image URL',
  })
  @IsString()
  @IsOptional()
  image?: string;
}

export class CreateNearbyTagDto {
  @ApiProperty({
    example: 'School',
    description: 'The title of the nearby tag',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example: 'https://example.com/image.png',
    description: 'Optional image URL',
  })
  @IsString()
  @IsOptional()
  image?: string;
}

export class CreateFurnishingOptionDto {
  @ApiProperty({
    example: 'Fully Furnished',
    description: 'The title of the furnishing option',
  })
  @IsString()
  @IsNotEmpty()
  title: string;
}

export class CreateListingTypeOptionDto {
  @ApiProperty({
    example: 'Villa',
    description: 'The title of the listing type',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example: 'https://example.com/image.png',
    description: 'Optional image URL',
  })
  @IsString()
  @IsOptional()
  image?: string;
}

export class CreateMunicipalityDto {
  @ApiProperty({ example: 'Doha', description: 'The name of the municipality' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'https://example.com/image.png',
    description: 'Optional image URL',
  })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({ example: 25.2854, description: 'Latitude' })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ example: 51.531, description: 'Longitude' })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Is the municipality popular?',
  })
  @IsBoolean()
  @IsOptional()
  isPopular?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Is the municipality active?',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
