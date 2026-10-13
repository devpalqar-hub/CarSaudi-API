import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FirebaseAuthDto {
  @ApiProperty({
    description:
      'Firebase ID Token obtained after the client signs in via Firebase Authentication ' +
      '(any provider — Google, Apple, etc.). The provider is auto-detected from the token, ' +
      'so this one endpoint works regardless of which social provider the user picked.',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ii4uLiJ9...',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({
    description:
      'First name (Apple only provides this via Firebase on the FIRST sign-in — forward it ' +
      "from the native SDK response so it isn't lost). Ignored for other providers.",
    example: 'John',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    description:
      'Last name (Apple only provides this on the FIRST sign-in). Ignored for other providers.',
    example: 'Doe',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    description:
      'Email fallback if not present in the Firebase token (e.g. Apple private relay on first sign-in).',
    example: 'john@privaterelay.appleid.com',
  })
  @IsOptional()
  @IsString()
  email?: string;
}
