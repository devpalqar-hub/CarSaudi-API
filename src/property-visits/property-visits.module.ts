import { Module } from '@nestjs/common';
import { PropertyVisitsController } from './property-visits.controller';
import { PropertyVisitsService } from './property-visits.service';

@Module({
  controllers: [PropertyVisitsController],
  providers: [PropertyVisitsService],
})
export class PropertyVisitsModule {}
