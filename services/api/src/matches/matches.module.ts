import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchesController } from './matches.controller';
import { MatchesRepository } from './matches.repository';
import { MatchesService } from './matches.service';
import { PrismaMatchesRepository } from './prisma-matches.repository';

@Module({
  imports: [AuthModule],
  controllers: [MatchesController],
  providers: [MatchesService, { provide: MatchesRepository, useClass: PrismaMatchesRepository }],
  exports: [MatchesService],
})
export class MatchesModule {}
