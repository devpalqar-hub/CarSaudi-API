import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { DealerStaffPermission } from '@prisma/client';
import { CreateDealerStaffDto } from './create-dealer-staff.dto';

export class UpdateDealerStaffDto extends PartialType(
  OmitType(CreateDealerStaffDto, ['password', 'email'] as const),
) {
  @ApiPropertyOptional({
    enum: DealerStaffPermission,
    isArray: true,
    description: 'Replacement list of permissions (replaces existing set)',
    example: [DealerStaffPermission.PROPERTY_LISTINGS_VIEW],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(DealerStaffPermission, { each: true })
  permissions?: DealerStaffPermission[];

  @ApiPropertyOptional({
    description: 'Activate or deactivate the staff account',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
