import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RolesService } from './roles.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.SECONDARY_ADMIN)
  @ApiOperation({ summary: 'List all available roles with descriptions' })
  @ApiResponse({ status: 200, description: 'List of roles with permissions' })
  getAllRoles() {
    return this.rolesService.getAllRoles();
  }

  @Patch('assign/:userId')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign or change user role (Super Admin only)' })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiResponse({ status: 200, description: 'Role assigned successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async assignRole(
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser('id') adminId: string,
    @CurrentUser('role') adminRole: Role,
  ) {
    return this.rolesService.assignRole(userId, dto, adminId, adminRole);
  }
}
