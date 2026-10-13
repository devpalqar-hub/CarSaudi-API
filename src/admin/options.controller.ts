import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OptionsService } from './options.service';
import { ApiQuery } from '@nestjs/swagger';
import {
  CreateAmenityDto,
  CreateNearbyTagDto,
  CreateFurnishingOptionDto,
  CreateListingTypeOptionDto,
  CreateMunicipalityDto,
} from './dto/create-option.dto';
import {
  UpdateAmenityDto,
  UpdateNearbyTagDto,
  UpdateFurnishingOptionDto,
  UpdateListingTypeOptionDto,
  UpdateMunicipalityDto,
} from './dto/update-option.dto';

@ApiTags('Admin Options')
@Controller('admin/options')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@ApiBearerAuth('JWT-auth')
export class OptionsController {
  constructor(private readonly optionsService: OptionsService) {}

  @Get('amenities')
  @ApiOperation({ summary: 'Get all amenities' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for amenity title',
  })
  getAmenities(@Query('search') search?: string) {
    return this.optionsService.getAmenities(search);
  }

  @Post('amenities')
  @ApiOperation({ summary: 'Create an amenity' })
  createAmenity(@Body() dto: CreateAmenityDto) {
    return this.optionsService.createAmenity(dto);
  }

  @Patch('amenities/:id')
  @ApiOperation({ summary: 'Update an amenity' })
  updateAmenity(@Param('id') id: string, @Body() dto: UpdateAmenityDto) {
    return this.optionsService.updateAmenity(id, dto);
  }

  @Delete('amenities/:id')
  @ApiOperation({ summary: 'Delete an amenity' })
  deleteAmenity(@Param('id') id: string) {
    return this.optionsService.deleteAmenity(id);
  }

  @Get('nearby-tags')
  @ApiOperation({ summary: 'Get all nearby tags' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for nearby tag title',
  })
  getNearbyTags(@Query('search') search?: string) {
    return this.optionsService.getNearbyTags(search);
  }

  @Post('nearby-tags')
  @ApiOperation({ summary: 'Create a nearby tag' })
  createNearbyTag(@Body() dto: CreateNearbyTagDto) {
    return this.optionsService.createNearbyTag(dto);
  }

  @Patch('nearby-tags/:id')
  @ApiOperation({ summary: 'Update a nearby tag' })
  updateNearbyTag(@Param('id') id: string, @Body() dto: UpdateNearbyTagDto) {
    return this.optionsService.updateNearbyTag(id, dto);
  }

  @Delete('nearby-tags/:id')
  @ApiOperation({ summary: 'Delete a nearby tag' })
  deleteNearbyTag(@Param('id') id: string) {
    return this.optionsService.deleteNearbyTag(id);
  }

  @Get('furnishing')
  @ApiOperation({ summary: 'Get all furnishing options' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for furnishing option title',
  })
  getFurnishingOptions(@Query('search') search?: string) {
    return this.optionsService.getFurnishingOptions(search);
  }

  @Post('furnishing')
  @ApiOperation({ summary: 'Create a furnishing option' })
  createFurnishingOption(@Body() dto: CreateFurnishingOptionDto) {
    return this.optionsService.createFurnishingOption(dto);
  }

  @Patch('furnishing/:id')
  @ApiOperation({ summary: 'Update a furnishing option' })
  updateFurnishingOption(
    @Param('id') id: string,
    @Body() dto: UpdateFurnishingOptionDto,
  ) {
    return this.optionsService.updateFurnishingOption(id, dto);
  }

  @Delete('furnishing/:id')
  @ApiOperation({ summary: 'Delete a furnishing option' })
  deleteFurnishingOption(@Param('id') id: string) {
    return this.optionsService.deleteFurnishingOption(id);
  }

  @Get('listing-types')
  @ApiOperation({ summary: 'Get all listing types' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for listing type title',
  })
  getListingTypes(@Query('search') search?: string) {
    return this.optionsService.getListingTypes(search);
  }

  @Post('listing-types')
  @ApiOperation({ summary: 'Create a listing type' })
  createListingType(@Body() dto: CreateListingTypeOptionDto) {
    return this.optionsService.createListingType(dto);
  }

  @Patch('listing-types/:id')
  @ApiOperation({ summary: 'Update a listing type' })
  updateListingType(
    @Param('id') id: string,
    @Body() dto: UpdateListingTypeOptionDto,
  ) {
    return this.optionsService.updateListingType(id, dto);
  }

  @Delete('listing-types/:id')
  @ApiOperation({ summary: 'Delete a listing type' })
  deleteListingType(@Param('id') id: string) {
    return this.optionsService.deleteListingType(id);
  }

  @Get('municipalities')
  @ApiOperation({ summary: 'Get all municipalities' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for municipality name',
  })
  getMunicipalities(@Query('search') search?: string) {
    return this.optionsService.getMunicipalities(search);
  }

  @Post('municipalities')
  @ApiOperation({ summary: 'Create a municipality' })
  createMunicipality(@Body() dto: CreateMunicipalityDto) {
    return this.optionsService.createMunicipality(dto);
  }

  @Patch('municipalities/:id')
  @ApiOperation({ summary: 'Update a municipality' })
  updateMunicipality(
    @Param('id') id: string,
    @Body() dto: UpdateMunicipalityDto,
  ) {
    return this.optionsService.updateMunicipality(id, dto);
  }

  @Delete('municipalities/:id')
  @ApiOperation({ summary: 'Delete a municipality' })
  deleteMunicipality(@Param('id') id: string) {
    return this.optionsService.deleteMunicipality(id);
  }
}
