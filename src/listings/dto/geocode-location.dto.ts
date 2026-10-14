import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class GeocodeLocationDto {
  @ApiProperty({
    description: 'Location or area search text in Saudi Arabia',
    example: 'West Bay',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  location: string;
}
