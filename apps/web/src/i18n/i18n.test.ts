import { brand } from '@app/config/brand';
import { describe, expect, it } from 'vitest';

import esAR from './es-AR.json';

import { t } from '.';

describe('t', () => {
  it('fills {brand} and {tagline} from @app/config/brand', () => {
    expect(t('meta.title')).toBe(`${brand.name} · ${brand.tagline}`);
  });

  it('never has the brand name written by hand in the messages', () => {
    for (const message of Object.values(esAR)) {
      expect(message.toLowerCase()).not.toContain(brand.name.toLowerCase());
    }
  });

  it('fills {brand} and {tagline} itself and every other placeholder from its values', () => {
    for (const key of Object.keys(esAR) as (keyof typeof esAR)[]) {
      // Placeholders other than the brand ones are passed by the caller, e.g. {n} or {court}.
      const names = [...esAR[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');
      const values = Object.fromEntries(
        names.filter((name) => name !== 'brand' && name !== 'tagline').map((name) => [name, 'x']),
      );
      expect(() => t(key, values)).not.toThrow();
    }
  });
});
