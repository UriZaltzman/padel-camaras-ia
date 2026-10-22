// Where a club sits on the map. ClubSummary has no coordinates yet (follow-up for the contract
// owner), so a pin is placed from the club's `city` using the centre of each locality of CABA and
// Gran Buenos Aires, nudged by a stable offset per club so clubs of one locality do not overlap.
import type { Schema } from '@app/contracts';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Whole-area bounds the map opens on: CABA and the first and second GBA ring. */
export const BUENOS_AIRES_BOUNDS = { north: -34.4, south: -35.0, west: -59.0, east: -58.1 };

const LOCALITIES: Record<string, LatLng> = {
  caba: { lat: -34.6037, lng: -58.4116 },
  'vicente lopez': { lat: -34.5265, lng: -58.4731 },
  'san isidro': { lat: -34.4708, lng: -58.5286 },
  'san fernando': { lat: -34.4421, lng: -58.5594 },
  tigre: { lat: -34.4264, lng: -58.5796 },
  'san martin': { lat: -34.5755, lng: -58.5369 },
  'tres de febrero': { lat: -34.6027, lng: -58.5646 },
  moron: { lat: -34.6534, lng: -58.6198 },
  ituzaingo: { lat: -34.6586, lng: -58.6676 },
  'la matanza': { lat: -34.7706, lng: -58.6271 },
  avellaneda: { lat: -34.6622, lng: -58.3654 },
  lanus: { lat: -34.7078, lng: -58.3911 },
  'lomas de zamora': { lat: -34.7609, lng: -58.4016 },
  quilmes: { lat: -34.7206, lng: -58.2526 },
  berazategui: { lat: -34.7647, lng: -58.2128 },
  'almirante brown': { lat: -34.8, lng: -58.3916 },
  'esteban echeverria': { lat: -34.8167, lng: -58.4667 },
  pilar: { lat: -34.4587, lng: -58.9142 },
  escobar: { lat: -34.3484, lng: -58.7915 },
  'la plata': { lat: -34.9205, lng: -57.9536 },
};

/** Lower-case, accent-free key of a city name. */
export function localityKey(city: string): string {
  return city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function hash(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Position of a club, or null when its city is not a known locality (it stays in the list). */
export function clubPosition(club: Pick<Schema<'ClubSummary'>, 'id' | 'city'>): LatLng | null {
  const centre = LOCALITIES[localityKey(club.city)];
  if (!centre) return null;
  const h = hash(club.id);
  const offset = (n: number) => ((n % 2001) / 2000 - 0.5) * 0.04;
  return { lat: centre.lat + offset(h), lng: centre.lng + offset(h >>> 11) };
}
