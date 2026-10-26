// All user-facing Spanish text of the app, one file per module in ./es-AR/ (each file holds one
// top-level namespace such as `home` or `signIn`). To add text, edit your module's file, or add a
// new file and one import line below in alphabetical order; nobody edits a shared file.
// `mergeLocale` throws if two files define the same key (locale.test.ts also checks the files).
import court from './es-AR/court.json';
import favorites from './es-AR/favorites.json';
import findSlot from './es-AR/find-slot.json';
import home from './es-AR/home.json';
import match from './es-AR/match.json';
import profile from './es-AR/profile.json';
import settings from './es-AR/settings.json';
import signIn from './es-AR/sign-in.json';
import tournaments from './es-AR/tournaments.json';

export const localeParts = {
  court: court,
  favorites: favorites,
  'find-slot': findSlot,
  home: home,
  match: match,
  profile: profile,
  settings: settings,
  'sign-in': signIn,
  tournaments: tournaments,
} as const;

type Parts = typeof localeParts;
type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;
export type Locale = UnionToIntersection<Parts[keyof Parts]>;

interface Tree {
  [key: string]: string | Tree;
}

/** Deep-merges the module files; a leaf defined twice (same path) is a mistake, not an override. */
export function mergeLocale(parts: Record<string, object>): Tree {
  const merged: Tree = {};
  const owner = new Map<string, string>();
  const add = (target: Tree, tree: Tree, path: string[], file: string): void => {
    for (const [key, value] of Object.entries(tree)) {
      const here = [...path, key];
      if (typeof value === 'string') {
        const id = here.join('.');
        const first = owner.get(id);
        if (first !== undefined || key in target) {
          throw new Error(
            `i18n key "${id}" is defined in both es-AR/${first ?? '?'}.json and es-AR/${file}.json`,
          );
        }
        owner.set(id, file);
        target[key] = value;
      } else {
        const child = target[key];
        const next: Tree = typeof child === 'object' ? child : {};
        target[key] = next;
        add(next, value, here, file);
      }
    }
  };
  for (const [file, tree] of Object.entries(parts)) add(merged, tree as Tree, [], file);
  return merged;
}

export const esAR = mergeLocale(localeParts) as Locale;
