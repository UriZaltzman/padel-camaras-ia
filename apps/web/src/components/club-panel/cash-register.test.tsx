import { createApiClient } from '@app/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import { DEMO_CLUB_ID, demoClub } from '@/lib/api/mock-data';
import { createMockFetch } from '@/lib/api/mock-fetch';
import { todayLocal } from '@/lib/player/format';

import { CashRegister } from './cash-register';

function setup() {
  const client = createApiClient({
    baseUrl: 'http://localhost:3000/v1',
    fetch: createMockFetch(demoClub),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CashRegister clubId={DEMO_CLUB_ID} client={client} today={todayLocal()} />
    </QueryClientProvider>,
  );
}

describe('CashRegister', () => {
  it('lists the movements and totals by payment method', async () => {
    setup();
    expect(await screen.findByText('Marcos Gil · Cancha 1')).toBeInTheDocument();
    expect(screen.getByText(t('cash.total.expected'))).toBeInTheDocument();
    expect(screen.getByText(t('cash.status.open'))).toBeInTheDocument();
  });

  it('shows the empty state on a day without movements', async () => {
    setup();
    await screen.findByText('Marcos Gil · Cancha 1');
    fireEvent.click(screen.getByRole('button', { name: t('cash.next') }));
    expect(await screen.findByText(t('cash.empty'))).toBeInTheDocument();
  });

  it('adds an expense and closes with difference 0', async () => {
    setup();
    await screen.findByText('Marcos Gil · Cancha 1');
    fireEvent.change(screen.getByLabelText(t('cash.expense.description')), {
      target: { value: 'Pelotas' },
    });
    fireEvent.change(screen.getByLabelText(t('cash.expense.amount')), {
      target: { value: '500' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('cash.expense.add') }));
    expect(await screen.findByText('Pelotas')).toBeInTheDocument();

    // 20.000 + 10.000 cash − 500 expense = 29.500
    fireEvent.change(screen.getByLabelText(t('cash.close.counted')), {
      target: { value: '29.500' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('cash.close.submit') }));
    expect(await screen.findByText(t('cash.closed.balanced'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('cash.closed.pdf') })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('cash.close.submit') })).not.toBeInTheDocument();
  });

  it('reports a difference when the count does not match', async () => {
    setup();
    await screen.findByText('Marcos Gil · Cancha 1');
    fireEvent.change(screen.getByLabelText(t('cash.close.counted')), {
      target: { value: '29.000' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('cash.close.submit') }));
    expect(await screen.findByText(/Diferencia: −/)).toBeInTheDocument();
  });
});
