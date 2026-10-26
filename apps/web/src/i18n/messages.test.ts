import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { mergeMessages, messageParts, messages } from './messages';

const dir = join(__dirname, 'messages');
const files = readdirSync(dir).filter((name) => name.endsWith('.json'));

describe('message files', () => {
  it('registers every file of messages/ in messages.ts, and nothing else', () => {
    expect(Object.keys(messageParts).sort()).toEqual(
      files.map((f) => f.replace('.json', '')).sort(),
    );
  });

  it('never defines the same key in two files', () => {
    const seen = new Map<string, string>();
    for (const file of files) {
      const part = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, string>;
      for (const key of Object.keys(part)) {
        expect(seen.get(key), `"${key}" is in both ${seen.get(key)} and ${file}`).toBeUndefined();
        seen.set(key, file);
      }
    }
    expect(Object.keys(messages).length).toBe(seen.size);
  });

  it('refuses to merge a key defined twice', () => {
    expect(() => mergeMessages({ a: { 'x.y': 'uno' }, b: { 'x.y': 'dos' } })).toThrow(
      /"x\.y" is defined in both messages\/a\.json and messages\/b\.json/,
    );
  });
});
