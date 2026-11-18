package mx.lazo.app.domain

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset

/** Hora de Chihuahua: UTC-6 todo el año (no hay horario de verano desde 2022). Igual que el servidor. */
val ZONA: ZoneOffset = ZoneOffset.ofHours(-6)

fun ahoraLocal(millis: Long = System.currentTimeMillis()): LocalDateTime = LocalDateTime.ofEpochSecond(Math.floorDiv(millis, 1000L), 0, ZONA)

fun LocalDateTime.aMillis(): Long = toEpochSecond(ZONA) * 1000

fun parseHora(hhmm: String): LocalTime = LocalTime.parse(hhmm)

fun hoyIso(millis: Long = System.currentTimeMillis()): String = ahoraLocal(millis).toLocalDate().toString()

fun horaActual(millis: Long = System.currentTimeMillis()): String = ahoraLocal(millis).toLocalTime().let { "%02d:%02d".format(it.hour, it.minute) }

/** 0 = domingo … 6 = sábado, como el servidor. */
fun LocalDate.diaServidor(): Int = dayOfWeek.value % 7
