import { Module } from '@nestjs/common';
import { DealerOnboardingController } from './dealer-onboarding.controller';
import { DealerOnboardingService } from './dealer-onboarding.service';

@Module({
  controllers: [DealerOnboardingController],
  providers: [DealerOnboardingService],
  exports: [DealerOnboardingService],
})
export class DealerOnboardingModule {}
