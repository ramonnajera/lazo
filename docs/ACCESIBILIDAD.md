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

## Color con significado (auditoría de diseño, 2026-11-18)
Cada tema tiene su color y su ícono, y **el color nunca es lo único que dice algo**: siempre hay texto al lado.

| Tema | Color | Dónde |
|---|---|---|
| Hoy, Hablar con Lazo | Azul `#0B3D91` | Barra de pestañas, botón grande de Hoy, botón flotante |
| Medicinas | Verde `#12803C` | Pestaña y tarjetas |
| Citas | Morado `#7A2FC0` | Pestaña y tarjetas |
| Salud | Rosa `#D0124F` (presión), petróleo `#0B7285` (glucosa), morado (ánimo), naranja `#C2410C` (dolor), verde (peso) | Pestaña, cuadros y registros |
| Apoyos, avisos | Naranja `#C2410C` | Convocatorias |

- Todos los acentos dan ≥ 4.5:1 con blanco (ícono blanco sobre el color) y sobre el fondo claro (ícono de color sobre fondo); el **texto** sigue siendo oscuro sobre blanco (≥ 7:1). En alto contraste todo pasa a amarillo sobre negro. Pruebas: `PaletaTest`.
- «Hablar con Lazo» es lo primero que se alcanza en Hoy (botón grande justo bajo el saludo) y en las demás pestañas queda un botón flotante de 64 dp. Las pantallas internas llevan un «Volver» grande a la vista.
- Con letra grande (≥ 1.5×) los cuadros de Salud pasan a una sola columna y la barra de pestañas se vuelve un menú de filas grandes.
- La isla de Windows usa los mismos matices (aclarados para fondo azul noche), con «Hablar con Lazo» como botón redondo y relleno al inicio de la barra y también arriba de Hoy.
