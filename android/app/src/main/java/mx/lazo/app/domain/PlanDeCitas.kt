package mx.lazo.app.domain

import mx.lazo.app.data.Cita
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/** Cuándo se avisa de una cita: la víspera a las 20:00 y 2 horas antes. */
enum class MomentoCita(val clave: String) { VISPERA("v"), DOS_HORAS("2h") }

/** Un recordatorio local de cita. No depende del servidor: se calcula con la caché de citas. */
data class RecordatorioCita(
    val citaId: String, val momento: MomentoCita, val millis: Long, val especialista: String, val lugar: String,
    val fecha: String, val hora: String, val transporte: String,
) {
    /** Identificador estable para el PendingIntent: el mismo recordatorio siempre usa el mismo. */
    val codigo: Int get() = "cita|$citaId|${momento.clave}".hashCode()
}

const val HORA_VISPERA = 20
const val HORAS_ANTES_CITA = 2L
const val MAX_RECORDATORIOS_CITA = 20

/**
 * Recordatorios de las citas futuras: la víspera a las [HORA_VISPERA]:00 y [HORAS_ANTES_CITA] horas antes. Solo los que aún
 * no pasaron; si la víspera cae después del aviso de 2 horas (no ocurre con horarios normales) se omite para no avisar dos veces seguidas.
 */
fun planDeRecordatoriosCitas(citas: List<Cita>, ahora: LocalDateTime): List<RecordatorioCita> {
    val ahoraMs = ahora.aMillis()
    val out = mutableListOf<RecordatorioCita>()
    for (c in citas) {
        val instante = runCatching { LocalDateTime.of(LocalDate.parse(c.fecha), parseHora(c.hora)) }.getOrNull() ?: continue
        if (!instante.isAfter(ahora)) continue
        val dosHoras = instante.minusHours(HORAS_ANTES_CITA)
        val vispera = LocalDateTime.of(instante.toLocalDate().minusDays(1), LocalTime.of(HORA_VISPERA, 0))
        fun nuevo(m: MomentoCita, t: LocalDateTime) = RecordatorioCita(c.id, m, t.aMillis(), c.especialista, c.lugar, c.fecha, c.hora, c.transporte)
        if (vispera.isBefore(dosHoras) && vispera.aMillis() > ahoraMs) out += nuevo(MomentoCita.VISPERA, vispera)
        if (dosHoras.aMillis() > ahoraMs) out += nuevo(MomentoCita.DOS_HORAS, dosHoras)
    }
    return out.sortedBy { it.millis }.take(MAX_RECORDATORIOS_CITA)
}

/** Lo que dice (y muestra) el recordatorio. */
fun fraseRecordatorioCita(r: RecordatorioCita): String {
    val con = r.especialista.ifBlank { "tu consulta" }
    val lugar = if (r.lugar.isBlank()) "" else ", en ${r.lugar}"
    val transporte = if (r.transporte.isBlank()) "" else " Cómo llegarás: ${r.transporte.trimEnd('.')}."
    return when (r.momento) {
        MomentoCita.VISPERA -> "Mañana tienes cita con $con a las ${horaHablada(r.hora)}$lugar.$transporte"
        MomentoCita.DOS_HORAS -> "En 2 horas tienes cita con $con, a las ${horaHablada(r.hora)}$lugar.$transporte"
    }
}

fun tituloRecordatorioCita(r: RecordatorioCita) = when (r.momento) {
    MomentoCita.VISPERA -> "Mañana tienes cita"
    MomentoCita.DOS_HORAS -> "Tu cita es en 2 horas"
}
