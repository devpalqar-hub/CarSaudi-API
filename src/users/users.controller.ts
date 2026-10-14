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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

import { UpdateUserProfileSelfDto } from './dto/update-user-profile-self.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { RemoveDeviceTokenDto } from './dto/remove-device-token.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Patch('profile/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update my profile',
    description: 'Update the currently authenticated user profile.',
  })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Email or phone already in use' })
  updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() updateProfileDto: UpdateUserProfileSelfDto,
  ) {
    return this.usersService.update(userId, updateProfileDto);
  }

  // ─── Push Notifications (FCM device tokens) ─────────────────────────────────

  @Post('fcm-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Register (or refresh) this device's FCM push notification token",
    description:
      'Call this after login and whenever Firebase issues a new/refreshed token for the device ' +
      '(e.g. `onTokenRefresh`). Tokens are unique — registering a token already tied to another ' +
      'account re-assigns it to the current user (device logged into a different account).',
  })
  @ApiResponse({ status: 200, description: 'Device token registered' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  registerFcmToken(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.notificationsService.registerToken(
      userId,
      dto.token,
      dto.platform,
    );
  }

  @Delete('fcm-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Unregister this device's FCM push notification token",
    description:
      'Call this on logout so the device stops receiving push notifications for this account.',
  })
  @ApiResponse({ status: 200, description: 'Device token removed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  removeFcmToken(
    @CurrentUser('id') userId: string,
    @Body() dto: RemoveDeviceTokenDto,
  ) {
    return this.notificationsService.removeToken(userId, dto.token);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new user',
    description:
      'Creates a user. Either email or phone number must be provided.',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request — validation failed' })
  @ApiResponse({ status: 409, description: 'Email or phone already in use' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: List all users (paginated)',
    description:
      'Accessible by SUPER_ADMIN and MODERATOR only. Filter by `role`, `isActive`, or ' +
      '`search` (name/email/phone). Each row includes `listingsCount` — the total number of ' +
      'car listings that user has created.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of users' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  findAll(@Query() queryDto: QueryUserDto) {
    return this.usersService.findAll(queryDto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Get full user details by ID',
    description:
      'Accessible by SUPER_ADMIN and MODERATOR only. Returns contact info (email/phone), account ' +
      'status/role/auth provider, dealer profile summary (if the user is a DEALER), ' +
      '`listingsCount` (total car listings created), and `listings` — up to the 50 most recent ' +
      'car listings this user has created with their core details (status, price, model, location, views).',
  })
  @ApiParam({ name: 'id', description: 'User CUID', example: 'clxyz...' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a user',
    description: 'Partial update. Accessible by SUPER_ADMIN and MODERATOR.',
  })
  @ApiParam({ name: 'id', description: 'User CUID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Email or phone already in use' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Activate or deactivate a user',
    description:
      'Sets user isActive to true or false. Accessible by SUPER_ADMIN and MODERATOR.',
  })
  @ApiParam({ name: 'id', description: 'User CUID' })
  @ApiResponse({ status: 200, description: 'User status updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.usersService.updateStatus(id, dto.isActive);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Soft-delete a user (set isActive = false)',
    description: 'Accessible by SUPER_ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'User CUID' })
  @ApiResponse({ status: 200, description: 'User deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
