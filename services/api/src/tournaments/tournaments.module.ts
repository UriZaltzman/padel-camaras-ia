import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubsModule } from '../clubs/clubs.module';
import { PrismaTournamentsRepository } from './prisma-tournaments.repository';
import { TournamentsController } from './tournaments.controller';
import { TournamentsRepository } from './tournaments.repository';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [AuthModule, ClubsModule],
  controllers: [TournamentsController],
  providers: [
    TournamentsService,
    { provide: TournamentsRepository, useClass: PrismaTournamentsRepository },
  ],
})
export class TournamentsModule {}
