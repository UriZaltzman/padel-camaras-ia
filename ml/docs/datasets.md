# Relevamiento de datasets y videos de pádel para entrenamiento

Issue #223 · Especificación §5 (pipeline) y §8 (datos) · Relevado el 2026-10-17.

**No se descargó nada.** Una persona tiene que aprobar cada fuente antes de bajarla. Los datos de licencia salen de las páginas oficiales de cada fuente en la fecha del relevamiento. Hay que volver a verificarlos en el momento de descargar.

## Criterios

- **Usable**: la licencia es explícita, permite uso comercial y entrenamiento (CC BY 4.0, CC0, MIT, Apache 2.0), y el origen del video está claro (grabado por los autores, con permiso).
- **No usable**: no tiene licencia, la licencia es ambigua o es no comercial (NC), o el video es de una transmisión, de YouTube o de otro tercero sin permiso explícito, aunque las etiquetas tengan licencia abierta. Una licencia CC sobre las anotaciones no transfiere los derechos sobre las imágenes del broadcaster.
- **Excluido**: código o pesos AGPL/GPL (Ultralytics y derivados). No entran al repo ni al pipeline.
- **Ley 25.326 (datos personales)**: la imagen de una persona identificable es un dato personal. Si un video público tiene jugadores amateurs sin consentimiento documentado, no se usa. Los partidos propios requieren el consentimiento de §12.

## Fuentes evaluadas

| Fuente | Licencia | Comercial / entrenamiento | Cámaras y ángulo | Resolución / fps | Volumen | Etiquetas | Veredicto |
|---|---|---|---|---|---|---|---|
| [PadelTracker100](https://zenodo.org/records/14653706) ([paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC12926558/)) | "Creative Commons Attribution 4.0 International" ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) sobre el dataset | Las anotaciones sí. El video es del broadcast del World Padel Tour, cuyos derechos los licenciaron los autores, no WPT. | 1 cámara de transmisión, elevada en el fondo | No figura en Zenodo; es un broadcast (sin verificar) | 2 partidos (WPT Finals 2022), unos 100k cuadros, 7,1 GB | Pelota por cuadro, posición de jugadores en metros, pose, eventos de golpe | **No usable** para entrenar con las imágenes hasta tener un permiso de WPT/Premier Padel o una revisión legal. Si legales lo aprueba, sirve como referencia de formato de etiquetas y como benchmark de evaluación. |
| [PADELVIC](https://upcommons.upc.edu/entities/publication/7d1cb4df-c8cd-4778-9b76-c14ff19b9732) (UPC) | "Creative Commons Attribution 4.0 International" ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) | Sí, con atribución. Lo grabaron los autores. | Multivista (la cantidad no figura en la ficha), cancha amateur | No figura | 1 partido amateur, más videos sintéticos | Posiciones de los 4 jugadores, motion capture de pose de 1 jugador, sintéticos con ground truth | **Usable con verificación**: falta confirmar el consentimiento de los jugadores (25.326) y el detalle de cámaras en el PDF. Es poco volumen: sirve para probar tracking y pose, no para entrenar. |
| [Roboflow: Padel_VV](https://universe.roboflow.com/najla02/padel_vv) | CC BY 4.0 (declarado por quien subió el dataset) | Formalmente sí | Mayormente capturas de transmisión | Variable | Sin descripción publicada | Recuadros: ball, player, racket, net, court, scoreboard | **No usable**: el origen de las imágenes no está documentado. La clase *scoreboard* indica transmisión. |
| [Roboflow: padel-msqfg players / players-2](https://universe.roboflow.com/padel-msqfg/players-thays) | CC BY 4.0 (declarado) | Formalmente sí | Desconocido | Variable | Sin dato | Recuadros de jugadores | **No usable**: origen no documentado. |
| [Roboflow: padelballdataset](https://universe.roboflow.com/padelballdataset) | Varía por proyecto, sin confirmar | Sin confirmar | Desconocido | Variable | Unas 2,1k imágenes (padel_ball) y 1,6k (Active_Inactive_Ball) | Recuadros de pelota | **No usable**: origen y licencia sin confirmar. |
| [Roboflow: tfm-padel-training](https://universe.roboflow.com/tfm-azkdo/tfm-padel-training) | Sin confirmar | Sin confirmar | Desconocido | — | 481 imágenes | Keypoints de cancha y recuadros | **No usable**. Sirve solo como idea para el modelo de puntos de la calibración. |
| [Roboflow: padel-tracking (padelytixs)](https://universe.roboflow.com/padelytixs-workspace/padel-tracking) | — | — | — | — | 0 imágenes | ball, player por equipo | **No usable** (vacío). |
| [padel_analytics](https://github.com/Joao-M-Silva/padel_analytics) | No se encontró un LICENSE; usa YOLO de Ultralytics | — | 1 cámara fija | — | No publica dataset; pesos en Google Drive | — | **Excluido**: sin licencia y depende de Ultralytics (AGPL). |
| [padex](https://pypi.org/project/padex/) | GPL-3.0 según PyPI; depende de `ultralytics` | — | Broadcast | — | Sin datasets (están en el roadmap) | — | **Excluido** (GPL/AGPL). |
| [TrackNet tenis, dataset original](https://arxiv.org/abs/1907.03698) | Sin licencia explícita (un agregador lo lista como "Other") | No | 1 cámara de broadcast | 1280x720 / 30 fps según el paper | 1 partido (Universiada 2017) | Pelota por cuadro y visibilidad | **No usable**: sin licencia y es broadcast. |
| [Roboflow: TrackNet (Tennis AI)](https://universe.roboflow.com/tennis-ai/tracknet/dataset/) | CC BY 4.0 (declarado) | Formalmente sí | Broadcast de tenis | — | — | Recuadros de pelota | **No usable**: re-subida de un tercero de video broadcast. |
| [Shuttlecock Trajectory Dataset (TrackNetV2/V3)](https://hackmd.io/Nf8Rh1NrSrqNUzmO0sQKZw) | Sin licencia explícita | No | Broadcast de bádminton, 1 cámara | — | 26 videos | Volante por cuadro (Frame, Visibility, X, Y) | **No usable**. |
| [TrackNetV3, código y pesos](https://github.com/qaz812345/TrackNetV3) | "MIT License" ([MIT](https://opensource.org/license/mit)), que según el README cubre código y checkpoints | Sí | — | — | — | — | **Usable como punto de partida** (arquitectura y pesos para fine-tuning), con atribución. Ojo: los pesos se entrenaron con el dataset de bádminton, que no tiene licencia. Que legales confirme que la licencia MIT de los checkpoints alcanza. |

## Utilidad por etapa del pipeline (§5)

| Etapa | Fuente externa utilizable hoy | Comentario |
|---|---|---|
| 1. Calibración (keypoints de cancha) | Ninguna | Hay que etiquetar 12 puntos en nuestras canchas. Son pocos cuadros. |
| 2. Detección de jugadores | Pesos preentrenados en COCO de YOLOX/RT-DETR (Apache 2.0) | Ningún dataset de pádel es usable. Hace falta fine-tuning con lo nuestro. |
| 3. Seguimiento / re-ID | PADELVIC, después de verificarlo, solo para probar | — |
| 5. Pelota | Pesos de TrackNetV3 (MIT) como inicialización | No hay datos de pelota de pádel usables. |
| 6. Pose | Pesos de RTMPose (Apache 2.0); PADELVIC como chequeo | No hace falta un dataset de pádel. |
| 7–8. Golpes y botes con superficie | Ninguna | PadelTracker100 trae eventos de golpe, pero no es usable para entrenar. Las superficies de vidrio y reja de nuestras canchas no están en ninguna fuente. |
| 9. Tipo de golpe | Ninguna | No hay datasets abiertos con las 10 clases. |
| Punto y marcador (§6) | Ninguna | — |

## Recomendación

1. **Usar**: pesos de TrackNetV3 (MIT) como inicialización de la pelota, y pesos Apache 2.0 de YOLOX/RT-DETR y RTMPose. Son modelos, no videos de pádel.
2. **Usar tras verificar consentimiento y cámaras**: PADELVIC (CC BY 4.0), solo para validar tracking y pose.
3. **Pedir permiso o revisión legal**: PadelTracker100. Las etiquetas son CC BY 4.0, pero las imágenes son del broadcast de WPT. Si legales aprueba, se usa como benchmark externo de pelota y golpes.
4. **Descartar**: los datasets de Roboflow (origen sin documentar o broadcast), los datasets de TrackNet tenis y bádminton (sin licencia), y padel_analytics y padex (sin licencia, GPL o Ultralytics).
5. **Lo que solo cubren nuestros 20–30 partidos**: la vista desde 2 cámaras elevadas detrás de los vidrios de fondo, la luz de día y de noche, los reflejos en el vidrio, los botes con superficie (`floor`, `back_glass`, `side_glass`, `fence`, `net`), las 10 clases de golpe, el ganador del punto y los 15 partidos de evaluación. No existe ninguna fuente pública usable con etiquetas de pelota de pádel. Por eso las cantidades de §8 (30.000 cuadros de pelota, 5.000 de jugadores) **no se reducen**. Partir de pesos preentrenados debería acortar el entrenamiento, pero no reduce la cantidad de etiquetas.
