package mx.lazo.app.data

import android.content.Context
import org.json.JSONObject
import java.io.File

/** Última respuesta de cada pantalla, en disco: la app abre al instante y funciona sin conexión; las alarmas leen de aquí. */
class Cache(context: Context) {
    private val dir = File(context.filesDir, "cache").apply { mkdirs() }

    fun read(key: String): JSONObject? =
        File(dir, "$key.json").takeIf { it.exists() }?.let { runCatching { JSONObject(it.readText()) }.getOrNull() }

    fun write(key: String, json: JSONObject) {
        val tmp = File(dir, "$key.json.tmp")
        tmp.writeText(json.toString())
        tmp.renameTo(File(dir, "$key.json"))
    }

    fun clear() = dir.listFiles()?.forEach { it.delete() }
}
