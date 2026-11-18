# Lazo

Un acompañante para las **medicinas, las citas y el bienestar de personas con discapacidad visual o motriz**, y para
quienes las cuidan. Gratuito, de código abierto y accesible desde su diseño.

> Proyecto presentado al *Premio Estatal por la Discapacidad «Manuel Trueva Martínez 2026»* (Chihuahua).
> Todas las demostraciones usan **personas y datos ficticios**.

## Qué hace
- **Medicinas:** alarmas exactas **sin internet** que se **leen en voz alta**; se confirman con un toque grande o con la voz («ya la tomé», «pospón diez minutos», «qué sigue»).
- **Citas:** agenda de consultas con lugar y transporte.
- **Cómo estoy:** presión, glucosa, ánimo, dolor y peso, con avisos **orientativos** (nunca un diagnóstico).
- **Círculo de cuidado:** el cuidador se une con un código de 6 dígitos y ve —solo en lectura— cuánto ha tomado la persona, las dosis sin confirmar y las próximas citas.
- **Apoyos:** las convocatorias de la Secretaría de Desarrollo Humano y Bien Común de Chihuahua, con las de discapacidad primero y el enlace oficial de cada una. Lazo **no inventa fechas**: la Secretaría no las publica en esa lista.
- **Varios dispositivos:** el teléfono y la computadora de la misma persona se vinculan con un código.

## Tres piezas
| Carpeta | Qué es | Tecnología |
|---|---|---|
| [`server/`](server/README.md) | Servidor: guarda los datos, calcula los avisos, lee las convocatorias | Node.js 20+, **sin dependencias** |
| [`android/`](android/README.md) | App del teléfono (persona y cuidador) | Kotlin + Jetpack Compose |
| [`desktop/`](desktop/README.md) | Asistente de Windows 11: barra superior con dictado y órdenes por voz locales | Tauri 2 (Rust + React) |

## Empezar en cinco minutos
```bash
cd server && npm test && LAZO_HOST=0.0.0.0 node scripts/demo.js   # servidor con datos ficticios
```
Luego instala el APK (`android/app/build/outputs/apk/release/`) y abre Lazo. Guía completa: [`docs/entrega/preparar-demo.md`](docs/entrega/preparar-demo.md).

## Accesibilidad
Es el requisito central, no un extra: contraste ≥ 7:1, áreas táctiles ≥ 64 dp, TalkBack en cada elemento, estados con texto y signo (nunca solo color), letra hasta el doble y un menú de botones grandes cuando la letra crece. Detalle y pruebas: [`docs/ACCESIBILIDAD.md`](docs/ACCESIBILIDAD.md).

## Privacidad
Sin cuentas, sin analítica, sin inteligencia artificial de terceros. Los datos viven en el servidor de cada persona (archivo con permisos solo del dueño, tokens guardados como huella). El dictado y las órdenes por voz de Windows se procesan en la computadora. Lo único que se descarga de internet es la página pública de convocatorias.

## Pruebas
`server`: 60 · `android`: 44 (incluye pantallas con capturas y una prueba contra el servidor real) · `desktop`: 137 (TypeScript) + 84 (Rust: 45 de la app y 39 del núcleo).

## Licencia
MIT. Ver [`LICENSE`](LICENSE) y [`desktop/THIRD_PARTY.md`](desktop/THIRD_PARTY.md).
