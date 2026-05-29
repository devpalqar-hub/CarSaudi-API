import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsEmail } from 'class-validator';

export class ListingInquiryDto {
  @ApiProperty({ description: 'Inquiry message', example: 'Is this vehicle still available? I am interested.' })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ description: 'Contact phone number', example: '+966501234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Contact email', example: 'buyer@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
