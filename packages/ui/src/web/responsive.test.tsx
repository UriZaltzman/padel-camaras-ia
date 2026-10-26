// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelShell, ResponsiveTable, Sheet } from './responsive';

/** `matchMedia` where `(min-width: N)` is true when N <= width. */
function setViewport(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)/.exec(query)?.[1];
    return {
      matches: min !== undefined && Number(min) <= width,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  }) as unknown as typeof window.matchMedia;
}

afterEach(cleanup);
beforeEach(() => setViewport(375));

const labels = { nav: 'Principal', openMenu: 'Abrir menú', closeMenu: 'Cerrar menú' };
const items = [
  { href: '/a', label: 'Uno' },
  { href: '/b', label: 'Dos' },
];

describe('PanelShell', () => {
  it('opens the navigation as a drawer and closes it with Escape', () => {
    render(
      <PanelShell title="Panel" items={items} labels={labels} currentHref="/b">
        <p>contenido</p>
      </PanelShell>,
    );
    const nav = screen.getByRole('navigation', { hidden: true });
    expect(nav.className).toContain('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(nav.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(screen.getByRole('link', { name: 'Dos' }).getAttribute('aria-current')).toBe('page');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(nav.className).toMatch(/(^|\s)hidden(\s|$)/);
  });
});

describe('ResponsiveTable', () => {
  const columns = [
    { key: 'n', header: 'Nombre', cell: (r: { n: string; p: number }) => r.n },
    { key: 'p', header: 'Precio', cell: (r: { n: string; p: number }) => String(r.p) },
  ];
  const rows = [{ n: 'Club A', p: 10 }];

  it('stacks rows as cards on a phone', () => {
    render(<ResponsiveTable caption="Clubes" columns={columns} rows={rows} rowKey={(r) => r.n} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Precio')).toBeTruthy();
    expect(screen.getByText('Club A')).toBeTruthy();
  });

  it('is a real table from the tablet up', () => {
    setViewport(768);
    render(<ResponsiveTable caption="Clubes" columns={columns} rows={rows} rowKey={(r) => r.n} />);
    expect(screen.getByRole('table')).toBeTruthy();
  });
});

describe('Sheet', () => {
  it('renders only when open and closes with Escape', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open={false} onClose={onClose} title="Detalle">
        <p>cuerpo</p>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <Sheet open onClose={onClose} title="Detalle">
        <p>cuerpo</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Detalle' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
