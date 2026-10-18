// Brand fonts from docs/marca.md (all OFL), self-hosted by next/font. Weights follow
// `typography` in packages/ui/tokens.ts; the CSS variables feed the Tailwind theme.
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

export const displayFont = Archivo({
  subsets: ['latin'],
  weight: ['800', '900'],
  variable: '--font-display',
  display: 'swap',
});

export const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

export const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-mono',
  display: 'swap',
});

export const fontVariables = [displayFont, bodyFont, monoFont]
  .map((font) => font.variable)
  .join(' ');
