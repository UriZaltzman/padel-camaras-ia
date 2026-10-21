import { createApiClient } from '@app/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import { DEMO_CLUB_ID, demoClub } from '@/lib/api/mock-data';
import { createMockFetch } from '@/lib/api/mock-fetch';

import { BrandSettingsPanel } from './brand-settings-panel';

function setup() {
  const client = createApiClient({ baseUrl: 'http://localhost:3000/v1', fetch: createMockFetch() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BrandSettingsPanel clubId={DEMO_CLUB_ID} client={client} />
    </QueryClientProvider>,
  );
}

const file = (name: string, type: string) => new File(['x'], name, { type });

describe('BrandSettingsPanel', () => {
  it('uploads a logo and a sponsor and configures streaming', async () => {
    setup();
    fireEvent.change(screen.getByLabelText(t('brand.logo.label')), {
      target: { files: [file('club.png', 'image/png')] },
    });
    expect(screen.getByText(t('brand.logo.chosen', { name: 'club.png' }))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('brand.sponsors.add') }));
    fireEvent.change(screen.getByLabelText(t('brand.sponsors.name')), {
      target: { value: 'Bebidas Sur' },
    });
    fireEvent.change(screen.getByLabelText(t('brand.sponsors.logo')), {
      target: { files: [file('sponsor.svg', 'image/svg+xml')] },
    });

    fireEvent.click(screen.getByLabelText(t('brand.streaming.enabled')));
    fireEvent.change(screen.getByLabelText(t('brand.streaming.channelId')), {
      target: { value: `UC${'x'.repeat(22)}` },
    });
    fireEvent.change(screen.getByLabelText(t('brand.streaming.title')), {
      target: { value: 'Torneo de primavera' },
    });
    const court = demoClub.courts[0];
    if (!court) throw new Error('demo club without courts');
    fireEvent.click(await screen.findByLabelText(court.name));

    fireEvent.click(screen.getByRole('button', { name: t('brand.save') }));
    expect(screen.getByRole('status')).toHaveTextContent(t('brand.saved'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows errors for a bad logo and incomplete streaming', () => {
    setup();
    fireEvent.change(screen.getByLabelText(t('brand.logo.label')), {
      target: { files: [file('club.gif', 'image/gif')] },
    });
    fireEvent.click(screen.getByLabelText(t('brand.streaming.enabled')));
    fireEvent.click(screen.getByRole('button', { name: t('brand.save') }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(t('brand.error.logoType'));
    expect(alert).toHaveTextContent(t('brand.error.channelId'));
  });
});
