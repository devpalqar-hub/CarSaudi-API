import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';

export class SendMessageDto {
  @ApiProperty({ description: 'Conversation ID to send message into' })
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @ApiProperty({ enum: MessageType, description: 'Type of message' })
  @IsEnum(MessageType)
  type: MessageType;

  // ── TEXT ──────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Text body (required for TEXT type)' })
  @ValidateIf((o) => o.type === MessageType.TEXT)
  @IsString()
  @IsNotEmpty()
  content?: string;

  // ── IMAGE ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'MinIO media URL (required for IMAGE type)',
  })
  @ValidateIf((o) => o.type === MessageType.IMAGE)
  @IsString()
  @IsNotEmpty()
  mediaUrl?: string;

  // ── LOCATION ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Latitude (required for LOCATION type)' })
  @ValidateIf((o) => o.type === MessageType.LOCATION)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude (required for LOCATION type)',
  })
  @ValidateIf((o) => o.type === MessageType.LOCATION)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Human-readable location label (optional for LOCATION type)',
  })
  @IsOptional()
  @IsString()
  locationLabel?: string;
}
