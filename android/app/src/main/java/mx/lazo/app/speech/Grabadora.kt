package mx.lazo.app.speech

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File

/**
 * Graba una nota de voz corta (m4a/AAC, 16 kHz mono) para enviarla a Lazo. Se pulsa una vez para empezar y otra para
 * enviar: nada de mantener presionado, que a muchas manos les cuesta. Se detiene sola a los 60 s.
 */
class Grabadora(private val context: Context) {
    private var rec: MediaRecorder? = null
    private var archivo: File? = null
    private var inicio = 0L

    val grabando get() = rec != null

    /** true si empezó a grabar; false si el micrófono no estaba disponible. */
    fun empezar(): Boolean {
        if (rec != null) return true
        val f = File(context.cacheDir, "nota-${System.nanoTime()}.m4a")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
        return try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1)
            r.setAudioSamplingRate(16_000)
            r.setAudioEncodingBitRate(48_000)
            r.setMaxDuration(60_000)
            r.setOutputFile(f.absolutePath)
            r.prepare()
            r.start()
            rec = r; archivo = f; inicio = System.currentTimeMillis()
            true
        } catch (e: Exception) {
            runCatching { r.release() }
            f.delete()
            false
        }
    }

    /** Termina y devuelve el archivo; null si fue demasiado corto (menos de 0.7 s) o falló. */
    fun terminar(): File? {
        val r = rec ?: return null
        val f = archivo
        rec = null; archivo = null
        val corto = System.currentTimeMillis() - inicio < 700
        val ok = runCatching { r.stop() }.isSuccess
        runCatching { r.release() }
        if (!ok || corto || f == null) { f?.delete(); return null }
        return f
    }

    fun cancelar() { terminar()?.delete() }
}
