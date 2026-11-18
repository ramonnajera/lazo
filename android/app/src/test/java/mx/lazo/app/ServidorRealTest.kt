package mx.lazo.app

import kotlinx.coroutines.runBlocking
import mx.lazo.app.data.*
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.ServerSocket

/** Levanta el servidor REAL de Lazo (node) y prueba el cliente Android contra él: así se comprueba el contrato de verdad. */
class ServidorRealTest {
    private var proceso: Process? = null
    private lateinit var base: String
    private lateinit var datos: File

    @Before fun arrancar() {
        val servidor = generateSequence(File("").absoluteFile) { it.parentFile }.map { File(it, "server/src/index.js") }.firstOrNull { it.exists() }
        assumeTrue("no se encontró server/src/index.js", servidor != null)
        val node = listOf("node", "/usr/bin/node", System.getProperty("user.home") + "/.nvm/versions/node/v22.23.2/bin/node").firstOrNull {
            runCatching { ProcessBuilder(it, "-v").start().waitFor() == 0 }.getOrDefault(false)
        }
        assumeTrue("node no está disponible", node != null)
        val puerto = ServerSocket(0).use { it.localPort }
        datos = File.createTempFile("lazo", ".json").also { it.delete() }
        proceso = ProcessBuilder(node, servidor!!.path).redirectErrorStream(true).apply {
            environment()["LAZO_PORT"] = puerto.toString(); environment()["LAZO_DATA"] = datos.path
        }.start()
        base = "http://127.0.0.1:$puerto"
        val limite = System.currentTimeMillis() + 8000
        while (System.currentTimeMillis() < limite) {
            if (runCatching { runBlocking { LazoApi(base).health() } }.isSuccess) return
            Thread.sleep(150)
        }
        fail("el servidor no arrancó")
    }

    @After fun detener() { proceso?.destroy(); datos.delete() }

    @Test fun recorridoCompletoPersonaYCuidador() = runBlocking {
        assertFalse(LazoApi(base).health().getBoolean("configurado"))
        val alta = LazoApi(base).crearPerfil("Ana Ejemplo", Discapacidad.AMBAS, textoGrande = true, altoContraste = true)
        val token = alta.getString("token")
        val persona = LazoApi(base, token)
        val perfil = Perfil.de(persona.perfil().getJSONObject("perfil"))
        assertEquals("Ana Ejemplo", perfil.nombre); assertEquals(Discapacidad.AMBAS, perfil.discapacidad); assertTrue(perfil.altoContraste)

        // medicamento con una toma que ya venció y otra más tarde, para ver estados distintos sin depender de la hora del día
        val hoy = mx.lazo.app.domain.hoyIso()
        val ahora = mx.lazo.app.domain.ahoraLocal()
        val vencida = ahora.minusHours(2).let { "%02d:%02d".format(it.hour, it.minute) }
        val med = Medicamento.de(persona.guardarMedicamento(null, JSONObject().put("nombre", "Metformina").put("dosis", "850 mg").put("horarios", org.json.JSONArray(listOf(vencida))).put("existencias", 10).put("inicio", hoy)).getJSONObject("medicamento"))
        assertEquals(10, med.existencias)

        if (ahora.hour >= 2) { // si no, «hace dos horas» cae en el día anterior
            val tomas = persona.tomas().getJSONArray("tomas")
            assertEquals(Estado.ATRASADA, Dosis.de(tomas.getJSONObject(0)).estado)
            val r = persona.registrarToma(med.id, hoy, vencida, "tomada")
            assertEquals(Estado.TOMADA, Dosis.de(r.getJSONObject("toma")).estado)
            assertEquals(9, r.getInt("existencias"))
        }

        persona.guardarCita(null, JSONObject().put("especialista", "Oftalmología").put("fecha", "2026-12-20").put("hora", "09:30").put("lugar", "Hospital General"))
        val citas = persona.citas().getJSONArray("citas")
        assertEquals("Oftalmología", Cita.de(citas.getJSONObject(0)).especialista)

        val m = persona.registrarMedicion(TipoMedicion.GLUCOSA, JSONObject().put("mgdl", 260), "después de comer")
        assertEquals("media", m.getJSONObject("aviso").getString("nivel"))
        val meds = persona.mediciones().getJSONArray("mediciones")
        val medicion = Medicion.de(meds.getJSONObject(0))
        assertEquals(TipoMedicion.GLUCOSA, medicion.tipo); assertEquals("260 mg/dL", medicion.texto); assertNotNull(medicion.aviso)

        // círculo: invitación → cuidador → solo lectura
        val codigo = persona.invitacion().getString("codigo")
        val unido = LazoApi(base).unirse(codigo, "Luis Ejemplo", "Hijo")
        val cuidador = LazoApi(base, unido.getString("token"))
        val resumen = Resumen.de(cuidador.resumen())
        assertEquals("Ana Ejemplo", resumen.persona)
        assertEquals(1, resumen.citas.size)
        assertTrue(resumen.mediciones.any { it.first == TipoMedicion.GLUCOSA })
        val ex = runCatching { cuidador.guardarCita(null, JSONObject().put("especialista", "X").put("fecha", "2026-12-20").put("hora", "09:30")) }.exceptionOrNull() as ApiException
        assertEquals(403, ex.codigo)
        assertEquals("El cuidador solo puede consultar.", ex.message)
        val sinAcceso = runCatching { LazoApi(base, "lzo_falso").perfil() }.exceptionOrNull() as ApiException
        assertEquals(401, sinAcceso.codigo)
        val mala = runCatching { persona.guardarMedicamento(null, JSONObject().put("nombre", "X").put("horarios", org.json.JSONArray(listOf("25:00")))) }.exceptionOrNull() as ApiException
        assertEquals(400, mala.codigo); assertTrue(mala.message!!.contains("HH:MM"))

        val lista = ListaConvocatorias.de(persona.convocatorias())
        assertTrue(lista.items.isEmpty() || lista.items.any { it.discapacidad }) // sin red en pruebas: vacía; con red, trae las de discapacidad
    }

    @Test fun vincularOtroDispositivoEsLaMismaPersonaYSePuedeQuitarElAcceso() = runBlocking {
        val token = LazoApi(base).crearPerfil("Ana Ejemplo", Discapacidad.VISUAL, true, false).getString("token")
        val primero = LazoApi(base, token)
        val codigo = primero.invitacionDispositivo().getString("codigo")
        assertEquals(6, codigo.length)
        val unido = LazoApi(base).vincularDispositivo(codigo, "Computadora")
        assertEquals("Ana Ejemplo", Perfil.de(unido.getJSONObject("perfil")).nombre)
        val segundo = LazoApi(base, unido.getString("token"))
        segundo.guardarCita(null, JSONObject().put("especialista", "Oftalmología").put("fecha", "2026-12-20").put("hora", "09:30")) // puede escribir: es la persona
        assertEquals(1, primero.citas().getJSONArray("citas").length())
        val usado = runCatching { LazoApi(base).vincularDispositivo(codigo, "Otro") }.exceptionOrNull() as ApiException
        assertEquals(404, usado.codigo)
        val lista = primero.dispositivos().getJSONArray("dispositivos")
        assertEquals(2, lista.length())
        val viejo = (0 until 2).map { lista.getJSONObject(it) }.first { it.getString("nombre") == "Computadora" }.getString("id")
        primero.quitarDispositivo(viejo)
        val fuera = runCatching { segundo.citas() }.exceptionOrNull() as ApiException
        assertEquals(401, fuera.codigo)
    }

    @Test fun sinServidorElErrorEsClaro() = runBlocking {
        val libre = ServerSocket(0).use { it.localPort }
        val ex = runCatching { LazoApi("http://127.0.0.1:$libre").health() }.exceptionOrNull() as ApiException
        assertTrue(ex.message!!.startsWith("No pude conectar"))
    }
}
