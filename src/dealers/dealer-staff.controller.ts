import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DealerStaffPermission, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DealerStaffService } from './dealer-staff.service';
import { CreateDealerStaffDto } from './dto/create-dealer-staff.dto';
import { UpdateDealerStaffDto } from './dto/update-dealer-staff.dto';

@ApiTags('Dealer Staff')
@Controller('dealer-staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class DealerStaffController {
  constructor(private readonly dealerStaffService: DealerStaffService) {}

  @Post()
  @Roles(UserRole.DEALER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[Dealer] Create a new staff member',
    description: 'Creates a new staff account and assigns permissions.',
  })
  @ApiResponse({ status: 201, description: 'Staff member created' })
  @ApiResponse({ status: 409, description: 'Email or phone already in use' })
  create(
    @CurrentUser('id') dealerUserId: string,
    @Body() dto: CreateDealerStaffDto,
  ) {
    return this.dealerStaffService.create(dealerUserId, dto);
  }

  @Get()
  @Roles(UserRole.DEALER)
  @ApiOperation({ summary: '[Dealer] List all staff members' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @CurrentUser('id') dealerUserId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
  ) {
    return this.dealerStaffService.findAll(dealerUserId, +page, +limit, search);
  }

  @Get('my-profile')
  @Roles(UserRole.DEALER_STAFF)
  @ApiOperation({
    summary: '[Dealer Staff] Get own profile and permissions',
  })
  getMyProfile(@CurrentUser('id') staffUserId: string) {
    return this.dealerStaffService.getMyProfile(staffUserId);
  }

  @Get(':id')
  @Roles(UserRole.DEALER)
  @ApiOperation({ summary: '[Dealer] Get details of a specific staff member' })
  @ApiParam({
    name: 'id',
    description: 'Staff member ID (DealerStaff record ID)',
  })
  findOne(@CurrentUser('id') dealerUserId: string, @Param('id') id: string) {
    return this.dealerStaffService.findOne(dealerUserId, id);
  }

  @Patch(':id')
  @Roles(UserRole.DEALER)
  @ApiOperation({
    summary: '[Dealer] Update staff member profile or permissions',
  })
  @ApiParam({ name: 'id', description: 'Staff member ID' })
  update(
    @CurrentUser('id') dealerUserId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDealerStaffDto,
  ) {
    return this.dealerStaffService.update(dealerUserId, id, dto);
  }

  @Patch(':id/permissions')
  @Roles(UserRole.DEALER)
  @ApiOperation({ summary: '[Dealer] Replace permissions for a staff member' })
  @ApiParam({ name: 'id', description: 'Staff member ID' })
  updatePermissions(
    @CurrentUser('id') dealerUserId: string,
    @Param('id') id: string,
    @Body('permissions') permissions: DealerStaffPermission[],
  ) {
    return this.dealerStaffService.updatePermissions(
      dealerUserId,
      id,
      permissions,
    );
  }

  @Delete(':id')
  @Roles(UserRole.DEALER)
  @ApiOperation({
    summary: '[Dealer] Deactivate a staff member',
  })
  @ApiParam({ name: 'id', description: 'Staff member ID' })
  remove(@CurrentUser('id') dealerUserId: string, @Param('id') id: string) {
    return this.dealerStaffService.remove(dealerUserId, id);
  }
}
