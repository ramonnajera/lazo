package mx.lazo.app.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import mx.lazo.app.data.Dosis
import mx.lazo.app.data.Estado
import mx.lazo.app.domain.*

/** Intenta abrir el reconocimiento de voz del teléfono; devuelve lo que se entendió. */
@Composable
fun rememberEscucha(vm: AppViewModel): () -> Unit {
    val lanzador = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let(vm::procesarVoz)
    }
    return {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-MX").putExtra(RecognizerIntent.EXTRA_PROMPT, "Dime qué necesitas")
        try { lanzador.launch(i) } catch (e: ActivityNotFoundException) { vm.avisar("Este teléfono no tiene reconocimiento de voz.") }
    }
}

@Composable
fun PantallaHoy(vm: AppViewModel, ui: Ui, escuchar: () -> Unit, abrir: (Pantalla) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Titulo("Hola, ${ui.nombre.substringBefore(' ')}")
            if (ui.hoy.isNotEmpty()) Cuerpo("Hoy es ${fechaLarga(ui.hoy)}", secundario = true)
        }
        item { TarjetaSiguiente(vm, ui.proxima, ui.hoy) }
        item { BotonGrande("Hablar con Lazo", escuchar, icono = Icons.Filled.Mic, tono = Tono.NEUTRO, descripcion = "Hablar con Lazo. Puedes decir: ya la tomé, qué sigue, o mis citas.") }
        item { BotonGrande("Leer mi día en voz alta", { vm.hablar(fraseHoy(ui.tomas, ui.hoy) + " " + fraseCitas(ui.citas, ui.hoy)) }, icono = Icons.Filled.VolumeUp, tono = Tono.NEUTRO) }
        if (ui.tomas.isNotEmpty()) item { Subtitulo("Tus tomas de hoy") }
        else item { Cuerpo("Hoy no tienes tomas programadas.", secundario = true) }
        items(ui.tomas, key = { it.clave }) { FilaToma(it, vm) }
        ui.citas.firstOrNull()?.let { c ->
            item { Subtitulo("Tu próxima cita") }
            item {
                TarjetaLegible("Próxima cita: ${fraseCitas(listOf(c), ui.hoy)}") {
                    Text(c.especialista, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto)
                    Cuerpo("${fechaHablada(c.fecha, ui.hoy).replaceFirstChar { it.uppercase() }} · ${horaCorta(c.hora)}")
                    if (c.lugar.isNotBlank()) Cuerpo(c.lugar, secundario = true)
                }
            }
        }
        val nuevas = ui.convocatorias?.items?.count { it.id in (ui.convocatorias?.nuevas ?: emptySet()) } ?: 0
        if (nuevas > 0) item { BotonGrande("Hay ${plural(nuevas, "convocatoria nueva", "convocatorias nuevas")}", { abrir(Pantalla.Convocatorias) }, icono = Icons.Filled.Campaign, tono = Tono.NEUTRO) }
    }
}

@Composable
private fun TarjetaSiguiente(vm: AppViewModel, d: Dosis?, hoy: String) {
    if (d == null) {
        Tarjeta { Subtitulo("Todo al día"); Cuerpo("No tienes tomas pendientes. Si agregas una medicina, aquí verás la que sigue.") }
        return
    }
    val urgente = d.estado.requiereAtencion
    TarjetaLegible(
        "Siguiente toma: ${textoDosis(d.nombre, d.dosis)}, ${fechaHablada(d.fecha, hoy)} a las ${horaHablada(d.hora)}. ${textoEstado(d.estado, d)}.",
        fondo = if (urgente) LocalPaleta.current.fondoAviso else LocalPaleta.current.superficie,
    ) {
        Text(if (urgente) "Es hora de tu medicina" else "Siguiente toma", style = MaterialTheme.typography.titleMedium, color = LocalPaleta.current.textoSecundario)
        Text(d.nombre, style = MaterialTheme.typography.displayLarge, color = LocalPaleta.current.texto)
        if (d.dosis.isNotBlank()) Text(d.dosis, style = MaterialTheme.typography.headlineMedium, color = LocalPaleta.current.texto)
        Text("${fechaHablada(d.fecha, hoy).replaceFirstChar { it.uppercase() }} · ${horaCorta(d.hora)}", style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto)
        if (d.instrucciones.isNotBlank()) Cuerpo(d.instrucciones, secundario = true)
        EtiquetaEstado(d.estado, textoEstado(d.estado, d))
    }
    Spacer(Modifier.height(12.dp))
    BotonGrande("Ya la tomé", { vm.registrar(d, Estado.TOMADA) }, tono = Tono.EXITO, icono = Icons.Filled.Check, descripcion = "Ya tomé ${textoDosis(d.nombre, d.dosis)}")
    Spacer(Modifier.height(12.dp))
    // Apilados y a todo el ancho: con letra grande, dos botones lado a lado se aprietan y parten las palabras
    BotonGrande("Pospón 10 minutos", { vm.registrar(d, Estado.POSPUESTA, 10) }, tono = Tono.NEUTRO, icono = Icons.Filled.Snooze)
    Spacer(Modifier.height(12.dp))
    BotonGrande("Omitir esta toma", { vm.registrar(d, Estado.OMITIDA) }, tono = Tono.NEUTRO, icono = Icons.Filled.SkipNext)
}

@Composable
private fun FilaToma(d: Dosis, vm: AppViewModel) {
    TarjetaLegible("${horaHablada(d.hora)}, ${textoDosis(d.nombre, d.dosis)}. ${textoEstado(d.estado, d)}.") {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(horaCorta(d.hora), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = LocalPaleta.current.texto)
            Column(Modifier.weight(1f)) {
                Text(d.nombre, style = MaterialTheme.typography.titleMedium, color = LocalPaleta.current.texto)
                if (d.dosis.isNotBlank()) Cuerpo(d.dosis, secundario = true)
            }
        }
        EtiquetaEstado(d.estado, textoEstado(d.estado, d))
        if (d.estado == Estado.TOMADA || d.estado == Estado.OMITIDA) {
            BotonGrande("Deshacer", { vm.registrar(d, Estado.PENDIENTE) }, tono = Tono.NEUTRO, descripcion = "Deshacer: volver a marcar ${d.nombre} de las ${horaHablada(d.hora)} como pendiente")
        }
    }
}
