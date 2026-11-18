package mx.lazo.app.alarm

import android.content.Context
import kotlinx.coroutines.runBlocking
import mx.lazo.app.data.AccionPendiente
import mx.lazo.app.data.ApiException
import mx.lazo.app.data.LazoApi
import mx.lazo.app.data.Prefs

/** Envío de tomas al servidor con cola local: sin conexión no se pierde nada, se reintenta después. */
object Sincronizacion {
    private fun api(prefs: Prefs) = LazoApi(prefs.servidor, prefs.token)

    private suspend fun enviar(api: LazoApi, a: AccionPendiente) = api.registrarToma(a.medicamentoId, a.fecha, a.hora, a.estado, a.minutos)

    /** true si el servidor ya lo tiene (o lo rechazó de forma definitiva); false si quedó en la cola. Bloquea: no usar en el hilo principal. */
    fun enviarOEncolar(context: Context, a: AccionPendiente): Boolean {
        val prefs = Prefs.de(context)
        if (!prefs.conectado) return false
        return try {
            runBlocking { enviar(api(prefs), a) }
            true
        } catch (e: ApiException) {
            if (e.codigo in 400..499 && e.codigo != 401 && e.codigo != 429) true // dosis que ya no existe, etc.: no tiene caso reintentar
            else { prefs.encolar(a); false }
        }
    }

    /** Intenta enviar lo pendiente; deja en la cola solo lo que siga sin poder enviarse. */
    suspend fun vaciarCola(context: Context) {
        val prefs = Prefs.de(context)
        if (!prefs.conectado) return
        val api = api(prefs)
        val restantes = mutableListOf<AccionPendiente>()
        for (a in prefs.cola()) {
            try { enviar(api, a) } catch (e: ApiException) {
                if (!(e.codigo in 400..499 && e.codigo != 401 && e.codigo != 429)) restantes += a
            }
        }
        prefs.reemplazarCola(restantes)
    }
}
