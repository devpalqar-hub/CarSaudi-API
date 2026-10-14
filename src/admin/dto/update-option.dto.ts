import { PartialType } from '@nestjs/swagger';
import {
  CreateCarFeatureDto,
  CreateCarTypeDto,
  CreateCarTagDto,
  CreateCarModelDto,
  CreateCarBrandDto,
} from './create-option.dto';

export class UpdateCarFeatureDto extends PartialType(CreateCarFeatureDto) {}
export class UpdateCarTagDto extends PartialType(CreateCarTagDto) {}
export class UpdateCarTypeDto extends PartialType(CreateCarTypeDto) {}
export class UpdateCarModelDto extends PartialType(CreateCarModelDto) {}
export class UpdateCarBrandDto extends PartialType(CreateCarBrandDto) {}
