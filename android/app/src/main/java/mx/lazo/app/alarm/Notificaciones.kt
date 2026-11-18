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
import mx.lazo.app.domain.fraseAlarma
import mx.lazo.app.domain.horaCorta
import mx.lazo.app.domain.textoDosis

object Notificaciones {
    const val CANAL_TOMAS = "tomas"
    const val CANAL_ALERTAS = "alertas"

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

    fun mostrarAlerta(context: Context, a: Alerta) {
        if (!puedePublicar(context)) return
        val n = NotificationCompat.Builder(context, CANAL_ALERTAS)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle(a.titulo)
            .setContentText(a.detalle)
            .setStyle(NotificationCompat.BigTextStyle().bigText(a.detalle))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(abrirApp(context, a.id.hashCode()))
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(a.id.hashCode(), n)
    }

    fun cancelar(context: Context, codigo: Int) = context.getSystemService(NotificationManager::class.java).cancel(codigo)
}
