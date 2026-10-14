import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
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
