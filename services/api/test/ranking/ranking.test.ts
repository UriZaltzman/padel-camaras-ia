import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/common/clock';
import type { AppError } from '../../src/errors/app-error';
import { RankingRepository, type RankingRow } from '../../src/ranking/ranking.repository';
import { RankingService, buildRanking } from '../../src/ranking/ranking.service';

const CLUB = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e01';
const ME = { userId: 'u-me', sessionId: 's' };

function row(userId: string, rating: number, extra: Partial<RankingRow> = {}): RankingRow {
  return {
    userId,
    name: userId,
    photoUrl: null,
    rating,
    matchesRated: 10,
    matches: 5,
    wins: 3,
    ...extra,
  };
}

class FakeRepo extends RankingRepository {
  since: Date | null = null;
  constructor(
    private readonly allRows: RankingRow[],
    private readonly participant = true,
  ) {
    super();
  }
  isParticipant() {
    return Promise.resolve(this.participant);
  }
  rows(_clubId: string, since: Date) {
    this.since = since;
    return Promise.resolve(this.allRows);
  }
}

describe('buildRanking', () => {
  it('orders by rating, then wins, then matches', () => {
    const rows = [
      row('low', 1610),
      row('top', 1690),
      row('tie-b', 1650, { wins: 2 }),
      row('tie-a', 1650, { wins: 4 }),
    ];
    const out = buildRanking(rows, 'cat_4', 'x', 10);
    expect(out.map((e) => e.user_id)).toEqual(['top', 'tie-a', 'tie-b', 'low']);
    expect(out.map((e) => e.position)).toEqual([1, 2, 3, 4]);
  });

  it('keeps only the requested category', () => {
    const out = buildRanking([row('a', 1650), row('b', 1750), row('c', 1550)], 'cat_3', 'x', 10);
    expect(out.map((e) => e.user_id)).toEqual(['b']);
  });

  it('hides players with too few rated matches and exposes no rating', () => {
    const out = buildRanking(
      [row('new', 1650, { matchesRated: 4 }), row('ok', 1640)],
      'cat_4',
      'x',
      10,
    );
    expect(out.map((e) => e.user_id)).toEqual(['ok']);
    expect(Object.keys(out[0] ?? {})).not.toContain('rating');
  });

  it('marks the caller and applies the limit', () => {
    const out = buildRanking(
      [row('a', 1690), row('u-me', 1680), row('c', 1670)],
      'cat_4',
      'u-me',
      2,
    );
    expect(out.map((e) => e.is_me)).toEqual([false, true]);
  });
});

describe('RankingService', () => {
  const clock = new FakeClock(new Date('2026-11-01T12:00:00Z'));

  it('looks back 12 months and returns the category as 1..8', async () => {
    const repo = new FakeRepo([row('a', 1650)]);
    const res = await new RankingService(repo, clock).get(ME, CLUB, 'cat_4', 50);
    expect(repo.since?.toISOString()).toBe('2025-11-01T12:00:00.000Z');
    expect(res).toMatchObject({ club_id: CLUB, category: '4', window_months: 12 });
    expect(res.entries).toHaveLength(1);
  });

  it('answers NOT_FOUND to someone who is not part of the club', async () => {
    const svc = new RankingService(new FakeRepo([row('a', 1650)], false), clock);
    await expect(svc.get(ME, CLUB, 'cat_4', 50)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppError>);
  });
});
