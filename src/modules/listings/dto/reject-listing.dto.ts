import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RejectListingDto {
  @ApiProperty({ description: 'Reason for rejecting the listing', example: 'Incomplete vehicle information' })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
