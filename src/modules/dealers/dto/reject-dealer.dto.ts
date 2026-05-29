import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RejectDealerDto {
  @ApiProperty({
    description: 'Reason for rejecting the dealer application',
    example: 'Trade license document could not be verified',
  })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
