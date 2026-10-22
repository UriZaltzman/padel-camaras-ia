import { createApiClient } from '@app/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import { DEMO_CLUB_ID, demoClub } from '@/lib/api/mock-data';
import { createMockFetch } from '@/lib/api/mock-fetch';
import { todayLocal } from '@/lib/player/format';

import { BookingCalendar } from './booking-calendar';

function setup() {
  const client = createApiClient({
    baseUrl: 'http://localhost:3000/v1',
    fetch: createMockFetch(demoClub),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BookingCalendar clubId={DEMO_CLUB_ID} client={client} today={todayLocal()} />
    </QueryClientProvider>,
  );
}

describe('BookingCalendar', () => {
  it('shows today’s turns by court with their state', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: /Lucía Pérez.*Seña pagada/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Marcos Gil.*Pagado/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Diego Ruiz.*Manual/ })).toBeInTheDocument();
    expect(screen.queryByText(t('calendar.empty'))).not.toBeInTheDocument();
  });

  it('shows the empty state on a day without turns', async () => {
    setup();
    await screen.findByRole('button', { name: /Lucía Pérez/ });
    fireEvent.click(screen.getByRole('button', { name: t('calendar.next') }));
    fireEvent.click(screen.getByRole('button', { name: t('calendar.next') }));
    expect(await screen.findByText(t('calendar.emptyOther'))).toBeInTheDocument();
  });

  it('switches to the week view', async () => {
    setup();
    await screen.findByRole('button', { name: /Lucía Pérez/ });
    fireEvent.click(screen.getByRole('button', { name: t('calendar.view.week') }));
    expect(await screen.findAllByRole('columnheader')).toHaveLength(7);
    expect(await screen.findByRole('button', { name: /Sofía Díaz/ })).toBeInTheDocument();
  });

  it('opens the detail and cancels after confirming', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Marcos Gil/ }));
    const dialog = screen.getByRole('dialog', { name: t('calendar.detail.title') });
    expect(within(dialog).getByText('Marcos Gil')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: t('calendar.cancel') }));
    fireEvent.click(within(dialog).getByRole('button', { name: t('calendar.cancel.confirm') }));
    expect(await within(dialog).findByText(t('calendar.cancel.done'))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: t('calendar.detail.close') }));
    expect(screen.queryByRole('button', { name: /Marcos Gil/ })).not.toBeInTheDocument();
  });
});
