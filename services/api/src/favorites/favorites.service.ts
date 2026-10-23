import { Inject, Injectable } from '@nestjs/common';
import { AvailabilityService } from '../bookings/availability.service';
import { localDate } from '../bookings/slots';
import { CLOCK, type Clock } from '../common/clock';
import { ClubAccessService } from '../clubs/club-access.service';
import type { AccessIdentity } from '../auth/session/session.service';
import { AppError } from '../errors/app-error';
import { FavoritesRepository, type FavoriteClubRecord } from './favorites.repository';

/** Favorites a player can keep. */
export const MAX_FAVORITE_CLUBS = 10;
/** Upcoming bookings shown under each favorite on the home. */
export const HOME_BOOKINGS_PER_CLUB = 3;
/** Free starts shown under each favorite on the home. */
export const HOME_FREE_SLOTS_PER_CLUB = 3;
/** Length the home quotes free starts for. */
export const HOME_SLOT_MINUTES = 90;
/** Courts looked at per club for the free starts. */
export const HOME_MAX_COURTS = 6;

export interface FavoriteClubDto {
  club_id: string;
  name: string;
  address: string | null;
  logo_url: string | null;
  position: number;
}

export interface FavoriteListDto {
  items: FavoriteClubDto[];
}

export interface HomeFavoriteDto {
  club: FavoriteClubDto;
  next_bookings: {
    id: string;
    court_id: string;
    court_name: string;
    starts_at: string;
    ends_at: string;
    status: 'held' | 'confirmed';
  }[];
  free_slots_today: {
    court_id: string;
    starts_at: string;
    ends_at: string;
    amount_cents: number;
  }[];
}

export interface HomeDto {
  favorites: HomeFavoriteDto[];
}

function toDto(f: FavoriteClubRecord): FavoriteClubDto {
  return {
    club_id: f.clubId,
    name: f.name,
    address: f.address,
    logo_url: f.logoUrl,
    position: f.position,
  };
}

@Injectable()
export class FavoritesService {
  constructor(
    private readonly repo: FavoritesRepository,
    private readonly availability: AvailabilityService,
    private readonly access: ClubAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(auth: AccessIdentity): Promise<FavoriteListDto> {
    return { items: (await this.repo.list(auth.userId)).map(toDto) };
  }

  /** Idempotent: starring a club twice keeps it where it was. */
  async add(auth: AccessIdentity, clubId: string): Promise<FavoriteListDto> {
    const result = await this.repo.add(auth.userId, clubId, MAX_FAVORITE_CLUBS);
    if (result === 'no_club') throw new AppError('NOT_FOUND');
    if (result === 'full') {
      throw new AppError('VALIDATION_FAILED', { max_favorites: MAX_FAVORITE_CLUBS });
    }
    return this.list(auth);
  }

  async remove(auth: AccessIdentity, clubId: string): Promise<void> {
    await this.repo.remove(auth.userId, clubId);
  }

  async reorder(auth: AccessIdentity, clubIds: string[]): Promise<FavoriteListDto> {
    if (!(await this.repo.reorder(auth.userId, clubIds))) {
      throw new AppError('VALIDATION_FAILED', { field: 'club_ids' });
    }
    return this.list(auth);
  }

  async home(auth: AccessIdentity): Promise<HomeDto> {
    const favorites = await this.repo.list(auth.userId);
    if (favorites.length === 0) return { favorites: [] };
    const now = this.clock.now();
    const bookings = await this.repo.upcomingBookings(
      auth.userId,
      favorites.map((f) => f.clubId),
      now,
      HOME_BOOKINGS_PER_CLUB,
    );
    const entries = await Promise.all(
      favorites.map(async (f) => ({
        club: toDto(f),
        next_bookings: bookings
          .filter((b) => b.clubId === f.clubId)
          .map((b) => ({
            id: b.id,
            court_id: b.courtId,
            court_name: b.courtName,
            starts_at: b.startsAt.toISOString(),
            ends_at: b.endsAt.toISOString(),
            status: b.status,
          })),
        free_slots_today: await this.freeSlots(f, now),
      })),
    );
    return { favorites: entries };
  }

  /** Anonymous count for the club's panel; never who. */
  async countForClub(auth: AccessIdentity, clubId: string): Promise<{ favorite_count: number }> {
    const { db } = await this.access.authorize(auth, clubId, 'club.operate');
    const favorite_count = await this.repo.countFor({
      role: db.role === 'owner' ? 'owner' : 'staff',
      userId: auth.userId,
      clubId,
    });
    return { favorite_count };
  }

  private async freeSlots(club: FavoriteClubRecord, now: Date) {
    const courts = (await this.repo.activeCourts(club.clubId)).slice(0, HOME_MAX_COURTS);
    const date = localDate(now, club.timezone);
    const perCourt = await Promise.all(
      courts.map((c) =>
        this.availability
          .forCourt(c.id, date, HOME_SLOT_MINUTES)
          .then((a) => a.slots.map((s) => ({ court_id: c.id, ...s }))),
      ),
    );
    const seen = new Set<string>();
    return perCourt
      .flat()
      .filter((s) => new Date(s.starts_at) > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .filter((s) => !seen.has(s.starts_at) && !!seen.add(s.starts_at))
      .slice(0, HOME_FREE_SLOTS_PER_CLUB)
      .map(({ court_id, starts_at, ends_at, amount_cents }) => ({
        court_id,
        starts_at,
        ends_at,
        amount_cents,
      }));
  }
}
