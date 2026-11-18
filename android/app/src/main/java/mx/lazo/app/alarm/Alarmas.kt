package mx.lazo.app.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import mx.lazo.app.data.Cache
import mx.lazo.app.data.Medicamento
import mx.lazo.app.data.Prefs
import mx.lazo.app.data.Rol
import mx.lazo.app.domain.Alarma
import mx.lazo.app.domain.ahoraLocal
import mx.lazo.app.domain.hoyIso
import mx.lazo.app.domain.planDeAlarmas

/** Programa en el teléfono las alarmas exactas de las próximas 48 horas. No depende de internet: lee la caché local. */
object Alarmas {
    private fun intentDe(context: Context, a: Alarma) = Intent(context, DoseAlarmReceiver::class.java)
        .putExtra("clave", a.clave).putExtra("nombre", a.nombre).putExtra("dosis", a.dosis).putExtra("instrucciones", a.instrucciones)
        .putExtra("hora", a.hora).putExtra("reintento", a.reintento).putExtra("millis", a.millis)

    private fun pendiente(context: Context, a: Alarma) = PendingIntent.getBroadcast(context, a.codigo, intentDe(context, a), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun cancelarCodigo(context: Context, am: AlarmManager, codigo: Int) {
        PendingIntent.getBroadcast(context, codigo, Intent(context, DoseAlarmReceiver::class.java), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)?.let { am.cancel(it); it.cancel() }
    }

    fun medicamentosEnCache(context: Context): List<Medicamento> {
        val arr = Cache(context).read("medicamentos")?.optJSONArray("medicamentos") ?: return emptyList()
        return (0 until arr.length()).map { Medicamento.de(arr.getJSONObject(it)) }
    }

    /** Vuelve a calcular y programar todo. Se llama al abrir la app, tras cada acción, tras cada alarma y al reiniciar el teléfono. */
    fun reprogramar(context: Context, ahoraMs: Long = System.currentTimeMillis()) {
        val prefs = Prefs.de(context)
        val am = context.getSystemService(AlarmManager::class.java)
        prefs.programadas().forEach { cancelarCodigo(context, am, it) }
        if (prefs.rol != Rol.PERSONA) { prefs.guardarProgramadas(emptySet()); return }
        prefs.podarResueltas(hoyIso(ahoraMs))
        val plan = planDeAlarmas(medicamentosEnCache(context), ahoraLocal(ahoraMs), prefs.resueltas(), prefs.pospuestas())
        val exactas = android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        for (a in plan) {
            val pi = pendiente(context, a)
            if (exactas) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.millis, pi) else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.millis, pi)
        }
        prefs.guardarProgramadas(plan.map { it.codigo }.toSet())
    }
}
