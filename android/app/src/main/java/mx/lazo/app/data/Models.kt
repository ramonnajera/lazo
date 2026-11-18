package mx.lazo.app.data

import org.json.JSONArray
import org.json.JSONObject

/** Modelos de lo que devuelve el servidor de Lazo (JSON en español). */

private fun JSONObject.str(k: String): String = if (isNull(k)) "" else optString(k, "")
private fun JSONObject.strOrNull(k: String): String? = if (isNull(k) || !has(k)) null else optString(k).takeIf { it.isNotEmpty() }
private fun JSONObject.intOrNull(k: String): Int? = if (isNull(k) || !has(k)) null else optInt(k)
private fun <T> JSONArray?.map(f: (JSONObject) -> T): List<T> = if (this == null) emptyList() else (0 until length()).map { f(getJSONObject(it)) }
private fun JSONArray?.ints(): List<Int> = if (this == null) emptyList() else (0 until length()).map { getInt(it) }
private fun JSONArray?.strs(): List<String> = if (this == null) emptyList() else (0 until length()).map { getString(it) }

enum class Discapacidad(val clave: String, val texto: String) {
    VISUAL("visual", "Visual"), MOTRIZ("motriz", "Motriz"), AMBAS("ambas", "Visual y motriz"), OTRA("otra", "Otra");

    companion object {
        fun de(clave: String?) = entries.firstOrNull { it.clave == clave } ?: AMBAS
    }
}

data class Perfil(val nombre: String, val discapacidad: Discapacidad, val tolerancia: Int, val textoGrande: Boolean, val altoContraste: Boolean, val voz: Boolean) {
    companion object {
        fun de(o: JSONObject): Perfil {
            val p = o.optJSONObject("preferencias")
            return Perfil(o.str("nombre"), Discapacidad.de(o.strOrNull("discapacidad")), o.optInt("tolerancia", 30), p?.optBoolean("textoGrande", true) ?: true, p?.optBoolean("altoContraste", false) ?: false, p?.optBoolean("voz", true) ?: true)
        }
    }
}

data class Medicamento(
    val id: String, val nombre: String, val dosis: String, val instrucciones: String, val horarios: List<String>,
    val dias: List<Int>?, val inicio: String?, val fin: String?, val existencias: Int?, val activo: Boolean,
) {
    companion object {
        fun de(o: JSONObject) = Medicamento(
            o.str("id"), o.str("nombre"), o.str("dosis"), o.str("instrucciones"), o.optJSONArray("horarios").strs(),
            o.optJSONArray("dias")?.ints()?.takeIf { it.isNotEmpty() }, o.strOrNull("inicio"), o.strOrNull("fin"), o.intOrNull("existencias"), o.optBoolean("activo", true),
        )
    }
}

enum class Estado(val clave: String) {
    PENDIENTE("pendiente"), AHORA("ahora"), ATRASADA("atrasada"), TOMADA("tomada"), OMITIDA("omitida"), POSPUESTA("pospuesta");

    /** Falta una acción de la persona. */
    val requiereAtencion get() = this == AHORA || this == ATRASADA

    companion object {
        fun de(clave: String?) = entries.firstOrNull { it.clave == clave } ?: PENDIENTE
    }
}

data class Dosis(
    val medicamentoId: String, val nombre: String, val dosis: String, val instrucciones: String,
    val fecha: String, val hora: String, val estado: Estado, val horaReal: String?, val hastaHora: String?,
) {
    val clave get() = "$medicamentoId|$fecha|$hora"

    companion object {
        fun de(o: JSONObject) = Dosis(
            o.str("medicamentoId"), o.str("nombre"), o.str("dosis"), o.str("instrucciones"), o.str("fecha"), o.str("hora"),
            Estado.de(o.strOrNull("estado")), o.strOrNull("horaReal"), o.optJSONObject("hasta")?.strOrNull("hora"),
        )
    }
}

data class Cita(val id: String, val especialista: String, val motivo: String, val lugar: String, val fecha: String, val hora: String, val notas: String, val transporte: String) {
    companion object {
        fun de(o: JSONObject) = Cita(o.str("id"), o.str("especialista"), o.str("motivo"), o.str("lugar"), o.str("fecha"), o.str("hora"), o.str("notas"), o.str("transporte"))
    }
}

enum class TipoMedicion(val clave: String, val titulo: String) {
    PRESION("presion", "Presión"), GLUCOSA("glucosa", "Glucosa"), ANIMO("animo", "Ánimo"), DOLOR("dolor", "Dolor"), PESO("peso", "Peso");

    companion object {
        fun de(clave: String?) = entries.firstOrNull { it.clave == clave } ?: PESO
    }
}

data class Aviso(val nivel: String, val texto: String)

data class Medicion(val id: String, val tipo: TipoMedicion, val texto: String, val nota: String, val fecha: String, val hora: String, val aviso: Aviso?) {
    companion object {
        fun de(o: JSONObject) = Medicion(
            o.str("id"), TipoMedicion.de(o.strOrNull("tipo")), o.str("texto"), o.str("nota"), o.str("fecha"), o.str("hora"),
            o.optJSONObject("aviso")?.let { Aviso(it.str("nivel"), it.str("texto")) },
        )
    }
}

data class Alerta(val id: String, val tipo: String, val severidad: String, val fecha: String, val titulo: String, val detalle: String, val visto: Boolean) {
    companion object {
        fun de(o: JSONObject) = Alerta(o.str("id"), o.str("tipo"), o.str("severidad"), o.str("fecha"), o.str("titulo"), o.str("detalle"), o.optBoolean("visto", false))
    }
}

data class Convocatoria(val id: String, val nombre: String, val dependencia: String, val documento: String, val ficha: String?, val tipoDocumento: String, val discapacidad: Boolean) {
    companion object {
        fun de(o: JSONObject) = Convocatoria(o.str("id"), o.str("nombre"), o.str("dependencia"), o.str("documento"), o.strOrNull("ficha"), o.str("tipoDocumento"), o.optBoolean("discapacidad"))
    }
}

data class ListaConvocatorias(val items: List<Convocatoria>, val ultimaLectura: String?, val error: String?, val nuevas: Set<String>) {
    companion object {
        fun de(o: JSONObject) = ListaConvocatorias(o.optJSONArray("items").map(Convocatoria::de), o.strOrNull("ultimaLectura"), o.strOrNull("error"), o.optJSONArray("nuevas").strs().toSet())
    }
}

data class DiaAdherencia(val fecha: String, val programadas: Int, val tomadas: Int, val omitidas: Int, val atrasadas: Int, val pendientes: Int)

data class Resumen(
    val persona: String, val discapacidad: Discapacidad, val proximaToma: Dosis?, val porcentaje: Int?, val dias: List<DiaAdherencia>,
    val citas: List<Cita>, val mediciones: List<Pair<TipoMedicion, String>>, val alertas: List<Alerta>,
) {
    companion object {
        fun de(o: JSONObject): Resumen {
            val p = o.optJSONObject("persona")
            val a = o.optJSONObject("adherencia")
            val m = o.optJSONObject("mediciones")
            return Resumen(
                p?.str("nombre") ?: "", Discapacidad.de(p?.strOrNull("discapacidad")), o.optJSONObject("proximaToma")?.let(Dosis::de), a?.intOrNull("porcentaje"),
                a?.optJSONArray("porDia").map { DiaAdherencia(it.str("fecha"), it.optInt("programadas"), it.optInt("tomadas"), it.optInt("omitidas"), it.optInt("atrasadas"), it.optInt("pendientes")) },
                o.optJSONArray("citas").map(Cita::de),
                m?.keys()?.asSequence()?.map { TipoMedicion.de(it) to (m.getJSONObject(it).str("texto")) }?.toList() ?: emptyList(),
                o.optJSONArray("alertas").map(Alerta::de),
            )
        }
    }
}

data class Cuidador(val id: String, val nombre: String, val parentesco: String)
