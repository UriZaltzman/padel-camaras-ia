# Mediciones de los algoritmos de geometría y eventos

Qué se midió y cómo, para las etapas de calibración (#120), suavizado de la pelota (#124), triangulación (#125), golpes (#127) y botes (#128).

No hay video real todavía. Todo se midió contra un simulador de pádel escrito para las pruebas (`ml/tests/sim`): cancha de 10 x 20 m, red de 0,88 m en el centro y 0,92 m en los postes, pelota con gravedad y resistencia del aire, rebotes con coeficientes distintos en piso, vidrio, reja y red, cuatro jugadores con muñecas que alcanzan la pelota en cada golpe y dos cámaras virtuales de 1080p, una detrás de cada vidrio de fondo, a 6 m de altura, 3 m detrás del vidrio e inclinadas 35 grados, con distorsión de lente, ruido de píxel y huecos de detección al azar.

Las cifras salen de `ml/tests/sim/report.py` y las mismas funciones sostienen las pruebas de aceptación: si un número empeora, falla la prueba. Para regenerar la tabla:

```bash
uv run --directory ml python tests/sim/report.py
```

Notas para leer las tablas:

- Los eventos se comparan con una tolerancia de 100 ms. Cada fila usa 10 partidos simulados (semillas 0 a 9) y las semillas son fijas, así que el resultado es reproducible.
- Los parámetros (ventanas de ajuste, puertas del filtro, ángulo mínimo entre rayos) se ajustaron mirando estas mismas semillas. Para ver que no sobreajustan se midieron 20 partidos nuevos (semillas 100 a 119, nunca usadas al ajustar): golpes F1 0,982 / 0,953 / 0,869 y botes F1 0,978 / 0,963 / 0,915 en ruido bajo / medio / alto, error 3D mediano 1,5 / 3,2 / 6,4 cm. Son los mismos números dentro de un par de puntos.
- El primer golpe de cada punto (la pelota sale del reposo) no tiene trayectoria anterior y no se evalúa; tampoco los eventos de los primeros 250 ms.
- Dos contactos con menos de 120 ms de diferencia (por ejemplo vidrio de fondo y piso en un rincón) son un solo bote para la etapa; la verdad del simulador los junta igual (alrededor del 7% de los contactos) y el bote acierta la superficie si coincide con cualquiera de los dos.
- La calibración del "12 puntos" es el error que ve el instalador (el que se compara con los 5 cm); el error "en una grilla de 1 m" se mide en todo el piso contra la verdad del simulador y es el que importa para las posiciones.

### Noise levels

| Noise | Click (px) | Ball (px) | Dropout | Bursts | False hits | Wrist (cm) | Lens focal / k1 error | B clock (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| low | 0.4 | 0.5 | 5.0% | 1% x 4 frames | 0.2% | 5 | 0.2% / 0.005 | +17 |
| medium | 0.7 | 1.0 | 12.0% | 2% x 5 frames | 0.5% | 10 | 0.5% / 0.01 | -23 |
| high | 1.0 | 2.0 | 25.0% | 4% x 6 frames | 1.0% | 15 | 1.0% / 0.02 | +31 |
| extreme | 1.0 | 3.0 | 40.0% | 6% x 7 frames | 2.0% | 25 | 1.0% / 0.02 | -37 |

### Calibration (issue 120)

| Click error (px) | Rejected (> 5 cm) | Mean error on the 12 points (cm) | Mean error on a 1 m floor grid (cm) | p95 of that mean (cm) | Worst grid point (cm) |
| --- | --- | --- | --- | --- | --- |
| 0.25 | 0.0% | 1.2 | 0.9 | 1.5 | 5.7 |
| 0.5 | 0.0% | 2.2 | 1.3 | 2.0 | 8.0 |
| 0.75 | 0.0% | 3.2 | 1.8 | 2.7 | 11.1 |
| 1.0 | 17.5% | 3.9 | 2.2 | 3.6 | 14.5 |
| 1.5 | 77.5% | 4.5 | 4.1 | 6.2 | 18.6 |
| 2.0 | 97.5% | 4.9 | 2.6 | 2.6 | 7.9 |
| 3.0 | 100.0% | - | - | - | - |

### Daily check of the stored calibration (issue 120)

| Camera moved by (px) | Mean line shift (cm) | Support is warned |
| --- | --- | --- |
| 0.0 | 3.5 | 0.0% |
| 1.0 | 4.6 | 0.0% |
| 2.0 | 7.1 | 0.0% |
| 4.0 | 13.1 | 100.0% |
| 8.0 | 25.7 | 100.0% |
| 16.0 | 50.8 | 100.0% |

### Ball track smoothing (issue 124)

| Noise | Gap-fill recall (gaps <= 10 frames) | Frames filled in gaps > 10 | Impossible jumps rejected | Good detections lost | Position error raw -> smoothed (px) |
| --- | --- | --- | --- | --- | --- |
| low | 96.5% | 0.0% | 93.3% | 0.6% | 0.66 -> 0.51 |
| medium | 95.4% | 1.1% | 92.1% | 0.7% | 1.31 -> 0.87 |
| high | 89.9% | 1.1% | 90.8% | 0.9% | 2.62 -> 1.69 |
| extreme | 74.5% | 3.1% | 79.9% | 1.5% | 3.95 -> 2.77 |

### Triangulation and clock alignment (issue 125)

| Noise | Frames in 3D | 3D error median / p95 (cm) | Height error median / p95 (cm) | Clock offset error (ms) | Speed error, 3 frames | Speed error, 6 frames | Speed error, 12 frames |
| --- | --- | --- | --- | --- | --- | --- | --- |
| low | 99.7% | 1.5 / 6.2 | 0.5 / 2.0 | 0.70 | 13% | 2% | 3% |
| medium | 99.4% | 3.1 / 12.4 | 1.1 / 3.6 | 1.03 | 15% | 3% | 3% |
| high | 97.2% | 5.7 / 22.1 | 1.7 / 6.6 | 2.10 | 14% | 5% | 4% |
| extreme | 89.7% | 8.6 / 36.0 | 2.7 / 11.7 | 2.01 | 17% | 7% | 6% |

### Shots and bounces, 10 rallies per row (issues 127 and 128)

| Scenario | Shot F1 (100 ms) | Shot P / R | Shooter right | Bounce F1 (100 ms) | Bounce P / R | Surface right |
| --- | --- | --- | --- | --- | --- | --- |
| low | 0.985 | 0.97 / 1.00 | 100.0% | 0.970 | 0.99 / 0.95 | 99.0% |
| medium | 0.950 | 0.94 / 0.96 | 100.0% | 0.971 | 0.98 / 0.96 | 99.0% |
| high | 0.893 | 0.90 / 0.89 | 100.0% | 0.935 | 0.96 / 0.91 | 97.9% |
| extreme | 0.792 | 0.80 / 0.79 | 100.0% | 0.734 | 0.94 / 0.60 | 100.0% |

### Other conditions

| Scenario | Shot F1 (100 ms) | Shot P / R | Shooter right | Bounce F1 (100 ms) | Bounce P / R | Surface right |
| --- | --- | --- | --- | --- | --- | --- |
| medium, 60 fps (reference) | 0.950 | 0.94 / 0.96 | 100.0% | 0.971 | 0.98 / 0.96 | 99.0% |
| medium, 25 fps (analysis rate) | 0.945 | 0.94 / 0.95 | 100.0% | 0.880 | 1.00 / 0.79 | 100.0% |
| low, 25 fps | 0.964 | 0.97 / 0.96 | 100.0% | 0.944 | 0.99 / 0.90 | 100.0% |
| medium, wrist without height | 0.931 | 0.90 / 0.96 | 100.0% | 0.971 | 0.98 / 0.96 | 99.0% |
| medium, one camera only | 0.206 | 0.38 / 0.14 | 100.0% | 0.296 | 0.21 / 0.51 | 73.6% |

### Balls sent into the back corners (issue 128)

| Noise | Contacts | Surface right (velocity direction) | Surface right (position only) |
| --- | --- | --- | --- |
| low | 246 | 97.9% | 97.9% |
| medium | 246 | 97.8% | 97.0% |
| high | 246 | 98.0% | 94.8% |
