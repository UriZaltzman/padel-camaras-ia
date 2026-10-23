import { Injectable } from '@nestjs/common';
import type { AccessIdentity } from '../auth/session/session.service';
import { parseInput } from '../common/zod';
import { AppError } from '../errors/app-error';
import { currentLogContext, setLogContext } from '../logging/request-context';
import type { ClubDto, ClubSettingsUpdate, ClubSummaryDto } from './club-model';
import { ClubAccessService } from './club-access.service';
import { assertSettingsValid, clubSettingsUpdateSchema } from './club-settings';
import { ClubModulesService } from '../club-modules/club-modules.service';
import { ClubsRepository } from './clubs.repository';

export interface ClubSummaryPage {
  items: ClubSummaryDto[];
  next_cursor: string | null;
}

/** Lowercase without accents, so "Palermo" finds "palérmo". */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

interface Cursor {
  k: string;
  id: string;
}

function decodeCursor(raw: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const c = parsed as Partial<Cursor>;
    if (typeof c.k === 'string' && typeof c.id === 'string') return { k: c.k, id: c.id };
  } catch {
    // falls through
  }
  throw new AppError('INVALID_CURSOR');
}

const encodeCursor = (cursor: Cursor): string =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url');

@Injectable()
export class ClubsService {
  constructor(
    private readonly clubs: ClubsRepository,
    private readonly access: ClubAccessService,
    private readonly modules: ClubModulesService,
  ) {}

  async list(query: { q?: string; cursor?: string; limit: number }): Promise<ClubSummaryPage> {
    const needle = query.q ? fold(query.q) : undefined;
    const matching = (await this.clubs.listSummaries())
      .filter((club) => !needle || fold(`${club.name} ${club.city}`).includes(needle))
      .map((club) => ({ club, key: fold(club.name) }))
      .sort((a, b) =>
        a.key === b.key ? a.club.id.localeCompare(b.club.id) : a.key.localeCompare(b.key),
      );

    const after = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rest = after
      ? matching.filter(
          (row) => row.key > after.k || (row.key === after.k && row.club.id > after.id),
        )
      : matching;
    const page = rest.slice(0, query.limit);
    const last = page.at(-1);
    const hasMore = rest.length > page.length;
    return {
      items: page.map((row) => row.club),
      next_cursor: hasMore && last ? encodeCursor({ k: last.key, id: last.club.id }) : null,
    };
  }

  async get(id: string): Promise<ClubDto> {
    const club = await this.clubs.findById(id);
    if (!club) throw new AppError('NOT_FOUND');
    return { ...club, modules: await this.modules.get(id) };
  }

  /** Owner only. Changes apply to bookings created afterwards. */
  async updateSettings(auth: AccessIdentity, clubId: string, body: unknown): Promise<ClubDto> {
    // Who may call is decided before the body is looked at, so non-members learn nothing.
    const { db } = await this.access.authorize(auth, clubId, 'club.update_settings');
    const update = assertSettingsValid(parseInput(clubSettingsUpdateSchema, body));
    unsupportedCharges(update);
    setLogContext({ club_id: clubId });
    const club = await this.clubs.updateSettings(db, clubId, update, {
      actorUserId: auth.userId,
      requestId: currentLogContext()?.request_id,
    });
    return { ...club, modules: await this.modules.get(clubId) };
  }
}

/**
 * Coach plan, lesson payments and city have no column yet (schema owner: arquitecto). Refuse a
 * change instead of silently dropping it; "included" and "off" are what the club already has.
 */
function unsupportedCharges(update: ClubSettingsUpdate): void {
  const charges = update.charges;
  if (!charges) return;
  const issues: { path: string; rule: string }[] = [];
  if (charges.coach_plan.type !== 'included') {
    issues.push({ path: '/charges/coach_plan/type', rule: 'unsupported' });
  }
  if (charges.lesson_payments_enabled) {
    issues.push({ path: '/charges/lesson_payments_enabled', rule: 'unsupported' });
  }
  if (issues.length > 0) throw new AppError('VALIDATION_FAILED', { issues });
}
