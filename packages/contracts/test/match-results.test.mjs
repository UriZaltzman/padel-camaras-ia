// The pipeline results format (POST /device/matches/{id}/results) shared by ml and edge-agent:
// the full-match example validates against `MatchResults` and is coherent with the scoring rules
// of section 6 (points add up to the sets, events link to existing points).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const spec = YAML.parse(
  await readFile(new URL('../openapi/openapi.yaml', import.meta.url), 'utf8'),
);
const example = JSON.parse(
  await readFile(new URL('../examples/match-results.example.json', import.meta.url), 'utf8'),
);

// OpenAPI keywords (`discriminator`, `x-*`, `examples` on properties) are not JSON Schema.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema({ $id: 'openapi.json', components: spec.components });
const validate = ajv.getSchema('openapi.json#/components/schemas/MatchResults');

/** Games won per team in each set, replaying the point winners. */
function replaySets(points) {
  const sets = new Map();
  for (const p of points) {
    const games = sets.get(p.set) ?? new Map();
    const won = games.get(p.game) ?? { 1: 0, 2: 0 };
    won[p.winner_team] += 1;
    games.set(p.game, won);
    sets.set(p.set, games);
  }
  return [...sets.values()].map((games) => {
    const score = { team_1: 0, team_2: 0 };
    for (const won of games.values()) score[won[1] > won[2] ? 'team_1' : 'team_2'] += 1;
    return score;
  });
}

describe('MatchResults full example', () => {
  test('validates against the schema', () => {
    const ok = validate(example);
    assert.ok(ok, JSON.stringify(validate.errors, null, 2));
  });

  test('a broken example is rejected', () => {
    const broken = JSON.parse(JSON.stringify(example));
    broken.bounces[0].surface = 'roof';
    assert.equal(validate(broken), false);
  });

  test('points are consecutive and add up to the final sets', () => {
    example.points.forEach((p, i) => assert.equal(p.number, i + 1));
    assert.deepEqual(replaySets(example.points), example.score.sets);
  });

  test('shots, bounces, highlights and deciding events point to existing events', () => {
    const numbers = new Set(example.points.map((p) => p.number));
    for (const e of [...example.shots, ...example.bounces, ...example.highlights]) {
      assert.ok(numbers.has(e.point_number), `unknown point ${e.point_number}`);
    }
    for (const p of example.points) {
      if (p.deciding_event === null) continue;
      const list = p.deciding_event.kind === 'shot' ? example.shots : example.bounces;
      assert.equal(list[p.deciding_event.index]?.point_number, p.number);
    }
  });

  test('points under 0.7 confidence are flagged for review', () => {
    for (const p of example.points) assert.equal(p.needs_review, p.confidence < 0.7);
  });
});
