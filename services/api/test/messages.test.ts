import { readFileSync } from 'node:fs';
import { brand } from '@app/config/brand';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../src/errors/error-codes';
import { errorMessage, interpolate } from '../src/i18n/messages';

const raw = readFileSync(new URL('../src/i18n/es-AR/errors.json', import.meta.url), 'utf8');
const catalog = JSON.parse(raw) as Record<string, string>;

describe('es-AR error messages', () => {
  it('has exactly one message per contract error code', () => {
    expect(Object.keys(catalog).sort()).toEqual([...ERROR_CODES].sort());
  });

  it('never writes the brand name by hand', () => {
    expect(raw.toLowerCase()).not.toContain(brand.name.toLowerCase());
  });

  it('replaces {brand} with the configured name', () => {
    expect(errorMessage('TERMS_NOT_ACCEPTED')).toContain(brand.name);
    expect(errorMessage('TERMS_NOT_ACCEPTED')).not.toContain('{brand}');
  });

  it('leaves no unresolved placeholders in error messages', () => {
    for (const code of ERROR_CODES) {
      expect(errorMessage(code)).not.toMatch(/\{\w+\}/);
    }
  });

  it('interpolates parameters and keeps unknown placeholders visible', () => {
    expect(interpolate('Hola {player}, {missing}', { player: 'Ana' })).toBe('Hola Ana, {missing}');
  });
});
