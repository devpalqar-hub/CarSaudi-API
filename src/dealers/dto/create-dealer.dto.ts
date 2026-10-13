import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDealerDto {
  @ApiProperty({
    description: 'Contact person full name',
    example: 'Ahmed Al-Mansouri',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Business email (used for login)',
    example: 'ahmed@pearlrealestate.qa',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Login password (min 8 chars, 1 uppercase, 1 number)',
    example: 'Dealer@Pass1',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*[0-9])/, {
    message:
      'Password must contain at least one uppercase letter and one number',
  })
  password: string;

  @ApiProperty({
    description: 'Business / agency name',
    example: 'Pearl Real Estate LLC',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  dealerName: string;

  @ApiPropertyOptional({
    description: 'Contact phone in E.164 format',
    example: '+97412345678',
  })
  @IsOptional()
  @Matches(/^\+?[1-9]\d{6,14}$/)
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Trade license number',
    example: '12345/2024',
  })
  @IsOptional()
  @IsString()
  tradeNumber?: string;

  @ApiPropertyOptional({
    description: 'RERA certificate number',
    example: 'RERA-2024-67890',
  })
  @IsOptional()
  @IsString()
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
    description: 'Website',
    example: 'https://pearlrealestate.qa',
  })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ description: 'Brief description of the agency' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Facebook page/profile URL or handle',
    example: 'https://facebook.com/pearlrealestate',
  })
  @IsOptional()
  @IsString()
  facebook?: string;

  @ApiPropertyOptional({
    description: 'YouTube channel URL or handle',
    example: 'https://youtube.com/@pearlrealestate',
  })
  @IsOptional()
  @IsString()
  youtube?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp contact number or link',
    example: '+97412345678',
  })
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional({
    description: 'Instagram handle or profile URL',
    example: 'https://instagram.com/pearlrealestate',
  })
  @IsOptional()
  @IsString()
  instagram?: string;
}
