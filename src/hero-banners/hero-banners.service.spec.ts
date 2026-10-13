import { Test, TestingModule } from '@nestjs/testing';
import { HeroBannersService } from './hero-banners.service';

describe('HeroBannersService', () => {
  let service: HeroBannersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HeroBannersService],
    }).compile();

    service = module.get<HeroBannersService>(HeroBannersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
