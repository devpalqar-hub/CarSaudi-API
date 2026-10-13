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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { HeroBannersService } from './hero-banners.service';
import { CreateHeroBannerDto } from './dto/create-hero-banner.dto';
import { UpdateHeroBannerDto } from './dto/update-hero-banner.dto';

@ApiTags('Hero Banners')
@Controller('hero-banners')
export class HeroBannersController {
  constructor(private readonly heroBannersService: HeroBannersService) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get all hero banners (public)',
    description: 'Returns all hero banners, sorted by newest first.',
  })
  @ApiResponse({ status: 200, description: 'List of hero banners returned' })
  findAll() {
    return this.heroBannersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get hero banner by ID (public)' })
  @ApiParam({
    name: 'id',
    description: 'Hero banner CUID',
    example: 'clxyz123',
  })
  @ApiResponse({ status: 200, description: 'Hero banner details returned' })
  @ApiResponse({ status: 404, description: 'Hero banner not found' })
  findOne(@Param('id') id: string) {
    return this.heroBannersService.findOne(id);
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Admin: Create a new hero banner',
    description:
      'Creates a new hero banner. `webImageUrl` is required; ' +
      'all other fields (`mobileImageUrl`, `title`, `arabicTitle`, `subtitle`, `description`, `arabicHeroText`, `actionUrl`, `actionButtonName`) are optional. ' +
      '**Requires**: SUPER_ADMIN or MODERATOR role.',
  })
  @ApiBody({ type: CreateHeroBannerDto })
  @ApiResponse({ status: 201, description: 'Hero banner created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  create(@Body() createHeroBannerDto: CreateHeroBannerDto) {
    return this.heroBannersService.create(createHeroBannerDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Update a hero banner',
    description:
      'Partially updates a hero banner. All fields are optional. ' +
      '**Requires**: SUPER_ADMIN or MODERATOR role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Hero banner CUID',
    example: 'clxyz123',
  })
  @ApiBody({ type: UpdateHeroBannerDto })
  @ApiResponse({ status: 200, description: 'Hero banner updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'Hero banner not found' })
  update(
    @Param('id') id: string,
    @Body() updateHeroBannerDto: UpdateHeroBannerDto,
  ) {
    return this.heroBannersService.update(id, updateHeroBannerDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin: Delete a hero banner',
    description:
      'Permanently deletes a hero banner. This action cannot be undone. ' +
      '**Requires**: SUPER_ADMIN or MODERATOR role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Hero banner CUID',
    example: 'clxyz123',
  })
  @ApiResponse({ status: 200, description: 'Hero banner deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'Hero banner not found' })
  remove(@Param('id') id: string) {
    return this.heroBannersService.remove(id);
  }
}
