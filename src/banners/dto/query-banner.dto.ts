import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class QueryBannerDto {
  @ApiProperty({ required: false, description: 'Filter by featured status' })
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  isFeatured?: boolean;

  @ApiProperty({ required: false, description: 'Search term for banner title' })
  @IsString()
  @IsOptional()
  search?: string;
}
