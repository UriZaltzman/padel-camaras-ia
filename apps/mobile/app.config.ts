// Expo app config. Name, slug, scheme and bundle id come from the single brand source:
// renaming the product is changing packages/config/brand.ts, never this file.
import type { ConfigContext, ExpoConfig } from 'expo/config';

import { createJiti } from 'jiti';

import type * as BrandModule from '@app/config/brand';
import type * as TokensModule from '@app/ui/tokens';

// The config is evaluated by Node, which does not load the workspace's .ts sources on every
// Node 22 release, so they go through jiti. The app code imports them directly (Metro).
declare const __filename: string;
const load = createJiti(__filename);
const { brand } = load('@app/config/brand') as typeof BrandModule;
const { color } = load('@app/ui/tokens') as typeof TokensModule;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: brand.name,
  slug: brand.slug,
  scheme: brand.slug,
  version: '0.1.0',
  orientation: 'portrait',
  // Dark mode (night background, ball accent) comes with its own issue.
  userInterfaceStyle: 'light',
  backgroundColor: color.glass,
  ios: {
    bundleIdentifier: brand.bundleId,
    supportsTablet: false,
  },
  android: {
    package: brand.bundleId,
  },
  web: {
    bundler: 'metro',
  },
  plugins: ['expo-router', 'expo-font', ['expo-splash-screen', { backgroundColor: color.glass }]],
  experiments: {
    typedRoutes: true,
  },
});
