import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
