// Which map renders the club pins. Only the built-in `schematic` map exists today: it draws pins
// over the Buenos Aires area with no third-party service, so it needs no account or key. A tile
// or native provider is selected here later (EXPO_PUBLIC_MAP_PROVIDER, EXPO_PUBLIC_MAP_API_KEY);
// the key is a placeholder and lives in the secrets manager, never in the repo.
import { z } from 'zod';

const mapEnv = z.object({
  EXPO_PUBLIC_MAP_PROVIDER: z.enum(['schematic', 'native']).default('schematic'),
  EXPO_PUBLIC_MAP_API_KEY: z.string().optional(),
});

export type MapProvider = 'schematic';

/** Provider to draw with. A provider that is not built yet, or has no key, falls back. */
export function mapProvider(env: Record<string, string | undefined> = process.env): MapProvider {
  mapEnv.parse({
    EXPO_PUBLIC_MAP_PROVIDER: env.EXPO_PUBLIC_MAP_PROVIDER,
    EXPO_PUBLIC_MAP_API_KEY: env.EXPO_PUBLIC_MAP_API_KEY,
  });
  return 'schematic';
}
