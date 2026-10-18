import { nth } from '@/test-utils/nth';
import { createApiClient } from '@app/contracts';
import type { Schema } from '@app/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { t } from '@/i18n';
import { DEMO_CLUB_ID, demoClub } from '@/lib/api/mock-data';
import { createMockFetch } from '@/lib/api/mock-fetch';

import { CourtSettingsPanel } from './court-settings-panel';

/** Renders the panel against `fetchImpl` and records the body of every PATCH it sends. */
function setup(fetchImpl: typeof fetch = createMockFetch()) {
  const patches: Schema<'ClubSettingsUpdate'>[] = [];
  const fetchSpy = vi.fn<typeof fetch>(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.method === 'PATCH') {
      patches.push((await request.clone().json()) as Schema<'ClubSettingsUpdate'>);
    }
    return fetchImpl(request);
  });
  const client = createApiClient({ baseUrl: 'http://localhost:3000/v1', fetch: fetchSpy });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CourtSettingsPanel clubId={DEMO_CLUB_ID} client={client} />
    </QueryClientProvider>,
  );
  return patches;
}

function patchBody(patches: Schema<'ClubSettingsUpdate'>[]) {
  expect(patches).toHaveLength(1);
  return nth(patches, 0);
}

const firstBand = () =>
  nth(screen.getAllByRole('group', { name: t('courts.band.label', { n: 1 }) }), 0);
const save = () => fireEvent.click(screen.getByRole('button', { name: t('courts.save') }));

describe('CourtSettingsPanel', () => {
  it('loads the club and shows prices in pesos', async () => {
    setup();
    expect(screen.getByRole('status')).toHaveTextContent(t('courts.loading'));

    expect(await screen.findByText('Club Demo Palermo')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: t('courts.selectCourt') })).toHaveDisplayValue(
      'Cancha 1',
    );
    expect(within(firstBand()).getByLabelText(t('courts.band.price', { n: 60 }))).toHaveValue(
      '16000',
    );
  });

  it('saves an edited peak price in cents', async () => {
    const patches = setup();
    await screen.findByText('Club Demo Palermo');

    const peak = nth(screen.getAllByRole('group', { name: t('courts.band.label', { n: 2 }) }), 0);
    fireEvent.change(within(peak).getByLabelText(t('courts.band.price', { n: 60 })), {
      target: { value: '22.500,50' },
    });
    save();

    expect(await screen.findByText(t('courts.saved'))).toBeInTheDocument();
    const body = patchBody(patches);
    const band = body.courts?.[0]?.booking.rules[0]?.price_bands[1];
    expect(band?.prices[0]).toEqual({ duration_minutes: 60, amount_cents: 2_250_050 });
    // The other court is sent unchanged.
    expect(body.courts?.[1]?.booking).toEqual(nth(demoClub.courts, 1).booking);
  });

  it('shows validation errors and does not call the API', async () => {
    const patches = setup();
    await screen.findByText('Club Demo Palermo');

    fireEvent.change(within(firstBand()).getByLabelText(t('courts.band.price', { n: 90 })), {
      target: { value: '' },
    });
    save();

    const where = t('courts.where.band', { court: 'Cancha 1', rule: 1, band: 1 });
    expect(screen.getByRole('alert')).toHaveTextContent(
      t('courts.error.priceMissing', { where, n: 90 }),
    );
    expect(patches).toHaveLength(0);
  });

  it('shows an error when saving fails', async () => {
    const mock = createMockFetch();
    setup(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.method === 'PATCH') {
        return new Response(JSON.stringify({ code: 'INTERNAL', message: 'x' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return mock(request);
    });
    await screen.findByText('Club Demo Palermo');
    save();

    expect(await screen.findByText(t('courts.saveFailed'))).toBeInTheDocument();
  });

  it('edits deposit and hours of another court', async () => {
    const patches = setup();
    await screen.findByText('Club Demo Palermo');

    fireEvent.change(screen.getByRole('combobox', { name: t('courts.selectCourt') }), {
      target: { value: '1' },
    });
    expect(screen.getByText(t('courts.rules.empty'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: t('courts.deposit.fixed') }));
    fireEvent.change(screen.getByLabelText(t('courts.deposit.amountValue')), {
      target: { value: '5000' },
    });
    fireEvent.change(screen.getByLabelText(t('courts.cancellation.hours')), {
      target: { value: '12' },
    });
    save();

    await screen.findByText(t('courts.saved'));
    const body = patchBody(patches);
    expect(body.courts?.[1]?.booking).toMatchObject({
      deposit: { type: 'fixed', amount_cents: 500_000 },
      cancellation_refund_hours: 12,
    });
  });

  it('shows an error when the club cannot be loaded', async () => {
    setup(async () => new Response('{}', { status: 503 }));
    expect(await screen.findByText(t('courts.loadFailed'))).toBeInTheDocument();
  });
});
