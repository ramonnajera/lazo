package mx.lazo.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import mx.lazo.app.data.Alerta
import mx.lazo.app.data.DiaAdherencia
import mx.lazo.app.domain.*

private fun etiquetaSeveridad(s: String) = when (s) { "alta" -> "Urgente"; "media" -> "Atención"; else -> "Información" }

@Composable
private fun TarjetaAlerta(a: Alerta, alVer: (() -> Unit)?) {
    TarjetaLegible("${etiquetaSeveridad(a.severidad)}. ${a.titulo}. ${a.detalle}") {
        Aviso("${etiquetaSeveridad(a.severidad)}: ${a.titulo}", peligro = a.severidad == "alta")
        Cuerpo(a.detalle, secundario = true)
        if (alVer != null) BotonGrande("Ya lo vi", alVer, tono = Tono.NEUTRO, descripcion = "Marcar como visto: ${a.titulo}")
    }
}

@Composable
fun PantallaResumen(vm: AppViewModel, ui: Ui) {
    val r = ui.resumen
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo(if (r != null) r.persona else "Resumen") }
        if (r == null) { item { Cuerpo(if (ui.cargando) "Cargando…" else "Todavía no hay datos. Revisa la conexión.", secundario = true) }; return@LazyColumn }
        if (r.alertas.isNotEmpty()) {
            item { Subtitulo("Necesita tu atención") }
            items(r.alertas, key = { it.id }) { a -> TarjetaAlerta(a) { vm.marcarVista(a) } }
        } else item { Aviso("Todo en orden: no hay avisos pendientes.") }
        item { Subtitulo("Esta semana") }
        item {
            TarjetaLegible(if (r.porcentaje != null) "Tomó el ${r.porcentaje} por ciento de sus medicinas esta semana." else "Todavía no hay tomas que contar.") {
                Text(if (r.porcentaje != null) "${r.porcentaje} %" else "—", style = MaterialTheme.typography.displayLarge, color = LocalPaleta.current.texto)
                Cuerpo("de las tomas de los últimos 7 días", secundario = true)
            }
        }
        items(r.dias.reversed(), key = { it.fecha }) { d -> FilaDia(d) }
        r.proximaToma?.let { d ->
            item { Subtitulo("Próxima toma") }
            item { Tarjeta { Text(textoDosis(d.nombre, d.dosis), style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto); Cuerpo("${fechaHablada(d.fecha, ui.hoy).replaceFirstChar { it.uppercase() }} · ${horaCorta(d.hora)} · ${textoEstado(d.estado, d)}") } }
        }
        if (r.citas.isNotEmpty()) {
            item { Subtitulo("Próximas citas") }
            items(r.citas, key = { it.id }) { c -> TarjetaLegible(fraseCitas(listOf(c), ui.hoy)) { Text(c.especialista, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto); Cuerpo("${fechaCorta(c.fecha)} · ${horaCorta(c.hora)}${if (c.lugar.isNotBlank()) " · ${c.lugar}" else ""}") } }
        }
        if (r.mediciones.isNotEmpty()) {
            item { Subtitulo("Últimas mediciones") }
            items(r.mediciones, key = { it.first.clave }) { (t, texto) -> Tarjeta { Cuerpo("${t.titulo}: $texto") } }
        }
    }
}

@Composable
private fun FilaDia(d: DiaAdherencia) {
    val total = d.programadas
    val resumen = if (total == 0) "sin tomas" else "${d.tomadas} de $total tomadas" + (if (d.omitidas > 0) ", ${d.omitidas} omitidas" else "") + (if (d.atrasadas > 0) ", ${d.atrasadas} sin confirmar" else "") + (if (d.pendientes > 0) ", ${d.pendientes} por venir" else "")
    TarjetaLegible("${fechaCorta(d.fecha)}: $resumen") {
        Text("${fechaCorta(d.fecha)}: $resumen", style = MaterialTheme.typography.titleMedium, color = LocalPaleta.current.texto)
        if (total > 0) BarraTomas(d)
    }
}

/** Barra de texto y forma (no solo color): ● tomada, ○ pendiente, ✕ omitida o sin confirmar. */
@Composable
private fun BarraTomas(d: DiaAdherencia) {
    val s = "●".repeat(d.tomadas) + "○".repeat(d.pendientes) + "✕".repeat(d.omitidas + d.atrasadas)
    Text(s, style = MaterialTheme.typography.headlineMedium, color = LocalPaleta.current.texto)
}

@Composable
fun PantallaAlertas(vm: AppViewModel, ui: Ui) {
    val activas = ui.alertas.filter { !it.visto }
    val vistas = ui.alertas.filter { it.visto }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Avisos") }
        if (activas.isEmpty()) item { Aviso("No hay avisos nuevos.") }
        items(activas, key = { it.id }) { a -> TarjetaAlerta(a) { vm.marcarVista(a) } }
        if (vistas.isNotEmpty()) item { Subtitulo("Ya vistos") }
        items(vistas, key = { it.id }) { a -> TarjetaAlerta(a, null) }
    }
}
