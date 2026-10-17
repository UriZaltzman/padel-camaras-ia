# Marca

Fuente visual: canvas "Propuesta de marca" (https://claude.ai/artifact/Xwu8YFz7pvmquiRK7UfSZ2).

## Nombre (provisorio)

| Clave | Valor actual | Estado |
| --- | --- | --- |
| `BRAND_NAME` | `rebote` | Provisorio. Falta buscar en INPI (clases 9 y 41) y comprar dominio |
| `BRAND_SLUG` | `rebote` | Se usa en bundle id, nombres de paquetes y subdominios |
| `BRAND_DOMAIN` | `rebote.com.ar` | Sin comprar |
| `BRAND_TAGLINE` | `Tu partido, visto entero.` | Propuesto |

Alternativas evaluadas: `pique`, `vidrio`. Descartados por existir: "Bandeja AI", "Contrapared".

**Regla para el código:** el nombre de la marca no se escribe nunca a mano en el código ni en los textos. Vive en un solo lugar, `packages/config/brand.ts` (y su espejo `packages/config/brand.py` para Python), y en las traducciones se usa la variable `{brand}`. Cambiar de nombre tiene que ser cambiar ese archivo, el `app.json` de Expo y los assets del logo, nada más.

```ts
// packages/config/brand.ts
export const brand = {
  name: 'rebote',            // BRAND_NAME (provisorio)
  slug: 'rebote',            // BRAND_SLUG
  domain: 'rebote.com.ar',   // BRAND_DOMAIN
  tagline: 'Tu partido, visto entero.',
  bundleId: 'ar.rebote.app', // cambia junto con el nombre, antes de publicar en tiendas
} as const;
```

## Colores

| Token | Hex | Uso |
| --- | --- | --- |
| `color.court` (Azul cancha) | `#2348E6` | Color principal, botones, cancha dibujada |
| `color.courtDark` | `#1A36B0` | Hover y presionado del azul, cancha en tarjetas |
| `color.ball` (Amarillo pelota) | `#D9F24A` | Acento. **Solo sobre azul o noche**, nunca sobre fondo claro (no contrasta) |
| `color.night` (Noche) | `#0B1328` | Texto principal, modo "lo que ve la cámara", fondo de reels |
| `color.glass` (Vidrio) | `#F2F4F7` | Fondo general de app y web |
| `color.alert` (Alerta) | `#E8590C` | Puntos perdidos, errores, zonas débiles |
| `color.ink2` | `#2B3447` | Texto secundario |
| `color.ink3` | `#4A5468` | Etiquetas y texto terciario |
| `color.line` | `#D5DAE3` | Bordes de tarjetas y divisores |
| `color.white` | `#FFFFFF` | Tarjetas y texto sobre azul |

Contraste mínimo WCAG AA en todo texto. El modo oscuro usa `night` de fondo y `ball` como acento.

## Tipografía

| Uso | Fuente | Pesos |
| --- | --- | --- |
| Títulos, frases de insight, marcador | Archivo | 800, 900 (tracking -0,02em) |
| Textos y pantallas | IBM Plex Sans | 400, 500, 600 |
| Etiquetas de datos e IA (`CANCHA · JUGADORES · PELOTA`) | IBM Plex Mono | 500, mayúsculas, tracking 0,12em |

Las tres son de Google Fonts con licencia OFL. En la app se cargan con `expo-font`; en la web con `next/font`.

## Logo

Símbolo: la trayectoria de la pelota que baja, pica y sube, con la pelota amarilla en el punto alto. Wordmark: el nombre en Archivo 900 en minúscula seguido de un punto de color (azul sobre claro, amarillo sobre oscuro).

```svg
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="16" fill="#2348E6"/>
  <path d="M14 16 L30 44 L48 22" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="48" cy="18" r="6" fill="#D9F24A"/>
</svg>
```

Se usa como ícono de la app, en el cartel de cada cancha (junto al QR) y como marca de agua en videos y reels (esquina inferior, 60% de opacidad). El logo del club siempre aparece junto al nuestro: el club es el anfitrión.

## Cómo habla

- Frases cortas, con punto final, que dicen qué pasó y qué hacer.
- Voseo rioplatense: "subí con él", "mirá tu partido".
- Sin tecnicismos: no decimos "algoritmo", "inteligencia artificial revolucionaria" ni "optimizá tu rendimiento".
- Ningún número que no se use para decidir algo.

Ejemplos: "Nadie lo vio entero. Ni vos." · "La red que nadie cubrió." · "El mismo lado. Otra vez." · "Tu mejor punto ya está en tu celular."

## Reel vertical

1080x1920, fondo `night`, etiqueta mono en amarillo arriba (`● REC · CANCHA 2`), logo del club arriba a la derecha, frase grande en Archivo 900 con la segunda línea en amarillo, marcador en una pastilla blanca y wordmark al cierre.
