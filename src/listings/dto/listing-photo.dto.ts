import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListingPhotoDto {
  @ApiProperty({
    description: 'Public URL of the photo (CDN / MinIO presigned URL)',
    example: 'https://cdn.example.com/listings/photo1.jpg',
  })
  @IsString()
  url: string;

  @ApiPropertyOptional({
    description: 'MinIO object key (for internal management)',
    example: 'listings/clx1234/photo1.jpg',
  })
  @IsOptional()
  @IsString()
  minioKey?: string;

  @ApiPropertyOptional({
    description: 'Photo caption or label',
    example: 'Living Room',
  })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiProperty({
    description: 'Display order (0 = first / hero image)',
    example: 0,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder: number;
}
