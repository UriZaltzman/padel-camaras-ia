// All user-facing Spanish text of the web, one file per module in ./messages/. To add text, add a
// key to your module's file (or add a new file and one import line below, in alphabetical order);
// nobody edits a shared file. `mergeMessages` throws if two files define the same key, and
// messages.test.ts checks that every file in ./messages is registered here.
// Relative imports only: the Playwright specs import this file too, where `@/` does not exist.
import adminCore from './messages/admin-core.json' with { type: 'json' };
import adminModules from './messages/admin-modules.json' with { type: 'json' };
import adminOnboarding from './messages/admin-onboarding.json' with { type: 'json' };
import adminTariffs from './messages/admin-tariffs.json' with { type: 'json' };
import adminUsage from './messages/admin-usage.json' with { type: 'json' };
import brand from './messages/brand.json' with { type: 'json' };
import calendar from './messages/calendar.json' with { type: 'json' };
import cash from './messages/cash.json' with { type: 'json' };
import courts from './messages/courts.json' with { type: 'json' };
import crm from './messages/crm.json' with { type: 'json' };
import playerAuth from './messages/player-auth.json' with { type: 'json' };
import playerBooking from './messages/player-booking.json' with { type: 'json' };
import responsive from './messages/responsive.json' with { type: 'json' };
import site from './messages/site.json' with { type: 'json' };
import tournaments from './messages/tournaments.json' with { type: 'json' };
import yearCalendar from './messages/year-calendar.json' with { type: 'json' };

export const messageParts = {
  'admin-core': adminCore,
  'admin-modules': adminModules,
  'admin-onboarding': adminOnboarding,
  'admin-tariffs': adminTariffs,
  'admin-usage': adminUsage,
  brand: brand,
  calendar: calendar,
  cash: cash,
  courts: courts,
  crm: crm,
  'player-auth': playerAuth,
  'player-booking': playerBooking,
  responsive: responsive,
  site: site,
  tournaments: tournaments,
  'year-calendar': yearCalendar,
} as const;

type Parts = typeof messageParts;
type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;
export type Messages = UnionToIntersection<Parts[keyof Parts]>;

/** Merges the module files into one flat map; a key defined twice is a mistake, not an override. */
export function mergeMessages(
  parts: Record<string, Record<string, string>>,
): Record<string, string> {
  const merged: Record<string, string> = {};
  const owner = new Map<string, string>();
  for (const [file, messages] of Object.entries(parts)) {
    for (const [key, text] of Object.entries(messages)) {
      const first = owner.get(key);
      if (first !== undefined) {
        throw new Error(
          `i18n key "${key}" is defined in both messages/${first}.json and messages/${file}.json`,
        );
      }
      owner.set(key, file);
      merged[key] = text;
    }
  }
  return merged;
}

export const messages = mergeMessages(messageParts) as Messages;
