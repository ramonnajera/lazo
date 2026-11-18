package mx.lazo.app

import android.app.Application
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import com.github.takahirom.roborazzi.captureRoboImage
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import mx.lazo.app.data.*
import mx.lazo.app.ui.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** Pantallas reales de Lazo en Robolectric: comportamiento (toques, descripciones para TalkBack) y capturas para revisarlas a ojo. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h1900dp-xhdpi")
class PantallasTest {
    @get:Rule val rule = createComposeRule()
    private val app get() = ApplicationProvider.getApplicationContext<Application>()
    private lateinit var vm: AppViewModel
    private val carpeta = File("build/pantallas").apply { mkdirs() }

    private val hoy = "2026-11-18"
    private val tomas = listOf(
        Dosis("a", "Metformina", "850 mg", "Con alimentos", hoy, "08:00", Estado.TOMADA, "08:05", null),
        Dosis("b", "Losartán", "50 mg", "", hoy, "12:00", Estado.ATRASADA, null, null),
        Dosis("a", "Metformina", "850 mg", "Con alimentos", hoy, "20:00", Estado.PENDIENTE, null, null),
    )
    private val citas = listOf(Cita("c1", "Oftalmología", "Revisión de la vista", "Hospital General, consultorio 4", "2026-11-20", "09:30", "Llevar estudios", "Taxi adaptado"))
    private val ui = Ui(
        rol = Rol.PERSONA, nombre = "Ana Ejemplo", hoy = hoy, tomas = tomas, proxima = tomas[1], citas = citas,
        medicamentos = listOf(Medicamento("a", "Metformina", "850 mg", "Con alimentos", listOf("08:00", "20:00"), null, hoy, null, 2, true), Medicamento("b", "Losartán", "50 mg", "", listOf("12:00"), listOf(1, 3, 5), hoy, null, 28, true)),
        mediciones = listOf(Medicion("m1", TipoMedicion.GLUCOSA, "260 mg/dL", "después de comer", hoy, "09:10", Aviso("media", "Glucosa alta: 260 mg/dL")), Medicion("m2", TipoMedicion.PRESION, "120/80", "", hoy, "08:00", null)),
        convocatorias = ListaConvocatorias(
            listOf(
                Convocatoria("premio", "Premio estatal por la discapacidad Manuel Trueva Martínez", "Dirección de Grupos Vulnerables y Prevención a la Discriminación", "https://x/p.pdf", "https://x/f", "pdf", true),
                Convocatoria("esp", "Apoyo en especie para personas con discapacidad resto del Estado", "Dirección de Grupos Vulnerables y Prevención a la Discriminación", "https://x/e.pdf", "https://x/f2", "pdf", true),
                Convocatoria("ali", "Apoyos alimenticios", "Subsecretaría de la Frontera Norte", "https://x/a.png", null, "imagen", false),
            ), "2026-11-18T08:00:00-06:00", null, setOf("premio"),
        ),
        escala = 1.25f,
    )

    @Before fun preparar() { Prefs.de(app).cerrarSesion(); vm = AppViewModel(app) }

    private fun mostrar(alto: Boolean = false, escala: Float = 1.25f, contenido: @Composable () -> Unit) = rule.setContent { LazoTema(alto, escala) { androidx.compose.material3.Surface(color = LocalPaleta.current.fondo) { contenido() } } }

    private fun foto(nombre: String) {
        rule.onRoot().captureRoboImage(File(carpeta, "$nombre.png").path)
    }

    // ---------- comportamiento ----------
    @Test fun yaLaTomeConfirmaLaTomaYLaGuardaLocalmente() {
        mostrar { PantallaHoy(vm, ui, {}, {}) }
        rule.onNodeWithText("Ya la tomé").assertIsDisplayed().assertHasClickAction()
        rule.onNodeWithText("Ya la tomé").performClick()
        rule.waitForIdle()
        assertTrue("b|2026-11-18|12:00" in Prefs.de(app).resueltas())
    }

    @Test fun losBotonesGrandesTienenAlMenos64dpDeAlto() {
        mostrar { PantallaHoy(vm, ui, {}, {}) }
        val altoMinimoPx = with(rule.density) { 64.dp.toPx() }
        for (texto in listOf("Ya la tomé", "Hablar con Lazo", "Leer mi día en voz alta")) {
            val h = rule.onNodeWithText(texto).fetchSemanticsNode().size.height
            assertTrue("$texto mide $h px", h >= altoMinimoPx)
        }
    }

    @Test fun talkBackLeeLaTomaSiguienteDeUnaSolaVez() {
        mostrar { PantallaHoy(vm, ui, {}, {}) }
        rule.onNode(hasContentDescription("Siguiente toma", substring = true)).assertExists()
        val d = rule.onNode(hasContentDescription("Siguiente toma", substring = true)).fetchSemanticsNode().config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.ContentDescription)!!.first()
        assertTrue(d, d.contains("Losartán") && d.contains("12 del día") && d.contains("Atrasada"))
    }

    @Test fun losEstadosSiempreTienenTextoNoSoloColor() {
        mostrar { PantallaHoy(vm, ui, {}, {}) }
        rule.onAllNodesWithText("Atrasada").assertCountEquals(2) // en la tarjeta grande y en la lista del día
        rule.onNodeWithText("Tomada a las 8:05 am").assertExists()
        rule.onNodeWithText("Pendiente").assertExists()
    }

    @Test fun losTresBotonesDeAccionEstanApiladosYTienenElMismoAncho() {
        mostrar(false, 2f) { PantallaHoy(vm, ui, {}, {}) }
        val nodos = listOf("Ya la tomé", "Pospón 10 minutos", "Omitir esta toma").map { rule.onNodeWithText(it).fetchSemanticsNode().boundsInRoot }
        assertEquals("los tres botones deben medir lo mismo de ancho: $nodos", 1, nodos.map { it.width }.toSet().size)
        assertTrue("deben ir uno debajo de otro: $nodos", nodos.zipWithNext().all { (a, b) -> b.top >= a.bottom })
    }

    @Test fun conLetraNormalHayBarraConCincoDestinosYSinMenu() {
        // Que las etiquetas no se corten se revisa a ojo en las capturas (la métrica de desborde de Robolectric no es fiable)
        mostrar(false, 1.25f) { Principal(vm, ui, {}) }
        for (t in listOf("Hoy", "Medicinas", "Citas", "Salud", "Más")) rule.onNodeWithText(t).assertExists()
        rule.onAllNodesWithText("Menú", substring = true).assertCountEquals(0)
    }

    @Test fun conLetraMuyGrandeLaBarraSeConvierteEnUnMenuDeBotones() {
        mostrar(false, 2f) { Principal(vm, ui, {}) }
        rule.onNodeWithText("Menú · Hoy").assertExists().assertHasClickAction()
        rule.onAllNodesWithText("Medicinas").assertCountEquals(0) // no hay barra apretada
        rule.onNodeWithText("Menú · Hoy").performClick()
        rule.onNodeWithText("Cerrar el menú").assertExists()
        for (t in listOf("Hoy", "Medicinas", "Citas", "Salud", "Más")) rule.onNodeWithText(t).assertExists().assertHasClickAction()
        rule.onNodeWithText("Medicinas").performClick()
        rule.onNodeWithText("Mis medicinas").assertExists() // navega y cierra el menú
        rule.onNodeWithText("Menú · Medicinas").assertExists()
    }

    @Test fun deshacerSoloApareceEnLoQueYaSeResolvio() {
        mostrar { PantallaHoy(vm, ui, {}, {}) }
        rule.onAllNodesWithText("Deshacer").assertCountEquals(1)
    }

    @Test fun sinTomasPendientesLoDiceEnVozClara() {
        mostrar { PantallaHoy(vm, ui.copy(proxima = null, tomas = emptyList()), {}, {}) }
        rule.onNodeWithText("Todo al día").assertExists()
        rule.onNodeWithText("Hoy no tienes tomas programadas.").assertExists()
    }

    @Test fun medicinaConPocasDosisAvisaConTexto() {
        mostrar { PantallaMedicinas(ui, {}) }
        rule.onNodeWithText("Quedan pocas dosis: 2.").assertExists()
        rule.onAllNodesWithText("Editar").assertCountEquals(2)
    }

    @Test fun elCuidadorNoVeBotonesDeEscrituraEnCitas() {
        mostrar { PantallaCitas(ui.copy(rol = Rol.CUIDADOR), {}) }
        rule.onNodeWithText("Agregar una cita").assertDoesNotExist()
        rule.onNodeWithText("Editar").assertDoesNotExist()
    }

    @Test fun formularioDeMedicinaExigeNombreYHora() {
        mostrar { FormMedicamento(vm, ui, null) {} }
        rule.onNodeWithText("Guardar").performClick()
        rule.onNodeWithText("Escribe el nombre de la medicina.").assertExists()
    }

    @Test fun convocatoriaNuevaYDeDiscapacidadSeDistinguenConTexto() {
        mostrar { PantallaConvocatorias(vm, ui) }
        rule.onNodeWithText("Para personas con discapacidad").assertExists()
        rule.onNodeWithText("Otras convocatorias").assertExists()
        rule.onAllNodesWithText("Nueva").assertCountEquals(1)
        rule.onNodeWithText("Buscar convocatorias nuevas").assertExists() // la persona puede actualizar
    }

    @Test fun elMensajeDeErrorSeAnunciaComoRegionVivaParaTalkBack() {
        mostrar { MensajeVivo("Sin conexión") {} }
        val n = rule.onNodeWithText("Sin conexión").fetchSemanticsNode()
        assertTrue(generateSequence(n) { it.parent }.any { it.config.contains(androidx.compose.ui.semantics.SemanticsProperties.LiveRegion) })
    }

    // ---------- capturas ----------
    @Test fun capturas() {
        val resumen = Resumen("Ana Ejemplo", Discapacidad.AMBAS, tomas[1], 83, listOf(DiaAdherencia("2026-11-16", 3, 3, 0, 0, 0), DiaAdherencia("2026-11-17", 3, 2, 1, 0, 0), DiaAdherencia("2026-11-18", 3, 1, 0, 1, 1)), citas, listOf(TipoMedicion.PRESION to "120/80", TipoMedicion.GLUCOSA to "260 mg/dL"),
            listOf(Alerta("x", "dosis-atrasada", "alta", "", "Sin confirmar: Losartán", "La toma de las 12:00 no se ha confirmado.", false)))
        val pantallas: List<Pair<String, @Composable () -> Unit>> = listOf(
            "hoy" to { PantallaHoy(vm, ui, {}, {}) }, "medicinas" to { PantallaMedicinas(ui, {}) }, "form_medicina" to { FormMedicamento(vm, ui, "a") {} },
            "citas" to { PantallaCitas(ui, {}) }, "seguimiento" to { PantallaSeguimiento(vm, ui, {}) }, "form_dolor" to { FormMedicion(vm, TipoMedicion.DOLOR) {} },
            "convocatorias" to { PantallaConvocatorias(vm, ui) }, "accesibilidad" to { PantallaAccesibilidad(vm, ui) }, "mas" to { PantallaMas(ui, {}) },
            "bienvenida" to { Bienvenida(vm, Ui()) },
            "cuidador_resumen" to { PantallaResumen(vm, ui.copy(rol = Rol.CUIDADOR, resumen = resumen)) },
        )
        var actual by androidx.compose.runtime.mutableStateOf<(@Composable () -> Unit)?>(null)
        var alto by androidx.compose.runtime.mutableStateOf(false)
        var escala by androidx.compose.runtime.mutableFloatStateOf(1.25f)
        rule.setContent { LazoTema(alto, escala) { androidx.compose.material3.Surface(color = LocalPaleta.current.fondo) { actual?.invoke() } } }
        for ((nombre, p) in pantallas) { actual = p; rule.waitForIdle(); foto(nombre) }
        // La misma pantalla principal en alto contraste y con la letra al doble
        actual = { Principal(vm, ui, {}) }; escala = 1.25f; rule.waitForIdle(); foto("principal_normal")
        escala = 2f; rule.waitForIdle(); foto("principal_letra_doble")
        escala = 1.25f
        alto = true; actual = pantallas[0].second; rule.waitForIdle(); foto("hoy_alto_contraste")
        alto = false; escala = 2f; rule.waitForIdle(); foto("hoy_letra_doble")
    }
}
