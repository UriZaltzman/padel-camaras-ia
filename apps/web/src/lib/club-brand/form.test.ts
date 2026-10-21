import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';

import { MAX_LOGO_BYTES, logoError, newBrandForm, newSponsor, validateBrandForm } from './form';

const png = { name: 'logo.png', type: 'image/png', size: 1000 };

describe('validateBrandForm', () => {
  it('accepts the empty form', () => {
    expect(validateBrandForm(newBrandForm())).toEqual([]);
  });

  it('rejects wrong logo types and sizes', () => {
    expect(logoError({ ...png, type: 'image/gif' })).toBe(t('brand.error.logoType'));
    expect(logoError({ ...png, size: MAX_LOGO_BYTES + 1 })).toBe(t('brand.error.logoSize'));
    expect(logoError(png)).toBeNull();
  });

  it('requires name, logo and a placement per sponsor', () => {
    const form = newBrandForm();
    form.sponsors = [{ ...newSponsor(), inVideos: false, inReels: false }];
    expect(validateBrandForm(form)).toEqual([
      t('brand.error.sponsorName', { n: 1 }),
      t('brand.error.sponsorLogo', { n: 1 }),
      t('brand.error.sponsorWhere', { n: 1 }),
    ]);
  });

  it('checks streaming only when enabled', () => {
    const form = newBrandForm();
    form.streaming.channelId = 'bad';
    expect(validateBrandForm(form)).toEqual([]);
    form.streaming.enabled = true;
    expect(validateBrandForm(form)).toEqual([
      t('brand.error.channelId'),
      t('brand.error.streamTitle'),
      t('brand.error.streamCourts'),
    ]);
    form.streaming = {
      ...form.streaming,
      channelId: `UC${'a'.repeat(22)}`,
      title: 'Torneo',
      courtIds: ['c'],
    };
    expect(validateBrandForm(form)).toEqual([]);
  });
});
