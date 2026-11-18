package mx.lazo.app.domain

import mx.lazo.app.data.Medicamento
import java.time.LocalDate
import java.time.LocalDateTime

/** Una toma programada. `instante` en hora local. */
data class DosisProgramada(val medicamentoId: String, val nombre: String, val dosis: String, val instrucciones: String, val fecha: String, val hora: String) {
    val clave get() = "$medicamentoId|$fecha|$hora"
    val instante: LocalDateTime get() = LocalDateTime.of(LocalDate.parse(fecha), parseHora(hora))
}

/** Tomas de un día, igual que `dosesFor` del servidor: respeta días, inicio, fin y activo; ordenadas por hora. */
fun dosisDelDia(medicamentos: List<Medicamento>, fecha: LocalDate): List<DosisProgramada> {
    val f = fecha.toString()
    val dia = fecha.diaServidor()
    return medicamentos.filter { m ->
        m.activo && (m.inicio == null || f >= m.inicio) && (m.fin == null || f <= m.fin) && (m.dias == null || dia in m.dias)
    }.flatMap { m -> m.horarios.map { DosisProgramada(m.id, m.nombre, m.dosis, m.instrucciones, f, it) } }
        .sortedWith(compareBy({ it.hora }, { it.nombre }))
}

/** Próximas tomas desde `desde` (inclusive) hasta `horas` adelante, ordenadas, sin las ya resueltas. */
fun proximasDosis(medicamentos: List<Medicamento>, desde: LocalDateTime, horas: Int, resueltas: Set<String> = emptySet()): List<DosisProgramada> {
    val limite = desde.plusHours(horas.toLong())
    val dias = generateSequence(desde.toLocalDate()) { it.plusDays(1) }.takeWhile { !it.isAfter(limite.toLocalDate()) }
    return dias.flatMap { dosisDelDia(medicamentos, it).asSequence() }
        .filter { it.clave !in resueltas && !it.instante.isBefore(desde) && !it.instante.isAfter(limite) }
        .sortedBy { it.instante }.toList()
}
