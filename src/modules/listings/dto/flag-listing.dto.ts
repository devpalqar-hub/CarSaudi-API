import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FlagReason } from '@prisma/client';

export class FlagListingDto {
  @ApiProperty({ description: 'Reason for flagging', enum: FlagReason })
  @IsEnum(FlagReason)
  reason: FlagReason;

  @ApiPropertyOptional({ description: 'Additional details about the flag' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
