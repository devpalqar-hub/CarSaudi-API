import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsDateString } from 'class-validator';

export class FeatureListingDto {
  @ApiProperty({ description: 'Set or remove featured status', example: true })
  @IsBoolean()
  isFeatured: boolean;

  @ApiPropertyOptional({
    description: 'Featured until date (ISO format). If omitted, featured indefinitely.',
    example: '2025-06-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  featuredUntil?: string;
}
