import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SharedModule } from './shared/shared.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ListingsModule } from './listings/listings.module';
import { DealerOnboardingModule } from './dealer-onboarding/dealer-onboarding.module';
import { DealersModule } from './dealers/dealers.module';
import { ChatModule } from './chat/chat.module';
import { SupportModule } from './support/support.module';
import { WishlistsModule } from './wishlists/wishlists.module';
import { CarVisitsModule } from './car-visits/car-visits.module';
import { FeaturedModule } from './featured/featured.module';
import { DealerSubscriptionsModule } from './dealer-subscriptions/dealer-subscriptions.module';
import { BannersModule } from './banners/banners.module';
import { HeroBannersModule } from './hero-banners/hero-banners.module';
import { TrackingModule } from './tracking/tracking.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InvoicesModule } from './invoices/invoices.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    SharedModule,
    UsersModule,
    AuthModule,
    AdminModule,
    ListingsModule,
    DealerOnboardingModule,
    DealersModule,
    ChatModule,
    SupportModule,
    WishlistsModule,
    CarVisitsModule,
    FeaturedModule,
    DealerSubscriptionsModule,
    BannersModule,
    HeroBannersModule,
    TrackingModule,
    NotificationsModule,
    InvoicesModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
