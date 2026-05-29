import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ApplyDealerDto {
  @ApiProperty({ description: 'Company / dealership name', example: 'Al Jazirah Vehicles' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  companyName: string;

  @ApiPropertyOptional({ description: 'Trade / commercial license number', example: 'CR-1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tradeLicenseNumber?: string;

  @ApiPropertyOptional({ description: 'URL to trade license document/image' })
  @IsOptional()
  @IsString()
  tradeLicenseUrl?: string;

  @ApiPropertyOptional({ description: 'Business contact email', example: 'info@aljazirah.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Business contact phone', example: '+966112345678' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Business address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Riyadh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'Region / Province', example: 'Riyadh Region' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ description: 'Business description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Company logo URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Company website URL', example: 'https://aljazirah.com' })
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;
}
