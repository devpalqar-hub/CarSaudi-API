import { Module } from '@nestjs/common';
import { DealersController } from './dealers.controller';
import { DealersService } from './dealers.service';
import { DealerStaffController } from './dealer-staff.controller';
import { DealerStaffService } from './dealer-staff.service';

@Module({
  controllers: [DealersController, DealerStaffController],
  providers: [DealersService, DealerStaffService],
  exports: [DealersService, DealerStaffService],
})
export class DealersModule {}
