import { Inject, Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { CLOCK, type Clock } from '../common/clock';
import { AppError } from '../errors/app-error';
import { CRM, computeMetrics, type ClubPlayerSegment } from './crm-metrics';
import { CrmRepository, type CrmPerson } from './crm.repository';

export interface ClubPlayerDto {
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  bookings_per_month: number;
  active_weeks: number;
  weeks_window: 8;
  no_shows: number;
  last_visit_at: string | null;
  total_spend_cents: number | null;
  segments: ClubPlayerSegment[];
  tags: string[];
  notes: string | null;
}

export interface ClubPlayerDetailDto extends ClubPlayerDto {
  recent_bookings: {
    booking_id: string;
    starts_at: string;
    court_name: string;
    status: string;
    price_cents: number;
  }[];
}

export interface ClubPlayerQuery {
  q?: string;
  segment?: ClubPlayerSegment;
  tag?: string;
  cursor?: string;
  limit: number;
}

export interface ClubPlayerPageDto {
  items: ClubPlayerDto[];
  next_cursor: string | null;
}

@Injectable()
export class CrmService {
  constructor(
    private readonly repo: CrmRepository,
    private readonly access: ClubAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(auth: AccessIdentity, clubId: string, q: ClubPlayerQuery): Promise<ClubPlayerPageDto> {
    const { db } = await this.access.authorize(auth, clubId, 'club.operate');
    const now = this.clock.now();
    const needle = q.q?.toLowerCase();
    const rows = (await this.repo.people({ ...db, clubId }))
      .map((p) => this.toDto(p, now))
      .filter(
        (p) =>
          (!needle || p.name.toLowerCase().includes(needle) || (p.phone ?? '').includes(needle)) &&
          (!q.segment || p.segments.includes(q.segment)) &&
          (!q.tag || p.tags.includes(q.tag)),
      )
      .sort(
        (a, b) =>
          (b.last_visit_at ?? '').localeCompare(a.last_visit_at ?? '') ||
          a.user_id.localeCompare(b.user_id),
      );
    const offset = decodeCursor(q.cursor);
    const items = rows.slice(offset, offset + q.limit);
    const next = offset + q.limit;
    return { items, next_cursor: next < rows.length ? encodeCursor(next) : null };
  }

  async get(auth: AccessIdentity, clubId: string, userId: string): Promise<ClubPlayerDetailDto> {
    const { db } = await this.access.authorize(auth, clubId, 'club.operate');
    const [person] = await this.repo.people({ ...db, clubId }, userId);
    if (!person) throw new AppError('NOT_FOUND');
    return this.detail(person, this.clock.now());
  }

  async updateNotes(
    auth: AccessIdentity,
    clubId: string,
    userId: string,
    body: { tags: string[]; notes: string | null },
  ): Promise<ClubPlayerDetailDto> {
    const { db } = await this.access.authorize(auth, clubId, 'club.operate');
    const tags = body.tags.map((t) => t.trim()).filter(Boolean);
    const notes = body.notes?.trim() || null;
    if (!(await this.repo.saveNotes({ ...db, clubId }, userId, tags, notes))) {
      throw new AppError('NOT_FOUND');
    }
    return this.get(auth, clubId, userId);
  }

  private toDto(p: CrmPerson, now: Date): ClubPlayerDto {
    const m = computeMetrics(p.bookings, now);
    return {
      user_id: p.userId,
      name: p.name,
      phone: p.phone,
      email: p.email,
      bookings_per_month: m.bookingsPerMonth,
      active_weeks: m.activeWeeks,
      weeks_window: CRM.windowWeeks,
      no_shows: m.noShows,
      last_visit_at: m.lastVisitAt?.toISOString() ?? null,
      total_spend_cents: p.spendCents,
      segments: m.segments,
      tags: p.tags,
      notes: p.notes,
    };
  }

  private detail(p: CrmPerson, now: Date): ClubPlayerDetailDto {
    return {
      ...this.toDto(p, now),
      recent_bookings: [...p.bookings]
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
        .slice(0, CRM.recentBookings)
        .map((b) => ({
          booking_id: b.id,
          starts_at: b.startsAt.toISOString(),
          court_name: b.courtName,
          status: b.status,
          price_cents: b.priceCents,
        })),
    };
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const match = /^o:(\d{1,9})$/.exec(Buffer.from(cursor, 'base64url').toString());
  if (!match?.[1]) throw new AppError('VALIDATION_FAILED');
  return Number(match[1]);
}
