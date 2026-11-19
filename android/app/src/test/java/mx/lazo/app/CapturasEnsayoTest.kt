package mx.lazo.app

import android.app.Application
import androidx.compose.runtime.Composable
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

/** Capturas para el ensayo, con la persona ficticia del demo (Mateo Ruiz, joven autista) y medidas de un teléfono real. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xhdpi")
class CapturasEnsayoTest {
    @get:Rule val rule = createComposeRule()
    private val app get() = ApplicationProvider.getApplicationContext<Application>()
    private lateinit var vm: AppViewModel
    private val carpeta = File("build/ensayo").apply { mkdirs() }
    private val hoy = "2026-11-18"
    private val tomas = listOf(
        Dosis("r", "Risperidona", "0.5 mg", "Con alimentos. Para la irritabilidad", hoy, "08:00", Estado.TOMADA, "08:04", null),
        Dosis("s", "Sertralina", "25 mg", "En el desayuno", hoy, "09:00", Estado.TOMADA, "09:10", null),
        Dosis("o", "Omega 3", "1 cápsula", "Con la comida", hoy, "14:00", Estado.TOMADA, "14:20", null),
        Dosis("r", "Risperidona", "0.5 mg", "Con alimentos. Para la irritabilidad", hoy, "20:00", Estado.AHORA, null, null),
        Dosis("m", "Melatonina", "3 mg", "30 minutos antes de dormir, con luz baja", hoy, "21:30", Estado.PENDIENTE, null, null),
    )
    private val citas = listOf(
        Cita("c1", "Terapia ocupacional", "Integración sensorial", "Centro de Neurodesarrollo, sala 2", "2026-11-19", "10:00", "Llevar audífonos de cancelación de ruido y su agenda visual", "Lo lleva su mamá"),
        Cita("c2", "Terapia de lenguaje", "Comunicación social y conversación", "Centro de Neurodesarrollo, consultorio 5", "2026-11-20", "16:30", "Avisarle un día antes: no le gustan los cambios de último minuto", "Camión ruta 3, con su hermano"),
        Cita("c3", "Psiquiatría · Dra. Treviño", "Control de risperidona", "Hospital General, consultorio 12", "2026-11-24", "11:00", "Llevar el registro de peso, glucosa y ánimo", "Taxi"),
    )
    private val meds = listOf(
        Medicamento("r", "Risperidona", "0.5 mg", "Con alimentos. Para la irritabilidad", listOf("08:00", "20:00"), null, "2026-11-08", null, 5, true),
        Medicamento("s", "Sertralina", "25 mg", "En el desayuno. Para la ansiedad", listOf("09:00"), null, "2026-11-08", null, 24, true),
        Medicamento("m", "Melatonina", "3 mg", "30 minutos antes de dormir, con luz baja", listOf("21:30"), null, "2026-11-08", null, 40, true),
    )
    private val mediciones = listOf(
        Medicion("1", TipoMedicion.ANIMO, "4 de 5", "Tranquilo", hoy, "19:30", null),
        Medicion("2", TipoMedicion.GLUCOSA, "104 mg/dL", "En ayunas", hoy, "07:45", null),
        Medicion("3", TipoMedicion.PESO, "72.9 kg", "En ayunas: sube poco a poco, comentarlo en psiquiatría", hoy, "07:40", null),
        Medicion("4", TipoMedicion.ANIMO, "2 de 5", "Cambio de rutina en el trabajo, mucho ruido", "2026-11-12", "21:00", mx.lazo.app.data.Aviso("media", "Ánimo bajo (2 de 5)")),
    )
    private val ui = Ui(
        rol = Rol.PERSONA, nombre = "Mateo Ruiz", hoy = hoy, tomas = tomas, proxima = tomas[3], citas = citas, medicamentos = meds, mediciones = mediciones,
        resurtir = mapOf("r" to Resurtir("r", 2, "2026-11-20", false, true), "s" to Resurtir("s", 24, "2026-12-12", false, false), "m" to Resurtir("m", 40, "2026-12-28", false, false)),
        chat = listOf(
            MensajeChat(true, "¿Qué tengo mañana?", audio = true),
            MensajeChat(false, "Mañana a las 10 de la mañana tienes terapia ocupacional en el Centro de Neurodesarrollo. Recuerda llevar tus audífonos de cancelación de ruido."),
            MensajeChat(true, "ya me tomé la pastilla de la noche"),
            MensajeChat(false, "Listo, anoté tu Risperidona de las 8 de la noche como tomada. La siguiente es tu Melatonina a las 9 y media."),
        ),
        escala = 1.25f,
    )

    @Before fun preparar() { Prefs.de(app).cerrarSesion(); vm = AppViewModel(app) }
    private fun foto(nombre: String) { rule.onRoot().captureRoboImage(File(carpeta, "$nombre.png").path) }

    @Test fun capturas() {
        var actual by mutableStateOf<(@Composable () -> Unit)?>(null)
        var alto by mutableStateOf(false)
        rule.setContent { LazoTema(alto, 1.25f) { androidx.compose.material3.Surface(color = LocalPaleta.current.fondo) { actual?.invoke() } } }
        actual = { Principal(vm, ui) }; rule.waitForIdle(); foto("01_hoy")
        for ((n, t) in listOf("02_medicinas" to "Medicinas", "03_citas" to "Citas", "04_salud" to "Salud")) { rule.onNodeWithText(t).performClick(); rule.waitForIdle(); foto(n) }
        actual = { PantallaChat(vm, ui) }; rule.waitForIdle(); foto("05_hablar_con_lazo")
        actual = { PantallaHoy(vm, ui.copy(ayuda = EstadoAyuda.Enviada(1)), {}) }; rule.waitForIdle(); foto("06_necesito_ayuda")
        val alertas = listOf(
            Alerta("ay", "ayuda", "alta", "2026-11-18T20:05:00-06:00", "Mateo pidió ayuda", "Necesito ayuda", false),
            Alerta("x", "existencias-bajas", "media", "2026-11-18T08:00:00-06:00", "Quedan pocas dosis de Risperidona", "Quedan 5: alcanzan para 2 días.", false),
        )
        actual = { PantallaAlertas(vm, ui.copy(rol = Rol.CUIDADOR, alertas = alertas)) }; rule.waitForIdle(); foto("07_cuidador_aviso")
        alto = true; actual = { Principal(vm, ui) }; rule.waitForIdle(); foto("08_alto_contraste")
    }
}
