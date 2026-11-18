# Accesibilidad en Lazo

Cada requisito tiene una implementación concreta y, donde se puede, una prueba automática que impide que vuelva a romperse.

| Requisito | Cómo se cumple | Dónde se verifica |
|---|---|---|
| Contraste ≥ 7:1 (WCAG AAA) | Paleta normal y modo **alto contraste** (negro, amarillo y blanco) | `android/.../ui/Tema.kt`; capturas `hoy` y `hoy_alto_contraste` |
| Áreas táctiles ≥ 64 dp | `BotonGrande` mide ≥ 72 dp; fichas ≥ 60 dp | `PantallasTest.losBotonesGrandesTienenAlMenos64dpDeAlto` |
| Lector de pantalla (TalkBack) | Cada tarjeta se lee de una sola vez («Siguiente toma: Losartán, 50 mg, hoy a las 12 del día. Atrasada.»); mensajes como región viva | `talkBackLeeLaTomaSiguienteDeUnaSolaVez`, `elMensajeDeErrorSeAnunciaComoRegionVivaParaTalkBack` |
| Nada se comunica solo con color | Cada estado lleva texto y signo (✓ ! ✕ ↻ ○); la adherencia se muestra con ● ○ ✕ | `losEstadosSiempreTienenTextoNoSoloColor` |
| Letra grande | Hasta 2× sobre la del sistema; con letra ≥ 1.5× la barra de pestañas se vuelve un botón «Menú» y los botones se apilan | `conLetraMuyGrandeLaBarraSeConvierteEnUnMenuDeBotones`, `losTresBotonesDeAccionEstanApiladosYTienenElMismoAncho`, captura `principal_letra_doble` |
| Sin gestos de precisión | Nada de deslizar para confirmar; una acción principal por pantalla; selectores de fecha y hora del sistema | Diseño |
| Voz | Las alarmas se leen solas; órdenes por voz en español («ya la tomé», «pospón diez minutos», «qué sigue»); la isla de Windows dicta y contesta con voz | `LogicaPuraTest` (órdenes), `server/test/comandos.test.js` |
| Funciona sin internet | Las alarmas son locales (AlarmManager exacto) y lo que se hace sin conexión se guarda en una cola y se envía después | `DatosTest`, `LogicaPuraTest.planDeAlarmas*` |
| Avisos orientativos, no diagnóstico | Todo aviso de un valor fuera de rango lo dice con esas palabras y sus rangos son editables | `server/test/alerts-resumen.test.js` |

## Lo que **no** está hecho todavía (con honestidad)
- No se ha validado con personas usuarias reales ni con una auditoría formal de accesibilidad: está en el cronograma (fases 2 y 3).
- Los avisos al cuidador son por consulta periódica (cada ~15 minutos con la app cerrada), no instantáneos; Firebase queda como trabajo futuro.
- No hay versión para iOS.
- Las capturas de pantalla de las pruebas se generan en un emulador de pruebas (Robolectric); falta probar en dispositivos físicos con TalkBack.
