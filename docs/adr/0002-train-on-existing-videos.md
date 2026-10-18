# 0002. Entrenar primero con videos de pádel existentes

Fecha: 2026-10-17 · Estado: aprobada por una persona (dueño del proyecto) el 2026-10-17

## Contexto

La sección 8 de la especificación y la fase 0 de la hoja de ruta pedían grabar y etiquetar 100 partidos propios antes de entrenar. Eso ata el arranque de la IA a conseguir un club amigo, instalar el equipo final y etiquetar 100 partidos, que es lo más lento y caro de la fase 0. Ya existen videos de partidos de pádel grabados por otros (datasets públicos, videos con licencia abierta, material cedido) que sirven para que los modelos aprendan jugadores, pelota y golpes.

## Decisión

- Los modelos se entrenan primero con videos de pádel existentes cuya licencia permita uso comercial y entrenamiento de modelos. El relevamiento de fuentes es el issue #223 (`ml/docs/datasets.md`).
- Los partidos propios bajan de 100 a 20 a 30, grabados con nuestro equipo de 2 cámaras. Se usan solo para ajuste fino (fine-tuning) y para medir.
- Los 15 partidos que quedan fuera del entrenamiento para medir siguen siendo propios, grabados con nuestras 2 cámaras: la geometría (2 cámaras elevadas detrás del vidrio del fondo, triangulación 3D, superficies de bote) no está en los videos existentes.
- La velocidad del pipeline en la GPU del club se sigue midiendo en la fase 0.

## Consecuencias

- La IA puede empezar a entrenarse antes de tener el club amigo y el equipo instalado.
- La fase 0 graba y etiqueta 20 a 30 partidos en lugar de 100; cambian la hoja de ruta, la sección 8 de la especificación y los pendientes.
- Las métricas mínimas para pasar al piloto pago no cambian y se siguen midiendo sobre los 15 partidos propios.
- Cada fuente externa se registra con su origen y licencia exacta junto con la versión del modelo (MLflow), para poder rastrear con qué datos se entrenó cada uno.

## Riesgos

- **Cambio de dominio:** los videos existentes tienen otros ángulos (en general una cámara alta en el fondo o de transmisión), otra luz y otros vidrios. Lo que aprende el modelo puede no pasar bien a nuestras cámaras. Se mitiga con el ajuste fino sobre partidos propios y midiendo siempre sobre los 15 propios; si no alcanza las métricas, se graban más partidos propios.
- **Botes y 3D:** la triangulación y las superficies de bote dependen de nuestras 2 cámaras; para eso los videos existentes ayudan poco y el peso cae en los partidos propios.
- **Licencias:** solo se usan fuentes con licencia escrita que permita uso comercial y entrenamiento. Quedan prohibidos los datasets, videos y pesos preentrenados con licencia AGPL o GPL, solo para uso no comercial, o con términos poco claros.
- **Datos personales (Ley 25.326):** los videos muestran personas identificables. Se guardan con acceso restringido, solo para entrenar, y se borran si la licencia o el titular lo piden.
- **Jugadores que no aceptan entrenar:** los videos de jugadores que eligieron "no usar mis videos para entrenar" quedan siempre fuera, tanto en partidos propios como en videos existentes donde se los pueda identificar.
- **Menores:** los partidos con menores sin permiso del adulto responsable nunca se usan para entrenar.
- **Sin reconocimiento facial:** la regla sigue igual. Ningún modelo se entrena para reconocer caras, ni con videos propios ni con existentes.
