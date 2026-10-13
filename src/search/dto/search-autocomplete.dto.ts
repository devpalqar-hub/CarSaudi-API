import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SearchAutocompleteDto {
  @ApiProperty({
    description: 'Search query text',
    example: 'lusail',
  })
  @IsString()
  @MinLength(1)
  q: string;
}
