// Texts of the responsive shells and tables. Kept in its own file (not es-AR.json) so the shared
// message file is not touched; same `{name}` placeholders as `t`.
import messages from './responsive.es-AR.json';

export type ResponsiveKey = keyof typeof messages;

export function tr(key: ResponsiveKey, values: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Missing value for "{${name}}" in message "${key}"`);
    return String(value);
  });
}
