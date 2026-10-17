// Design tokens from docs/marca.md. Shared by apps/web (Tailwind) and apps/mobile.
// Rule: `ball` is an accent only on `court`/`courtDark`/`night` backgrounds, never on light ones.

export const color = {
  court: '#2348E6', // Azul cancha: color principal, botones, cancha dibujada
  courtDark: '#1A36B0', // Hover y presionado del azul, cancha en tarjetas
  ball: '#D9F24A', // Amarillo pelota: acento, solo sobre azul o noche
  night: '#0B1328', // Texto principal, modo "lo que ve la cámara", fondo de reels
  glass: '#F2F4F7', // Fondo general de app y web
  alert: '#E8590C', // Puntos perdidos, errores, zonas débiles
  ink2: '#2B3447', // Texto secundario
  ink3: '#4A5468', // Etiquetas y texto terciario
  line: '#D5DAE3', // Bordes de tarjetas y divisores
  white: '#FFFFFF', // Tarjetas y texto sobre azul
} as const;

export type ColorToken = keyof typeof color;

/** Semantic roles per theme. Dark mode uses `night` as background and `ball` as accent. */
export const theme = {
  light: {
    background: color.glass,
    surface: color.white,
    text: color.night,
    textSecondary: color.ink2,
    textTertiary: color.ink3,
    border: color.line,
    primary: color.court,
    primaryPressed: color.courtDark,
    onPrimary: color.white,
    accent: color.court,
    danger: color.alert,
  },
  dark: {
    background: color.night,
    surface: color.ink2,
    text: color.white,
    textSecondary: color.line,
    textTertiary: color.line,
    border: color.ink3,
    primary: color.court,
    primaryPressed: color.courtDark,
    onPrimary: color.white,
    accent: color.ball,
    danger: color.alert,
  },
} as const;

export const fontFamily = {
  display: 'Archivo', // Títulos, frases de insight, marcador
  body: 'IBM Plex Sans', // Textos y pantallas
  mono: 'IBM Plex Mono', // Etiquetas de datos e IA, en mayúsculas
} as const;

export const typography = {
  display: { fontFamily: fontFamily.display, fontWeights: [800, 900], letterSpacingEm: -0.02 },
  body: { fontFamily: fontFamily.body, fontWeights: [400, 500, 600], letterSpacingEm: 0 },
  dataLabel: {
    fontFamily: fontFamily.mono,
    fontWeights: [500],
    letterSpacingEm: 0.12,
    textTransform: 'uppercase',
  },
} as const;

export const tokens = { color, theme, fontFamily, typography } as const;
