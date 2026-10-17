# Datos provisorios y pendientes

El proyecto arranca sin tres datos: el nombre definitivo de la marca, los nombres de los clubes y la cotización del hardware. Para que el desarrollo no espere, cada uno tiene un valor provisorio con una marca que se puede buscar en el repo. Antes de salir a producción, `grep -rn "TODO_" .` tiene que dar vacío.

| Marca en el código | Qué falta | Dónde vive | Quién lo completa |
| --- | --- | --- | --- |
| `BRAND_NAME` | Nombre definitivo (hoy `rebote`) | `packages/config/brand.ts`, `brand.py`, `apps/mobile/app.json`, assets del logo | Uri y socios, después de INPI y dominio |
| `TODO_CLUB` | Clubes reales | Solo en datos de prueba (`services/api/prisma/seed.ts`) | Nadie: los clubes reales se cargan desde la consola interna, nunca en código |
| `TODO_COTIZAR` | Precios reales del hardware | `infra/hardware/bom.yaml` | Uri, con 2 o 3 proveedores locales |

## Clubes de prueba (seed)

Los clubes de prueba son ficticios y tienen que parecerlo, para que nadie los confunda con un cliente.

| Club | Zona | Canchas | Plan | Uso |
| --- | --- | --- | --- | --- |
| Club Demo Palermo | CABA | 4 (2 techadas) | `loan` (comodato) | Club principal de pruebas y de demos de venta |
| Club Demo Quilmes | PBA sur | 2 | `purchase` (compra) | Probar el plan de compra y un club con internet lento |
| Club Demo Pilar | PBA norte | 6 | `loan` | Probar varias canchas en simultáneo |

Cada club de prueba tiene: un dueño, un staff, dos entrenadores, 24 jugadores con categorías de 8va a 3ra, reglas de reserva de 60, 90 y 120 minutos, y 30 partidos de ejemplo ya analizados (generados a partir de un partido real etiquetado de la fase 0 cuando exista; hasta entonces, datos sintéticos coherentes con el marcador).

## Hardware

`infra/hardware/bom.yaml` lleva la lista de materiales con precios estimados en USD (tipo de cambio ARS 1.535/USD, a actualizar). Cada precio tiene `status: TODO_COTIZAR` hasta que haya una cotización real con proveedor, fecha y validez.

```yaml
fx_ars_per_usd: 1535          # TODO_COTIZAR: actualizar al cotizar (Rava, 9/10/2026)
markup_purchase_plan: 0.25    # plan compra: costo + 25%
per_court:
  - { item: "Cámara IP 8MP (4K) PoE de exterior, lente 2,8-4 mm", qty: 2, usd_estimated_total: 300, status: TODO_COTIZAR }
  - { item: "Soportes elevados detrás del vidrio de fondo", qty: 2, usd_estimated_total: 120, status: TODO_COTIZAR }
  - { item: "Botón inalámbrico para clips + cartel con QR", qty: 1, usd_estimated_total: 40, status: TODO_COTIZAR }
  - { item: "Cable UTP de exterior, caños e instalación", qty: 1, usd_estimated_total: 180, status: TODO_COTIZAR }
per_club:
  - { item: "Computadora con GPU clase RTX 4060, 32 GB, disco 2 TB", qty: 1, usd_estimated_total: 1300, status: TODO_COTIZAR }
  - { item: "Switch PoE de 8 puertos", qty: 1, usd_estimated_total: 130, status: TODO_COTIZAR }
  - { item: "UPS de 1 kVA", qty: 1, usd_estimated_total: 150, status: TODO_COTIZAR }
  - { item: "Router 4G de respaldo", qty: 1, usd_estimated_total: 100, status: TODO_COTIZAR }
  - { item: "Gabinete con ventilación", qty: 1, usd_estimated_total: 80, status: TODO_COTIZAR }
# Control: 4 canchas x 640 + 1.760 = US$4.320 (ARS 6.631.200)
```

Los valores salen de la sección "Hardware y presupuesto del combo" de `docs/estructura.md`; si difieren, manda ese documento. El cotizador del panel interno lee este archivo, así que cuando lleguen los precios reales no hay que tocar código.

## Otros pendientes (no bloquean el desarrollo)

- Rangos de referencia del modo clase y catálogo de consejos: se definen con 2 o 3 entrenadores durante el piloto.
- Velocidad real del pipeline en la GPU del club: se mide en la fase 0.
- Club amigo para grabar los 100 partidos de la fase 0.
