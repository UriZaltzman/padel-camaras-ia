# CVAT: recuadros de jugadores y pelota

Issue #16 · Especificación §8 (recuadros de jugadores y posición de la pelota) · ADR 0002.

Los recuadros de jugadores y la pelota (un punto por cuadro) se etiquetan en [CVAT](https://github.com/cvat-ai/cvat). Golpes, botes, tipo de golpe y ganador de punto se etiquetan con la herramienta propia (`ml.labels`), no acá.

**Licencia.** CVAT se publica con licencia MIT (archivo `LICENSE` del repo `cvat-ai/cvat`). La corremos local, sin modificarla y sin distribuirla. Hay que volver a verificarla al instalar una versión nueva. CVAT trae funciones de pre-etiquetado con modelos de Ultralytics: **no se usan** (AGPL, CLAUDE.md).

## Correr CVAT local

Requiere Docker y Docker Compose. Fijá una versión publicada (tag) en vez de `develop`:

```bash
git clone https://github.com/cvat-ai/cvat && cd cvat
git checkout <tag publicado, por ejemplo v2.x.y>
docker compose up -d
docker exec -it cvat_server bash -ic 'python3 ~/manage.py createsuperuser'
```

CVAT queda en `http://localhost:8080`. Los videos se suben desde la máquina local; nunca a una instancia pública de CVAT (los partidos son datos personales, Ley 25.326). Solo se cargan partidos que pueden entrar al entrenamiento según ADR 0002 (sin "no usar mis videos", sin menores sin permiso).

## Proyecto y etiquetas

Creá un proyecto con exactamente estas 2 etiquetas (en *Raw*):

```json
[
  { "name": "person", "type": "rectangle", "attributes": [] },
  { "name": "ball", "type": "points", "attributes": [] }
]
```

- `person`: un recuadro por persona en la cancha (jugadores; también entrenador o pasabolas si están dentro, igual que el detector genérico). El recuadro va de la cabeza a los pies; los pies son lo que el pipeline proyecta a la cancha.
- `ball`: **un solo punto** en el centro de la pelota. Usá un *track* para toda la pelota del video y marcá *outside* cuando no se ve (fuera de cuadro o tapada del todo). Si se ve a medias, dejala y marcá *occluded*.
- *Occluded* sirve en las dos etiquetas y el conversor lo conserva.

Una tarea = un video de una cámara. Poné la cámara (A o B) en el nombre de la tarea (`<match_id>-A`), porque se la pasás al conversor. Usá *tracks* (modo interpolación) para los jugadores: marcás cuadros clave y CVAT interpola el resto; revisá los cuadros interpolados antes de exportar.

## Exportar

En la tarea: *Actions → Export task dataset*:

| Formato | Qué trae | Lector |
| --- | --- | --- |
| **CVAT for video 1.1** (recomendado) | Jugadores con su track y pelota | `ml.cvat.read_cvat_video_xml` |
| COCO 1.0 | Solo recuadros de jugadores (COCO no tiene puntos) | `ml.cvat.read_coco` |

Sin "Save images". El ZIP de *CVAT for video 1.1* trae `annotations.xml`.

```python
from pathlib import Path
from ml.cvat import read_cvat_video_xml, write_frame_annotations
from ml.schemas import Camera

annotations = read_cvat_video_xml(Path("annotations.xml"), Camera.A)
write_frame_annotations(annotations, Path("data/annotations/<match_id>/A"))
# -> player_boxes.parquet (PlayerBoxLabel) y ball_points.parquet (BallPointLabel)
```

El XML de video trae un elemento por cuadro (claves e interpolados); el conversor guarda todos los visibles y salta los `outside="1"`. Las coordenadas quedan en píxeles del video original. **No hay pérdida**: si algo no se puede convertir tal cual (etiqueta desconocida, recuadro sin área o fuera del cuadro, más de una pelota por cuadro, un track con dos recuadros en el mismo cuadro, exportación "CVAT for images", versión distinta de 1.1, XML con DTD), falla con `CvatFormatError` y no escribe nada. Corregí en CVAT y volvé a exportar.

## Pre-etiquetado de jugadores

La especificación pide pre-etiquetar los recuadros con el detector genérico. El detector es Apache 2.0: [YOLOX](https://github.com/Megvii-BaseDetection/YOLOX) o [RT-DETR](https://github.com/lyuwenyu/RT-DETR) (implementación de los autores), con pesos de COCO. **Nunca Ultralytics** ni sus pesos, ni las funciones serverless de CVAT basadas en ellos. Los pesos no se bajan todavía: se aprueban como cualquier fuente (ADR 0002, `datasets.md`).

Cómo se enchufa, sin tocar CVAT:

1. Correr el detector sobre el video (clase `person` de COCO) con el mismo filtro de confianza del pipeline, `players.min_confidence` de `ml/config/thresholds.yaml`.
2. Escribir el resultado como COCO 1.0 (recuadros `person`, imágenes `frame_<n>.PNG` con el tamaño del video) o como *CVAT for video 1.1*.
3. En la tarea: *Actions → Upload annotations* con ese formato.
4. La persona corrige, agrega los que faltan y borra los falsos, y exporta como arriba. Los recuadros pre-etiquetados quedan sin track; para tener tracks, la persona los une con *Merge* o se pre-etiqueta ya con tracks de ByteTrack (§5.3).

Alternativa: empaquetar el detector como función serverless de CVAT (nuclio, `serverless/` del repo de CVAT) para usar *Automatic annotation* desde la interfaz. Requiere levantar CVAT con `docker-compose.serverless.yml`. Se evalúa cuando haya volumen; el flujo de arriba alcanza para la fase 0.

La pelota no se pre-etiqueta con el detector genérico (es chica y borrosa). Cuando el modelo de pelota (§5.5) tenga una primera versión, sus puntos se suben igual, como *CVAT for video 1.1*.
