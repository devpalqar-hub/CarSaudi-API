import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AdditionalContactDto {
  @ApiPropertyOptional({ example: 'Sara Al-Ali' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '+97498765432' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'sara@pearlrealestate.qa' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Operations Manager' })
  @IsOptional()
  @IsString()
  designation?: string;
}

export class ApplyStep2Dto {
  @ApiPropertyOptional({
    description: 'Trade license number',
    example: '12345/2024',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tradeNumber?: string;

  @ApiPropertyOptional({
    description: 'RERA (Real Estate Regulatory Authority) certificate number',
    example: 'RERA-2024-67890',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reraNumber?: string;

  @ApiPropertyOptional({
    description: 'Business address',
    example: 'Office 12, Al Sadd Street',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Doha' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'Country',
    default: 'Qatar',
    example: 'Qatar',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description: 'Company website',
    example: 'https://www.pearlrealestate.qa',
  })
  @IsOptional()
  @IsUrl({}, { message: 'Website must be a valid URL' })
  website?: string;

  @ApiPropertyOptional({
    description: 'Brief description of the agency and its specializations',
    example:
      'Leading real estate agency specializing in luxury villas in Qatar.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Additional contact persons',
    type: [AdditionalContactDto],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalContactDto)
  additionalContacts?: AdditionalContactDto[];
}
