# Lazo — servidor

Node.js 20 o superior, **sin dependencias**. Guarda todo en un archivo JSON (permisos 0600).

```bash
cd server
npm test                      # 46 pruebas
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
El servidor pertenece a **una persona**: `POST /perfil` solo funciona la primera vez. Después, `POST /circulo/invitacion`
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
| `GET /alertas` · `POST /alertas/:id/visto` | todos | Dosis sin confirmar, citas, mediciones fuera de rango, existencias, convocatorias nuevas |
| `POST /circulo/invitacion` · `POST /circulo/unirse` · `GET /circulo` · `DELETE /circulo/:id` | persona / pública | Círculo de cuidado |
| `GET /circulo/resumen` | todos | Adherencia de la semana, próxima toma, citas y últimas mediciones |
| `GET /convocatorias[?discapacidad=1]` · `POST /convocatorias/actualizar` | todos / persona | Convocatorias de la Secretaría de Desarrollo Humano y Bien Común |

Los rangos de las mediciones son **avisos orientativos, no un diagnóstico**; la persona puede ajustarlos con lo que le
indique su médico (`PATCH /perfil` → `rangos`).

## Privacidad
No hay cuentas, analítica ni servicios externos salvo la lectura pública de la página de convocatorias. Los datos viven
en el archivo de datos y solo se comparten con quien la persona invite.
