import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { ClubsModule } from '../clubs/clubs.module';
import { FavoritesController } from './favorites.controller';
import { FavoritesRepository } from './favorites.repository';
import { FavoritesService } from './favorites.service';
import { PrismaFavoritesRepository } from './prisma-favorites.repository';

@Module({
  imports: [AuthModule, ClubsModule, BookingsModule],
  controllers: [FavoritesController],
  providers: [
    FavoritesService,
    { provide: FavoritesRepository, useClass: PrismaFavoritesRepository },
  ],
})
export class FavoritesModule {}
