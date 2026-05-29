import { Module } from '@nestjs/common';
import { DealersController } from './dealers.controller';
import { DealersAdminController } from './dealers-admin.controller';
import { DealersService } from './dealers.service';

@Module({
  controllers: [DealersController, DealersAdminController],
  providers: [DealersService],
  exports: [DealersService],
})
export class DealersModule {}
