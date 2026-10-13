import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateBannerDto {
  @ApiProperty({
    required: false,
    description: 'Optional internal title for the banner',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ description: 'URL of the uploaded banner image' })
  @IsString()
  @IsUrl()
  imageUrl: string;

  @ApiProperty({
    required: false,
    description: 'Optional link when the banner is clicked',
  })
  @IsString()
  @IsUrl()
  @IsOptional()
  linkUrl?: string;

  @ApiProperty({
    required: false,
    default: 0,
    description: 'Position order for sorting',
  })
  @IsInt()
  @Type(() => Number)
  @IsOptional()
  position?: number;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Is the banner featured?',
  })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Is the banner active?',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false, description: 'Scheduled start date' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @ApiProperty({ required: false, description: 'Scheduled end date' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  endDate?: Date;
}
