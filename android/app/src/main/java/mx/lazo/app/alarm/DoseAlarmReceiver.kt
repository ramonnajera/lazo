package mx.lazo.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import mx.lazo.app.data.Prefs
import mx.lazo.app.domain.Alarma
import mx.lazo.app.domain.fraseAlarma
import mx.lazo.app.speech.Voz

/** Suena a la hora de cada toma: notificación con acciones y, si está activado, lectura en voz alta. */
class DoseAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val clave = intent.getStringExtra("clave") ?: return
        val prefs = Prefs.de(context)
        if (clave in prefs.resueltas()) { Alarmas.reprogramar(context); return } // ya la tomó o la omitió: no molestar
        val a = Alarma(
            clave, intent.getLongExtra("millis", 0), intent.getStringExtra("nombre").orEmpty(), intent.getStringExtra("dosis").orEmpty(),
            intent.getStringExtra("instrucciones").orEmpty(), intent.getStringExtra("hora").orEmpty(), intent.getBooleanExtra("reintento", false),
        )
        Notificaciones.mostrarToma(context, a)
        if (!a.reintento) prefs.quitarPospuesta(clave)
        Alarmas.reprogramar(context) // renueva el horizonte de 48 horas
        if (prefs.voz) {
            val pendiente = goAsync()
            Voz.hablarYCerrar(context, fraseAlarma(a.nombre, a.dosis, a.instrucciones, a.reintento), prefs.velocidadVoz) { pendiente.finish() }
        }
    }
}
