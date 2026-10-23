import { createApiClient } from '@app/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import { DEMO_CLUB_ID, demoClub } from '@/lib/api/mock-data';
import { createMockFetch } from '@/lib/api/mock-fetch';

import { PlayersCrm } from './players-crm';

function setup() {
  const client = createApiClient({
    baseUrl: 'http://localhost:3000/v1',
    fetch: createMockFetch(demoClub),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PlayersCrm clubId={DEMO_CLUB_ID} client={client} />
    </QueryClientProvider>,
  );
}

describe('PlayersCrm', () => {
  it('lists players and filters by the dormant segment', async () => {
    setup();
    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('crm.segment.dormant') }));
    expect(await screen.findByText('Bruno Páez')).toBeInTheDocument();
    expect(screen.queryByText('Ana Torres')).not.toBeInTheDocument();
  });

  it('shows the empty state when a search matches nobody', async () => {
    setup();
    await screen.findByText('Ana Torres');
    fireEvent.change(screen.getByLabelText(t('crm.search')), { target: { value: 'zzz' } });
    expect(await screen.findByText(t('crm.emptyFiltered'))).toBeInTheDocument();
  });

  it('opens the file with a prefilled wa.me link and saves tags and note', async () => {
    setup();
    fireEvent.click(
      await screen.findByRole('button', { name: t('crm.open', { name: 'Ana Torres' }) }),
    );
    const link = await screen.findByRole('link', { name: t('crm.wa.send') });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5491155550101\?text=Hola%20Ana/);
    fireEvent.change(screen.getByLabelText(t('crm.wa.template')), { target: { value: 'promo' } });
    expect(screen.getByRole('link', { name: t('crm.wa.send') }).getAttribute('href')).toContain(
      encodeURIComponent('promo'),
    );

    fireEvent.change(screen.getByLabelText(t('crm.notes.notes')), { target: { value: 'VIP' } });
    fireEvent.click(screen.getByRole('button', { name: t('crm.notes.save') }));
    expect(await screen.findByText(t('crm.notes.saved'))).toBeInTheDocument();
  });

  it('explains when the player has no phone', async () => {
    setup();
    fireEvent.click(
      await screen.findByRole('button', { name: t('crm.open', { name: 'Dante Gil' }) }),
    );
    expect(await screen.findByText(t('crm.wa.noPhone'))).toBeInTheDocument();
  });
});
