package mx.lazo.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import com.github.takahirom.roborazzi.captureRoboImage
import mx.lazo.app.data.*
import mx.lazo.app.ui.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** Capturas con las medidas de un teléfono real (411 × 891 dp): así se ve de verdad la barra, el botón flotante y lo que cabe sin desplazarse. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xhdpi")
class CapturasTelefonoTest {
    @get:Rule val rule = createComposeRule()
    private val app get() = ApplicationProvider.getApplicationContext<Application>()
    private lateinit var vm: AppViewModel
    private val carpeta = File("build/telefono").apply { mkdirs() }
    private val hoy = "2026-11-18"
    private val tomas = listOf(
        Dosis("a", "Metformina", "850 mg", "Con alimentos", hoy, "08:00", Estado.TOMADA, "08:05", null),
        Dosis("b", "Losartán", "50 mg", "", hoy, "12:00", Estado.ATRASADA, null, null),
        Dosis("a", "Metformina", "850 mg", "Con alimentos", hoy, "20:00", Estado.PENDIENTE, null, null),
    )
    private val ui = Ui(
        rol = Rol.PERSONA, nombre = "Ana Ejemplo", hoy = hoy, tomas = tomas, proxima = tomas[1],
        citas = listOf(Cita("c1", "Oftalmología", "Revisión de la vista", "Hospital General, consultorio 4", "2026-11-20", "09:30", "", "")),
        medicamentos = listOf(Medicamento("a", "Metformina", "850 mg", "Con alimentos", listOf("08:00", "20:00"), null, hoy, null, 2, true)),
        mediciones = listOf(Medicion("m1", TipoMedicion.GLUCOSA, "260 mg/dL", "", hoy, "09:10", Aviso("media", "Glucosa alta: 260 mg/dL")), Medicion("m2", TipoMedicion.PRESION, "120/80", "", hoy, "08:00", null)),
        escala = 1.25f,
    )

    @Before fun preparar() { Prefs.de(app).cerrarSesion(); vm = AppViewModel(app) }

    private fun foto(nombre: String) { rule.onRoot().captureRoboImage(File(carpeta, "$nombre.png").path) }

    @Test fun capturas() {
        var u by mutableStateOf(ui)
        var alto by mutableStateOf(false)
        var escala by mutableStateOf(1.25f)
        rule.setContent { LazoTema(alto, escala) { androidx.compose.material3.Surface(color = LocalPaleta.current.fondo) { Principal(vm, u) } } }
        rule.waitForIdle(); foto("1_hoy")
        for ((i, t) in listOf("Medicinas", "Citas", "Salud", "Más").withIndex()) { rule.onNodeWithText(t).performClick(); rule.waitForIdle(); foto("${i + 2}_${t.lowercase().replace("á", "a")}") }
        rule.onNodeWithText("Hoy").performClick(); rule.waitForIdle()
        alto = true; rule.waitForIdle(); foto("6_hoy_alto_contraste")
        rule.onNodeWithText("Salud").performClick(); rule.waitForIdle(); foto("7_salud_alto_contraste")
        alto = false; escala = 2f; rule.waitForIdle(); foto("8_salud_letra_doble")
    }
}
