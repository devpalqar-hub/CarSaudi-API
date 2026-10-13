import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RemoveDeviceTokenDto {
  @ApiProperty({
    description: 'The FCM device token to unregister',
    example: 'dEabc123XyZ:APA91bF...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
