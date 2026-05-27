import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, IsOptional, IsDateString } from 'class-validator';

export class SuspendUserDto {
  @ApiProperty({
    description: 'Reason for suspending the account',
    example: 'Violation of platform terms of service',
    maxLength: 500,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description:
      'Timestamp until which the account is suspended. If omitted, suspension is indefinite.',
    example: '2026-06-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  suspendUntil?: string;
}
