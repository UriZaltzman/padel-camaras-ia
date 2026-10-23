import { describe, expect, it } from 'vitest';
import { matchStatusMachine } from '@app/contracts';
import { FakeClock } from '../../src/common/clock';
import type { AppError } from '../../src/errors/app-error';
import { assertMatchTransition, type MatchStatus } from '../../src/matches/match-transitions';
import {
  MatchesRepository,
  type Actor,
  type ClaimResult,
  type Correction,
  type MatchRecord,
} from '../../src/matches/matches.repository';
import { MatchesService } from '../../src/matches/matches.service';
import { winnerOf } from '../../src/matches/score';

const CLUB = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e01';
const MATCH = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e03';
const POINT = '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e04';
const ME = { userId: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e11', sessionId: 's' };
const BOOKED = { userId: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e12', sessionId: 's' };
const STRANGER = { userId: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e13', sessionId: 's' };
const STAFF = { userId: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5e14', sessionId: 's' };

const STATUSES = matchStatusMachine.states as readonly MatchStatus[];

function record(status: MatchStatus): MatchRecord {
  return {
    id: MATCH,
    clubId: CLUB,
    clubName: 'Club',
    courtId: 'c',
    courtName: 'Cancha 1',
    bookingId: 'b',
    type: 'match',
    status,
    startsAt: new Date('2026-11-01T10:00:00Z'),
    endsAt: new Date('2026-11-01T11:30:00Z'),
    goldenPoint: true,
    bestOfSets: 3,
    superTiebreak: false,
    sets: [],
    winnerTeam: null,
    players: [
      {
        position: 1,
        team: 1,
        userId: ME.userId,
        displayName: 'Yo',
        photoUrl: null,
        confirmed: true,
      },
      { position: 2, team: 1, userId: null, displayName: null, photoUrl: null, confirmed: false },
    ],
    pointsToReview: [
      { id: POINT, number: 3, set: 1, game: 1, winnerTeam: 1, endReason: 'net', confidence: 0.5 },
    ],
    insights: [{ id: 'i', kind: 'net_uncovered', text: 'x', order: 1 }],
  };
}

class FakeRepo extends MatchesRepository {
  corrections: Correction[] = [];
  constructor(public match: MatchRecord) {
    super();
  }
  staffClubs(userId: string) {
    return Promise.resolve(
      userId === STAFF.userId ? [{ clubId: CLUB, role: 'staff' as const }] : [],
    );
  }
  find(actor: Actor, id: string) {
    const seen =
      id === this.match.id &&
      (actor.role === 'staff' || this.match.players.some((p) => p.userId === actor.userId));
    return Promise.resolve(seen ? structuredClone(this.match) : null);
  }
  locate() {
    return Promise.resolve({ clubId: CLUB, status: this.match.status });
  }
  mayClaim(_m: string, userId: string) {
    return Promise.resolve([ME.userId, BOOKED.userId].includes(userId));
  }
  claim(_c: string, _m: string, position: number, userId: string): Promise<ClaimResult> {
    if (this.match.players.some((p) => p.userId === userId && p.position !== position)) {
      return Promise.resolve('already_joined');
    }
    const slot = this.match.players.find((p) => p.position === position);
    if (!slot || (slot.userId && slot.userId !== userId)) return Promise.resolve('slot_taken');
    slot.userId = userId;
    slot.displayName = 'Otro';
    slot.confirmed = true;
    return Promise.resolve('claimed');
  }
  isConfirmedPlayer(_m: string, userId: string) {
    return Promise.resolve(userId === ME.userId);
  }
  applyCorrection(_c: string, _m: string, c: Correction) {
    if (this.match.status !== 'published') return Promise.resolve('moved' as const);
    if (c.type === 'point_winner' && c.pointId !== POINT)
      return Promise.resolve('no_point' as const);
    this.match.status = 'needs_review';
    this.corrections.push(c);
    return Promise.resolve({ id: 'corr' });
  }
}

const service = (status: MatchStatus) => {
  const repo = new FakeRepo(record(status));
  return { repo, svc: new MatchesService(repo, new FakeClock()) };
};
const code = async (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: AppError) => e.code,
  );

describe('match state machine', () => {
  it('allows exactly the transitions of the contract table and rejects every other', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const allowed = matchStatusMachine.transitions[from].includes(to);
        if (allowed) expect(() => assertMatchTransition(from, to)).not.toThrow();
        else expect(() => assertMatchTransition(from, to)).toThrowError(/INVALID_STATE_TRANSITION/);
      }
    }
  });
});

describe('GET /matches/{id}', () => {
  it('shows a player the match where they played, with insights and points to review', async () => {
    const dto = await service('published').svc.get(ME, MATCH);
    expect(dto.players).toHaveLength(2);
    expect(dto.insights).toHaveLength(1);
    expect(dto.points_to_review).toHaveLength(1);
  });
  it('hides a match the caller did not play (404, not 403)', async () => {
    expect(await code(service('published').svc.get(STRANGER, MATCH))).toBe('NOT_FOUND');
  });
  it('gives staff the match without insights or points to review', async () => {
    const dto = await service('published').svc.get(STAFF, MATCH);
    expect(dto.insights).toBeNull();
    expect(dto.points_to_review).toEqual([]);
  });
});

describe('claim-player', () => {
  it('claims a free position of a published match', async () => {
    const dto = await service('published').svc.claimPlayer(BOOKED, MATCH, 2);
    expect(dto.players[1]?.confirmed).toBe(true);
  });
  it('rejects before the analysis, with a taken slot, and a second position', async () => {
    expect(await code(service('processing').svc.claimPlayer(BOOKED, MATCH, 2))).toBe(
      'MATCH_NOT_PUBLISHED',
    );
    expect(await code(service('published').svc.claimPlayer(BOOKED, MATCH, 1))).toBe(
      'MATCH_PLAYER_SLOT_TAKEN',
    );
    const { svc } = service('published');
    await svc.claimPlayer(BOOKED, MATCH, 2);
    expect(await code(svc.claimPlayer(BOOKED, MATCH, 1))).toBe('MATCH_ALREADY_JOINED');
  });
  it('does not let someone outside the booking claim', async () => {
    expect(await code(service('published').svc.claimPlayer(STRANGER, MATCH, 2))).toBe('NOT_FOUND');
  });
});

describe('score-correction', () => {
  const final = {
    type: 'final_score' as const,
    sets: [
      { team_1: 6, team_2: 4 },
      { team_1: 6, team_2: 3 },
    ],
  };
  it('moves published -> needs_review and stores the correction', async () => {
    const { svc, repo } = service('published');
    const r = await svc.correctScore(ME, MATCH, final);
    expect(r.match_status).toBe('needs_review');
    expect(repo.corrections[0]).toMatchObject({ type: 'final_score', winnerTeam: 1 });
  });
  it('rejects a second correction while one is applied, and archived matches', async () => {
    expect(await code(service('needs_review').svc.correctScore(ME, MATCH, final))).toBe(
      'INVALID_STATE_TRANSITION',
    );
    expect(await code(service('archived').svc.correctScore(ME, MATCH, final))).toBe(
      'INVALID_STATE_TRANSITION',
    );
  });
  it('rejects unpublished matches, non-players, impossible scores and unknown points', async () => {
    for (const s of [
      'scheduled',
      'recording',
      'recorded',
      'processing',
      'failed',
      'cancelled',
    ] as const) {
      expect(await code(service(s).svc.correctScore(ME, MATCH, final))).toBe('MATCH_NOT_PUBLISHED');
    }
    expect(await code(service('published').svc.correctScore(STAFF, MATCH, final))).toBe(
      'FORBIDDEN',
    );
    expect(await code(service('published').svc.correctScore(BOOKED, MATCH, final))).toBe(
      'NOT_FOUND',
    );
    expect(
      await code(
        service('published').svc.correctScore(ME, MATCH, {
          type: 'final_score',
          sets: [{ team_1: 6, team_2: 5 }],
        }),
      ),
    ).toBe('VALIDATION_FAILED');
    expect(
      await code(
        service('published').svc.correctScore(ME, MATCH, {
          type: 'point_winner',
          point_id: '0192b1e4-5a6b-7c8d-9e0f-1a2b3c4d5eff',
          winner_team: 2,
        }),
      ),
    ).toBe('VALIDATION_FAILED');
  });
});

describe('winnerOf', () => {
  const rules = { bestOfSets: 3, superTiebreak: false };
  it('accepts real padel results and rejects impossible ones', () => {
    expect(
      winnerOf(
        [
          { team_1: 6, team_2: 4 },
          { team_1: 7, team_2: 6 },
        ],
        rules,
      ),
    ).toBe(1);
    expect(
      winnerOf(
        [
          { team_1: 6, team_2: 4 },
          { team_1: 3, team_2: 6 },
          { team_1: 2, team_2: 6 },
        ],
        rules,
      ),
    ).toBe(2);
    expect(winnerOf([{ team_1: 6, team_2: 5 }], rules)).toBeNull();
    expect(winnerOf([{ team_1: 6, team_2: 4 }], rules)).toBeNull();
    expect(
      winnerOf(
        [
          { team_1: 6, team_2: 0 },
          { team_1: 6, team_2: 0 },
          { team_1: 6, team_2: 0 },
        ],
        rules,
      ),
    ).toBeNull();
  });
  it('plays the deciding set as a super tie-break to 10', () => {
    const sb = { bestOfSets: 3, superTiebreak: true };
    expect(
      winnerOf(
        [
          { team_1: 6, team_2: 4 },
          { team_1: 3, team_2: 6 },
          { team_1: 10, team_2: 7 },
        ],
        sb,
      ),
    ).toBe(1);
  });
});
