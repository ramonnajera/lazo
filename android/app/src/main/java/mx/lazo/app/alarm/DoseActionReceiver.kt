package mx.lazo.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import mx.lazo.app.data.AccionPendiente
import mx.lazo.app.data.Prefs
import mx.lazo.app.domain.ahoraLocal
import mx.lazo.app.domain.aMillis

/** Botones de la notificación: «Ya la tomé» y «Pospón 10 min». Funcionan sin abrir la app y sin conexión. */
class DoseActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val clave = intent.getStringExtra("clave") ?: return
        val prefs = Prefs.de(context)
        val medicamentoId = intent.getStringExtra("medicamentoId").orEmpty()
        val fecha = intent.getStringExtra("fecha").orEmpty()
        val hora = intent.getStringExtra("hora").orEmpty()
        Notificaciones.cancelar(context, intent.getIntExtra("codigo", 0))
        val accion = when (intent.action) {
            TOMADA -> { prefs.resolver(clave); prefs.quitarPospuesta(clave); AccionPendiente(medicamentoId, fecha, hora, "tomada", null) }
            POSPONER -> {
                val min = intent.getIntExtra("minutos", 10)
                prefs.pospuesta(clave, ahoraLocal().plusMinutes(min.toLong()).let { it.aMillis() })
                AccionPendiente(medicamentoId, fecha, hora, "pospuesta", min)
            }
            else -> return
        }
        Alarmas.reprogramar(context)
        val pendiente = goAsync()
        Thread {
            try { Sincronizacion.enviarOEncolar(context, accion) } finally { pendiente.finish() }
        }.start()
    }

    companion object {
        const val TOMADA = "mx.lazo.app.TOMADA"
        const val POSPONER = "mx.lazo.app.POSPONER"
    }
}
