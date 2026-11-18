package mx.lazo.app.domain

import mx.lazo.app.data.Medicamento
import java.time.LocalDateTime

/** Qué alarma exacta se programa en el teléfono. `reintento`: «¿ya la tomaste?» unos minutos después de la toma. */
data class Alarma(val clave: String, val millis: Long, val nombre: String, val dosis: String, val instrucciones: String, val hora: String, val reintento: Boolean) {
    /** Identificador estable para el PendingIntent: la misma toma siempre usa el mismo. */
    val codigo: Int get() = (clave + if (reintento) "#r" else "").hashCode()
}

const val MINUTOS_REINTENTO = 15
const val MAX_ALARMAS = 40

/**
 * Plan de alarmas para las próximas 48 horas: una a la hora de cada toma y otra de recordatorio a los
 * [MINUTOS_REINTENTO] minutos. Lo ya resuelto (tomado u omitido) no suena. Las pospuestas traen su nueva hora en `pospuestas`.
 */
fun planDeAlarmas(
    medicamentos: List<Medicamento>,
    ahora: LocalDateTime,
    resueltas: Set<String>,
    pospuestas: Map<String, Long> = emptyMap(),
    reintentoMin: Int = MINUTOS_REINTENTO,
): List<Alarma> {
    val ahoraMs = ahora.aMillis()
    val out = mutableListOf<Alarma>()
    // Se incluye 1 hora atrás para no perder el reintento de una toma que acaba de pasar
    for (d in proximasDosis(medicamentos, ahora.minusHours(1), 49, resueltas)) {
        val base = pospuestas[d.clave] ?: d.instante.aMillis()
        if (base > ahoraMs) out += Alarma(d.clave, base, d.nombre, d.dosis, d.instrucciones, d.hora, false)
        val reintento = base + reintentoMin * 60_000L
        if (reintento > ahoraMs) out += Alarma(d.clave, reintento, d.nombre, d.dosis, d.instrucciones, d.hora, true)
    }
    return out.sortedBy { it.millis }.take(MAX_ALARMAS)
}

/** Códigos de las dos alarmas (toma y reintento) de una dosis: sirven para borrar sus notificaciones. */
fun codigosDe(clave: String): List<Int> = listOf(clave.hashCode(), (clave + "#r").hashCode())
