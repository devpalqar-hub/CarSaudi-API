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
  CreateCarFeatureDto,
  CreateCarTagDto,
  CreateCarTypeDto,
  CreateCarModelDto,
  CreateCarBrandDto,
} from './dto/create-option.dto';
import {
  UpdateCarFeatureDto,
  UpdateCarTagDto,
  UpdateCarTypeDto,
  UpdateCarModelDto,
  UpdateCarBrandDto,
} from './dto/update-option.dto';

@ApiTags('Admin Options')
@Controller('admin/options')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@ApiBearerAuth('JWT-auth')
export class OptionsController {
  constructor(private readonly optionsService: OptionsService) {}

  @Get('car-features')
  @ApiOperation({ summary: 'Get all car features' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for car feature title',
  })
  getCarFeatures(@Query('search') search?: string) {
    return this.optionsService.getCarFeatures(search);
  }

  @Post('car-features')
  @ApiOperation({ summary: 'Create a car feature' })
  createCarFeature(@Body() dto: CreateCarFeatureDto) {
    return this.optionsService.createCarFeature(dto);
  }

  @Patch('car-features/:id')
  @ApiOperation({ summary: 'Update a car feature' })
  updateCarFeature(@Param('id') id: string, @Body() dto: UpdateCarFeatureDto) {
    return this.optionsService.updateCarFeature(id, dto);
  }

  @Delete('car-features/:id')
  @ApiOperation({ summary: 'Delete a car feature' })
  deleteCarFeature(@Param('id') id: string) {
    return this.optionsService.deleteCarFeature(id);
  }

  @Get('car-tags')
  @ApiOperation({ summary: 'Get all car tags' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for car tag title',
  })
  getCarTags(@Query('search') search?: string) {
    return this.optionsService.getCarTags(search);
  }

  @Post('car-tags')
  @ApiOperation({ summary: 'Create a car tag' })
  createCarTag(@Body() dto: CreateCarTagDto) {
    return this.optionsService.createCarTag(dto);
  }

  @Patch('car-tags/:id')
  @ApiOperation({ summary: 'Update a car tag' })
  updateCarTag(@Param('id') id: string, @Body() dto: UpdateCarTagDto) {
    return this.optionsService.updateCarTag(id, dto);
  }

  @Delete('car-tags/:id')
  @ApiOperation({ summary: 'Delete a car tag' })
  deleteCarTag(@Param('id') id: string) {
    return this.optionsService.deleteCarTag(id);
  }

  @Get('car-types')
  @ApiOperation({ summary: 'Get all car types (body styles)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for car type title',
  })
  getCarTypes(@Query('search') search?: string) {
    return this.optionsService.getCarTypes(search);
  }

  @Post('car-types')
  @ApiOperation({ summary: 'Create a car type' })
  createCarType(@Body() dto: CreateCarTypeDto) {
    return this.optionsService.createCarType(dto);
  }

  @Patch('car-types/:id')
  @ApiOperation({ summary: 'Update a car type' })
  updateCarType(@Param('id') id: string, @Body() dto: UpdateCarTypeDto) {
    return this.optionsService.updateCarType(id, dto);
  }

  @Delete('car-types/:id')
  @ApiOperation({ summary: 'Delete a car type' })
  deleteCarType(@Param('id') id: string) {
    return this.optionsService.deleteCarType(id);
  }

  @Get('car-models')
  @ApiOperation({ summary: 'Get all car models' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for car model title',
  })
  getCarModels(@Query('search') search?: string) {
    return this.optionsService.getCarModels(search);
  }

  @Post('car-models')
  @ApiOperation({ summary: 'Create a car model' })
  createCarModel(@Body() dto: CreateCarModelDto) {
    return this.optionsService.createCarModel(dto);
  }

  @Patch('car-models/:id')
  @ApiOperation({ summary: 'Update a car model' })
  updateCarModel(@Param('id') id: string, @Body() dto: UpdateCarModelDto) {
    return this.optionsService.updateCarModel(id, dto);
  }

  @Delete('car-models/:id')
  @ApiOperation({ summary: 'Delete a car model' })
  deleteCarModel(@Param('id') id: string) {
    return this.optionsService.deleteCarModel(id);
  }

  @Get('car-brands')
  @ApiOperation({ summary: 'Get all car brands' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for car brand name',
  })
  getCarBrands(@Query('search') search?: string) {
    return this.optionsService.getCarBrands(search);
  }

  @Post('car-brands')
  @ApiOperation({ summary: 'Create a car brand' })
  createCarBrand(@Body() dto: CreateCarBrandDto) {
    return this.optionsService.createCarBrand(dto);
  }

  @Patch('car-brands/:id')
  @ApiOperation({ summary: 'Update a car brand' })
  updateCarBrand(@Param('id') id: string, @Body() dto: UpdateCarBrandDto) {
    return this.optionsService.updateCarBrand(id, dto);
  }

  @Delete('car-brands/:id')
  @ApiOperation({ summary: 'Delete a car brand' })
  deleteCarBrand(@Param('id') id: string) {
    return this.optionsService.deleteCarBrand(id);
  }
}
