// Form model of the club brand, sponsors and tournament streaming panel. There is no contract for
// these settings yet (issue for the arquitecto pending), so the panel keeps them in this model and
// `validateBrandForm` mirrors the rules we expect the API to enforce.
// PLACEHOLDER: YouTube streaming runs only in test mode until a real channel is connected via OAuth
// by a person; no keys live in the web app.
import { t } from '@/i18n';

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_SPONSORS = 6;
export const LOGO_POSITIONS = ['top_left', 'top_right', 'bottom_left', 'bottom_right'] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];
export const STREAM_PRIVACY = ['public', 'unlisted'] as const;
export type StreamPrivacy = (typeof STREAM_PRIVACY)[number];

export interface LogoFile {
  name: string;
  type: string;
  size: number;
}

export interface SponsorForm {
  name: string;
  logo: LogoFile | null;
  inVideos: boolean;
  inReels: boolean;
}

export interface StreamingForm {
  enabled: boolean;
  /** YouTube channel ID, `UC` + 22 characters. */
  channelId: string;
  title: string;
  privacy: StreamPrivacy;
  courtIds: string[];
}

export interface BrandForm {
  logo: LogoFile | null;
  logoPosition: LogoPosition;
  sponsors: SponsorForm[];
  streaming: StreamingForm;
}

export function newBrandForm(): BrandForm {
  return {
    logo: null,
    logoPosition: 'top_right',
    sponsors: [],
    streaming: { enabled: false, channelId: '', title: '', privacy: 'unlisted', courtIds: [] },
  };
}

export function newSponsor(): SponsorForm {
  return { name: '', logo: null, inVideos: true, inReels: true };
}

/** es-AR message for a logo file that cannot be used, or null when it is fine. */
export function logoError(file: LogoFile): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return t('brand.error.logoType');
  if (file.size > MAX_LOGO_BYTES) return t('brand.error.logoSize');
  return null;
}

const CHANNEL_ID = /^UC[\w-]{22}$/;

/** Every problem of the form as es-AR messages; empty when it can be saved. */
export function validateBrandForm(form: BrandForm): string[] {
  const errors: string[] = [];
  if (form.logo) {
    const e = logoError(form.logo);
    if (e) errors.push(e);
  }
  if (form.sponsors.length > MAX_SPONSORS) {
    errors.push(t('brand.error.tooManySponsors', { n: MAX_SPONSORS }));
  }
  form.sponsors.forEach((sponsor, i) => {
    const n = i + 1;
    if (sponsor.name.trim() === '') errors.push(t('brand.error.sponsorName', { n }));
    if (!sponsor.logo) errors.push(t('brand.error.sponsorLogo', { n }));
    else {
      const e = logoError(sponsor.logo);
      if (e) errors.push(t('brand.error.sponsorPrefix', { n, error: e }));
    }
    if (!sponsor.inVideos && !sponsor.inReels) errors.push(t('brand.error.sponsorWhere', { n }));
  });
  const s = form.streaming;
  if (s.enabled) {
    if (!CHANNEL_ID.test(s.channelId.trim())) errors.push(t('brand.error.channelId'));
    if (s.title.trim() === '' || s.title.length > 100) errors.push(t('brand.error.streamTitle'));
    if (s.courtIds.length === 0) errors.push(t('brand.error.streamCourts'));
  }
  return errors;
}
