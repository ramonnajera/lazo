# Lazo — servidor

Node.js 20 o superior, **sin dependencias**. Guarda todo en un archivo JSON (permisos 0600).

```bash
cd server
npm test                      # 111 pruebas
LAZO_HOST=0.0.0.0 npm start   # http://0.0.0.0:18800
```

| Variable | Por omisión | Para qué |
|---|---|---|
| `LAZO_PORT` | `18800` | Puerto |
| `LAZO_HOST` | `127.0.0.1` | Interfaz (usa `0.0.0.0` o la IP de Tailscale para abrirlo a tus dispositivos) |
| `LAZO_DATA` | `server/data/lazo.json` | Archivo de datos |

## Primer uso
```bash
curl -X POST http://localhost:18800/perfil -H 'Content-Type: application/json' \
  -d '{"nombre":"Ana Ejemplo","discapacidad":"visual"}'
# → {"perfil":{…},"token":"lzo_…"}   (el token se muestra una sola vez; en disco solo queda su huella)
```
Un servidor admite **varias personas, cada una en su propio hogar aislado** (por defecto hasta 200; `maxHogares` en `createApp`; con 1 el servidor es de una sola persona y `POST /perfil` solo funciona la primera vez; más de 30 altas por hora dan 429). Cada token pertenece a un hogar y nunca ve datos de otro. `POST /circulo/invitacion`
da un código de 6 dígitos (24 h, un solo uso) para que un cuidador se una con `POST /circulo/unirse` y reciba un token
de **solo lectura**.

## API
Todo con `Authorization: Bearer lzo_…`, JSON en español.

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /health` | pública | Estado y si ya hay perfil |
| `POST /perfil` · `GET/PATCH /perfil` | pública (una vez) · todos / persona | Perfil, preferencias y rangos |
| `GET/POST /medicamentos` · `PATCH/DELETE /medicamentos/:id` | todos / persona | Medicamentos con horarios |
| `GET /tomas?fecha=` · `POST /tomas` | todos / persona | Dosis del día; confirmar, omitir, posponer, deshacer |
| `GET /proxima` | todos | La toma que sigue (o la que toca ahora) |
| `GET/POST /citas` · `PATCH/DELETE /citas/:id` | todos / persona | Agenda de consultas |
| `GET /mediciones` · `POST /mediciones` · `DELETE /mediciones/:id` | todos / persona | Presión, glucosa, peso, ánimo, dolor |
| `GET /alertas` · `POST /alertas/:id/visto` | todos | Pedidos de ayuda (siempre primero), dosis sin confirmar, citas, mediciones fuera de rango, existencias, convocatorias nuevas |
| `POST /ayuda` | persona | «Necesito ayuda»: avisa al círculo (ver abajo) |
| `GET /resurtir` | todos | Para cuántos días alcanzan las medicinas (ver abajo) |
| `POST /circulo/invitacion` · `POST /circulo/unirse` · `GET /circulo` · `DELETE /circulo/:id` | persona / pública | Círculo de cuidado |
| `GET /circulo/resumen` | todos | Adherencia de la semana, próxima toma, citas y últimas mediciones |
| `GET /convocatorias[?discapacidad=1]` · `POST /convocatorias/actualizar` | todos / persona | Convocatorias de la Secretaría de Desarrollo Humano y Bien Común |

### `POST /ayuda` — «Necesito ayuda»
Solo la persona. Cuerpo opcional `{ "mensaje": "texto de hasta 200 caracteres" }`.

- **201** `{ "ayuda": { "id", "fecha": "YYYY-MM-DD", "hora": "HH:MM", "mensaje" }, "cuidadores": <número de cuidadores del círculo> }`
- **200** con la misma ayuda si ya hubo una en el último minuto (un doble toque no la duplica).
- Durante 24 h, `GET /alertas` y `GET /circulo/resumen` muestran, **antes que cualquier otra alerta**:
  `{ "id": "ayuda:<id>", "tipo": "ayuda", "severidad": "alta", "titulo": "<Nombre> pidió ayuda", "detalle": "<mensaje>" | "Sin mensaje", "fecha": "<ISO -06:00>", "visto": false }`.
  Se marca vista con `POST /alertas/ayuda:<id>/visto`, como las demás.
- Por voz (`POST /voz`): «necesito ayuda», «auxilio», «emergencia», «ayúdenme» o «socorro» registran la ayuda (con la frase como
  mensaje) y responden «Avisé a tus cuidadores. Si es una emergencia, llama al 911.» (sin cuidadores: «Todavía no tienes
  cuidadores en tu círculo. Si es una emergencia, llama al 911.»). «Ayuda» sola sigue siendo la lista de órdenes.
- Conversando con el modelo, la herramienta `pedir_ayuda` hace lo mismo cuando la persona describe una emergencia.

### `GET /resurtir` — cuándo se acaban las medicinas
Persona y cuidador. Recorre el calendario real (horarios, días de la semana, inicio y fin), sin contar lo ya tomado hoy.
```json
{ "medicamentos": [ { "id", "nombre", "dosis", "existencias": 8, "porDia": 3, "diasRestantes": 2, "seAcaba": "2026-11-20",
                      "alcanzaHastaFin": false, "urgente": true } ] }
```
Solo medicinas activas con `existencias`; la que se acaba antes va primero. `seAcaba` es el día de la primera dosis que ya no
alcanza (`diasRestantes` = días de hoy a esa fecha; 0 = hoy). Si alcanza hasta el `fin` del tratamiento, `seAcaba` y
`diasRestantes` son `null` y `alcanzaHastaFin` es `true`. `urgente` = alcanza para 3 días o menos: entonces también aparece
la alerta `existencias-bajas` («Quedan 8: alcanzan para 2 días.»), además de cuando quedan 3 dosis o menos.

Los rangos de las mediciones son **avisos orientativos, no un diagnóstico**; la persona puede ajustarlos con lo que le
indique su médico (`PATCH /perfil` → `rangos`; solo tipos y límites conocidos, números de 0 a 1000).

Otras reglas: las mediciones no pueden ser del futuro (5 min de margen por el reloj del teléfono); una toma se puede
registrar de hasta 30 días atrás y 1 día adelante; pasada la medianoche, la dosis de las 23:50 (o una pospuesta que cruza
las 00:00) sigue siendo la que se confirma con «ya la tomé».

## Privacidad
No hay cuentas, analítica ni servicios externos salvo la lectura pública de la página de convocatorias. Los datos viven
en el archivo de datos y solo se comparten con quien la persona invite.
