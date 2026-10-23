import { describe, expect, it } from 'vitest';

import { groupLetter, inviteLink, localToIso, parseFeeToCents, validSets } from './model';

describe('validSets', () => {
  it('accepts two sets or a third set decider', () => {
    expect(
      validSets([
        { team_1: 6, team_2: 4 },
        { team_1: 6, team_2: 2 },
      ]),
    ).toBe(true);
    expect(
      validSets([
        { team_1: 6, team_2: 4 },
        { team_1: 3, team_2: 6 },
        { team_1: 7, team_2: 6 },
      ]),
    ).toBe(true);
  });
  it('rejects impossible or unfinished scores', () => {
    expect(
      validSets([
        { team_1: 6, team_2: 5 },
        { team_1: 6, team_2: 2 },
      ]),
    ).toBe(false);
    expect(
      validSets([
        { team_1: 6, team_2: 4 },
        { team_1: 3, team_2: 6 },
      ]),
    ).toBe(false);
    expect(
      validSets([
        { team_1: 6, team_2: 0 },
        { team_1: 6, team_2: 0 },
        { team_1: 6, team_2: 0 },
      ]),
    ).toBe(false);
  });
});

describe('helpers', () => {
  it('letters groups', () => expect(groupLetter(2)).toBe('C'));
  it('converts Buenos Aires time to UTC', () =>
    expect(localToIso('2026-11-07', '10:00')).toBe('2026-11-07T13:00:00.000Z'));
  it('parses fees', () => {
    expect(parseFeeToCents('15.000')).toBe(1_500_000);
    expect(parseFeeToCents('')).toBe(0);
    expect(parseFeeToCents('abc')).toBeNull();
  });
  it('builds the public link', () =>
    expect(inviteLink('c', 't', 'https://x.test')).toBe('https://x.test/clubes/c/torneos/t'));
});
