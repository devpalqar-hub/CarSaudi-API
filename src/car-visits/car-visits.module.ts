import { Module } from '@nestjs/common';
import { CarVisitsController } from './car-visits.controller';
import { CarVisitsService } from './car-visits.service';

@Module({
  controllers: [CarVisitsController],
  providers: [CarVisitsService],
})
export class CarVisitsModule {}
