import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AppleAuthDto {
  @ApiProperty({
    description:
      'Apple Identity Token (identityToken) from Apple Sign-In SDK on the client side',
    example: 'eyJraWQiOiJBSURPUEsxIiwiYWxnIjoiUlMyNTYifQ...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({
    description:
      'First name from Apple (only provided on the FIRST sign-in — store it permanently)',
    example: 'John',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    description:
      'Last name from Apple (only provided on the FIRST sign-in — store it permanently)',
    example: 'Doe',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Email from Apple (may be a relay address)',
    example: 'john@privaterelay.appleid.com',
  })
  @IsOptional()
  @IsString()
  email?: string;
}
