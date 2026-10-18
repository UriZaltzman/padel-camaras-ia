# Instalación del equipo del club (fase 0)

Guía para el técnico. Al terminar, la cancha graba sus 2 cámaras en segmentos de 10 s, sin recomprimir, durante cada turno del horario (con 2 minutos de margen antes y después), y el equipo sube los segmentos a la nube. Es la fase 0: 1 cancha de un club amigo (ver `docs/estructura.md`, hoja de ruta, y `docs/especificacion-tecnica.md` §4, §12 y §15).

Tiempo estimado: medio día (incluye la prueba de día; la de noche se hace a la tardecita).

## 1. Lista de equipo

Antes de salir, confirmá que tenés todo (ítems de `infra/hardware/bom.yaml`):

- [ ] 2 cámaras IP 8 MP (4K) PoE de exterior, lente 2,8-4 mm. Que entreguen RTSP en **2560x1440 a 25 cuadros por segundo** (H.264 o H.265).
- [ ] 2 soportes elevados para detrás del vidrio de fondo.
- [ ] Switch PoE de 8 puertos.
- [ ] Computadora del club: GPU clase RTX 4060, 32 GB de RAM, disco de 2 TB, **2 placas de red** (una para cámaras, otra para internet).
- [ ] UPS de 1 kVA.
- [ ] Router 4G de respaldo.
- [ ] Gabinete con ventilación.
- [ ] Cable UTP de exterior, caños, fichas RJ45, pinza y tester.
- [ ] Notebook con cable de red para configurar las cámaras.
- [ ] Pendrive con Ubuntu Server 24.04 LTS.
- [ ] Del equipo de soporte: `EDGE_CLUB_ID`, `EDGE_DEVICE_ID` y las claves del bucket (por canal seguro, nunca por mail ni WhatsApp en texto).

Requisitos del club (relevados en la visita, §15): toma de 220 V en la oficina, acceso al router del club (cable o WiFi), iluminación LED pareja.

## 2. Montaje de las cámaras

- **Cámara A** detrás del vidrio de fondo del lado A; **cámara B** detrás del vidrio del lado B. Cada una, elevada y centrada en el ancho de la cancha (x = 5 m), tiene que ver **la cancha entera**: los 4 rincones, la red y las 2 líneas de saque (§5, "Geometría de la cancha").
- **Altura:** la especificación no fija todavía un número. Montá la cámara lo más alto que permita el soporte detrás del vidrio, por encima de la reja, y verificá en la imagen que se vean los 4 rincones del piso y que el vidrio de fondo propio no tape la línea de fondo. Anotá la altura real medida (en metros, desde el piso hasta el lente) y la distancia al vidrio; se la pasás a soporte para la calibración. _Pendiente: altura recomendada, a definir por `vision-ia` con los partidos de la fase 0._
- Lente en 2,8 mm (lo más abierto) si con 4 mm no entra la cancha entera.
- Sin luminarias de frente al lente ni sol directo de frente en ningún horario; si pasa, mové el soporte antes de seguir.
- Fijá bien el soporte: si la cámara se mueve, se pierde la calibración.
- Pasá el cable UTP por caño hasta el gabinete; cada cámara va a un puerto PoE del switch.

## 3. Red

```
cámaras ──PoE── switch PoE ── placa de red 1 (10.50.0.1/24, sin gateway)  ┐
                                                                          ├─ computadora del club
router del club ─────────────  placa de red 2 (DHCP, con internet)        ┘
```

- **Las cámaras van en una red aparte, sin salida a internet** (§12). El switch PoE **no** se conecta al router del club.
- Configurá cada cámara desde la notebook (conectada al switch) con IP fija: cámara A `10.50.0.11`, cámara B `10.50.0.12`, máscara `255.255.255.0`, **sin gateway ni DNS**.
- En cada cámara: stream principal en 2560x1440, 25 fps, cuadro clave (I-frame / GOP) cada 25 cuadros o menos, bitrate de unos 8 Mbps. Cambiá la clave de fábrica por una propia (guardala en el gestor de soporte, nunca en papel pegado al equipo). Apagá P2P/nube del fabricante, UPnP y todo servicio que no sea RTSP y NTP.
- NTP de las cámaras: `10.50.0.1` (la computadora del club).
- El equipo solo hace conexiones **salientes**: no abras ni redirijas puertos en el router del club.

## 4. Sistema operativo de la computadora

1. Instalá **Ubuntu Server 24.04 LTS** desde el pendrive. Usuario `tecnico`, con OpenSSH. Todo el disco de 2 TB para el sistema.
2. Actualizá y dejá la hora en Buenos Aires:
   ```bash
   sudo apt update && sudo apt full-upgrade -y
   sudo timedatectl set-timezone America/Argentina/Buenos_Aires
   ```
3. Identificá las placas de red (`ip link`). La conectada al switch de cámaras es `CAMERA_NIC` (por ejemplo `enp3s0`). Dale IP fija sin gateway en `/etc/netplan/60-camaras.yaml`:
   ```yaml
   network:
     version: 2
     ethernets:
       enp3s0:
         addresses: [10.50.0.1/24]
         dhcp4: false
   ```
   `sudo chmod 600 /etc/netplan/60-camaras.yaml && sudo netplan apply`. La otra placa queda con DHCP hacia el router del club.
4. Servidor de hora para las cámaras:
   ```bash
   sudo apt install -y chrony
   echo "allow 10.50.0.0/24" | sudo tee /etc/chrony/conf.d/camaras.conf
   sudo systemctl restart chrony
   ```
5. Firewall: nada entra salvo SSH desde la red local y la hora (NTP) que piden las cámaras, solo desde su red y por su placa (la VPN de soporte llega después).
   ```bash
   sudo ufw default deny incoming && sudo ufw default allow outgoing
   sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp
   sudo ufw allow in on enp3s0 from 10.50.0.0/24 to any port 123 proto udp   # enp3s0 = CAMERA_NIC
   sudo ufw enable
   ```
6. Docker Engine y Compose (versión 2.24.4 o más nueva) desde el repositorio oficial de Docker (docs.docker.com, "Install Docker Engine on Ubuntu"). Después: `sudo usermod -aG docker tecnico` y volvé a entrar.
7. Que la computadora arranque sola al volver la luz: en la BIOS, "Restore on AC power loss" = "Power On". Conectá la computadora y el switch a la UPS.
8. Verificá que la computadora ve las cámaras y que las cámaras no salen a internet:
   ```bash
   ping -c 3 10.50.0.11 && ping -c 3 10.50.0.12
   ```

## 5. Arrancar el equipo

1. Bajá el repositorio (o la versión que te pase soporte) en `/opt/padel-camaras-ia`:
   ```bash
   sudo git clone https://github.com/UriZaltzman/padel-camaras-ia.git /opt/padel-camaras-ia
   sudo chown -R tecnico: /opt/padel-camaras-ia
   cd /opt/padel-camaras-ia/infra/club-box
   ```
2. Carpetas de grabación y de la base local, del usuario del contenedor (uid 10001):
   ```bash
   sudo install -d -o 10001 -g 10001 -m 750 /srv/edge-agent/state /srv/edge-agent/recordings
   ```
3. Configuración (solo en este equipo, nunca en el repositorio):
   ```bash
   cp .env.example .env && chmod 600 .env
   nano .env
   ```
   Completá `EDGE_CLUB_ID`, `EDGE_DEVICE_ID`, `EDGE_API_BASE_URL`, `CAMERA_NIC`, `EDGE_RECORDER_CAMERAS` (usuario, clave y ruta RTSP de cada cámara, en una sola línea) y las 4 variables `EDGE_UPLOADER_*` con lo que te pasó soporte. `RECORDER_CAMERA_IP` (10.50.0.2) tiene que estar libre en la red de cámaras.
4. Horario de turnos (en la fase 0 se carga a mano):
   ```bash
   cp config/horario.example.json config/horario.json
   nano config/horario.json
   ```
   Cada turno lleva `id`, las 2 cámaras (`court-1-a`, `court-1-b`) y `start`/`end` con el desfase `-03:00`. El grabador relee el archivo cuando lo guardás; no hace falta reiniciar.
5. Construí la imagen y arrancá:
   ```bash
   docker compose build
   docker compose up -d
   docker compose ps          # recorder y uploader en "running"
   ```
   Los dos contenedores se reinician solos si se caen o si se corta la luz (`restart: unless-stopped`).
6. Verificá las cámaras:
   ```bash
   docker compose exec recorder edge-recorder probe
   ```
   Tiene que decir que cada cámara está arriba y en 2560x1440 a 25 fps. Si no, ver la sección 8.

## 6. Prueba de grabación de día y de noche

Hacé **dos** turnos de prueba de 20 minutos (§15, partido de prueba): uno **de día** con luz natural y otro **de noche** con las luces de la cancha prendidas. Si podés, que jueguen empleados del club.

1. Agregá los dos turnos a `config/horario.json`, por ejemplo:
   ```json
   {
     "shifts": [
       {
         "id": "prueba-dia",
         "cameras": ["court-1-a", "court-1-b"],
         "start": "2026-10-20T15:00:00-03:00",
         "end": "2026-10-20T15:20:00-03:00"
       },
       {
         "id": "prueba-noche",
         "cameras": ["court-1-a", "court-1-b"],
         "start": "2026-10-20T20:30:00-03:00",
         "end": "2026-10-20T20:50:00-03:00"
       }
     ]
   }
   ```
2. Durante el turno, mirá que se escriban segmentos (uno cada 10 s por cámara):
   ```bash
   ls -lt /srv/edge-agent/recordings/court-1-a | head
   docker compose logs --tail 50 recorder
   ```
3. Cuando termina cada turno (más los 2 minutos de margen), verificá la continuidad:
   ```bash
   docker compose exec recorder edge-recorder check --schedule /etc/edge-agent/horario.json
   ```
   Por cada turno terminado y cada cámara dice si está completo. **Sale con código 0 solo si no falta ningún segmento**; si falta alguno, muestra el hueco y sale con 1. También podés revisar una ventana suelta:
   ```bash
   docker compose exec recorder edge-recorder check --camera court-1-a \
     --from 2026-10-20T14:58:00-03:00 --to 2026-10-20T15:22:00-03:00
   ```
4. Revisá la imagen a ojo: copiá un segmento de cada prueba a la notebook y abrilo con VLC.
   - De día: la cancha entera se ve, sin quemado por sol ni reflejos fuertes en el vidrio.
   - De noche: la pelota se distingue en toda la cancha, sin parpadeo de las luminarias (si parpadea, en la cámara poné obturador 1/100 o "anti-flicker 50 Hz"), y la cámara **no** pasó a blanco y negro (desactivá el modo noche/IR automático: con las luces de la cancha alcanza).
5. Confirmá la subida: `docker compose logs --tail 50 uploader` sin errores repetidos, y pedile a soporte que confirme que los segmentos llegaron al bucket.

La instalación está aprobada cuando las dos pruebas pasan el `check` con código 0 y las imágenes se ven bien. Mandá a soporte la salida de los dos `check`, las alturas medidas y una captura de cada cámara de día y de noche.

## 7. Uso diario

- Cargar turnos: editar `config/horario.json` (hasta que llegue el `scheduler`, fase 1).
- Estado: `docker compose ps` y `docker compose logs --tail 100 recorder uploader`.
- Disco: `df -h /srv/edge-agent`. Cada hora de turno ocupa unos 7 GB (2 cámaras). Por ahora no se borra solo: avisá a soporte si pasa el 85%.
- Actualizar a una versión nueva (con OK de soporte): `git pull && docker compose build && docker compose up -d`, **fuera de horario de turnos**.

## 8. Problemas frecuentes

| Síntoma                                                                            | Qué revisar                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up` dice `set EDGE_... in .env`                                    | Falta esa variable en `.env`.                                                                                                                                                                                  |
| Un contenedor se reinicia en loop y el log dice `Invalid edge-agent configuration` | El mensaje nombra la variable mal cargada (UUID inválido, URL sin `https://`, JSON de cámaras mal formado). Nunca muestra el valor.                                                                            |
| `probe` dice que una cámara está caída                                             | `ping 10.50.0.11`; luz del puerto PoE en el switch; usuario, clave y ruta RTSP en `EDGE_RECORDER_CAMERAS`; que la cámara no haya cambiado de IP. Probá el RTSP desde la notebook con VLC.                      |
| `probe` dice resolución o fps distintos                                            | Configurá el stream principal de la cámara en 2560x1440 a 25 fps.                                                                                                                                              |
| Error al crear la red `cameras` (`parent interface not found`)                     | `CAMERA_NIC` no coincide con el nombre de la placa (`ip link`).                                                                                                                                                |
| Error `Address already in use` en la red `cameras`                                 | `RECORDER_CAMERA_IP` choca con otra IP (cámara o computadora). Usá otra libre, por ejemplo `10.50.0.2`.                                                                                                        |
| `Permission denied` en `/recordings` o `/var/lib/edge-agent`                       | Las carpetas no son del uid 10001: repetí el paso 5.2.                                                                                                                                                         |
| `check` muestra huecos                                                             | `docker compose logs recorder` en ese horario: si FFmpeg se reinició, la cámara se cortó (cable, PoE, luz). Si los huecos son en todas las cámaras a la vez, revisá la UPS y `journalctl -b -1` por reinicios. |
| La hora de los segmentos no coincide con el turno                                  | `timedatectl` (zona Buenos Aires, NTP activo) y NTP de las cámaras apuntando a `10.50.0.1`. Los nombres de archivo están en UTC (3 horas más).                                                                 |
| El uploader loguea `uploader_segment_failed` todo el tiempo                        | Internet del club (`curl -I https://www.google.com`), claves y nombre del bucket en `.env`. Lo pendiente se retoma solo cuando vuelve la conexión, sin perder lo grabado.                                      |
| La imagen de noche sale en blanco y negro o con parpadeo                           | Paso 6.4: modo noche/IR apagado, anti-flicker 50 Hz.                                                                                                                                                           |
| Se cortó la luz                                                                    | Al volver, la computadora arranca sola y los contenedores también. Verificá con `docker compose ps` y `check`.                                                                                                 |

Si nada de esto lo resuelve, mandá a soporte la salida de `docker compose ps`, `docker compose logs --tail 200` y `df -h`. Los logs no tienen claves ni datos personales.

## Prueba sin cámaras (simulador)

Para practicar la instalación o probar en una máquina sin cámaras, `infra/club-box/smoke-test.sh` levanta el simulador de cámaras (`infra/camsim`), arranca este mismo equipo contra él con un turno corto y verifica con `edge-recorder check` que los segmentos estén completos y que hayan llegado a un almacenamiento de prueba. Necesita Docker; tarda unos 6 minutos.
