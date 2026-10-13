import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({
    description:
      'Google ID Token obtained from the Google Sign-In SDK on the client side',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
