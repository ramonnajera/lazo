package mx.lazo.app.domain

import mx.lazo.app.data.Cita
import mx.lazo.app.data.Dosis
import mx.lazo.app.data.Estado
import java.time.LocalDate

/** Textos para mostrar y, sobre todo, para leer en voz alta. Todo en español de México, sin abreviaturas confusas. */

private val DIAS = listOf("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
private val MESES = listOf("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre")

fun plural(n: Int, uno: String, varios: String) = if (n == 1) "1 $uno" else "$n $varios"

/** «20:05» → «8:05 pm» (para la pantalla). */
fun horaCorta(hhmm: String): String {
    val t = parseHora(hhmm)
    val h12 = if (t.hour % 12 == 0) 12 else t.hour % 12
    return "%d:%02d %s".format(h12, t.minute, if (t.hour < 12) "am" else "pm")
}

/** «20:05» → «8:05 de la noche» (para la voz: los lectores dicen bien «ocho cinco», no «veinte horas»). */
fun horaHablada(hhmm: String): String {
    val t = parseHora(hhmm)
    val h12 = if (t.hour % 12 == 0) 12 else t.hour % 12
    val periodo = when (t.hour) {
        in 0..5 -> "de la madrugada"
        in 6..11 -> "de la mañana"
        12 -> "del día"
        in 13..18 -> "de la tarde"
        else -> "de la noche"
    }
    val min = if (t.minute == 0) "" else ":%02d".format(t.minute)
    return "$h12$min $periodo"
}

fun nombreDia(f: LocalDate) = DIAS[f.dayOfWeek.value - 1]

/** «hoy», «mañana» o «el lunes 23 de noviembre». */
fun fechaHablada(fechaIso: String, hoyIso: String): String {
    val f = LocalDate.parse(fechaIso)
    val hoy = LocalDate.parse(hoyIso)
    return when (f) {
        hoy -> "hoy"
        hoy.plusDays(1) -> "mañana"
        hoy.minusDays(1) -> "ayer"
        else -> "el ${nombreDia(f)} ${f.dayOfMonth} de ${MESES[f.monthValue - 1]}"
    }
}

/** «lun 23 nov» (para listas compactas). */
fun fechaCorta(fechaIso: String): String {
    val f = LocalDate.parse(fechaIso)
    return "${nombreDia(f).take(3)} ${f.dayOfMonth} ${MESES[f.monthValue - 1].take(3)}"
}

fun textoDosis(nombre: String, dosis: String) = if (dosis.isBlank()) nombre else "$nombre, $dosis"

/** Lo que se dice cuando suena la alarma. */
fun fraseAlarma(nombre: String, dosis: String, instrucciones: String, reintento: Boolean): String {
    val base = if (reintento) "¿Ya tomaste ${textoDosis(nombre, dosis)}? Si ya la tomaste, confírmalo en Lazo." else "Es hora de tomar ${textoDosis(nombre, dosis)}."
    return if (instrucciones.isBlank() || reintento) base else "$base ${instrucciones.trimEnd('.')}."
}

/** Estado en palabras: nunca se comunica solo con color. */
fun textoEstado(e: Estado, dosis: Dosis? = null): String = when (e) {
    Estado.PENDIENTE -> "Pendiente"
    Estado.AHORA -> "Es la hora"
    Estado.ATRASADA -> "Atrasada"
    Estado.TOMADA -> if (dosis?.horaReal != null) "Tomada a las ${horaCorta(dosis.horaReal)}" else "Tomada"
    Estado.OMITIDA -> "Omitida"
    Estado.POSPUESTA -> if (dosis?.hastaHora != null) "Pospuesta hasta las ${horaCorta(dosis.hastaHora)}" else "Pospuesta"
}

fun fraseSiguiente(d: Dosis?, hoy: String): String {
    if (d == null) return "No tienes tomas programadas."
    val cuando = if (d.estado == Estado.AHORA) "Es la hora de" else if (d.estado == Estado.ATRASADA) "Tienes atrasada la toma de" else "La siguiente es"
    return "$cuando ${textoDosis(d.nombre, d.dosis)}, ${fechaHablada(d.fecha, hoy)} a las ${horaHablada(d.hora)}."
}

fun fraseHoy(tomas: List<Dosis>, hoy: String): String {
    if (tomas.isEmpty()) return "Hoy no tienes tomas programadas."
    val hechas = tomas.count { it.estado == Estado.TOMADA }
    val faltan = tomas.count { it.estado != Estado.TOMADA && it.estado != Estado.OMITIDA }
    val sig = tomas.firstOrNull { it.estado.requiereAtencion || it.estado == Estado.PENDIENTE || it.estado == Estado.POSPUESTA }
    val resumen = "Hoy tienes ${plural(tomas.size, "toma", "tomas")}: ya tomaste $hechas y faltan $faltan."
    return if (sig == null) resumen else "$resumen ${fraseSiguiente(sig, hoy)}"
}

fun fraseCitas(citas: List<Cita>, hoy: String): String {
    if (citas.isEmpty()) return "No tienes citas próximas."
    val c = citas.first()
    val extra = if (citas.size > 1) " Después tienes ${plural(citas.size - 1, "cita más", "citas más")}." else ""
    val lugar = if (c.lugar.isBlank()) "" else ", en ${c.lugar}"
    return "Tu próxima cita es con ${c.especialista}, ${fechaHablada(c.fecha, hoy)} a las ${horaHablada(c.hora)}$lugar.$extra"
}

/** «miércoles 18 de noviembre». */
fun fechaLarga(fechaIso: String): String = LocalDate.parse(fechaIso).let { "${nombreDia(it)} ${it.dayOfMonth} de ${MESES[it.monthValue - 1]}" }

/** «1 2 3 4 5 6»: un código con espacios para que se lea (y se dicte) dígito por dígito. */
fun codigoEspaciado(c: String) = c.toList().joinToString(" ")
