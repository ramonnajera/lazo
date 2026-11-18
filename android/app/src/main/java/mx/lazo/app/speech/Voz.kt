package mx.lazo.app.speech

import android.content.Context
import android.media.AudioAttributes
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/** Lectura en voz alta con las voces del teléfono (español de México si está; si no, español). */
class Voz(context: Context, private val velocidad: () -> Float = { 0.9f }, private val alTerminar: (() -> Unit)? = null) {
    private var listo = false
    private var pendiente: String? = null
    private var tts: TextToSpeech? = null

    init {
        tts = TextToSpeech(context.applicationContext) { estado ->
            val t = tts
            if (estado != TextToSpeech.SUCCESS || t == null) return@TextToSpeech
            val idioma = listOf(Locale("es", "MX"), Locale("es", "US"), Locale("es")).firstOrNull {
                val r = t.isLanguageAvailable(it)
                r == TextToSpeech.LANG_AVAILABLE || r == TextToSpeech.LANG_COUNTRY_AVAILABLE || r == TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE
            } ?: Locale("es")
            t.language = idioma
            t.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) { alTerminar?.invoke() }
                @Deprecated("Deprecated in Java") override fun onError(utteranceId: String?) { alTerminar?.invoke() }
            })
            listo = true
            pendiente?.let { hablar(it); pendiente = null }
        }
    }

    fun hablar(texto: String) {
        val t = tts
        if (!listo || t == null) { pendiente = texto; return }
        t.setSpeechRate(velocidad())
        t.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "lazo-${System.nanoTime()}")
    }

    fun detener() { tts?.stop() }

    fun cerrar() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        listo = false
    }

    companion object {
        /** Para los receptores de alarma: habla una vez y libera el motor al terminar (o a los 12 s). */
        fun hablarYCerrar(context: Context, texto: String, velocidad: Float, alFinal: () -> Unit = {}) {
            var voz: Voz? = null
            val cierre = android.os.Handler(android.os.Looper.getMainLooper())
            val cerrar = Runnable { voz?.cerrar(); alFinal() }
            voz = Voz(context, { velocidad }) { cierre.removeCallbacks(cerrar); cierre.post(cerrar) }
            cierre.postDelayed(cerrar, 12_000)
            voz.hablar(texto)
        }
    }
}
