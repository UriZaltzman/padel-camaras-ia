import { Module } from '@nestjs/common';
import { PrismaRatingsRepository } from './prisma-ratings.repository';
import { RatingsRepository } from './ratings.repository';
import { RatingsService } from './ratings.service';

@Module({
  providers: [RatingsService, { provide: RatingsRepository, useClass: PrismaRatingsRepository }],
  exports: [RatingsService],
})
export class RatingsModule {}
