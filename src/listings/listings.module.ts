import { Module } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { ListingsController } from './listings.controller';
import { ListingDraftsService } from './listing-drafts.service';
import { ListingDraftsController } from './listing-drafts.controller';
import { TrackingModule } from '../tracking/tracking.module';
import { AuthModule } from '../auth/auth.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [TrackingModule, AuthModule, InvoicesModule],
  // ListingDraftsController is registered first so its static routes (drafts, bulk-upload/template)
  // are matched before ListingsController's dynamic :id routes on the same /listings prefix.
  controllers: [ListingDraftsController, ListingsController],
  providers: [ListingsService, ListingDraftsService],
  exports: [ListingsService, ListingDraftsService],
})
export class ListingsModule {}
