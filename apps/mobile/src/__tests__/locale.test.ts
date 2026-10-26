// The app has no Node type definitions; the test only needs these few calls (it runs in Node).
declare function require(id: string): unknown;
const { readdirSync, readFileSync } = require('node:fs') as {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
};
const { join } = require('node:path') as { join(...parts: string[]): string };
declare const __dirname: string;

import { esAR, localeParts, mergeLocale } from '../i18n/locales';

const dir: string = join(__dirname, '..', 'i18n', 'locales', 'es-AR');
const files = readdirSync(dir).filter((name: string) => name.endsWith('.json'));

function leaves(tree: Record<string, unknown>, path: string[] = []): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[...path, key].join('.')]
      : leaves(value as Record<string, unknown>, [...path, key]),
  );
}

describe('locale files', () => {
  it('registers every file of es-AR/ in locales/index.ts, and nothing else', () => {
    expect(Object.keys(localeParts).sort()).toEqual(
      files.map((f: string) => f.replace('.json', '')).sort(),
    );
  });

  it('never defines the same key in two files', () => {
    const seen = new Map<string, string>();
    for (const file of files) {
      const part = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>;
      for (const key of leaves(part)) {
        expect(seen.get(key)).toBeUndefined();
        seen.set(key, file);
      }
    }
    expect(leaves(esAR as unknown as Record<string, unknown>).length).toBe(seen.size);
  });

  it('refuses to merge a key defined twice', () => {
    expect(() =>
      mergeLocale({ a: { home: { title: 'uno' } }, b: { home: { title: 'dos' } } }),
    ).toThrow(/"home\.title" is defined in both es-AR\/a\.json and es-AR\/b\.json/);
  });

  it('merges different keys of the same namespace from two files', () => {
    expect(mergeLocale({ a: { home: { one: '1' } }, b: { home: { two: '2' } } })).toEqual({
      home: { one: '1', two: '2' },
    });
  });
});
