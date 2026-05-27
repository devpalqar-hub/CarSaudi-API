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
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'List all available roles' })
  @ApiResponse({ status: 200, description: 'List of roles' })
  getAllRoles() {
    return this.rolesService.getAllRoles();
  }

  @Patch('assign/:userId')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Assign roles to a user (Super Admin only)' })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiResponse({ status: 200, description: 'Roles assigned successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async assignRole(
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser('id') adminId: string,
    @CurrentUser('roles') adminRoles: string[],
  ) {
    return this.rolesService.assignRole(userId, dto, adminId, adminRoles);
  }
}
