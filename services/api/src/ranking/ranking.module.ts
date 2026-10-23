import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaRankingRepository } from './prisma-ranking.repository';
import { RankingController } from './ranking.controller';
import { RankingRepository } from './ranking.repository';
import { RankingService } from './ranking.service';

@Module({
  imports: [AuthModule],
  controllers: [RankingController],
  providers: [RankingService, { provide: RankingRepository, useClass: PrismaRankingRepository }],
})
export class RankingModule {}
