package mx.lazo.app

import android.app.Application
import mx.lazo.app.alarm.AlertasJobService
import mx.lazo.app.alarm.Alarmas
import mx.lazo.app.alarm.Notificaciones

class LazoApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notificaciones.crearCanales(this)
        Alarmas.reprogramar(this)
        AlertasJobService.programar(this)
    }
}
