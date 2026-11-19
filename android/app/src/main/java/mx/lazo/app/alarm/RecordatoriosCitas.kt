package mx.lazo.app.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import mx.lazo.app.data.Cache
import mx.lazo.app.data.Cita
import mx.lazo.app.data.Prefs
import mx.lazo.app.domain.MomentoCita
import mx.lazo.app.domain.RecordatorioCita
import mx.lazo.app.domain.ahoraLocal
import mx.lazo.app.domain.fraseRecordatorioCita
import mx.lazo.app.domain.planDeRecordatoriosCitas
import mx.lazo.app.speech.Voz

/**
 * Recordatorios locales de citas: la víspera a las 20:00 y 2 horas antes. Igual que las alarmas de medicinas, no dependen de
 * internet (leen la caché) y se reprograman al sincronizar, al reiniciar el teléfono y al actualizar Lazo.
 */
object RecordatoriosCitas {
    private fun intentDe(context: Context, r: RecordatorioCita) = Intent(context, CitaAlarmReceiver::class.java)
        .putExtra("citaId", r.citaId).putExtra("momento", r.momento.name).putExtra("millis", r.millis).putExtra("especialista", r.especialista)
        .putExtra("lugar", r.lugar).putExtra("fecha", r.fecha).putExtra("hora", r.hora).putExtra("transporte", r.transporte)

    fun citasEnCache(context: Context): List<Cita> {
        val arr = Cache(context).read("citas")?.optJSONArray("citas") ?: return emptyList()
        return (0 until arr.length()).map { Cita.de(arr.getJSONObject(it)) }
    }

    fun reprogramar(context: Context, ahoraMs: Long = System.currentTimeMillis()) {
        val prefs = Prefs.de(context)
        val am = context.getSystemService(AlarmManager::class.java)
        for (codigo in prefs.programadasCitas()) {
            PendingIntent.getBroadcast(context, codigo, Intent(context, CitaAlarmReceiver::class.java), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)?.let { am.cancel(it); it.cancel() }
        }
        if (!prefs.conectado) { prefs.guardarProgramadasCitas(emptySet()); return }
        val plan = planDeRecordatoriosCitas(citasEnCache(context), ahoraLocal(ahoraMs))
        val exactas = android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        for (r in plan) {
            val pi = PendingIntent.getBroadcast(context, r.codigo, intentDe(context, r), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            if (exactas) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.millis, pi) else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.millis, pi)
        }
        prefs.guardarProgramadasCitas(plan.map { it.codigo }.toSet())
    }
}

/** Suena el recordatorio de una cita: notificación y, si la voz está activa, lectura en voz alta. */
class CitaAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val citaId = intent.getStringExtra("citaId") ?: return
        val prefs = Prefs.de(context)
        if (!prefs.conectado) return
        // Si la cita se borró o cambió de hora desde que se programó, no se avisa de algo que ya no existe
        val actual = RecordatoriosCitas.citasEnCache(context).firstOrNull { it.id == citaId }
        val hora = intent.getStringExtra("hora").orEmpty()
        val fecha = intent.getStringExtra("fecha").orEmpty()
        if (actual == null || actual.fecha != fecha || actual.hora != hora) { RecordatoriosCitas.reprogramar(context); return }
        val r = RecordatorioCita(
            citaId, runCatching { MomentoCita.valueOf(intent.getStringExtra("momento").orEmpty()) }.getOrDefault(MomentoCita.DOS_HORAS),
            intent.getLongExtra("millis", 0), actual.especialista, actual.lugar, fecha, hora, actual.transporte,
        )
        Notificaciones.mostrarCita(context, r)
        if (prefs.voz) {
            val pendiente = goAsync()
            Voz.hablarYCerrar(context, fraseRecordatorioCita(r), prefs.velocidadVoz) { pendiente.finish() }
        }
    }
}
