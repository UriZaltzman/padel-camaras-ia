import { createApiClient } from '@app/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import { DEMO_CLUB_ID, demoClub } from '@/lib/api/mock-data';
import { createMockFetch } from '@/lib/api/mock-fetch';
import { todayLocal } from '@/lib/player/format';

import { YearCalendar } from './year-calendar';

function setup(today = todayLocal()) {
  const client = createApiClient({
    baseUrl: 'http://localhost:3000/v1',
    fetch: createMockFetch(demoClub),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <YearCalendar clubId={DEMO_CLUB_ID} client={client} today={today} />
    </QueryClientProvider>,
  );
}

const dayButton = (n: number) =>
  screen.getAllByRole('button', { name: new RegExp(`^${n} de [a-zé]+: `) });

describe('YearCalendar', () => {
  it('shows 12 months with today’s occupancy', async () => {
    setup();
    expect(await screen.findAllByRole('heading', { level: 3 })).toHaveLength(12);
    const today = Number(todayLocal().slice(8));
    expect(dayButton(today).some((b) => /[1-9]\d*% ocupado/.test(b.ariaLabel ?? ''))).toBe(true);
  });

  it('blocks a range from the picked days and lists it', async () => {
    setup();
    await screen.findAllByRole('heading', { level: 3 });
    const buttons = screen.getAllByRole('button', { name: /^\d+ de [a-zé]+: / });
    const [first, last] = [buttons.at(200), buttons.at(203)];
    if (!first || !last) throw new Error('calendar not rendered');
    fireEvent.click(first);
    fireEvent.click(last);
    fireEvent.click(screen.getByRole('button', { name: t('yearCal.blockSelection') }));
    const dialog = screen.getByRole('dialog', { name: t('yearCal.modal.title') });
    fireEvent.change(within(dialog).getByLabelText(t('yearCal.modal.reason')), {
      target: { value: 'Cambio de piso' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: t('yearCal.modal.confirm') }));
    expect(await screen.findAllByText(/Cambio de piso/)).not.toHaveLength(0);
  });

  it('refuses to block over bookings unless a policy is chosen', async () => {
    setup();
    await screen.findAllByRole('heading', { level: 3 });
    fireEvent.click(screen.getByRole('button', { name: t('yearCal.newBlock') }));
    const dialog = screen.getByRole('dialog', { name: t('yearCal.modal.title') });
    fireEvent.click(within(dialog).getByRole('button', { name: t('yearCal.modal.confirm') }));
    expect(await within(dialog).findByText(t('yearCal.modal.conflict'))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(t('yearCal.policy.cancel_and_refund')));
    fireEvent.click(within(dialog).getByRole('button', { name: t('yearCal.modal.confirm') }));
    expect(await screen.findByText(/turnos cancelados/)).toBeInTheDocument();
  });

  it('imports the national holidays', async () => {
    setup('2026-10-23');
    await screen.findAllByRole('heading', { level: 3 });
    fireEvent.click(screen.getByRole('button', { name: t('yearCal.importHolidays') }));
    const dialog = screen.getByRole('dialog', { name: t('yearCal.holidays.title') });
    fireEvent.click(within(dialog).getByRole('button', { name: t('yearCal.holidays.confirm') }));
    expect(await screen.findAllByText(new RegExp(t('yearCal.kind.holiday')))).not.toHaveLength(0);
  });
});
