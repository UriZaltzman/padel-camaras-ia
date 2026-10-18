import { brand } from '@app/config/brand';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import esAR from '@/i18n/es-AR.json';

import HomePage from './page';

describe('HomePage', () => {
  it('renders its texts from the es-AR messages', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      `${esAR['home.titleLine1']}${esAR['home.titleLine2']}`,
    );
    expect(screen.getByText(t('home.eyebrow'))).toBeInTheDocument();
    expect(screen.getByText(t('home.lead'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('home.ctaClubs') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('home.ctaMatch') })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: t('home.logoLabel') })).toBeInTheDocument();
  });

  it('shows the tagline, what the product does and the club contact form', () => {
    render(<HomePage />);

    expect(screen.getByText(t('home.lead'))).toHaveTextContent(brand.tagline);
    expect(screen.getByRole('heading', { name: t('features.title') })).toBeInTheDocument();
    for (const key of ['cameras', 'stats', 'bookings', 'app'] as const) {
      expect(screen.getByRole('heading', { name: t(`features.${key}.title`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: t('contact.title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('contact.submit') })).toBeInTheDocument();
  });

  it('fills the brand from @app/config/brand, not from the messages', () => {
    render(<HomePage />);

    expect(esAR['home.ctaClubs']).toContain('{brand}');
    expect(screen.getByRole('link', { name: t('home.ctaClubs') })).toHaveTextContent(brand.name);
  });
});
