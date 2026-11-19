package mx.lazo.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Sos
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import mx.lazo.app.data.Alerta
import mx.lazo.app.data.DiaAdherencia
import mx.lazo.app.domain.*

private fun etiquetaSeveridad(s: String) = when (s) { "alta" -> "Urgente"; "media" -> "Atención"; else -> "Información" }

@Composable
private fun TarjetaAlerta(a: Alerta, alVer: (() -> Unit)?) {
    if (a.tipo == TIPO_ALERTA_AYUDA) return TarjetaAyuda(a, alVer)
    TarjetaLegible("${etiquetaSeveridad(a.severidad)}. ${a.titulo}. ${a.detalle}") {
        Aviso("${etiquetaSeveridad(a.severidad)}: ${a.titulo}", peligro = a.severidad == "alta")
        Cuerpo(a.detalle, secundario = true)
        if (alVer != null) BotonGrande("Ya lo vi", alVer, tono = Tono.NEUTRO, descripcion = "Marcar como visto: ${a.titulo}")
    }
}

/** Un pedido de ayuda: lo más visible de la pantalla. Fondo y borde rojos, ícono SOS y la palabra «Urgente» (nunca solo color). */
@Composable
private fun TarjetaAyuda(a: Alerta, alVer: (() -> Unit)?) {
    val p = LocalPaleta.current
    val cuando = horaDeAlerta(a.fecha)
    val detalle = a.detalle.ifBlank { "Comunícate con esa persona cuanto antes. Si no responde y crees que es una emergencia, llama al 911." }
    Surface(
        shape = RoundedCornerShape(20.dp), color = p.fondoPeligro, border = BorderStroke(4.dp, p.peligro),
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = "Urgente. ${a.titulo}${if (cuando != null) " a las ${horaHablada(cuando)}" else ""}. $detalle" },
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(56.dp).clip(CircleShape).background(p.peligro), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Sos, contentDescription = null, tint = if (p.altoContraste) Color.Black else Color.White, modifier = Modifier.size(36.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text("Urgente", style = MaterialTheme.typography.titleMedium, color = p.texto)
                    Text(a.titulo, style = MaterialTheme.typography.headlineMedium, color = p.texto)
                }
            }
            if (cuando != null) Cuerpo("A las ${horaCorta(cuando)}")
            Cuerpo(detalle)
            if (alVer != null) BotonGrande("Ya lo atendí", alVer, tono = Tono.NEUTRO, descripcion = "Marcar como atendido: ${a.titulo}")
        }
    }
}

/** «2026-11-18T09:30:00-06:00» → «09:30». */
private fun horaDeAlerta(fecha: String): String? = Regex("T(\\d{2}:\\d{2})").find(fecha)?.groupValues?.get(1)

@Composable
fun PantallaResumen(vm: AppViewModel, ui: Ui) {
    val r = ui.resumen
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo(if (r != null) r.persona else "Resumen") }
        if (r == null) { item { Cuerpo(if (ui.cargando) "Cargando…" else "Todavía no hay datos. Revisa la conexión.", secundario = true) }; return@LazyColumn }
        if (r.alertas.isNotEmpty()) {
            item { Subtitulo("Necesita tu atención") }
            items(ordenarAlertas(r.alertas), key = { it.id }) { a -> TarjetaAlerta(a) { vm.marcarVista(a) } }
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
    // Los pedidos de ayuda siempre arriba, luego lo urgente
    val activas = ordenarAlertas(ui.alertas.filter { !it.visto })
    val vistas = ui.alertas.filter { it.visto }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Avisos") }
        if (activas.isEmpty()) item { Aviso("No hay avisos nuevos.") }
        items(activas, key = { it.id }) { a -> TarjetaAlerta(a) { vm.marcarVista(a) } }
        if (vistas.isNotEmpty()) item { Subtitulo("Ya vistos") }
        items(vistas, key = { it.id }) { a -> TarjetaAlerta(a, null) }
    }
}
