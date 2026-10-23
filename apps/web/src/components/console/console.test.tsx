import type { ApiClient } from '@app/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildApiClient } from '@/lib/api/client';
import { parseBom } from '@/lib/hardware/bom';

import { ClubDetail } from './club-detail';
import esAR from '@/i18n/es-AR.json';

import { ClubsList } from './clubs-list';
import { ModulesConfigurator } from './modules-configurator';
import { QuoteTool } from './quote-tool';
import { TariffsEditor } from './tariffs-editor';
import { UsageTable } from './usage-table';

const bom = parseBom(`
fx_ars_per_usd: 1000
markup_purchase_plan: 0.25
per_court:
  - { item: "Cámara", qty: 2, usd_estimated_total: 100, status: TODO_COTIZAR }
per_club:
  - { item: "PC", qty: 1, usd_estimated_total: 500, status: QUOTED }
`);

function client(): ApiClient {
  return buildApiClient({
    NEXT_PUBLIC_API_URL: 'http://localhost:3000/v1',
    NEXT_PUBLIC_API_MOCK: true,
  });
}

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

describe('QuoteTool', () => {
  it('computes from the bom it is given and recomputes with the courts', () => {
    render(<QuoteTool bom={bom} />);
    expect(screen.getByTestId('cost').textContent).toContain('US$ 700');
    fireEvent.change(screen.getByLabelText('Cantidad de canchas'), { target: { value: '4' } });
    expect(screen.getByTestId('cost').textContent).toContain('US$ 900');
    expect(screen.getByRole('note').textContent).toContain('TODO_COTIZAR');
  });
});

describe('ClubsList', () => {
  it('lists clubs and filters by status', async () => {
    wrap(<ClubsList client={client()} />);
    expect(await screen.findByText('Club Demo Norte')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Suspendido' }));
    expect(await screen.findByText('Club Demo Centro')).toBeTruthy();
    expect(screen.queryByText('Club Demo Norte')).toBeNull();
  });

  it('shows the empty state when nothing matches', async () => {
    wrap(<ClubsList client={client()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dado de baja' }));
    expect(await screen.findByText('Ningún club coincide con el filtro.')).toBeTruthy();
  });
});

describe('ClubDetail', () => {
  it('switches tabs', async () => {
    wrap(<ClubDetail clubId="01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a02" client={client()} />);
    expect(await screen.findByRole('heading', { name: 'Club Demo Sur' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Contrato' }));
    expect(screen.getByText(/Compra: el club es dueño/)).toBeTruthy();
  });
});

describe('UsageTable', () => {
  it('lists usage and flags clubs near the next tier', async () => {
    wrap(<UsageTable client={client()} />);
    expect(await screen.findByText('Club Demo Sur')).toBeTruthy();
    expect(screen.getAllByText(/Cerca del próximo tramo/).length).toBe(2);
    fireEvent.click(screen.getByLabelText('Solo clubes cerca de cambiar de tramo'));
    await waitFor(() => expect(screen.queryByText('Club Demo Norte')).toBeNull());
  });
});

describe('TariffsEditor', () => {
  it('simulates a club of 900 players and shows its band', async () => {
    wrap(<TariffsEditor client={client()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Simular' }));
    expect((await screen.findByTestId('sim-tier')).textContent).toBe('401 a 1000 jugadores');
    expect(screen.getByTestId('sim-total').textContent).toContain('350.000');
  });

  it('blocks publishing bands with a gap', async () => {
    wrap(<TariffsEditor client={client()} />);
    fireEvent.change(await screen.findByLabelText('Tramo 2: desde'), { target: { value: '150' } });
    expect(screen.getByRole('alert').textContent).toContain('hueco');
    expect(
      (screen.getByRole('button', { name: 'Publicar versión' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('ModulesConfigurator', () => {
  const id = '01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a01';

  it('saves a deposit change and shows the new estimate', async () => {
    wrap(<ModulesConfigurator clubId={id} client={client()} />);
    const toggle = await screen.findByLabelText(esAR['admin.modules.deposit.on']);
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText(esAR['admin.modules.deposit.percentValue']), {
      target: { value: '30' },
    });
    await screen.findByTestId('price-draft');
    fireEvent.click(screen.getByRole('button', { name: esAR['admin.modules.save'] }));
    await screen.findByText(esAR['admin.modules.saved']);
    expect(screen.getByLabelText(esAR['admin.modules.deposit.on'])).toBeChecked();
  });

  it('blocks saving a deposit without a percent', async () => {
    wrap(<ModulesConfigurator clubId="01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a02" client={client()} />);
    fireEvent.click(await screen.findByLabelText(esAR['admin.modules.deposit.on']));
    expect(screen.getByRole('button', { name: esAR['admin.modules.save'] })).toBeDisabled();
    expect(screen.getByText(esAR['admin.modules.problem.depositPercent'])).toBeInTheDocument();
  });

  it('restores the defaults', async () => {
    wrap(<ModulesConfigurator clubId="01928f6e-7c1a-7d4e-9b3a-2f6c8e1d4a03" client={client()} />);
    fireEvent.click(await screen.findByRole('button', { name: esAR['admin.modules.restore'] }));
    expect(screen.getByLabelText(esAR['admin.modules.lessons.whatsapp'])).toBeChecked();
  });
});
