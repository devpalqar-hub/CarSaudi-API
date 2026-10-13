import { PartialType } from '@nestjs/swagger';
import {
  CreateAmenityDto,
  CreateFurnishingOptionDto,
  CreateNearbyTagDto,
  CreateListingTypeOptionDto,
  CreateMunicipalityDto,
} from './create-option.dto';

export class UpdateAmenityDto extends PartialType(CreateAmenityDto) {}
export class UpdateNearbyTagDto extends PartialType(CreateNearbyTagDto) {}
export class UpdateFurnishingOptionDto extends PartialType(
  CreateFurnishingOptionDto,
) {}
export class UpdateListingTypeOptionDto extends PartialType(
  CreateListingTypeOptionDto,
) {}
export class UpdateMunicipalityDto extends PartialType(CreateMunicipalityDto) {}
