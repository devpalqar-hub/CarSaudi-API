import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '@prisma/client';

export class AssignRoleDto {
  @ApiProperty({
    description: 'Role to assign to the user',
    enum: Role,
    example: Role.MODERATOR,
  })
  @IsNotEmpty()
  @IsEnum(Role)
  role: Role;
}
