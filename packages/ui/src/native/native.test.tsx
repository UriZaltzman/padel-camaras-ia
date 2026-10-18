// @vitest-environment jsdom
// React Native can't run under vitest, so its primitives are replaced by DOM stand-ins that
// expose the flattened style. That's enough to check what the renderers pass to RN.
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { color } from '../../tokens';

type Style = Record<string, unknown> | Style[] | null | undefined | false;
const flatten = (s: Style): Record<string, unknown> =>
  Array.isArray(s) ? Object.assign({}, ...s.map(flatten)) : s ? s : {};

let pressed = false;
vi.mock('react-native', () => ({
  View: ({ children, style }: { children?: ReactNode; style?: Style }) => (
    <div data-style={JSON.stringify(flatten(style))}>{children}</div>
  ),
  Text: ({ children, style }: { children?: ReactNode; style?: Style }) => (
    <span data-style={JSON.stringify(flatten(style))}>{children}</span>
  ),
  Pressable: ({
    children,
    style,
  }: {
    children?: ReactNode;
    style: (s: { pressed: boolean }) => Style;
  }) => <button data-style={JSON.stringify(flatten(style({ pressed })))}>{children}</button>,
}));

const { Button, Card, DataLabel, ScorePill } = await import('./index');
const styleOf = (el: Element | null) =>
  JSON.parse(el?.getAttribute('data-style') ?? '{}') as Record<string, unknown>;

afterEach(() => {
  cleanup();
  pressed = false;
});

describe('native components', () => {
  it('renders the primary button and uses courtDark when pressed', () => {
    render(<Button label="Reservar" />);
    expect(styleOf(screen.getByRole('button')).backgroundColor).toBe(color.court);
    const text = styleOf(screen.getByText('Reservar'));
    expect(text.fontFamily).toBe('IBMPlexSans_600SemiBold');
    expect(text).not.toHaveProperty('fontWeight');
    cleanup();
    pressed = true;
    render(<Button label="Reservar" />);
    expect(styleOf(screen.getByRole('button')).backgroundColor).toBe(color.courtDark);
  });

  it('renders the mono data label with per-weight family and point tracking', () => {
    render(<DataLabel label="pelota" variant="onDark" />);
    const s = styleOf(screen.getByText('pelota'));
    expect(s.fontFamily).toBe('IBMPlexMono_500Medium');
    expect(s.textTransform).toBe('uppercase');
    expect(s.letterSpacing).toBeCloseTo(12 * 0.12);
    expect(s.color).toBe(color.ball);
  });

  it('renders card and score pill', () => {
    render(
      <Card variant="dark">
        <ScorePill score="6-4" variant="dark" />
      </Card>,
    );
    const score = styleOf(screen.getByText('6-4'));
    expect(score.fontFamily).toBe('Archivo_900Black');
    expect(score.color).toBe(color.ball);
  });
});
