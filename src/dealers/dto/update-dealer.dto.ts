import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDealerDto } from './create-dealer.dto';

// Updating a dealer doesn't require changing the password via this endpoint
export class UpdateDealerDto extends PartialType(
  OmitType(CreateDealerDto, ['password'] as const),
) {}
