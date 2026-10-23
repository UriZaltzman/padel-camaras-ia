import { describe, expect, it } from 'vitest';

import { formatFrequency, parseTags, whatsappLink } from './model';

describe('club-crm model', () => {
  it('builds a wa.me link with the text encoded', () => {
    expect(whatsappLink('+5491155550101', 'Hola Ana, ¿venís?')).toBe(
      'https://wa.me/5491155550101?text=Hola%20Ana%2C%20%C2%BFven%C3%ADs%3F',
    );
  });
  it('gives no link without a usable phone', () => {
    expect(whatsappLink(null, 'x')).toBeNull();
    expect(whatsappLink('abc', 'x')).toBeNull();
  });
  it('parses tags: trims, dedupes, caps at 10', () => {
    expect(parseTags(' zurdo, torneo ,zurdo,,')).toEqual(['zurdo', 'torneo']);
    expect(parseTags(Array.from({ length: 12 }, (_, i) => `t${i}`).join(','))).toHaveLength(10);
  });
  it('formats frequency with a comma', () => expect(formatFrequency(4.5)).toBe('4,5'));
});
