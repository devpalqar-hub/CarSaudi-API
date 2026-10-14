import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ApplyStep1Dto {
  @ApiProperty({
    description: 'Business / agency name',
    example: 'Pearl Real Estate LLC',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  dealerName: string;

  @ApiProperty({
    description: 'Primary contact person full name',
    example: 'Ahmed Al-Mansouri',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  contactName: string;

  @ApiProperty({
    description: 'Business email address',
    example: 'ahmed@alfaisalmotors.sa',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Contact phone number in E.164 format',
    example: '+96612345678',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'Phone must be in E.164 format (e.g. +96612345678)',
  })
  phone: string;
}
