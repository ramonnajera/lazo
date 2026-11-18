package mx.lazo.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Error de la API con un mensaje que se le puede mostrar a la persona tal cual. */
class ApiException(message: String, val codigo: Int = 0) : IOException(message)

/** «192.168.1.5:18800» → «http://192.168.1.5:18800». null si no parece una dirección. */
fun normalizarUrl(entrada: String): String? {
    var s = entrada.trim()
    if (s.isEmpty() || s.contains(' ')) return null
    if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(s)) s = "http://$s"
    val url = runCatching { URL(s) }.getOrNull() ?: return null
    if (url.host.isNullOrEmpty()) return null
    return s.trimEnd('/')
}

/**
 * Cliente del servidor de Lazo. Sin dependencias: HttpURLConnection + org.json. Todas las llamadas son suspend y
 * corren en Dispatchers.IO. Las lecturas devuelven el JSON crudo para guardarlo en caché y abrir sin conexión.
 */
class LazoApi(base: String, private val token: String? = null) {
    private val base = base.trimEnd('/')

    suspend fun health() = get("/health")
    suspend fun crearPerfil(nombre: String, discapacidad: Discapacidad, textoGrande: Boolean, altoContraste: Boolean) =
        send("POST", "/perfil", JSONObject().put("nombre", nombre).put("discapacidad", discapacidad.clave).put("preferencias", JSONObject().put("textoGrande", textoGrande).put("altoContraste", altoContraste).put("voz", true)))
    suspend fun unirse(codigo: String, nombre: String, parentesco: String) =
        send("POST", "/circulo/unirse", JSONObject().put("codigo", codigo.trim()).put("nombre", nombre).put("parentesco", parentesco))

    suspend fun vincularDispositivo(codigo: String, nombre: String) =
        send("POST", "/perfil/vincular/unirse", JSONObject().put("codigo", codigo.trim()).put("nombre", nombre))

    suspend fun perfil() = get("/perfil")
    suspend fun medicamentos() = get("/medicamentos")
    suspend fun tomas(fecha: String? = null) = get(if (fecha == null) "/tomas" else "/tomas?fecha=$fecha")
    suspend fun proxima() = get("/proxima")
    suspend fun citas() = get("/citas")
    suspend fun mediciones(dias: Int = 30) = get("/mediciones?dias=$dias")
    suspend fun alertas() = get("/alertas")
    suspend fun resumen() = get("/circulo/resumen")
    suspend fun convocatorias() = get("/convocatorias")
    suspend fun circulo() = get("/circulo")

    suspend fun guardarMedicamento(id: String?, body: JSONObject) = if (id == null) send("POST", "/medicamentos", body) else send("PATCH", "/medicamentos/$id", body)
    suspend fun borrarMedicamento(id: String) = send("DELETE", "/medicamentos/$id")
    suspend fun registrarToma(medicamentoId: String, fecha: String, hora: String, estado: String, minutos: Int? = null) =
        send("POST", "/tomas", JSONObject().put("medicamentoId", medicamentoId).put("fecha", fecha).put("hora", hora).put("estado", estado).apply { if (minutos != null) put("minutos", minutos) })
    suspend fun guardarCita(id: String?, body: JSONObject) = if (id == null) send("POST", "/citas", body) else send("PATCH", "/citas/$id", body)
    suspend fun borrarCita(id: String) = send("DELETE", "/citas/$id")
    suspend fun registrarMedicion(tipo: TipoMedicion, valor: JSONObject, nota: String) = send("POST", "/mediciones", JSONObject().put("tipo", tipo.clave).put("valor", valor).put("nota", nota))
    suspend fun borrarMedicion(id: String) = send("DELETE", "/mediciones/$id")
    suspend fun alertaVista(id: String) = send("POST", "/alertas/${java.net.URLEncoder.encode(id, "UTF-8")}/visto")
    suspend fun invitacion() = send("POST", "/circulo/invitacion")
    suspend fun invitacionDispositivo() = send("POST", "/perfil/vincular")
    suspend fun dispositivos() = get("/dispositivos")
    suspend fun quitarDispositivo(id: String) = send("DELETE", "/dispositivos/$id")
    suspend fun revocarCuidador(id: String) = send("DELETE", "/circulo/$id")
    suspend fun actualizarConvocatorias() = send("POST", "/convocatorias/actualizar", timeoutMs = 45_000)
    suspend fun editarPerfil(body: JSONObject) = send("PATCH", "/perfil", body)

    private suspend fun get(path: String) = send("GET", path)

    private suspend fun send(method: String, path: String, body: JSONObject? = null, timeoutMs: Int = 15_000): JSONObject = withContext(Dispatchers.IO) {
        val conn = try {
            (URL(base + path).openConnection() as HttpURLConnection)
        } catch (e: IOException) {
            throw ApiException("La dirección del servidor no es válida.")
        }
        try {
            conn.requestMethod = method
            conn.connectTimeout = 8_000
            conn.readTimeout = timeoutMs
            conn.setRequestProperty("Accept", "application/json")
            if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            } else if (method == "POST") {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write("{}".toByteArray()) }
            }
            val codigo = conn.responseCode
            val texto = (if (codigo in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(texto) }.getOrNull()
            if (codigo !in 200..299) throw ApiException(mensajeDeError(codigo, json), codigo)
            json ?: JSONObject()
        } catch (e: ApiException) {
            throw e
        } catch (e: IOException) {
            throw ApiException("No pude conectar con el servidor. Revisa la dirección y la conexión.")
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        fun mensajeDeError(codigo: Int, json: JSONObject?): String {
            val del = json?.optString("error").orEmpty()
            return when {
                codigo == 401 -> "Este dispositivo ya no tiene acceso. Vuelve a conectarlo."
                codigo == 403 -> "El cuidador solo puede consultar."
                codigo == 429 -> del.ifEmpty { "Demasiados intentos. Espera un momento." }
                del.isNotEmpty() -> del.replaceFirstChar { it.uppercase() }
                else -> "El servidor respondió con un error ($codigo)."
            }
        }
    }
}
