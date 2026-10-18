import { act, cleanup, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { brand } from '@app/config/brand';
import { color } from '@app/ui/tokens';

import { i18n } from '../i18n';
import esAR from '../i18n/locales/es-AR.json';
import HomeScreen from '../app/index';

describe('HomeScreen', () => {
  afterEach(async () => {
    await cleanup();
    await act(() => i18n.changeLanguage('es-AR'));
  });

  it('renders the es-AR texts with the brand name interpolated', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText(brand.name)).toBeTruthy();
    expect(screen.getByText(esAR.home.subtitle)).toBeTruthy();
    expect(screen.getByText(esAR.home.primaryAction)).toBeTruthy();
  });

  it('takes every text from i18n, none hardcoded', async () => {
    i18n.addResourceBundle('xx', 'translation', {
      home: {
        dataLabel: 'k1',
        title: 'k2 {brand}',
        subtitle: 'k3',
        body: 'k4',
        primaryAction: 'k5',
      },
    });
    await i18n.changeLanguage('xx');
    await render(<HomeScreen />);
    for (const text of ['k1', `k2 ${brand.name}`, 'k3', 'k4', 'k5']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByText(esAR.home.subtitle)).toBeNull();
  });

  it('uses Vidrio as background and Azul cancha for the primary action', async () => {
    await render(<HomeScreen />);
    const bg = StyleSheet.flatten(screen.getByTestId('home-screen').props.style);
    expect(bg.backgroundColor).toBe(color.glass);
    const button = StyleSheet.flatten(screen.getByTestId('home-primary-action').props.style);
    expect(button.backgroundColor).toBe(color.court);
  });

  it('never writes the brand name by hand in the es-AR texts', () => {
    expect(JSON.stringify(esAR).toLowerCase()).not.toContain(brand.name.toLowerCase());
  });
});
