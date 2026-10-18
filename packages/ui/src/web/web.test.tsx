// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { color } from '../../tokens';
import { Button, Card, DataLabel, ScorePill } from './index';

afterEach(cleanup);

function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe('web components', () => {
  it('renders the button label from props and darkens when pressed', () => {
    render(<Button label="Reservar" />);
    const button = screen.getByRole('button', { name: 'Reservar' });
    expect(button.style.backgroundColor).toBe(rgb(color.court));
    expect(button.style.color).toBe(rgb(color.white));
    fireEvent.pointerDown(button);
    expect(button.style.backgroundColor).toBe(rgb(color.courtDark));
    fireEvent.pointerUp(button);
    expect(button.style.backgroundColor).toBe(rgb(color.court));
  });

  it.each(['primary', 'secondary', 'accent'] as const)('renders button %s', (variant) => {
    render(<Button label="x" variant={variant} />);
    expect(screen.getByRole('button').dataset.variant).toBe(variant);
  });

  it.each(['light', 'dark', 'court'] as const)('renders card %s with children', (variant) => {
    render(
      <Card variant={variant}>
        <p>child</p>
      </Card>,
    );
    expect(screen.getByText('child').parentElement?.dataset.variant).toBe(variant);
  });

  it.each(['default', 'onPrimary', 'onDark'] as const)('renders data label %s', (variant) => {
    render(<DataLabel label="cancha" variant={variant} />);
    const el = screen.getByText('cancha');
    expect(el.style.textTransform).toBe('uppercase');
    expect(el.style.letterSpacing).toBe('0.12em');
    expect(el.style.fontFamily).toContain('IBM Plex Mono');
  });

  it.each(['light', 'dark'] as const)('renders score pill %s', (variant) => {
    render(<ScorePill score="6-4" accessibilityLabel="score" variant={variant} />);
    expect(screen.getByLabelText('score').textContent).toBe('6-4');
  });
});
