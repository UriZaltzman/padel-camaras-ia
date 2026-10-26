// i18n: every user-facing text lives in locales/es-AR/*.json. The brand name is never written
// there: texts use `{brand}`, filled from packages/config/brand.ts.
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { brand } from '@app/config/brand';

import { esAR } from './locales';

export const defaultLocale = 'es-AR';

void i18next.use(initReactI18next).init({
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  resources: { [defaultLocale]: { translation: esAR } },
  initAsync: false,
  interpolation: {
    prefix: '{',
    suffix: '}',
    escapeValue: false, // React Native already escapes
    defaultVariables: { brand: brand.name },
  },
});

export const i18n = i18next;
