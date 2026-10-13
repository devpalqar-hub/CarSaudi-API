import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectApplicationDto {
  @ApiProperty({
    description:
      'Rejection message sent to the dealer in the email and shown on their dashboard',
    example:
      'Your trade license document is blurry. Please resubmit a clear scan of the original document.',
    minLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, {
    message: 'Please provide a detailed rejection reason (min 10 characters)',
  })
  message: string;
}
