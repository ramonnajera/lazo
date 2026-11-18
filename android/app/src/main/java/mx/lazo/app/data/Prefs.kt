package mx.lazo.app.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

enum class Rol(val clave: String) { PERSONA("persona"), CUIDADOR("cuidador") }

/** Una acción que no se pudo enviar (sin conexión) y se reintenta después. */
data class AccionPendiente(val medicamentoId: String, val fecha: String, val hora: String, val estado: String, val minutos: Int?) {
    fun aJson(): JSONObject = JSONObject().put("m", medicamentoId).put("f", fecha).put("h", hora).put("e", estado).apply { if (minutos != null) put("n", minutos) }

    companion object {
        fun de(o: JSONObject) = AccionPendiente(o.getString("m"), o.getString("f"), o.getString("h"), o.getString("e"), if (o.has("n")) o.getInt("n") else null)
    }
}

/**
 * Preferencias y estado local del teléfono. El token queda en el almacenamiento privado de la app (MODE_PRIVATE):
 * ninguna otra app puede leerlo. Lo que ya resolvió la persona se guarda aquí para que las alarmas no suenen de más.
 */
class Prefs(private val sp: SharedPreferences) {
    var servidor: String get() = sp.getString("servidor", "") ?: ""; set(v) = sp.edit().putString("servidor", v).apply()
    var token: String get() = sp.getString("token", "") ?: ""; set(v) = sp.edit().putString("token", v).apply()
    var nombre: String get() = sp.getString("nombre", "") ?: ""; set(v) = sp.edit().putString("nombre", v).apply()
    var rol: Rol? get() = Rol.entries.firstOrNull { it.clave == sp.getString("rol", null) }; set(v) = sp.edit().putString("rol", v?.clave).apply()

    /** Escala del texto sobre la del sistema (1.0 a 2.0). */
    var escalaTexto: Float get() = sp.getFloat("escala", 1.25f); set(v) = sp.edit().putFloat("escala", v.coerceIn(1f, 2f)).apply()
    var altoContraste: Boolean get() = sp.getBoolean("contraste", false); set(v) = sp.edit().putBoolean("contraste", v).apply()
    var voz: Boolean get() = sp.getBoolean("voz", true); set(v) = sp.edit().putBoolean("voz", v).apply()
    var velocidadVoz: Float get() = sp.getFloat("velocidad", 0.9f); set(v) = sp.edit().putFloat("velocidad", v.coerceIn(0.5f, 1.5f)).apply()

    val conectado get() = servidor.isNotEmpty() && token.isNotEmpty() && rol != null

    // ---- lo ya resuelto en este teléfono (clave = medicamento|fecha|hora) ----
    fun resueltas(): Set<String> = sp.getStringSet("resueltas", emptySet())!!.toSet()
    fun resolver(clave: String) = sp.edit().putStringSet("resueltas", resueltas() + clave).apply()
    fun desresolver(clave: String) = sp.edit().putStringSet("resueltas", resueltas() - clave).apply()
    fun podarResueltas(hoyIso: String, diasAtras: Int = 3) {
        val limite = java.time.LocalDate.parse(hoyIso).minusDays(diasAtras.toLong()).toString()
        sp.edit().putStringSet("resueltas", resueltas().filter { it.split("|").getOrNull(1).orEmpty() >= limite }.toSet()).apply()
    }

    // ---- tomas pospuestas: clave → nueva hora (ms) ----
    fun pospuestas(): Map<String, Long> = runCatching { JSONObject(sp.getString("pospuestas", "{}")!!).let { o -> o.keys().asSequence().associateWith { o.getLong(it) } } }.getOrDefault(emptyMap())
    fun pospuesta(clave: String, millis: Long) = sp.edit().putString("pospuestas", JSONObject(pospuestas() + (clave to millis)).toString()).apply()
    fun quitarPospuesta(clave: String) = sp.edit().putString("pospuestas", JSONObject(pospuestas() - clave).toString()).apply()

    // ---- acciones sin enviar ----
    fun cola(): List<AccionPendiente> = runCatching { JSONArray(sp.getString("cola", "[]")!!).let { a -> (0 until a.length()).map { AccionPendiente.de(a.getJSONObject(it)) } } }.getOrDefault(emptyList())
    fun encolar(a: AccionPendiente) {
        val limpia = cola().filterNot { it.medicamentoId == a.medicamentoId && it.fecha == a.fecha && it.hora == a.hora } + a
        sp.edit().putString("cola", JSONArray(limpia.map { it.aJson() }).toString()).apply()
    }
    fun reemplazarCola(restantes: List<AccionPendiente>) = sp.edit().putString("cola", JSONArray(restantes.map { it.aJson() }).toString()).apply()

    // ---- alarmas programadas (para poder cancelarlas) y alertas del cuidador ya notificadas ----
    fun programadas(): Set<Int> = sp.getStringSet("programadas", emptySet())!!.mapNotNull { it.toIntOrNull() }.toSet()
    fun guardarProgramadas(codigos: Set<Int>) = sp.edit().putStringSet("programadas", codigos.map { it.toString() }.toSet()).apply()
    fun notificadas(): Set<String> = sp.getStringSet("notificadas", emptySet())!!.toSet()
    fun marcarNotificada(id: String) = sp.edit().putStringSet("notificadas", (notificadas() + id).toList().takeLast(200).toSet()).apply()

    fun cerrarSesion() = sp.edit().clear().apply()

    companion object {
        fun de(context: Context) = Prefs(context.applicationContext.getSharedPreferences("lazo", Context.MODE_PRIVATE))
    }
}
