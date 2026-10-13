import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicesModule } from '../invoices/invoices.module';
import {
  DealerSubscriptionPlansController,
  DealerSubscriptionsController,
} from './dealer-subscriptions.controller';
import {
  DealerSubscriptionPlansAdminController,
  DealerSubscriptionsAdminController,
} from './dealer-subscriptions-admin.controller';
import { DealerSubscriptionsService } from './dealer-subscriptions.service';

@Module({
  imports: [PrismaModule, InvoicesModule],
  controllers: [
    DealerSubscriptionPlansController,
    DealerSubscriptionsController,
    DealerSubscriptionPlansAdminController,
    DealerSubscriptionsAdminController,
  ],
  providers: [DealerSubscriptionsService],
  exports: [DealerSubscriptionsService],
})
export class DealerSubscriptionsModule {}
