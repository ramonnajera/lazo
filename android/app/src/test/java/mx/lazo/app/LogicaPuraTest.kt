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
}
