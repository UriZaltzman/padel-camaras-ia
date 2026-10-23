import { createApiClient } from '@app/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { t } from '@/i18n';
import { DEMO_CLUB_ID, demoClub } from '@/lib/api/mock-data';
import { createMockFetch } from '@/lib/api/mock-fetch';

import { TournamentDetail } from './tournament-detail';
import { TournamentsHome } from './tournaments-home';

function clientFor(tournaments: boolean) {
  return createApiClient({
    baseUrl: 'http://localhost:3000/v1',
    fetch: createMockFetch({ ...demoClub, modules: { ...demoClub.modules, tournaments } }),
  });
}
const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

describe('TournamentsHome', () => {
  it('hides the section when the club has the module off', async () => {
    wrap(<TournamentsHome clubId={DEMO_CLUB_ID} client={clientFor(false)} />);
    expect(await screen.findByText(t('tournaments.disabled'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('tournaments.new') })).not.toBeInTheDocument();
  });

  it('lists tournaments and creates one through the wizard', async () => {
    wrap(<TournamentsHome clubId={DEMO_CLUB_ID} client={clientFor(true)} />);
    expect(await screen.findByText('Torneo Apertura 4ª')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('tournaments.new') }));
    fireEvent.click(screen.getByRole('button', { name: t('tournaments.wizard.next') }));
    expect(await screen.findByText(t('tournaments.wizard.invalid'))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(t('tournaments.wizard.name')), {
      target: { value: 'Copa Primavera' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('tournaments.wizard.next') }));
    fireEvent.click(screen.getByRole('button', { name: t('tournaments.category', { n: 3 }) }));
    fireEvent.click(screen.getByRole('button', { name: t('tournaments.wizard.next') }));
    fireEvent.click(screen.getByRole('button', { name: t('tournaments.wizard.next') }));
    fireEvent.click(screen.getByRole('button', { name: t('tournaments.wizard.create') }));
    expect(
      await screen.findByRole('link', { name: t('tournaments.open', { name: 'Copa Primavera' }) }),
    ).toBeInTheDocument();
  });
});

describe('TournamentDetail', () => {
  async function openSeeded() {
    const client = clientFor(true);
    const { data } = await client.GET('/clubs/{id}/tournaments', {
      params: { path: { id: DEMO_CLUB_ID } },
    });
    const id = data?.items[0]?.id ?? '';
    wrap(
      <TournamentDetail
        clubId={DEMO_CLUB_ID}
        tournamentId={id}
        client={client}
        today="2026-11-07"
        origin="https://club.test"
      />,
    );
  }

  it('invites a CRM player with a prefilled WhatsApp link and shows the public link', async () => {
    await openSeeded();
    expect(await screen.findByDisplayValue(/^https:\/\/club\.test\/clubes\//)).toBeInTheDocument();
    const link = await screen.findByRole('link', {
      name: t('tournaments.invite.send', { name: 'Ana Torres' }),
    });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5491155550101\?text=Hola%20Ana/);
  });

  it('draws, shows groups and bracket, and takes a result', async () => {
    await openSeeded();
    fireEvent.click(await screen.findByLabelText('Cancha 1'));
    fireEvent.click(screen.getByLabelText('Cancha 2'));
    fireEvent.click(screen.getByRole('button', { name: t('tournaments.draw.submit') }));
    expect(
      await screen.findByRole('table', { name: t('tournaments.groups.group', { letter: 'A' }) }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('tournaments.stage.semi') })).toBeInTheDocument();

    const enter = screen.getAllByRole('button', { name: /^Cargar resultado de/ })[0];
    if (!enter) throw new Error('no match to enter');
    fireEvent.click(enter);
    const form = await screen.findByRole('form', { name: /^Resultado:/ });
    const boxes = within(form).getAllByRole('textbox');
    fireEvent.change(boxes[0] as HTMLElement, { target: { value: '6' } });
    fireEvent.change(boxes[1] as HTMLElement, { target: { value: '5' } });
    fireEvent.change(boxes[2] as HTMLElement, { target: { value: '6' } });
    fireEvent.change(boxes[3] as HTMLElement, { target: { value: '2' } });
    fireEvent.click(within(form).getByRole('button', { name: t('tournaments.result.save') }));
    expect(await screen.findByText(t('tournaments.result.invalid'))).toBeInTheDocument();
    fireEvent.change(boxes[1] as HTMLElement, { target: { value: '3' } });
    fireEvent.click(within(form).getByRole('button', { name: t('tournaments.result.save') }));
    expect(await screen.findByText(/6-3 6-2/)).toBeInTheDocument();
  });

  it('explains when courts and slots do not fit', async () => {
    await openSeeded();
    fireEvent.click(await screen.findByLabelText('Cancha 1'));
    fireEvent.change(screen.getByLabelText(t('tournaments.draw.to')), {
      target: { value: '10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('tournaments.draw.submit') }));
    expect(
      await screen.findByText(t('tournaments.draw.error.TOURNAMENT_NOT_ENOUGH_SLOTS')),
    ).toBeInTheDocument();
  });
});
