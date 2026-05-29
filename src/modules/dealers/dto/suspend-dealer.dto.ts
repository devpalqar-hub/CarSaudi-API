import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class SuspendDealerDto {
  @ApiProperty({
    description: 'Reason for suspending the dealer account',
    example: 'Multiple policy violations reported',
  })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
