import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinConversationDto {
  @ApiProperty({ description: 'ID of the property listing to chat about' })
  @IsString()
  @IsNotEmpty()
  listingId: string;
}
