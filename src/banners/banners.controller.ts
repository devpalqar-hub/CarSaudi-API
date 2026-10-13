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
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { QueryBannerDto } from './dto/query-banner.dto';

@ApiTags('Banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get active banners (public)',
    description:
      'Returns all active banners visible to end-users. ' +
      'Only banners with `isActive = true` are returned. ' +
      'Banners with a `startDate` or `endDate` set are automatically hidden outside that window. ' +
      'Results are sorted by `position` ascending. ' +
      'Use `isFeatured=true` to fetch featured-only banners.',
  })
  @ApiQuery({
    name: 'isFeatured',
    required: false,
    type: Boolean,
    description: 'Filter to return only featured banners',
    example: true,
  })
  @ApiResponse({ status: 200, description: 'List of active banners returned' })
  findAllPublic(@Query() query: QueryBannerDto) {
    return this.bannersService.findAllPublic(query);
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Admin: Create a new banner',
    description:
      'Creates a new promotional banner. ' +
      'Set `isFeatured = true` to highlight it as a featured banner. ' +
      'Use `startDate` and `endDate` for scheduled banners — they will only appear to public users within that date range. ' +
      'Set `position` to control display ordering (lower values appear first). ' +
      '**Requires**: SUPER_ADMIN or MODERATOR role.',
  })
  @ApiBody({ type: CreateBannerDto })
  @ApiResponse({ status: 201, description: 'Banner created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  create(@Body() createBannerDto: CreateBannerDto) {
    return this.bannersService.create(createBannerDto);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: List all banners',
    description:
      'Returns **all** banners regardless of active status, date range, or featured flag. ' +
      'Sorted by `position` ascending, then `createdAt` descending. ' +
      '**Requires**: SUPER_ADMIN or MODERATOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Full list of banners (all statuses)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for banner title',
  })
  findAllAdmin(@Query('search') search?: string) {
    return this.bannersService.findAllAdmin(search);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Get banner by ID',
    description:
      'Fetches a single banner by its CUID. ' +
      '**Requires**: SUPER_ADMIN or MODERATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Banner CUID', example: 'clxyz123' })
  @ApiResponse({ status: 200, description: 'Banner details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  findOne(@Param('id') id: string) {
    return this.bannersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Update a banner',
    description:
      'Partially updates a banner. All fields are optional. ' +
      'Toggle `isActive` to enable/disable a banner without deleting it. ' +
      'Toggle `isFeatured` to promote or demote a banner. ' +
      '**Requires**: SUPER_ADMIN or MODERATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Banner CUID', example: 'clxyz123' })
  @ApiBody({ type: UpdateBannerDto })
  @ApiResponse({ status: 200, description: 'Banner updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  update(@Param('id') id: string, @Body() updateBannerDto: UpdateBannerDto) {
    return this.bannersService.update(id, updateBannerDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Delete a banner',
    description:
      'Permanently deletes a banner. This action cannot be undone. ' +
      'Consider using `PATCH /:id` with `isActive = false` to disable a banner instead. ' +
      '**Requires**: SUPER_ADMIN or MODERATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Banner CUID', example: 'clxyz123' })
  @ApiResponse({ status: 200, description: 'Banner deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  remove(@Param('id') id: string) {
    return this.bannersService.remove(id);
  }
}
