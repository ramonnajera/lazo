package mx.lazo.app

import mx.lazo.app.data.Estado
import mx.lazo.app.data.Medicamento
import mx.lazo.app.domain.*
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime

class LogicaPuraTest {
    private fun med(id: String, nombre: String, horarios: List<String>, dias: List<Int>? = null, inicio: String? = null, fin: String? = null, activo: Boolean = true) =
        Medicamento(id, nombre, "50 mg", "", horarios, dias, inicio, fin, null, activo)

    // ---- calendario de dosis (debe coincidir con el servidor) ----
    @Test fun dosisDelDiaRespetaDiasRangoYActivo() {
        val ms = listOf(med("a", "Metformina", listOf("20:00", "08:00")), med("b", "Losartán", listOf("08:00"), dias = listOf(1, 3), inicio = "2026-11-10", fin = "2026-11-30"), med("c", "Pausado", listOf("09:00"), activo = false))
        assertEquals(listOf("08:00 Losartán", "08:00 Metformina", "20:00 Metformina"), dosisDelDia(ms, LocalDate.parse("2026-11-18")).map { "${it.hora} ${it.nombre}" }) // miércoles
        assertEquals(listOf("Metformina", "Metformina"), dosisDelDia(ms, LocalDate.parse("2026-11-19")).map { it.nombre }) // jueves
        assertEquals(2, dosisDelDia(ms, LocalDate.parse("2026-12-02")).size) // Losartán ya terminó
        assertEquals(2, dosisDelDia(ms, LocalDate.parse("2026-11-04")).size) // aún no empieza
    }

    @Test fun domingoEsCeroComoEnElServidor() {
        assertEquals(0, LocalDate.parse("2026-11-22").diaServidor())
        assertEquals(3, LocalDate.parse("2026-11-18").diaServidor())
        assertEquals(1, dosisDelDia(listOf(med("d", "Domingos", listOf("10:00"), dias = listOf(0))), LocalDate.parse("2026-11-22")).size)
    }

    @Test fun proximasDosisCruzaLaMedianocheYOmiteLoResuelto() {
        val ms = listOf(med("a", "Metformina", listOf("08:00", "23:30")))
        val desde = LocalDateTime.parse("2026-11-18T22:00:00")
        assertEquals(listOf("2026-11-18 23:30", "2026-11-19 08:00"), proximasDosis(ms, desde, 12).map { "${it.fecha} ${it.hora}" })
        assertEquals(listOf("2026-11-19 08:00"), proximasDosis(ms, desde, 12, setOf("a|2026-11-18|23:30")).map { "${it.fecha} ${it.hora}" })
    }

    // ---- plan de alarmas ----
    @Test fun planIncluyeLaTomaYElReintento() {
        val ms = listOf(med("a", "Metformina", listOf("08:00")))
        val ahora = LocalDateTime.parse("2026-11-18T07:00:00")
        val plan = planDeAlarmas(ms, ahora, emptySet())
        val hoy = plan.filter { it.clave.contains("2026-11-18") }
        assertEquals(listOf(false, true), hoy.map { it.reintento })
        assertEquals(LocalDateTime.parse("2026-11-18T08:00:00").aMillis(), hoy[0].millis)
        assertEquals(hoy[0].millis + 15 * 60_000, hoy[1].millis)
        assertNotEquals(hoy[0].codigo, hoy[1].codigo)
        assertEquals(hoy[0].codigo, planDeAlarmas(ms, ahora, emptySet()).first { it.clave == hoy[0].clave && !it.reintento }.codigo) // estable
    }

    @Test fun loResueltoNoSuenaYLoPasadoSeDescarta() {
        val ms = listOf(med("a", "Metformina", listOf("08:00")))
        val resuelta = planDeAlarmas(ms, LocalDateTime.parse("2026-11-18T07:00:00"), setOf("a|2026-11-18|08:00"))
        assertTrue(resuelta.none { it.clave == "a|2026-11-18|08:00" })
        val tarde = planDeAlarmas(ms, LocalDateTime.parse("2026-11-18T08:20:00"), emptySet())
        assertTrue(tarde.none { it.clave == "a|2026-11-18|08:00" }) // ya pasaron la toma y su reintento (08:15)
        val justo = planDeAlarmas(ms, LocalDateTime.parse("2026-11-18T08:05:00"), emptySet())
        assertEquals(listOf(true), justo.filter { it.clave == "a|2026-11-18|08:00" }.map { it.reintento }) // solo falta el reintento
    }

    @Test fun posponerMueveLaAlarma() {
        val ms = listOf(med("a", "Metformina", listOf("08:00")))
        val ahora = LocalDateTime.parse("2026-11-18T08:02:00")
        val nueva = ahora.plusMinutes(10).aMillis()
        val plan = planDeAlarmas(ms, ahora, emptySet(), mapOf("a|2026-11-18|08:00" to nueva))
        assertEquals(nueva, plan.first { it.clave == "a|2026-11-18|08:00" && !it.reintento }.millis)
    }

    @Test fun planTieneTope() {
        val muchos = (1..30).map { med("m$it", "Med $it", listOf("08:00", "12:00", "20:00")) }
        assertEquals(MAX_ALARMAS, planDeAlarmas(muchos, LocalDateTime.parse("2026-11-18T07:00:00"), emptySet()).size)
    }

    // ---- zona horaria ----
    @Test fun horaLocalEsUtcMenosSeis() {
        val ms = LocalDateTime.parse("2026-11-18T14:00:00").aMillis()
        assertEquals("2026-11-18T14:00", ahoraLocal(ms).toString())
        assertEquals("2026-11-18", hoyIso(java.time.Instant.parse("2026-11-19T05:59:00Z").toEpochMilli()))
        assertEquals("2026-11-19", hoyIso(java.time.Instant.parse("2026-11-19T06:00:00Z").toEpochMilli()))
        assertEquals("23:59", horaActual(java.time.Instant.parse("2026-11-19T05:59:00Z").toEpochMilli()))
    }

    // ---- textos para voz ----
    @Test fun horasHabladas() {
        assertEquals("8 de la mañana", horaHablada("08:00"))
        assertEquals("8:45 de la noche", horaHablada("20:45"))
        assertEquals("12 del día", horaHablada("12:00"))
        assertEquals("12 de la madrugada", horaHablada("00:00"))
        assertEquals("3:30 de la tarde", horaHablada("15:30"))
        assertEquals("8:05 pm", horaCorta("20:05"))
        assertEquals("12:00 am", horaCorta("00:00"))
        assertEquals("12:30 pm", horaCorta("12:30"))
    }

    @Test fun fechasHabladas() {
        assertEquals("hoy", fechaHablada("2026-11-18", "2026-11-18"))
        assertEquals("mañana", fechaHablada("2026-11-19", "2026-11-18"))
        assertEquals("el lunes 23 de noviembre", fechaHablada("2026-11-23", "2026-11-18"))
        assertEquals("lun 23 nov", fechaCorta("2026-11-23"))
    }

    @Test fun fraseDeAlarma() {
        assertEquals("Es hora de tomar Metformina, 850 mg. Con alimentos.", fraseAlarma("Metformina", "850 mg", "Con alimentos.", false))
        assertEquals("¿Ya tomaste Metformina, 850 mg? Si ya la tomaste, confírmalo en Lazo.", fraseAlarma("Metformina", "850 mg", "Con alimentos", true))
        assertEquals("Es hora de tomar Aspirina.", fraseAlarma("Aspirina", "", "", false))
    }

    @Test fun estadosSiempreConTexto() {
        for (e in Estado.entries) assertTrue(textoEstado(e).isNotBlank())
        assertEquals("Pendiente", textoEstado(Estado.PENDIENTE))
    }

    // ---- órdenes por voz ----
    @Test fun ordenesDeConfirmar() {
        for (f in listOf("Ya la tomé", "ya lo tome", "listo", "Tomé", "confirmo", "Ya tomé mi pastilla")) assertEquals(f, Comando.Tomada, interpretar(f))
    }

    @Test fun noLaTomareEsOmitirNoConfirmar() {
        for (f in listOf("no la tomaré", "No la voy a tomar", "omitir", "saltar esta")) assertEquals(f, Comando.Omitir, interpretar(f))
    }

    @Test fun posponerEntiendeMinutosEnNumeroOPalabra() {
        assertEquals(Comando.Posponer(10), interpretar("pospón"))
        assertEquals(Comando.Posponer(15), interpretar("pospón 15 minutos"))
        assertEquals(Comando.Posponer(20), interpretar("pospón veinte minutos"))
        assertEquals(Comando.Posponer(30), interpretar("más tarde, media hora"))
        assertEquals(Comando.Posponer(45), interpretar("pospón cuarenta y cinco minutos"))
        assertEquals(Comando.Posponer(180), interpretar("pospón 500 minutos")) // tope razonable
    }

    @Test fun consultas() {
        assertEquals(Comando.Siguiente, interpretar("¿Qué sigue?"))
        assertEquals(Comando.Siguiente, interpretar("cuál es la próxima"))
        assertEquals(Comando.Hoy, interpretar("qué tengo hoy"))
        assertEquals(Comando.Citas, interpretar("mis citas"))
        assertEquals(Comando.Convocatorias, interpretar("convocatorias"))
        assertEquals(Comando.Convocatorias, interpretar("hay apoyos"))
        assertEquals(Comando.Ayuda, interpretar("ayuda"))
    }

    @Test fun loQueNoSeEntiendeEsDesconocidoNoUnaAccion() {
        assertEquals(Comando.Desconocido, interpretar(""))
        assertEquals(Comando.Desconocido, interpretar("   "))
        assertEquals(Comando.Desconocido, interpretar("qué bonito día"))
        assertEquals(Comando.Desconocido, interpretar("tomate")) // «tomate» no es «tomé»
    }

    // ---- recordatorios de citas ----
    private fun cita(id: String, fecha: String, hora: String, lugar: String = "Hospital General", transporte: String = "") =
        mx.lazo.app.data.Cita(id, "Oftalmología", "", lugar, fecha, hora, "", transporte)

    @Test fun citaAvisaLaVisperaALas20YDosHorasAntes() {
        val plan = planDeRecordatoriosCitas(listOf(cita("c1", "2026-11-20", "09:30")), LocalDateTime.parse("2026-11-18T10:00:00"))
        assertEquals(listOf(MomentoCita.VISPERA, MomentoCita.DOS_HORAS), plan.map { it.momento })
        assertEquals(LocalDateTime.parse("2026-11-19T20:00:00").aMillis(), plan[0].millis)
        assertEquals(LocalDateTime.parse("2026-11-20T07:30:00").aMillis(), plan[1].millis)
        assertNotEquals(plan[0].codigo, plan[1].codigo)
        assertEquals(plan, planDeRecordatoriosCitas(listOf(cita("c1", "2026-11-20", "09:30")), LocalDateTime.parse("2026-11-18T10:00:00"))) // estable
    }

    @Test fun loQueYaPasoNoSeProgramaYLasCitasPasadasNoAvisan() {
        val citas = listOf(cita("vieja", "2026-11-17", "09:00"), cita("hoy", "2026-11-18", "13:00"), cita("mañana", "2026-11-19", "09:00"))
        val plan = planDeRecordatoriosCitas(citas, LocalDateTime.parse("2026-11-18T21:00:00"))
        // «hoy» ya pasó; de «mañana» ya pasó la víspera (20:00) y solo falta el de 2 horas antes
        assertEquals(listOf("mañana" to MomentoCita.DOS_HORAS), plan.map { it.citaId to it.momento })
        assertTrue(planDeRecordatoriosCitas(listOf(cita("x", "fecha-rara", "9")), LocalDateTime.parse("2026-11-18T08:00:00")).isEmpty()) // datos malos no truenan
    }

    @Test fun citaDeMadrugadaNoRepiteElAvisoDeLaVispera() {
        // Cita a las 21:30: la víspera (20:00 del día anterior) y 2 horas antes (19:30 del mismo día) son avisos distintos
        assertEquals(2, planDeRecordatoriosCitas(listOf(cita("n", "2026-11-20", "21:30")), LocalDateTime.parse("2026-11-18T08:00:00")).size)
        // Cita a las 00:30: 2 horas antes cae a las 22:30 del día anterior, después de la víspera; ambos siguen en orden
        val m = planDeRecordatoriosCitas(listOf(cita("m", "2026-11-20", "00:30")), LocalDateTime.parse("2026-11-18T08:00:00"))
        assertEquals(listOf(MomentoCita.VISPERA, MomentoCita.DOS_HORAS), m.map { it.momento })
        assertTrue(m[0].millis < m[1].millis)
    }

    @Test fun recordatoriosDeCitasTienenTope() {
        val muchas = (1..30).map { cita("c$it", LocalDate.parse("2026-11-20").plusDays(it.toLong()).toString(), "10:00") }
        assertEquals(MAX_RECORDATORIOS_CITA, planDeRecordatoriosCitas(muchas, LocalDateTime.parse("2026-11-18T08:00:00")).size)
    }

    @Test fun fraseDelRecordatorioDeCita() {
        val p = planDeRecordatoriosCitas(listOf(cita("c1", "2026-11-20", "09:30", transporte = "Taxi adaptado")), LocalDateTime.parse("2026-11-18T10:00:00"))
        assertEquals("Mañana tienes cita con Oftalmología a las 9:30 de la mañana, en Hospital General. Cómo llegarás: Taxi adaptado.", fraseRecordatorioCita(p[0]))
        assertEquals("En 2 horas tienes cita con Oftalmología, a las 9:30 de la mañana, en Hospital General. Cómo llegarás: Taxi adaptado.", fraseRecordatorioCita(p[1]))
        assertEquals("Tu cita es en 2 horas", tituloRecordatorioCita(p[1]))
    }

    // ---- «Necesito ayuda» ----
    @Test fun textosDeAyuda() {
        assertEquals("Avisé a 1 cuidador. Si es una emergencia, llama al 911.", textoAyudaEnviada(1))
        assertEquals("Avisé a 3 cuidadores. Si es una emergencia, llama al 911.", textoAyudaEnviada(3))
        assertEquals("Todavía no tienes cuidadores: invita a alguien en Más → Mi círculo.", textoAyudaEnviada(0))
        assertTrue(textoAyudaFallida(true).contains("no hay conexión") && textoAyudaFallida(true).contains("911"))
        assertTrue(textoAyudaFallida(false).contains("911"))
    }

    @Test fun losPedidosDeAyudaVanPrimeroEnLosAvisos() {
        fun a(id: String, tipo: String, sev: String, fecha: String) = mx.lazo.app.data.Alerta(id, tipo, sev, fecha, id, "", false)
        val lista = listOf(a("info", "cita-proxima", "info", "2026-11-18T10:00:00-06:00"), a("dosis", "dosis-atrasada", "alta", "2026-11-18T12:00:00-06:00"),
            a("ayuda1", "ayuda", "alta", "2026-11-18T09:00:00-06:00"), a("omit", "dosis-omitida", "media", "2026-11-18T08:00:00-06:00"), a("ayuda2", "ayuda", "alta", "2026-11-18T11:00:00-06:00"))
        assertEquals(listOf("ayuda2", "ayuda1", "dosis", "omit", "info"), ordenarAlertas(lista).map { it.id })
    }

    // ---- acciones rápidas de cada toma ----
    @Test fun accionesDeTomaSegunSuEstado() {
        assertEquals(listOf("Ya la tomé", "Posponer 10 minutos", "Omitir esta toma"), accionesToma(Estado.ATRASADA).map { it.texto })
        assertEquals(listOf("Ya la tomé", "Posponer 10 minutos", "Omitir esta toma"), accionesToma(Estado.PENDIENTE).map { it.texto })
        assertEquals(10, accionesToma(Estado.AHORA)[1].minutos)
        assertEquals(listOf(Estado.PENDIENTE), accionesToma(Estado.TOMADA).map { it.estado }) // deshacer
        assertEquals(listOf("Deshacer"), accionesToma(Estado.OMITIDA).map { it.texto })
    }

    @Test fun ultimaLecturaRaraNoTruena() {
        assertEquals("Última lectura: mié 18 nov 8:00 am", mx.lazo.app.ui.textoUltimaLectura("2026-11-18T08:00:00-06:00"))
        assertNull(mx.lazo.app.ui.textoUltimaLectura("2026-11-18"))
    }
}
