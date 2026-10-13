import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    description: 'Set user active (true) or inactive (false)',
    example: false,
  })
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}
