package mx.lazo.app.alarm

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import kotlinx.coroutines.runBlocking
import mx.lazo.app.data.Alerta
import mx.lazo.app.data.LazoApi
import mx.lazo.app.data.Prefs
import mx.lazo.app.data.Rol
import org.json.JSONObject

/** Cada ~15 minutos consulta el servidor: el cuidador se entera de una dosis sin confirmar sin tener la app abierta. */
class AlertasJobService : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean {
        val contexto = applicationContext
        Thread {
            try { revisar(contexto) } catch (_: Exception) { /* sin conexión: se intenta en la siguiente ronda */ } finally { jobFinished(params, false) }
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters?) = false

    companion object {
        private const val ID = 4107

        fun programar(context: Context) {
            val js = context.getSystemService(JobScheduler::class.java)
            if (!Prefs.de(context).conectado) { js.cancel(ID); return }
            if (js.getPendingJob(ID) != null) return
            js.schedule(
                JobInfo.Builder(ID, ComponentName(context, AlertasJobService::class.java))
                    .setPeriodic(15 * 60_000L).setPersisted(true).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).build(),
            )
        }

        /** Qué alertas merecen una notificación: al cuidador, lo grave; a la persona, las convocatorias nuevas. */
        fun filtrar(rol: Rol, alertas: List<Alerta>, yaNotificadas: Set<String>): List<Alerta> = alertas.filter { a ->
            !a.visto && a.id !in yaNotificadas && when (rol) {
                Rol.CUIDADOR -> a.severidad == "alta" || a.severidad == "media"
                Rol.PERSONA -> a.tipo == "convocatoria-nueva"
            }
        }

        fun revisar(context: Context) {
            val prefs = Prefs.de(context)
            val rol = prefs.rol ?: return
            if (!prefs.conectado) return
            val json: JSONObject = runBlocking {
                Sincronizacion.vaciarCola(context)
                LazoApi(prefs.servidor, prefs.token).alertas()
            }
            val arr = json.optJSONArray("alertas") ?: return
            val alertas = (0 until arr.length()).map { Alerta.de(arr.getJSONObject(it)) }
            for (a in filtrar(rol, alertas, prefs.notificadas())) {
                Notificaciones.mostrarAlerta(context, a)
                prefs.marcarNotificada(a.id)
            }
        }
    }
}
