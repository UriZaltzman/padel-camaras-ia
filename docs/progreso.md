# Progreso

Lo actualiza el orquestador cada viernes o cuando se lo piden. Corto y en español.

## 18/10/2026 · Fin de la primera semana

**Resumen:** 33 de 203 issues cerrados. No hay PR abiertos ni agentes trabajando. Nada está en producción (todavía no existe ese entorno).

**Qué está hecho**

| Área | Qué hay |
| --- | --- |
| Repo y CI | Monorepo, chequeos en cada PR (formato, tipos, pruebas, licencias, tipos generados al día, imagen del equipo del club, simulador con video real) |
| Contrato de la API | Base (errores, paginación, límites), salud, login y usuarios, clubes y canchas, estados de cada entidad, 12 eventos. Tipos generados para TypeScript y Python |
| Base de datos | Personas, clubes, contratos, reglas de reserva, reservas y jugadores de la reserva, con reglas en la base (menores, seña, duraciones) |
| API | Base en NestJS (configuración, logs sin datos personales, errores) y pruebas que verifican que cumpla el contrato |
| App | Base en Expo y pantallas de ingreso (WhatsApp, Google, Apple, términos). Funciona contra un simulador del backend |
| Web | Base en Next.js, landing pública con formulario para clubes (todavía no envía nada), componentes compartidos con la app |
| Equipo del club | Configuración, grabador (probado con video real en CI), subidor reanudable con límite de velocidad, simulador de cámaras fuera de la imagen de producción |
| IA | Umbrales, formato de etiquetas, herramienta de etiquetado (golpes, piques, tipo de golpe), conversores de CVAT, medidor de velocidad, relevamiento de videos existentes (ADR 0002) |

**Qué está a medias (issues abiertos que esperan una prueba real)**

- #9 subidor: falta probarlo contra MinIO en CI.
- #13 y #14 herramienta de etiquetado: falta que una persona etiquete un partido y clasifique 50 golpes en el navegador.
- #18 medidor de velocidad: falta medir en la GPU del club.

**Qué sigue (próxima tanda, sin dependencias pendientes)**

Contratos de reservas, partidos y media, y del equipo del club; resto del schema (equipos, partidos, pagos) y seguridad por fila; en la API, login, clubes y reservas; en la app, perfil, inicio y reservas; en la web, el panel del club; en el equipo del club, agenda y salud; en la IA, etiquetado de ganador de punto y plan de etiquetado.

**Qué necesita decisión de una persona**

1. Club amigo para grabar partidos propios (#2) y compra del equipo de la fase 0 (#3). Siguen siendo necesarios: no hay videos públicos de pádel que se puedan usar para entrenar.
2. Cuentas de nube para desarrollo (#80).
3. Licencia de FFmpeg en el equipo del club (#196).
4. Dos umbrales de la IA que la especificación no define (#198).
5. Cinco huecos en los estados de reservas y partidos (#220).
6. Horas para devolver la seña: por cancha o por club (#242).
7. Nombre definitivo de la marca (#182), antes del piloto.

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
