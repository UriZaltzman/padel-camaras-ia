import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubAccessService } from './club-access.service';
import { ClubsController } from './clubs.controller';
import { ClubsRepository } from './clubs.repository';
import { ClubsService } from './clubs.service';
import { MembershipsRepository } from './memberships.repository';
import { MembershipsService } from './memberships.service';
import { PrismaClubsRepository } from './prisma-clubs.repository';

@Module({
  imports: [AuthModule],
  controllers: [ClubsController],
  providers: [
    ClubsService,
    ClubAccessService,
    MembershipsRepository,
    MembershipsService,
    { provide: ClubsRepository, useClass: PrismaClubsRepository },
  ],
  exports: [ClubAccessService, MembershipsService],
})
export class ClubsModule {}
