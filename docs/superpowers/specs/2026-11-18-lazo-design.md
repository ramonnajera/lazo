# Lazo — diseño

Fecha: 2026-11-18. Estado: aprobado por la persona responsable del proyecto, con decisiones delegadas (ver «Decisiones»).

## Propósito
Lazo es un asistente para **acompañar a una persona con discapacidad visual o motriz** y a quien la cuida. Ayuda a no
olvidar medicamentos, a llevar la agenda de consultas, a registrar cómo está (presión, glucosa, ánimo, dolor) y a que su
cuidador sepa a tiempo si algo se salió de lo normal. Además reúne en un solo lugar las **convocatorias de apoyo de la
Secretaría de Desarrollo Humano y Bien Común de Chihuahua**.

Se presenta al **Premio Estatal por la Discapacidad «Manuel Trueva Martínez 2026»** (cierre: 20 de noviembre de 2026).

## Criterios de la convocatoria y cómo responde Lazo
| Criterio de las bases | Respuesta de Lazo |
|---|---|
| Relevancia social, mejora de la calidad de vida | Menos dosis omitidas, citas que no se pierden, cuidador informado |
| Nivel de tecnologías aplicadas | Voz (dictado y órdenes locales en Windows, reconocimiento y lectura en Android), alarmas sin internet, tres plataformas sincronizadas |
| Permanencia en el tiempo | Código abierto, sin llaves de pago, datos propios, funciona en un servidor casero o un VPS barato |
| No asistencialista | Es una herramienta de autonomía: la persona decide y actúa; el cuidador solo observa |
| Inclusión y no discriminación | Diseñado desde el inicio para discapacidad visual y motriz, y usable con las dos manos ocupadas o sin ver la pantalla |
| Replicable en los 67 municipios | Cualquier municipio o asociación puede alojar su propio servidor con un comando |

## Usuarios
- **Persona usuaria** (paciente): usa la app en el teléfono y el asistente en la computadora.
- **Cuidador** (familiar o profesional): se une con un código y ve, solo en lectura, adherencia, próximas citas y alertas.

## Arquitectura
Tres piezas en un mismo repositorio, independientes de Alice (otro puerto, otro token, otro identificador de app):
- `server/` — Node.js sin dependencias externas. Almacén JSON con bloqueo y escritura atómica. Auth por token.
  Zona horaria fija America/Chihuahua (-06:00, sin horario de verano desde 2022).
- `android/` — Kotlin + Jetpack Compose. Las alarmas de medicamentos son **locales** (AlarmManager exacto) y no dependen
  de internet; el servidor solo sincroniza y alimenta al cuidador.
- `desktop/` — Tauri 2 (Rust + React) para Windows 11: isla superior con Hoy, Citas, Seguimiento y Convocatorias;
  lectura en voz alta y órdenes por voz. Se compila en un espejo en `C:` (la cadena Rust vive en Windows).

## Modelo de datos (servidor)
- `perfil`: nombre, discapacidad principal (`visual` | `motriz` | `ambas` | `otra`), preferencias de accesibilidad.
- `medicamentos`: nombre, dosis, instrucciones, horarios `HH:MM`, días de la semana, inicio, fin, existencias.
- `tomas`: (medicamento, fecha, hora programada) → `tomada` | `omitida` | `pospuesta`, hora real.
- `citas`: especialista, lugar, fecha, hora, notas, transporte.
- `mediciones`: tipo (`presion`, `glucosa`, `peso`, `animo`, `dolor`), valor(es), nota, fecha y hora.
- `circulo`: códigos de invitación de un solo uso y tokens de cuidador (solo lectura).
- `alertas`: dosis sin confirmar a los 30 min, medición fuera de rango, cita próxima.
- `convocatorias`: caché de la página de la Secretaría, con etiqueta `discapacidad` y fecha de última lectura.

## API (resumen)
`/health` · `/perfil` · `/medicamentos` · `/tomas?fecha=` y `POST /tomas` · `/citas` · `/mediciones` ·
`/circulo/invitacion` y `/circulo/unirse` · `/circulo/resumen` (cuidador) · `/alertas` · `/convocatorias` y
`/convocatorias/actualizar`. Todo con `Authorization: Bearer`. El token de la persona escribe; el del cuidador solo lee.

## Accesibilidad (requisito central, no un extra)
- **Visual:** etiquetas TalkBack en todo, orden de foco lógico, texto escalable hasta 200 %, tema de alto contraste
  (relación ≥ 7:1), nada se comunica solo con color, lectura en voz alta de cada toma y cada cita (TextToSpeech).
- **Motriz:** áreas táctiles ≥ 64 dp, una acción principal por pantalla («Ya la tomé»), órdenes por voz
  («ya la tomé», «pospón diez minutos», «qué sigue»), sin gestos que exijan precisión (nada de deslizar para confirmar).
- **Escritorio:** dictado y órdenes por voz locales (sin enviar audio a internet), atajos de teclado, lectura en voz alta
  con las voces de Windows.

## Convocatorias
El servidor lee `https://www.chihuahua.gob.mx/info/convocatorias-y-resultados-2026` una vez al día y al pedirlo, extrae
nombre, dependencia y enlaces (documento y ficha) y marca como `discapacidad` las que lo mencionan. La página **no
publica fechas ni estado**, así que Lazo no inventa ninguno: muestra el enlace oficial y la fecha en que lo leyó. Si
aparece una convocatoria nueva respecto a la lectura anterior, crea una alerta.

## Privacidad
Datos de salud: el servidor guarda solo lo que la persona captura, no envía nada a terceros, no usa IA externa y cada
instalación es dueña de sus datos. La demostración usa **personas y datos ficticios**. Este repositorio no contiene
datos de Alice ni de ninguna persona real.

## Fuera de alcance (por plazo)
Avisos push instantáneos (el cuidador consulta cada pocos minutos; Firebase queda como trabajo futuro), cuentas con
correo, iOS, receta por fotografía, integración con instituciones de salud.

## Decisiones (tomadas por delegación)
1. Nombre **Lazo**; discapacidad visual y motriz como foco, con apoyo de memoria y rutinas como beneficio secundario.
2. App Android nueva (id `mx.lazo.app`) con patrones tomados de alice-watch, no un renombrado de toda la app.
3. Escritorio: renombrado de alice-desktop (`mx.lazo.desktop`, datos en `%APPDATA%\LazoDesktop`).
4. Avisos al cuidador por consulta periódica, sin Firebase.
5. Repositorio nuevo sin historial; no se publica en ningún remoto sin que la persona responsable lo pida.
