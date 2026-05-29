import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FlagStatus } from '@prisma/client';

export class ModerateFlagDto {
  @ApiProperty({
    description: 'New flag status',
    enum: [FlagStatus.RESOLVED, FlagStatus.DISMISSED],
  })
  @IsEnum(FlagStatus)
  status: FlagStatus;

  @ApiPropertyOptional({ description: 'Moderator note / reason for decision' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  moderatorNote?: string;
}
