package mx.lazo.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import mx.lazo.app.data.Dosis
import mx.lazo.app.data.Estado
import mx.lazo.app.domain.*

@Composable
fun PantallaHoy(vm: AppViewModel, ui: Ui, abrir: (Pantalla) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                LogoLazo(tam = 52.dp)
                Column {
                    Titulo("Hola, ${ui.nombre.substringBefore(' ')}")
                    if (ui.hoy.isNotEmpty()) Cuerpo("Hoy es ${fechaLarga(ui.hoy)}", secundario = true)
                }
            }
        }
        // Lo primero que se ve y se alcanza: hablar con Lazo
        item { BotonHablar({ abrir(Pantalla.Chat) }) }
        // Persona: «Necesito ayuda» bien a la vista, con confirmación. El cuidador no lo ve (solo consulta)
        if (ui.rol == null || ui.rol == mx.lazo.app.data.Rol.PERSONA) item { PanelAyuda(vm, ui, abrir) }
        item { TarjetaSiguiente(vm, ui.proxima, ui.hoy) }
        item { FilaAccion("Leer mi día en voz alta", Icons.Filled.VolumeUp, Acento.PETROLEO, { vm.hablar(fraseHoy(ui.tomas, ui.hoy) + " " + fraseCitas(ui.citas, ui.hoy)) }) }
        if (ui.tomas.isNotEmpty()) item { Subtitulo("Tus tomas de hoy") }
        else item { Cuerpo("Hoy no tienes tomas programadas.", secundario = true) }
        items(ui.tomas, key = { it.clave }) { FilaToma(it, vm) }
        ui.citas.firstOrNull()?.let { c ->
            item { Subtitulo("Tu próxima cita") }
            item {
                TarjetaLegible("Próxima cita: ${fraseCitas(listOf(c), ui.hoy)}") {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        IconoChip(Icons.Filled.CalendarMonth, Acento.MORADO)
                        Text(c.especialista, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto, modifier = Modifier.weight(1f))
                    }
                    Cuerpo("${fechaHablada(c.fecha, ui.hoy).replaceFirstChar { it.uppercase() }} · ${horaCorta(c.hora)}")
                    if (c.lugar.isNotBlank()) Cuerpo(c.lugar, secundario = true)
                }
            }
        }
        val nuevas = ui.convocatorias?.items?.count { it.id in (ui.convocatorias?.nuevas ?: emptySet()) } ?: 0
        if (nuevas > 0) item { FilaAccion("Hay ${plural(nuevas, "convocatoria nueva", "convocatorias nuevas")}", Icons.Filled.Campaign, Acento.NARANJA, { abrir(Pantalla.Convocatorias) }) }
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
        modifier = Modifier.accionesRapidas(d, vm),
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
    TarjetaLegible("${horaHablada(d.hora)}, ${textoDosis(d.nombre, d.dosis)}. ${textoEstado(d.estado, d)}.", Modifier.accionesRapidas(d, vm)) {
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

/**
 * Acciones de TalkBack (y de Acceso con interruptor) en la tarjeta de cada toma: quien no ve o usa un interruptor confirma,
 * pospone, omite o deshace desde la misma tarjeta que escucha, sin tener que buscar botones uno por uno.
 */
private fun Modifier.accionesRapidas(d: Dosis, vm: AppViewModel) = semantics {
    customActions = accionesToma(d.estado).map { a -> CustomAccessibilityAction(a.texto) { vm.registrar(d, a.estado, a.minutos); true } }
}
