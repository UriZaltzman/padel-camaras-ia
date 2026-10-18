// User-facing text lives only in the es-AR message files. `{brand}` and `{tagline}` are filled from
// @app/config/brand, so the brand name is never written by hand.
import { brand } from '@app/config/brand';

import esAR from './es-AR.json';

export const locale = 'es-AR';
export const timeZone = 'America/Argentina/Buenos_Aires';

export type MessageKey = keyof typeof esAR;
export type MessageValues = Record<string, string | number>;

const messages: Record<MessageKey, string> = esAR;

const brandValues: MessageValues = { brand: brand.name, tagline: brand.tagline };

/** Translate `key`, replacing `{name}` placeholders. Throws if a placeholder has no value. */
export function t(key: MessageKey, values: MessageValues = {}): string {
  const all = { ...brandValues, ...values };
  return messages[key].replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = all[name];
    if (value === undefined) {
      throw new Error(`Missing value for "{${name}}" in message "${key}"`);
    }
    return String(value);
  });
}
