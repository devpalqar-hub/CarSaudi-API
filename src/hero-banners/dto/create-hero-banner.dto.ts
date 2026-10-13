import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateHeroBannerDto {
  @ApiProperty({
    required: false,
    description: 'URL of the hero banner image for mobile viewports',
  })
  @IsString()
  @IsUrl()
  @IsOptional()
  mobileImageUrl?: string;

  @ApiProperty({
    description: 'URL of the hero banner image for web viewports',
  })
  @IsString()
  @IsUrl()
  webImageUrl: string;

  @ApiProperty({ required: false, description: 'Title text' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ required: false, description: 'Arabic Title text' })
  @IsString()
  @IsOptional()
  arabicTitle?: string;

  @ApiProperty({ required: false, description: 'Subtitle text' })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiProperty({ required: false, description: 'Description text' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, description: 'Arabic Hero text' })
  @IsString()
  @IsOptional()
  arabicHeroText?: string;

  @ApiProperty({
    required: false,
    description: 'URL the action button links to',
  })
  @IsString()
  @IsUrl()
  @IsOptional()
  actionUrl?: string;

  @ApiProperty({
    required: false,
    description: 'Label shown on the action button',
  })
  @IsString()
  @IsOptional()
  actionButtonName?: string;
}
