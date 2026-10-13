import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateSystemSettingDto {
  @ApiProperty({ description: 'The setting value', example: '100' })
  @IsString()
  @IsNotEmpty()
  value: string;
}
