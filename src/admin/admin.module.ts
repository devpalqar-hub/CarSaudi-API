import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { OptionsController } from './options.controller';
import { OptionsService } from './options.service';
@Module({
  controllers: [AdminController, OptionsController],
  providers: [AdminService, OptionsService],
  exports: [AdminService],
})
export class AdminModule {}
