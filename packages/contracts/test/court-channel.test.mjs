// Real-time court channel of section 11: every message has a JSON Schema and an example, each
// example validates against its direction, and the envelope is enforced.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const common = await read('../events/common.schema.json');
const channel = await read('../realtime/court-channel.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(common);
ajv.addSchema(channel);
const at = (def) => ajv.getSchema(`${channel.$id}#/$defs/${def}`);

const DIRECTIONS = ['AppToServer', 'ServerToApp', 'DeviceToServer', 'ServerToDevice'];
const typeOf = (def) => channel.$defs[def].properties.type.const;
const messagesOf = (dir) => channel.$defs[dir].oneOf.map((s) => s.$ref.split('/').pop());
const copy = (value) => JSON.parse(JSON.stringify(value));

describe('court channel', () => {
  test('every message type has at least one example', () => {
    const types = new Set(DIRECTIONS.flatMap(messagesOf).map(typeOf));
    const covered = new Set(channel.examples.map((e) => e.type));
    assert.deepEqual(
      [...types].filter((t) => !covered.has(t)),
      [],
    );
  });

  for (const example of channel.examples) {
    test(`example ${example.type} validates against a direction`, () => {
      const dirs = DIRECTIONS.filter((d) => messagesOf(d).some((m) => typeOf(m) === example.type));
      assert.ok(dirs.length > 0);
      for (const dir of dirs) assert.ok(at(dir)(example), JSON.stringify(at(dir).errors));
    });
  }

  test('a clip tap cannot be sent by the device', () => {
    const tap = channel.examples.find((e) => e.type === 'clip.tap');
    assert.equal(at('DeviceToServer')(tap), false);
    assert.equal(at('AppToServer')(tap), true);
  });

  test('the envelope is required and closed', () => {
    const tap = channel.examples.find((e) => e.type === 'clip.tap');
    for (const key of ['id', 'sent_at', 'court_id', 'payload']) {
      const broken = Object.fromEntries(Object.entries(copy(tap)).filter(([k]) => k !== key));
      assert.equal(at('AppToServer')(broken), false, `missing ${key}`);
    }
    assert.equal(at('AppToServer')({ ...copy(tap), extra: 1 }), false);
  });

  test('no message carries a media URL', () => {
    const text = JSON.stringify(channel.$defs);
    assert.doesNotMatch(text, /"(\w+_)?url"/);
  });
});
