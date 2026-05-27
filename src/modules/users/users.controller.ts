import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'List users with pagination, search and filtering' })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  async findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('export')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Export users to XLSX file' })
  @ApiResponse({
    status: 200,
    description: 'XLSX file download',
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
    },
  })
  async exportToXlsx(@Query() query: QueryUsersDto, @Res() res: Response) {
    const buffer = await this.usersService.exportToXlsx(query);

    const filename = `users_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Create a new user with specified roles' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email or phone conflict' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser('roles') creatorRoles: string[],
  ) {
    return this.usersService.create(dto, creatorRoles);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update own profile (any authenticated user)' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Update user by ID (admin)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/suspend')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({
    summary: 'Suspend user account (optionally temporary with suspendUntil)',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User suspended' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async suspend(
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.usersService.suspend(id, dto, adminId);
  }

  @Patch(':id/reactivate')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @ApiOperation({ summary: 'Reactivate suspended user account' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User reactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async reactivate(@Param('id') id: string) {
    return this.usersService.reactivate(id);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Permanently delete user (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.usersService.remove(id, adminId);
  }

  @Post(':id/reset-password')
  @Roles('SUPER_ADMIN', 'SECONDARY_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin reset user password' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Password reset with temporary password returned',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async resetPassword(@Param('id') id: string) {
    return this.usersService.resetPassword(id);
  }
}
