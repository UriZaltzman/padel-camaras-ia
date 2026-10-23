import type { Schema } from '@app/contracts';

import { toE164 } from '@/lib/player/phone';

export type ClubPlayer = Schema<'ClubPlayer'>;
export type ClubPlayerDetail = Schema<'ClubPlayerDetail'>;
export type ClubPlayerSegment = Schema<'ClubPlayerSegment'>;

export const SEGMENTS: ClubPlayerSegment[] = ['frequent', 'dormant', 'no_show'];
export type WhatsappTemplate = 'late' | 'reminder' | 'promo';
export const TEMPLATES: WhatsappTemplate[] = ['late', 'reminder', 'promo'];

/** `wa.me` link with the text prefilled, or null when the player has no usable phone. */
export function whatsappLink(phone: string | null, text: string): string | null {
  const e164 = phone ? toE164(phone) : null;
  if (!e164) return null;
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}`;
}

/** Tags typed as "zurdo, torneo": trimmed, deduplicated, at most 10 of 30 characters. */
export function parseTags(input: string): string[] {
  const tags = input
    .split(',')
    .map((tag) => tag.trim().slice(0, 30))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 10);
}

/** Frequency as shown: one decimal, comma as separator. */
export const formatFrequency = (n: number) => n.toFixed(1).replace('.', ',');
