package mx.lazo.app

import androidx.test.core.app.ApplicationProvider
import mx.lazo.app.alarm.AlertasJobService
import mx.lazo.app.data.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DatosTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    @Test fun normalizarUrl() {
        assertEquals("http://192.168.1.5:18800", mx.lazo.app.data.normalizarUrl("192.168.1.5:18800"))
        assertEquals("https://lazo.ejemplo.mx", normalizarUrl("  https://lazo.ejemplo.mx/ "))
        assertEquals("http://100.64.0.1:18800", normalizarUrl("http://100.64.0.1:18800//".trimEnd('/')))
        assertNull(normalizarUrl(""))
        assertNull(normalizarUrl("mi servidor"))
        assertNull(normalizarUrl("http://"))
    }

    @Test fun parseaDosisConTodosLosEstados() {
        val o = JSONObject("""{"medicamentoId":"a","nombre":"Metformina","dosis":"850 mg","instrucciones":"","fecha":"2026-11-18","hora":"08:00","estado":"pospuesta","hasta":{"fecha":"2026-11-18","hora":"08:15"}}""")
        val d = Dosis.de(o)
        assertEquals(Estado.POSPUESTA, d.estado)
        assertEquals("08:15", d.hastaHora)
        assertEquals("a|2026-11-18|08:00", d.clave)
        assertEquals(Estado.PENDIENTE, Estado.de("raro")) // un estado desconocido no rompe la pantalla
        assertTrue(Estado.ATRASADA.requiereAtencion && Estado.AHORA.requiereAtencion && !Estado.TOMADA.requiereAtencion)
    }

    @Test fun parseaMedicamentoConCamposNulos() {
        val m = Medicamento.de(JSONObject("""{"id":"x","nombre":"Losartán","dosis":"50 mg","horarios":["08:00"],"dias":null,"inicio":"2026-11-18","fin":null,"existencias":null}"""))
        assertNull(m.dias); assertNull(m.fin); assertNull(m.existencias); assertTrue(m.activo)
        assertEquals(listOf("08:00"), m.horarios)
    }

    @Test fun parseaResumenDelCuidador() {
        val r = Resumen.de(JSONObject("""{"persona":{"nombre":"Ana Ejemplo","discapacidad":"visual"},"proximaToma":null,
          "adherencia":{"dias":7,"porDia":[{"fecha":"2026-11-17","programadas":2,"tomadas":2,"omitidas":0,"atrasadas":0,"pendientes":0}],"porcentaje":null},
          "citas":[{"id":"c","especialista":"Oftalmología","motivo":"","lugar":"Hospital","fecha":"2026-11-20","hora":"09:00","notas":"","transporte":""}],
          "mediciones":{"presion":{"texto":"120/80"}},"alertas":[{"id":"dosis:a:2026-11-18:08:00","tipo":"dosis-atrasada","severidad":"alta","fecha":"x","titulo":"Sin confirmar: Metformina","detalle":"d","visto":false}]}"""))
        assertEquals("Ana Ejemplo", r.persona); assertEquals(Discapacidad.VISUAL, r.discapacidad)
        assertNull(r.proximaToma); assertNull(r.porcentaje)
        assertEquals(1, r.dias.size); assertEquals(1, r.citas.size)
        assertEquals(listOf(TipoMedicion.PRESION to "120/80"), r.mediciones)
        assertEquals("alta", r.alertas[0].severidad)
    }

    @Test fun parseaConvocatorias() {
        val l = ListaConvocatorias.de(JSONObject("""{"items":[{"id":"p","nombre":"Premio estatal por la discapacidad","dependencia":"Dirección","documento":"https://x/p.pdf","ficha":"https://x/ficha","tipoDocumento":"pdf","discapacidad":true},
          {"id":"i","nombre":"Apoyos","dependencia":"D","documento":"https://x/i.png","tipoDocumento":"imagen","discapacidad":false}],"ultimaLectura":"2026-11-18T08:00:00-06:00","error":null,"nuevas":["p"]}"""))
        assertEquals(2, l.items.size); assertTrue(l.items[0].discapacidad); assertNull(l.items[1].ficha); assertNull(l.error); assertEquals(setOf("p"), l.nuevas)
    }

    @Test fun mensajesDeErrorSonHumanos() {
        assertEquals("Este dispositivo ya no tiene acceso. Vuelve a conectarlo.", LazoApi.mensajeDeError(401, null))
        assertEquals("El cuidador solo puede consultar.", LazoApi.mensajeDeError(403, null))
        assertEquals("Hora debe ser HH:MM", LazoApi.mensajeDeError(400, JSONObject("""{"error":"hora debe ser HH:MM"}""")))
        assertTrue(LazoApi.mensajeDeError(500, null).contains("500"))
    }

    @Test fun prefsGuardaResueltasPospuestasYCola() {
        val p = Prefs.de(ctx); p.cerrarSesion()
        assertFalse(p.conectado)
        p.servidor = "http://x:1"; p.token = "lzo_t"; p.rol = Rol.PERSONA
        assertTrue(p.conectado)
        p.resolver("a|2026-11-18|08:00"); p.resolver("a|2026-11-10|08:00")
        p.podarResueltas("2026-11-18")
        assertEquals(setOf("a|2026-11-18|08:00"), p.resueltas()) // lo de hace más de 3 días se olvida
        p.desresolver("a|2026-11-18|08:00"); assertTrue(p.resueltas().isEmpty())
        p.pospuesta("k", 123L); assertEquals(mapOf("k" to 123L), p.pospuestas()); p.quitarPospuesta("k"); assertTrue(p.pospuestas().isEmpty())
        p.encolar(AccionPendiente("a", "2026-11-18", "08:00", "tomada", null))
        p.encolar(AccionPendiente("a", "2026-11-18", "08:00", "omitida", null)) // la misma toma: gana la última acción
        assertEquals(listOf("omitida"), p.cola().map { it.estado })
        p.reemplazarCola(emptyList()); assertTrue(p.cola().isEmpty())
        p.escalaTexto = 5f; assertEquals(2f, p.escalaTexto, 0f) // se limita
        p.cerrarSesion(); assertEquals("", p.token)
    }

    @Test fun cacheEscribeYLee() {
        val c = Cache(ctx); c.clear()
        assertNull(c.read("x"))
        c.write("x", JSONObject("""{"a":1}""")); assertEquals(1, c.read("x")!!.getInt("a"))
        c.clear(); assertNull(c.read("x"))
    }

    @Test fun elCuidadorSoloRecibeAvisosGravesYLaPersonaSoloConvocatorias() {
        val alertas = listOf(
            Alerta("1", "dosis-atrasada", "alta", "", "t", "d", false), Alerta("2", "cita-proxima", "info", "", "t", "d", false),
            Alerta("3", "medicion-fuera-de-rango", "media", "", "t", "d", false), Alerta("4", "dosis-atrasada", "alta", "", "t", "d", true),
            Alerta("5", "convocatoria-nueva", "info", "", "t", "d", false), Alerta("6", "dosis-atrasada", "alta", "", "t", "d", false),
        )
        assertEquals(listOf("1", "3"), AlertasJobService.filtrar(Rol.CUIDADOR, alertas, setOf("6")).map { it.id }) // la vista y la ya notificada no repiten
        assertEquals(listOf("5"), AlertasJobService.filtrar(Rol.PERSONA, alertas, emptySet()).map { it.id })
    }

    @Test fun elPedidoDeAyudaSuenaComoAlarmaYNuncaLeLlegaALaPersona() {
        val ayuda = Alerta("ayuda:1", "ayuda", "alta", "2026-11-18T09:00:00-06:00", "Ana pidió ayuda", "", false)
        assertEquals(listOf("ayuda:1"), AlertasJobService.filtrar(Rol.CUIDADOR, listOf(ayuda), emptySet()).map { it.id })
        assertTrue(AlertasJobService.filtrar(Rol.PERSONA, listOf(ayuda), emptySet()).isEmpty())
        mx.lazo.app.alarm.Notificaciones.crearCanales(ctx)
        val nm = ctx.getSystemService(android.app.NotificationManager::class.java)
        val canal = nm.getNotificationChannel(mx.lazo.app.alarm.Notificaciones.CANAL_AYUDA)
        assertEquals(android.app.NotificationManager.IMPORTANCE_HIGH, canal.importance)
        assertEquals(android.media.AudioAttributes.USAGE_ALARM, canal.audioAttributes.usage)
        org.robolectric.Shadows.shadowOf(ctx as android.app.Application).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
        val prefs = Prefs.de(ctx)
        AlertasJobService.notificar(ctx, Rol.CUIDADOR, listOf(ayuda, Alerta("d", "dosis-atrasada", "alta", "", "Sin confirmar", "x", false)), soloAyuda = true)
        val publicadas = org.robolectric.Shadows.shadowOf(nm).allNotifications
        assertEquals(1, publicadas.size) // con la app abierta solo interrumpe el pedido de ayuda
        val n = publicadas.single()
        assertEquals(mx.lazo.app.alarm.Notificaciones.CANAL_AYUDA, n.channelId)
        assertEquals("Urgente: Ana pidió ayuda", n.extras.getString(android.app.Notification.EXTRA_TITLE))
        assertTrue(n.extras.getCharSequence(android.app.Notification.EXTRA_TEXT).toString().contains("911"))
        assertTrue("ayuda:1" in prefs.notificadas())
        AlertasJobService.notificar(ctx, Rol.CUIDADOR, listOf(ayuda))
        assertEquals("el mismo pedido no vuelve a sonar", 1, org.robolectric.Shadows.shadowOf(nm).allNotifications.size)
    }

    @Test fun losRecordatoriosDeCitasSeProgramanDesdeLaCacheYSeCancelanAlCerrarSesion() {
        val prefs = Prefs.de(ctx)
        prefs.cerrarSesion()
        prefs.servidor = "http://x"; prefs.token = "t"; prefs.rol = Rol.PERSONA
        val ahora = java.time.LocalDateTime.parse("2026-11-18T10:00:00")
        Cache(ctx).write("citas", JSONObject().put("citas", org.json.JSONArray().put(JSONObject().put("id", "c1").put("especialista", "Oftalmología").put("fecha", "2026-11-20").put("hora", "09:30"))))
        mx.lazo.app.alarm.RecordatoriosCitas.reprogramar(ctx, with(mx.lazo.app.domain.ZONA) { ahora.toEpochSecond(this) * 1000 })
        val am = org.robolectric.Shadows.shadowOf(ctx.getSystemService(android.app.AlarmManager::class.java))
        val tiempos = am.scheduledAlarms.map { it.triggerAtTime }.sorted()
        assertEquals(listOf(java.time.LocalDateTime.parse("2026-11-19T20:00:00"), java.time.LocalDateTime.parse("2026-11-20T07:30:00")).map { it.toEpochSecond(mx.lazo.app.domain.ZONA) * 1000 }, tiempos)
        assertEquals(2, prefs.programadasCitas().size)
        // Al cerrar sesión se cancelan ANTES de borrar las preferencias (si no, se pierden los códigos y las alarmas quedan sueltas)
        prefs.escalaTexto = 1.8f; prefs.altoContraste = true
        mx.lazo.app.ui.AppViewModel.cancelarAlarmasYBorrar(ctx)
        assertTrue(am.scheduledAlarms.isEmpty())
        assertFalse(prefs.conectado)
        assertEquals(1.8f, prefs.escalaTexto); assertTrue(prefs.altoContraste) // la letra grande y el contraste no se pierden
        assertTrue(prefs.programadasCitas().isEmpty())
    }

    @Test fun parseaResurtir() {
        val r = Resurtir.de(JSONObject("""{"id":"a","nombre":"Metformina","dosis":"850 mg","existencias":9,"porDia":2,"diasRestantes":4,"seAcaba":"2026-11-22","alcanzaHastaFin":false,"urgente":false}"""))
        assertEquals(Resurtir("a", 4, "2026-11-22", false, false), r)
        val sinFecha = Resurtir.de(JSONObject("""{"id":"b","diasRestantes":null,"seAcaba":null,"alcanzaHastaFin":true,"urgente":false}"""))
        assertNull(sinFecha.diasRestantes); assertNull(sinFecha.seAcaba); assertTrue(sinFecha.alcanzaHastaFin)
    }
}
