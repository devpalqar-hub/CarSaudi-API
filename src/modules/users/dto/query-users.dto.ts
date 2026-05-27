import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { AccountStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryUsersDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by role name (e.g. SUPER_ADMIN, USER)',
    example: 'USER',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: 'Filter by account status',
    enum: AccountStatus,
  })
  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @ApiPropertyOptional({
    description: 'Filter by verification status',
    example: 'true',
  })
  @IsOptional()
  @IsString()
  isVerified?: string;
}
