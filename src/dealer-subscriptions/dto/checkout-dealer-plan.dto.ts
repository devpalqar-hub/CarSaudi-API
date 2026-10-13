import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CheckoutDealerPlanDto {
  @ApiProperty({
    description: 'The dealer subscription plan ID to purchase',
    example: 'clxyz5678',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;
}
