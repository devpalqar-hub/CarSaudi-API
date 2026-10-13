import { Module } from '@nestjs/common';
import { DealerSubscriptionsModule } from '../dealer-subscriptions/dealer-subscriptions.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { FeaturedController } from './featured.controller';
import { FeaturedPlansController } from './featured-plans.controller';
import { FeaturedService } from './featured.service';

@Module({
  imports: [DealerSubscriptionsModule, InvoicesModule],
  controllers: [FeaturedController, FeaturedPlansController],
  providers: [FeaturedService],
  exports: [FeaturedService],
})
export class FeaturedModule {}
