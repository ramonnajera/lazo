package mx.lazo.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import mx.lazo.app.data.Medicamento
import mx.lazo.app.domain.horaCorta
import mx.lazo.app.domain.textoDosis
import org.json.JSONArray
import org.json.JSONObject

private val DIAS = listOf("Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb")
private val DIAS_LARGOS = listOf("domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados")

fun resumenHorarios(m: Medicamento): String {
    val horas = m.horarios.joinToString(", ") { horaCorta(it) }
    val dias = if (m.dias == null) "todos los días" else m.dias.joinToString(", ") { DIAS_LARGOS[it] }
    return "$horas · $dias"
}

@Composable
fun PantallaMedicinas(ui: Ui, abrir: (Pantalla) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Mis medicinas") }
        item { BotonGrande("Agregar una medicina", { abrir(Pantalla.FormMed(null)) }, icono = Icons.Filled.Add) }
        if (ui.medicamentos.isEmpty()) item { Cuerpo("Todavía no has agregado ninguna medicina. Cuando lo hagas, Lazo te avisará y te leerá en voz alta cada toma.", secundario = true) }
        items(ui.medicamentos, key = { it.id }) { m ->
            val bajas = m.existencias != null && m.existencias <= 3
            TarjetaLegible("${textoDosis(m.nombre, m.dosis)}. ${resumenHorarios(m)}.${if (!m.activo) " En pausa." else ""}${if (bajas) " Quedan pocas dosis." else ""} Toca para editar.") {
                Text(m.nombre, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto)
                if (m.dosis.isNotBlank()) Cuerpo(m.dosis)
                Cuerpo(resumenHorarios(m), secundario = true)
                if (!m.activo) Aviso("En pausa: no te avisará.")
                if (bajas) Aviso(if (m.existencias == 0) "Ya no quedan dosis." else "Quedan pocas dosis: ${m.existencias}.", peligro = true)
                BotonGrande("Editar", { abrir(Pantalla.FormMed(m.id)) }, tono = Tono.NEUTRO, descripcion = "Editar ${m.nombre}")
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FormMedicamento(vm: AppViewModel, ui: Ui, id: String?, volver: () -> Unit) {
    val existente = ui.medicamentos.firstOrNull { it.id == id }
    var nombre by remember { mutableStateOf(existente?.nombre ?: "") }
    var dosis by remember { mutableStateOf(existente?.dosis ?: "") }
    var instrucciones by remember { mutableStateOf(existente?.instrucciones ?: "") }
    val horarios = remember { mutableStateListOf<String>().apply { addAll(existente?.horarios ?: emptyList()) } }
    val dias = remember { mutableStateListOf<Int>().apply { addAll(existente?.dias ?: emptyList()) } }
    var existencias by remember { mutableStateOf(existente?.existencias?.toString() ?: "") }
    var activo by remember { mutableStateOf(existente?.activo ?: true) }
    var confirmarBorrar by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo(if (existente == null) "Agregar medicina" else "Editar medicina") }
        item { error?.let { Aviso(it, peligro = true) } }
        item { Campo("Nombre de la medicina", nombre, { nombre = it }) }
        item { Campo("Dosis", dosis, { dosis = it }, ayuda = "Por ejemplo: 1 tableta, 850 mg") }
        item { Campo("Indicaciones (opcional)", instrucciones, { instrucciones = it }, ayuda = "Por ejemplo: con alimentos") }
        item { Subtitulo("¿A qué hora la tomas?") }
        items(horarios.toList(), key = { it }) { h ->
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(horaCorta(h), style = MaterialTheme.typography.headlineMedium, color = LocalPaleta.current.texto, modifier = Modifier.weight(1f))
                BotonGrande("Quitar", { horarios.remove(h) }, Modifier.weight(1f), Tono.NEUTRO, Icons.Filled.Delete, descripcion = "Quitar el horario de las ${horaCorta(h)}")
            }
        }
        item {
            var agregando by remember { mutableStateOf<String?>(null) }
            SelectorHora("Agregar un horario", null, { h -> if (h !in horarios) { horarios.add(h); horarios.sort() } })
        }
        item { Subtitulo("¿Qué días?") }
        item { Cuerpo("Si no eliges ninguno, será todos los días.", secundario = true) }
        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                DIAS.forEachIndexed { i, d -> Ficha(d, i in dias, { on -> if (on) dias.add(i) else dias.remove(i) }) }
            }
        }
        item { Campo("Dosis que tienes (opcional)", existencias, { existencias = it.filter(Char::isDigit).take(4) }, numerico = true, ayuda = "Lazo te avisa cuando queden pocas.") }
        item { Interruptor("Avisarme de esta medicina", activo) { activo = it } }
        item {
            BotonGrande("Guardar", {
                when {
                    nombre.isBlank() -> error = "Escribe el nombre de la medicina."
                    horarios.isEmpty() -> error = "Agrega al menos una hora."
                    else -> {
                        error = null
                        val body = JSONObject().put("nombre", nombre.trim()).put("dosis", dosis.trim()).put("instrucciones", instrucciones.trim())
                            .put("horarios", JSONArray(horarios.sorted())).put("activo", activo)
                            .put("dias", if (dias.isEmpty()) JSONObject.NULL else JSONArray(dias.sorted()))
                            .put("existencias", existencias.toIntOrNull() ?: JSONObject.NULL)
                        vm.guardarMedicamento(existente?.id, body, volver)
                    }
                }
            }, tono = Tono.EXITO)
        }
        item { BotonGrande("Cancelar", volver, tono = Tono.NEUTRO) }
        if (existente != null) item { BotonGrande("Eliminar esta medicina", { confirmarBorrar = true }, tono = Tono.PELIGRO, icono = Icons.Filled.Delete) }
    }
    if (confirmarBorrar && existente != null) Confirmar("¿Eliminar ${existente.nombre}?", "Dejará de avisarte y se borrarán sus registros.", "Eliminar", { confirmarBorrar = false }) { vm.borrarMedicamento(existente.id, volver) }
}

@Composable
fun Confirmar(titulo: String, texto: String, confirmar: String, cerrar: () -> Unit, alConfirmar: () -> Unit) {
    AlertDialog(
        onDismissRequest = cerrar,
        title = { Text(titulo, style = MaterialTheme.typography.titleLarge) },
        text = { Text(texto, style = MaterialTheme.typography.bodyLarge) },
        confirmButton = { TextButton(onClick = { cerrar(); alConfirmar() }, modifier = Modifier.heightIn(min = 56.dp)) { Text(confirmar, style = MaterialTheme.typography.labelLarge) } },
        dismissButton = { TextButton(onClick = cerrar, modifier = Modifier.heightIn(min = 56.dp)) { Text("Cancelar", style = MaterialTheme.typography.labelLarge) } },
    )
}
