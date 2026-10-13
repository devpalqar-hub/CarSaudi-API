import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MakePaymentDto {
  @ApiProperty({
    description:
      'CUID of the listing sitting in PENDING_PAYMENT that needs to be paid for',
    example: 'clxyz123abc',
  })
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @ApiPropertyOptional({
    description:
      'Where to redirect after a successful payment (web/deep-link). ' +
      '`?session_id={CHECKOUT_SESSION_ID}` is appended automatically. ' +
      'Falls back to `FRONTEND_URL/dealer/listings/success` when omitted.',
    example: 'villasqatar://listings/payment-success',
  })
  @IsOptional()
  @IsString()
  successUrl?: string;

  @ApiPropertyOptional({
    description:
      'Where to redirect if the payment is cancelled/fails (web/deep-link). ' +
      'Falls back to `FRONTEND_URL/dealer/listings/cancel` when omitted.',
    example: 'villasqatar://listings/payment-failed',
  })
  @IsOptional()
  @IsString()
  failedUrl?: string;
}
