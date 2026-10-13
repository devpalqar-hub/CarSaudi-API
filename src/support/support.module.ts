import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SharedModule } from '../shared/shared.module';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { SupportAdminController } from './support-admin.controller';

@Module({
  imports: [PrismaModule, SharedModule],
  providers: [SupportService],
  controllers: [SupportController, SupportAdminController],
  exports: [SupportService],
})
export class SupportModule {}
