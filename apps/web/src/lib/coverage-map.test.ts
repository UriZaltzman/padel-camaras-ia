import { describe, expect, it } from 'vitest';

// @ts-expect-error plain .mjs script without types
import { checkCoverage } from '../../scripts/check-coverage-map.mjs';

const spec = "test(screenTitle('a', 'x'), async () => { await expectResponsive(page); })";
const files: Record<string, string> = {
  '/b/e2e/a.spec.ts': spec,
  '/b/e2e/bare.spec.ts': 'test("x")',
};
const read = (path: string) => files[path] ?? null;
const check = (screens: unknown[]): string[] => checkCoverage({ screens }, read, '/b') as string[];

describe('checkCoverage', () => {
  it('passes when every screen has a spec with its id', () => {
    expect(check([{ id: 'a', route: '/a', spec: 'e2e/a.spec.ts' }])).toEqual([]);
  });

  it('fails when a screen has no spec', () => {
    expect(check([{ id: 'a', route: '/a' }])).toEqual(['a: no spec']);
  });

  it('fails when the spec file does not exist', () => {
    expect(check([{ id: 'a', route: '/a', spec: 'e2e/missing.spec.ts' }])[0]).toContain(
      'does not exist',
    );
  });

  it('fails when the spec does not carry the screen id or the responsive check', () => {
    const problems = check([{ id: 'a', route: '/a', spec: 'e2e/bare.spec.ts' }]);
    expect(problems).toHaveLength(2);
  });
});
