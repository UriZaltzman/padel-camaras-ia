# Progreso

Lo actualiza el orquestador cada viernes o cuando se lo piden. Corto y en español.

## 17/10/2026 · Arranque

**Qué se cerró**

- Monorepo armado en la rama `orquestador/bootstrap` (pnpm + Turborepo, uv, config compartida, marca provisoria, tokens, Docker Compose, CI). Falta subirlo a GitHub y que una persona apruebe el PR.
- Plan de trabajo listo en `.github/planning/issues.yaml`: 190 tareas en 5 fases, pendientes de crear como issues en GitHub.

**Resumen por fase**

| Fase | Qué entrega | Tareas | Estado |
| --- | --- | --- | --- |
| 0. Grabar partidos reales | Equipo del club mínimo, simulador de cámaras, herramienta de etiquetado, 100 partidos | 17 | Lista para arrancar |
| 1. Grabación y plataforma | Contratos y base (primero), API, agente del club, app, web y paneles, pagos, WhatsApp | 99 | Arranca por los contratos del Arquitecto |
| 2. IA y marcador | Las 9 etapas del pipeline, marcador con 3 capas de corrección, métricas | 22 | Espera la fase 0 (datos etiquetados) |
| 3. Estadísticas y entrenador | Estadísticas, insights, reel, modo clase, cobros de clases, abono, liquidaciones | 41 | Espera fases 1 y 2 |
| 4. Piloto pago | Monitoreo, backups, despliegue a producción, 3 a 5 clubes | 11 | Espera fase 3 |

**Qué está trabado**

- Nada del código. Todo lo que necesita GitHub (repo, PR, issues, tablero) espera tu OK para crear el repositorio.

**Qué necesita decisión de una persona**

1. Crear el repositorio en GitHub (privado) y subir el bootstrap.
2. Club amigo para grabar los 100 partidos de la fase 0.
3. Compra del equipo de la fase 0 (precios estimados, `TODO_COTIZAR`).
4. Cuentas de nube para desarrollo (Vercel, Fly.io, Neon, Upstash, Cloudflare, Expo, Mercado Pago, WhatsApp Business, Sentry, Grafana).
5. Proveedor de GPU por hora para entrenar (Modal o RunPod), antes de la fase 2.
6. Rangos del modo clase y catálogo de consejos con 2 o 3 entrenadores, en la fase 3.
7. Música del reel y proveedor de factura electrónica, en la fase 3.
8. Nombre definitivo de la marca, INPI y dominio, antes del piloto.
9. Clubes del piloto, precios de lista y cotización real del hardware.
