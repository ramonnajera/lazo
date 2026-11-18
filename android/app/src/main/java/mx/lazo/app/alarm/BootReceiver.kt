package mx.lazo.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Al reiniciar el teléfono o actualizar Lazo se vuelven a programar las alarmas (Android las borra). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Notificaciones.crearCanales(context)
        Alarmas.reprogramar(context)
        AlertasJobService.programar(context)
    }
}
