import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'User email address or phone number',
    examples: {
      email: { value: 'john.doe@example.com' },
      phone: { value: '+96612345678' },
    },
    example: 'john.doe@example.com',
  })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({
    description: 'User password',
    example: 'StrongPass@123',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
