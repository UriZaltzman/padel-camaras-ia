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

  it('only uses placeholders it can fill', () => {
    for (const key of Object.keys(esAR) as (keyof typeof esAR)[]) {
      expect(() => t(key)).not.toThrow();
    }
  });
});
