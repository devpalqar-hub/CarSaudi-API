import { Test, TestingModule } from '@nestjs/testing';
import { HeroBannersController } from './hero-banners.controller';

describe('HeroBannersController', () => {
  let controller: HeroBannersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HeroBannersController],
    }).compile();

    controller = module.get<HeroBannersController>(HeroBannersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
