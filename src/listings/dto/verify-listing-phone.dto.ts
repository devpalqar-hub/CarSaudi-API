import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class CheckListingPhoneDto {
  @ApiProperty({
    description: 'Contact phone number to check verification status for',
    example: '+96612345678',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').trim() : value,
  )
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'Phone number must be in E.164 format (e.g. +96612345678)',
  })
  phone: string;
}

export class VerifyListingPhoneOtpDto {
  @ApiProperty({
    description: 'Contact phone number to verify',
    example: '+96612345678',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').trim() : value,
  )
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'Phone number must be in E.164 format (e.g. +96612345678)',
  })
  phone: string;

  @ApiProperty({
    description: '6-digit OTP code received via WhatsApp',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain only digits' })
  otp: string;
}
