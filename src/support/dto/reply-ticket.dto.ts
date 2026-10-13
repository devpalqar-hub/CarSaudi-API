import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplyTicketDto {
  @ApiProperty({
    description: 'Reply message to send to the ticket submitter',
    example:
      'Thank you for reaching out. We have reviewed the listing and taken action.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}
