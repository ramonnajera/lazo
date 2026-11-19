package mx.lazo.app.alarm

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import mx.lazo.app.MainActivity
import mx.lazo.app.R
import mx.lazo.app.data.Alerta
import mx.lazo.app.domain.Alarma
import mx.lazo.app.domain.RecordatorioCita
import mx.lazo.app.domain.TIPO_ALERTA_AYUDA
import mx.lazo.app.domain.fraseRecordatorioCita
import mx.lazo.app.domain.tituloRecordatorioCita
import mx.lazo.app.domain.fraseAlarma
import mx.lazo.app.domain.horaCorta
import mx.lazo.app.domain.textoDosis

object Notificaciones {
    const val CANAL_TOMAS = "tomas"
    const val CANAL_ALERTAS = "alertas"
    const val CANAL_AYUDA = "ayuda"
    const val CANAL_CITAS = "citas"

    fun crearCanales(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        val sonido = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        val atributos = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        nm.createNotificationChannel(NotificationChannel(CANAL_TOMAS, "Hora de tus medicinas", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Te avisa y te lee en voz alta cada toma de medicamento."
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 600, 300, 600)
            setSound(sonido, atributos)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        })
        nm.createNotificationChannel(NotificationChannel(CANAL_ALERTAS, "Avisos importantes", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Dosis sin confirmar y otros avisos sobre la persona que acompañas."
            enableVibration(true)
        })
        // Pedido de ayuda: suena como alarma (aunque el teléfono esté en vibrar), vibra largo y se ve en la pantalla bloqueada
        nm.createNotificationChannel(NotificationChannel(CANAL_AYUDA, "Pedidos de ayuda", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Suena como alarma cuando la persona que acompañas pulsa «Necesito ayuda»."
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 1000, 400, 1000, 400, 1000)
            setSound(sonido, atributos)
            setBypassDnd(true)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        })
        nm.createNotificationChannel(NotificationChannel(CANAL_CITAS, "Recordatorios de citas", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Te recuerda cada cita la noche anterior y 2 horas antes."
            enableVibration(true)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        })
    }

    private fun puedePublicar(context: Context) =
        android.os.Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun abrirApp(context: Context, codigo: Int) = PendingIntent.getActivity(
        context, codigo, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun accion(context: Context, a: Alarma, tipo: String, minutos: Int?, extra: Int): PendingIntent {
        val partes = a.clave.split("|")
        val i = Intent(context, DoseActionReceiver::class.java).setAction(tipo)
            .putExtra("clave", a.clave).putExtra("medicamentoId", partes[0]).putExtra("fecha", partes[1]).putExtra("hora", partes[2]).putExtra("codigo", a.codigo)
        if (minutos != null) i.putExtra("minutos", minutos)
        return PendingIntent.getBroadcast(context, a.codigo + extra, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun mostrarToma(context: Context, a: Alarma) {
        if (!puedePublicar(context)) return
        val titulo = if (a.reintento) "¿Ya tomaste tu medicina?" else "Es hora de tu medicina"
        val n = NotificationCompat.Builder(context, CANAL_TOMAS)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle(titulo)
            .setContentText("${textoDosis(a.nombre, a.dosis)} · ${horaCorta(a.hora)}")
            .setStyle(NotificationCompat.BigTextStyle().bigText(fraseAlarma(a.nombre, a.dosis, a.instrucciones, a.reintento)))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(abrirApp(context, a.codigo))
            .setAutoCancel(true)
            .addAction(0, "Ya la tomé", accion(context, a, DoseActionReceiver.TOMADA, null, 1))
            .addAction(0, "Pospón 10 min", accion(context, a, DoseActionReceiver.POSPONER, 10, 2))
            .build()
        context.getSystemService(NotificationManager::class.java).notify(a.codigo, n)
    }

    /** Texto de la notificación de un pedido de ayuda: claro aunque el servidor no mande detalle. */
    fun textoAyuda(a: Alerta): String = listOf(a.detalle.trim(), "Comunícate con esa persona cuanto antes. Si no responde y crees que es una emergencia, llama al 911.")
        .filter { it.isNotEmpty() }.joinToString(" ")

    fun mostrarAlerta(context: Context, a: Alerta) {
        if (!puedePublicar(context)) return
        val ayuda = a.tipo == TIPO_ALERTA_AYUDA
        val texto = if (ayuda) textoAyuda(a) else a.detalle
        val n = NotificationCompat.Builder(context, if (ayuda) CANAL_AYUDA else CANAL_ALERTAS)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle(if (ayuda) "Urgente: ${a.titulo}" else a.titulo)
            .setContentText(texto)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setPriority(if (ayuda) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
            .setCategory(if (ayuda) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(abrirApp(context, a.id.hashCode()))
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(a.id.hashCode(), n)
    }

    fun mostrarCita(context: Context, r: RecordatorioCita) {
        if (!puedePublicar(context)) return
        val texto = fraseRecordatorioCita(r)
        val n = NotificationCompat.Builder(context, CANAL_CITAS)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle(tituloRecordatorioCita(r))
            .setContentText(texto)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(abrirApp(context, r.codigo))
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(r.codigo, n)
    }

    fun cancelar(context: Context, codigo: Int) = context.getSystemService(NotificationManager::class.java).cancel(codigo)
}
