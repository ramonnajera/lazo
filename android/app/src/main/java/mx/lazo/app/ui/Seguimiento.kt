package mx.lazo.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import mx.lazo.app.data.Medicion
import mx.lazo.app.data.TipoMedicion
import mx.lazo.app.domain.fechaCorta
import mx.lazo.app.domain.horaCorta
import org.json.JSONObject

private val NIVELES_ANIMO = listOf(1 to "Muy mal", 2 to "Mal", 3 to "Regular", 4 to "Bien", 5 to "Muy bien")

@Composable
fun PantallaSeguimiento(vm: AppViewModel, ui: Ui, abrir: (Pantalla) -> Unit) {
    val columnas = if (LocalDensity.current.fontScale >= 1.5f) 1 else 2
    LazyColumn(Modifier.fillMaxSize(), contentPadding = RellenoPantalla, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("¿Cómo estoy?") }
        item { Cuerpo("Anota cómo te sientes o lo que mide tu aparato. Tu cuidador lo verá.", secundario = true) }
        // Dos columnas de cuadros de color; con letra grande, una sola para que nada se corte
        for (fila in TipoMedicion.entries.chunked(columnas)) item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (t in fila) CuadroMedicion(t, { abrir(Pantalla.FormMedicion(t)) }, Modifier.weight(1f)) // el último, si queda solo, ocupa todo el renglón
            }
        }
        if (ui.mediciones.isNotEmpty()) item { Subtitulo("Lo que has anotado") }
        items(ui.mediciones.take(30), key = { it.id }) { m -> FilaMedicion(m) { vm.borrarMedicion(m.id) } }
    }
}

fun acentoDe(t: TipoMedicion) = when (t) {
    TipoMedicion.PRESION -> Acento.ROSA; TipoMedicion.GLUCOSA -> Acento.PETROLEO; TipoMedicion.ANIMO -> Acento.MORADO
    TipoMedicion.DOLOR -> Acento.NARANJA; TipoMedicion.PESO -> Acento.VERDE
}

/** Un cuadro grande y de color por cada cosa que se puede anotar: ícono de color arriba, nombre claro abajo. */
@Composable
private fun CuadroMedicion(t: TipoMedicion, alPulsar: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPaleta.current
    val acento = acentoDe(t)
    androidx.compose.material3.Surface(
        onClick = alPulsar, shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp), color = p.superficie,
        border = androidx.compose.foundation.BorderStroke(if (p.altoContraste) 3.dp else 3.dp, if (p.altoContraste) p.texto else p.acento(acento)),
        modifier = modifier.heightIn(min = 120.dp).semantics { role = Role.Button; contentDescription = "Anotar ${t.titulo.lowercase()}" },
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically)) {
            IconoChip(iconoDe(t), acento, tam = 56.dp)
            Text(t.titulo, style = MaterialTheme.typography.labelLarge, color = p.texto)
        }
    }
}

private fun iconoDe(t: TipoMedicion) = when (t) {
    TipoMedicion.PRESION -> Icons.Filled.MonitorHeart; TipoMedicion.GLUCOSA -> Icons.Filled.Bloodtype; TipoMedicion.ANIMO -> Icons.Filled.SentimentSatisfied
    TipoMedicion.DOLOR -> Icons.Filled.Healing; TipoMedicion.PESO -> Icons.Filled.Scale
}

@Composable
private fun FilaMedicion(m: Medicion, borrar: () -> Unit) {
    TarjetaLegible("${m.tipo.titulo}: ${m.texto}, ${fechaCorta(m.fecha)} a las ${horaCorta(m.hora)}.${m.aviso?.let { " Aviso: ${it.texto}." } ?: ""}") {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            IconoChip(iconoDe(m.tipo), acentoDe(m.tipo))
            Text("${m.tipo.titulo}: ${m.texto}", style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto, modifier = Modifier.weight(1f))
        }
        Cuerpo("${fechaCorta(m.fecha)} · ${horaCorta(m.hora)}", secundario = true)
        if (m.nota.isNotBlank()) Cuerpo(m.nota, secundario = true)
        m.aviso?.let { Aviso("${it.texto}. Es un aviso orientativo, no un diagnóstico.", peligro = it.nivel == "alta") }
        BotonGrande("Eliminar", borrar, tono = Tono.NEUTRO, descripcion = "Eliminar esta medición")
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FormMedicion(vm: AppViewModel, tipo: TipoMedicion, volver: () -> Unit) {
    var a by remember { mutableStateOf("") }
    var b by remember { mutableStateOf("") }
    var c by remember { mutableStateOf("") }
    var nivel by remember { mutableStateOf<Int?>(null) }
    var nota by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var resultado by remember { mutableStateOf<String?>(null) }

    fun numero(s: String) = s.replace(',', '.').toDoubleOrNull()

    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo(tipo.titulo) }
        item { error?.let { Aviso(it, peligro = true) } }
        item { resultado?.let { Aviso(it) } }
        when (tipo) {
            TipoMedicion.PRESION -> {
                item { Campo("Número de arriba (sistólica)", a, { a = it.filter(Char::isDigit).take(3) }, numerico = true, ayuda = "Por ejemplo: 120") }
                item { Campo("Número de abajo (diastólica)", b, { b = it.filter(Char::isDigit).take(3) }, numerico = true, ayuda = "Por ejemplo: 80") }
                item { Campo("Pulso (opcional)", c, { c = it.filter(Char::isDigit).take(3) }, numerico = true) }
            }
            TipoMedicion.GLUCOSA -> item { Campo("Glucosa en mg/dL", a, { a = it.filter(Char::isDigit).take(3) }, numerico = true, ayuda = "Por ejemplo: 105") }
            TipoMedicion.PESO -> item { Campo("Peso en kilogramos", a, { a = it.filter { ch -> ch.isDigit() || ch == '.' || ch == ',' }.take(6) }, numerico = true, ayuda = "Por ejemplo: 68.5") }
            TipoMedicion.ANIMO -> {
                item { Subtitulo("¿Cómo te sientes hoy?") }
                items(NIVELES_ANIMO) { (n, texto) -> Ficha("$n · $texto", nivel == n, { nivel = n }, Modifier.fillMaxWidth()) }
            }
            TipoMedicion.DOLOR -> {
                item { Subtitulo("¿Cuánto te duele? (0 = nada, 10 = lo peor)") }
                item { FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { (0..10).forEach { n -> Ficha("$n", nivel == n, { nivel = n }, Modifier.widthIn(min = 72.dp)) } } }
            }
        }
        item { Campo("Nota (opcional)", nota, { nota = it }, ayuda = "Por ejemplo: después de comer") }
        item {
            BotonGrande("Guardar", {
                val valor: JSONObject? = when (tipo) {
                    TipoMedicion.PRESION -> if (a.toIntOrNull() != null && b.toIntOrNull() != null) JSONObject().put("sistolica", a.toInt()).put("diastolica", b.toInt()).apply { c.toIntOrNull()?.let { put("pulso", it) } } else null
                    TipoMedicion.GLUCOSA -> a.toIntOrNull()?.let { JSONObject().put("mgdl", it) }
                    TipoMedicion.PESO -> numero(a)?.let { JSONObject().put("kg", it) }
                    TipoMedicion.ANIMO, TipoMedicion.DOLOR -> nivel?.let { JSONObject().put("nivel", it) }
                }
                if (valor == null) error = "Completa el dato para guardarlo."
                else {
                    error = null
                    vm.registrarMedicion(tipo, valor, nota.trim()) { aviso ->
                        if (aviso == null) { vm.hablar("Listo, lo anoté."); volver() }
                        else { resultado = "${aviso.texto}. Es un aviso orientativo, no un diagnóstico. Si no te sientes bien, consulta a tu médico."; vm.hablar(resultado!!) }
                    }
                }
            }, tono = Tono.EXITO)
        }
        item { BotonGrande(if (resultado != null) "Listo" else "Cancelar", volver, tono = Tono.NEUTRO) }
    }
}
