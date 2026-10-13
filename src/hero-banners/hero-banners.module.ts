import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HeroBannersController } from './hero-banners.controller';
import { HeroBannersService } from './hero-banners.service';

@Module({
  imports: [PrismaModule],
  controllers: [HeroBannersController],
  providers: [HeroBannersService],
})
export class HeroBannersModule {}
