import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCarFeatureDto {
  @ApiProperty({
    example: 'Sunroof',
    description: 'The title of the car feature',
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

export class CreateCarTagDto {
  @ApiProperty({
    example: 'Single Owner',
    description: 'The title of the car tag',
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

export class CreateCarTypeDto {
  @ApiProperty({
    example: 'SUV',
    description: 'The title of the car type (body style)',
  })
  @IsString()
  @IsNotEmpty()
  title: string;
}

export class CreateCarModelDto {
  @ApiProperty({
    example: 'Camry',
    description: 'The title of the car model',
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

export class CreateCarBrandDto {
  @ApiProperty({ example: 'Toyota', description: 'The name of the car brand' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'https://example.com/image.png',
    description: 'Optional brand logo image URL',
  })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Is the brand popular?',
  })
  @IsBoolean()
  @IsOptional()
  isPopular?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Is the brand active?',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
