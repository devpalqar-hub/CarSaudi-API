import { PartialType } from '@nestjs/swagger';
import { ApplyDealerDto } from './apply-dealer.dto';

export class UpdateDealerDto extends PartialType(ApplyDealerDto) {}
