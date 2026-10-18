# apps/web

Dueño: `web-paneles`.

Next.js: web del partido, panel del club y consola interna. Ver `.claude/agents/web-paneles.md`.

## Estructura

| Dónde                | Qué                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/app`            | App Router. `layout.tsx` carga las fuentes (`fonts.ts`) y TanStack Query (`providers.tsx`)                 |
| `tailwind.config.ts` | Tema de Tailwind armado desde `packages/ui/tokens.ts`. Acá no se escribe ningún color                      |
| `src/i18n`           | Textos de usuario en `es-AR.json`. `t('clave')` completa `{brand}` y `{tagline}` desde `@app/config/brand` |
| `src/lib/api`        | Cliente tipado de `@app/contracts` y un mock que responde con el `Error` del contrato                      |
| `src/lib/env.ts`     | Variables públicas validadas con Zod                                                                       |

## Variables

| Variable               | Por defecto                | Para qué                                                           |
| ---------------------- | -------------------------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`  | `http://localhost:3000/v1` | Raíz de la API, con `/v1`                                          |
| `NEXT_PUBLIC_API_MOCK` | `true`                     | `true` responde desde el mock mientras la API no tenga el endpoint |

## Comandos

```bash
pnpm --filter @app/web dev        # http://localhost:3001
pnpm turbo run lint typecheck test build --filter=@app/web
```
