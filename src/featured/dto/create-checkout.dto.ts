import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({
    description: 'The listing ID to feature',
    example: 'clxyz123abc',
  })
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @ApiProperty({
    description: 'The featured plan ID to subscribe to',
    example: 'clxyz456def',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiPropertyOptional({
    description:
      'Where to redirect after a successful payment (web/deep-link). ' +
      '`{CHECKOUT_SESSION_ID}` is appended as a `session_id` query param automatically. ' +
      'Falls back to `FRONTEND_URL/featured/success` when omitted.',
    example: 'villasqatar://featured/success',
  })
  @IsOptional()
  @IsString()
  successUrl?: string;

  @ApiPropertyOptional({
    description:
      'Where to redirect if the payment is cancelled/fails (web/deep-link). ' +
      'Falls back to `FRONTEND_URL/featured/cancel` when omitted.',
    example: 'villasqatar://featured/failed',
  })
  @IsOptional()
  @IsString()
  failedUrl?: string;
}
