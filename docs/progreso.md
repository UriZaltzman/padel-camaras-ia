# Progreso

Lo actualiza el orquestador cada viernes o cuando se lo piden. Corto y en español.

## 17/10/2026 · Arranque

**Qué se cerró**

- Repositorio público creado: `UriZaltzman/padel-camaras-ia`.
- PR #1 (bootstrap del monorepo) abierto, esperando aprobación.
- Tablero: https://github.com/users/UriZaltzman/projects/1 (Pendiente, En curso, En revisión, Esperando aprobación, Listo).
- 190 issues creados para las 5 fases, con etiquetas de agente, fase y tipo (plan en `.github/planning/issues.yaml`, PR #7).
- Primeros PR de los agentes, abiertos y revisados (todos aprobados por qa-seguridad o arquitecto, esperan tu OK):

| PR | Agente | Issue | Qué trae |
| --- | --- | --- | --- |
| #191 | club-devops | #5 | Base del agente del club: configuración validada, logs JSON, SQLite, imagen Docker |
| #197 | vision-ia | #11 | Base de `ml/`: todos los umbrales iniciales en `thresholds.yaml`, esquemas y Parquet |
| #199 | arquitecto | #20 | Contrato OpenAPI base: formato de error, 33 códigos de error, paginación, límites |
| #200 | qa-seguridad | #111 | Chequeo de licencias en CI (nada AGPL/GPL, registro de modelos) |

**Resumen por fase**

| Fase | Issues | Estado |
| --- | --- | --- |
| 0. Grabar partidos reales | 17 | En curso: agente del club y base de IA en revisión |
| 1. Grabación y plataforma | 99 | En curso: contrato base y chequeo de licencias en revisión |
| 2. IA y marcador | 22 | Espera la fase 0 |
| 3. Estadísticas y entrenador | 41 | Espera fases 1 y 2 |
| 4. Piloto pago | 11 | Espera fase 3 |

**Qué está trabado**

- Mientras el PR #1 no entre, `main` está vacío: los PR de los agentes apuntan a la rama del bootstrap y **el CI no corre en ellos** (se probaron en local).

**Qué necesita decisión de una persona**

1. Aprobar el PR #1 (y después #7, #191, #197, #199, #200 con su revisión).
2. Club amigo para la fase 0 (#2) y compra del equipo de la fase 0 (#3).
3. Cuentas de nube para desarrollo (#80).
4. Licencia de FFmpeg en la imagen del club (#196).
5. Dos umbrales que la especificación no define (#198).
6. Revisar las 7 decisiones del contrato base en el PR #199 (códigos de error, estados HTTP, límites).
7. Licencias: si se permite LGPL y si se aceptan las librerías CUDA de NVIDIA en el equipo del club (PR #200).
