import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { breakpoints } from '@app/ui';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'globals.css'), 'utf8');
const remOf = (name: string) =>
  Number(new RegExp(`--breakpoint-${name}:\\s*([\\d.]+)rem`).exec(css)?.[1]) * 16;

describe('globals.css breakpoints', () => {
  it('match the numbers of @app/ui', () => {
    expect(remOf('sm')).toBe(breakpoints.tablet);
    expect(remOf('lg')).toBe(breakpoints.laptop);
    expect(remOf('wide')).toBe(breakpoints.wide);
  });
});
