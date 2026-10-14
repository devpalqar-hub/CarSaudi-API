import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * DTO for dealer self-updating their own profile.
 * Fields like tradeNumber, reraNumber, and email changes are intentionally
 * excluded — those go through admin for security.
 */
export class UpdateDealerProfileSelfDto {
  @ApiPropertyOptional({
    description: 'Dealer agency display name',
    example: 'Pearl Real Estate',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dealerName?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+96655123456',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Short tagline for the agency',
    example: "Saudi Arabia's #1 trusted car dealership",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @ApiPropertyOptional({
    description: 'Cover/hero banner image URL (uploaded via MinIO)',
    example: 'https://cdn.example.com/covers/my-agency.jpg',
  })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({
    description: 'Agency logo / profile picture URL (uploaded via MinIO)',
    example: 'https://cdn.example.com/logos/my-agency.jpg',
  })
  @IsOptional()
  @IsString()
  logoImage?: string;

  @ApiPropertyOptional({
    description: 'Agency website URL',
    example: 'https://myagency.sa',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({
    description: 'Short agency description / bio',
    example: 'Specialising in luxury and premium vehicles across Saudi Arabia.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Office address',
    example: '12th Floor, West Bay Tower, Doha',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Doha' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({
    description: 'Facebook page/profile URL or handle',
    example: 'https://facebook.com/alfaisalmotors',
  })
  @IsOptional()
  @IsString()
  facebook?: string;

  @ApiPropertyOptional({
    description: 'YouTube channel URL or handle',
    example: 'https://youtube.com/@alfaisalmotors',
  })
  @IsOptional()
  @IsString()
  youtube?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp contact number or link',
    example: '+96612345678',
  })
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional({
    description: 'Instagram handle or profile URL',
    example: 'https://instagram.com/alfaisalmotors',
  })
  @IsOptional()
  @IsString()
  instagram?: string;
}
