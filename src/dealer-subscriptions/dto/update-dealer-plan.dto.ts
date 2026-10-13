import { PartialType } from '@nestjs/swagger';
import { CreateDealerPlanDto } from './create-dealer-plan.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateDealerPlanDto extends PartialType(CreateDealerPlanDto) {
  @ApiPropertyOptional({
    description: 'Set to false to deactivate the plan',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
