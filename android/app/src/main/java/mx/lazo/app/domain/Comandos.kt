package mx.lazo.app.domain

import java.text.Normalizer

/** Órdenes por voz de Lazo. Se entienden en español hablado, con o sin acentos, y con variantes naturales. */
sealed interface Comando {
    data object Tomada : Comando
    data class Posponer(val minutos: Int) : Comando
    data object Omitir : Comando
    data object Siguiente : Comando
    data object Hoy : Comando
    data object Citas : Comando
    data object Convocatorias : Comando
    data object Ayuda : Comando
    data object Desconocido : Comando
}

private val NUMEROS = mapOf(
    "cinco" to 5, "diez" to 10, "quince" to 15, "veinte" to 20, "treinta" to 30, "cuarenta y cinco" to 45, "cuarenta" to 40,
    "media hora" to 30, "una hora" to 60, "hora" to 60,
)

private fun normalizar(s: String) = Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")
    .replace(Regex("[^a-z0-9 ]"), " ").replace(Regex("\\s+"), " ").trim()

private fun contiene(t: String, vararg frases: String) = frases.any { f -> Regex("(^| )${Regex.escape(f)}( |$)").containsMatchIn(t) }

private fun minutosDe(t: String): Int {
    Regex("(\\d{1,3}) minutos?").find(t)?.let { return it.groupValues[1].toInt().coerceIn(5, 180) }
    // El más largo primero: «cuarenta y cinco» antes que «cuarenta»
    for ((palabra, n) in NUMEROS.entries.sortedByDescending { it.key.length }) if (t.contains(palabra)) return n
    return 10
}

fun interpretar(frase: String): Comando {
    val t = normalizar(frase)
    if (t.isEmpty()) return Comando.Desconocido
    return when {
        // «No la tomaré» debe ganarle a «tomé»
        contiene(t, "omitir", "omito", "omite", "saltar", "salta", "salto", "no la tomare", "no lo tomare", "no la voy a tomar", "no lo voy a tomar", "no la tome", "no lo tome") -> Comando.Omitir
        contiene(t, "pospon", "pospone", "posponer", "pospongo", "mas tarde", "despues", "recuerdame en", "recuerdamelo en") -> Comando.Posponer(minutosDe(t))
        contiene(t, "ya la tome", "ya lo tome", "ya tome", "la tome", "lo tome", "tome", "listo", "tomada", "tomado", "confirmo", "confirmar", "hecho") -> Comando.Tomada
        contiene(t, "que sigue", "siguiente", "proxima", "proximo", "que me toca", "que toca", "cual sigue") -> Comando.Siguiente
        contiene(t, "citas", "cita", "consultas", "consulta", "agenda", "doctor", "medico") -> Comando.Citas
        contiene(t, "convocatorias", "convocatoria", "apoyos", "apoyo", "premios", "premio") -> Comando.Convocatorias
        contiene(t, "hoy", "mis medicinas", "mis medicamentos", "lista", "resumen") -> Comando.Hoy
        contiene(t, "ayuda", "ayudame", "que puedo decir", "comandos", "opciones") -> Comando.Ayuda
        else -> Comando.Desconocido
    }
}

val AYUDA_VOZ = "Puedes decir: ya la tomé. Pospón diez minutos. Omitir. Qué sigue. Qué tengo hoy. Mis citas. O convocatorias."
