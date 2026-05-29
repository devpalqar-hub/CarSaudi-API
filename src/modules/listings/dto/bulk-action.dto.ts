import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize, ArrayMaxSize, IsOptional, MaxLength } from 'class-validator';

export class BulkActionDto {
  @ApiProperty({
    description: 'Array of listing IDs to perform bulk action on',
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  ids: string[];

  @ApiPropertyOptional({ description: 'Reason (required for bulk rejection)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
