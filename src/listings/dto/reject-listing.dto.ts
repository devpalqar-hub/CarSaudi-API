import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectListingDto {
  @ApiProperty({
    description:
      'Rejection reason message shown to the listing owner. Must clearly explain why the listing was rejected.',
    example:
      'Property images are low quality. Please resubmit with clear, well-lit photos of all rooms.',
    minLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, {
    message: 'Rejection message must be at least 10 characters',
  })
  message: string;
}
