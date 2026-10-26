# Pruebas responsive de la web

Reglas y comandos del sistema responsive de `apps/web` (issue #342). Las reglas salen de la sección 2 del plan de construcción responsive; este archivo es lo que se usa en el día a día.

## Reglas de diseño

| Regla | Cómo |
| --- | --- |
| Puntos de corte | Teléfono < 640 px (sin prefijo), tablet `sm` ≥ 640, laptop `lg` ≥ 1024, ancho `wide` ≥ 1440. Una sola definición: `breakpoints` en `packages/ui/src/breakpoints.ts`, copiada a `@theme` de `apps/web/src/app/globals.css` (un test las compara). |
| Altura | `100dvh` (`min-h-dvh`), nunca `100vh`. |
| Áreas seguras | El `viewport` usa `viewportFit: 'cover'`; los bordes usan `env(safe-area-inset-*)` (ver `Container` y `PanelShell`). |
| Campos | 16 px o más (regla base en `globals.css`) para que el iPhone no haga zoom. |
| Toques | 44 × 44 px o más: `min-height` base en botones, campos y `select`. Los links dentro de un texto quedan exentos. |
| Ancho | Nada fuerza el ancho de la página. Lo que no entra scrollea dentro de su caja (`overflow-x-auto`). |

## Componentes (`@app/ui/web`)

- `PanelShell` / `ConsoleShell`: menú lateral desde laptop; debajo, barra superior con botón de menú y cajón (Escape lo cierra). Los textos entran por props.
- `ResponsiveTable`: cada fila es una tarjeta en teléfono; tabla real desde tablet, dentro de una región que scrollea sola.
- `Sheet`: hoja desde abajo en teléfono, diálogo centrado desde tablet.
- `useVisibleCourts(total)` / `visibleCourts(ancho, total)`: regla de la grilla de turnos (1 cancha en teléfono, 2 o 3 en tablet, todas desde laptop). Debajo de laptop un selector mueve la ventana de canchas.
- `useMediaQuery`, `useDeviceClass`, `Container`.

Tailwind tiene que escanear `packages/ui` (`@source` en `globals.css`).

## Dispositivos (proyectos de Playwright)

| Proyecto | Descriptor de Playwright 1.56 | Ancho | Motor |
| --- | --- | --- | --- |
| `iphone-se` | iPhone SE (3rd gen) | 375 | WebKit |
| `iphone-15` | iPhone 15 | 393 | WebKit |
| `pixel-7` | Pixel 7 | 412 | Chromium |
| `ipad-portrait` | iPad Mini | 768 | WebKit |
| `ipad-landscape` | iPad Mini landscape | 1024 | WebKit |
| `laptop` | Desktop Chrome | 1280 | Chromium |
| `desktop` | Desktop Chrome | 1440 | Chromium |

El plan menciona Firefox en la laptop; no se instala (Chromium y WebKit cubren los motores que usan los clubes). El proyecto `chromium` corre las pruebas funcionales de siempre (todo `e2e/` salvo `e2e/responsive`).

## Verificaciones reutilizables (`e2e/support/responsive.ts`)

```ts
import { expectAccessible, expectResponsive, expectScreenshot, screenTitle, test } from '../support/responsive';

test(screenTitle('mi-pantalla', 'cabe en el dispositivo'), async ({ page }) => {
  await page.goto('/mi-ruta');
  await expectResponsive(page); // sin scroll horizontal, nada cortado, toques ≥ 44 px, sin errores de consola
  await expectAccessible(page); // axe: sin violaciones serias o críticas (WCAG 2.1 A y AA)
  await expectScreenshot(page, 'mi-pantalla'); // contra la captura aprobada, tolerancia 2 % de píxeles
});
```

- Usá siempre el `test` de `support/responsive` (registra los errores de consola).
- Una caja con scroll propio puede salirse del ancho; el resto no.
- Accesibilidad: `@axe-core/playwright` (MPL-2.0, permitida por `tests/licenses/policy.yaml`).
- Capturas: las líneas base son por sistema operativo y dispositivo (`e2e/__screenshots__/<os>/<proyecto>/`). Si no hay línea base para el sistema, la captura se adjunta al reporte y no se compara. Para crearla o refrescarla: `pnpm exec playwright test e2e/responsive --update-snapshots`. Hoy no hay líneas base de Linux commiteadas, así que CI solo adjunta.

## Mapa de cobertura

`apps/web/e2e/coverage-map.json` lista cada pantalla (`id`, `surface`, `route`, `spec`). `pnpm e2e:coverage` falla si una pantalla no tiene `spec`, si el archivo no existe, si su prueba no se llama con `screenTitle('<id>', …)` o si nunca llama a `expectResponsive`. Para sumar una pantalla: escribí la prueba en `e2e/responsive/` y agregala al mapa.

## Comandos

Desde `apps/web`:

```bash
pnpm exec playwright install chromium webkit      # una vez
pnpm exec playwright test                         # todo: funcional + los 7 dispositivos
pnpm exec playwright test --project=iphone-se     # un dispositivo
pnpm exec playwright test e2e/responsive --trace on
pnpm exec playwright show-trace test-results/<carpeta>/trace.zip
pnpm exec playwright show-report
pnpm e2e:coverage                                 # chequeo del mapa
```

## Ciclo de autocorrección

Construir, correr la matriz, leer el reporte y la traza, corregir la causa (no la prueba, salvo que estuviera mal escrita: se explica en el PR), repetir. Tope de 5 vueltas; si sigue en rojo se abre un issue con la traza.

## CI (`.github/workflows/web-responsive.yml`)

- En cada PR que toque `apps/web` o `packages/ui`: chequeo de cobertura y 3 dispositivos (`pixel-7` Chromium teléfono, `iphone-15` WebKit teléfono, `desktop` Chromium).
- `workflow_dispatch` y todas las noches (06:00 UTC): los 7 dispositivos.
- Cada trabajo sube el reporte y las trazas como artefacto.
