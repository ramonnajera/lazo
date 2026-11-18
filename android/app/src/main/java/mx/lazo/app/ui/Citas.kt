package mx.lazo.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import mx.lazo.app.data.Rol
import mx.lazo.app.domain.fechaHablada
import mx.lazo.app.domain.fechaLarga
import mx.lazo.app.domain.horaCorta
import mx.lazo.app.domain.horaHablada
import org.json.JSONObject

@Composable
fun PantallaCitas(ui: Ui, abrir: (Pantalla) -> Unit) {
    val persona = ui.rol == Rol.PERSONA
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Mis citas") }
        if (persona) item { BotonGrande("Agregar una cita", { abrir(Pantalla.FormCita(null)) }, icono = Icons.Filled.Add) }
        if (ui.citas.isEmpty()) item { Cuerpo("No hay citas próximas.", secundario = true) }
        items(ui.citas, key = { it.id }) { c ->
            val cuando = fechaHablada(c.fecha, ui.hoy)
            TarjetaLegible("Cita con ${c.especialista}, ${cuando} a las ${horaHablada(c.hora)}.${if (c.lugar.isNotBlank()) " En ${c.lugar}." else ""}${if (c.transporte.isNotBlank()) " Transporte: ${c.transporte}." else ""}") {
                Text(c.especialista, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto)
                Cuerpo("${fechaLarga(c.fecha).replaceFirstChar { it.uppercase() }} · ${horaCorta(c.hora)}")
                if (c.motivo.isNotBlank()) Cuerpo(c.motivo, secundario = true)
                if (c.lugar.isNotBlank()) Cuerpo("Lugar: ${c.lugar}", secundario = true)
                if (c.transporte.isNotBlank()) Cuerpo("Transporte: ${c.transporte}", secundario = true)
                if (c.notas.isNotBlank()) Cuerpo(c.notas, secundario = true)
                if (persona) BotonGrande("Editar", { abrir(Pantalla.FormCita(c.id)) }, tono = Tono.NEUTRO, descripcion = "Editar la cita con ${c.especialista}")
            }
        }
    }
}

@Composable
fun FormCita(vm: AppViewModel, ui: Ui, id: String?, volver: () -> Unit) {
    val existente = ui.citas.firstOrNull { it.id == id }
    var especialista by remember { mutableStateOf(existente?.especialista ?: "") }
    var motivo by remember { mutableStateOf(existente?.motivo ?: "") }
    var lugar by remember { mutableStateOf(existente?.lugar ?: "") }
    var fecha by remember { mutableStateOf(existente?.fecha) }
    var hora by remember { mutableStateOf(existente?.hora) }
    var transporte by remember { mutableStateOf(existente?.transporte ?: "") }
    var notas by remember { mutableStateOf(existente?.notas ?: "") }
    var confirmarBorrar by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo(if (existente == null) "Agregar cita" else "Editar cita") }
        item { error?.let { Aviso(it, peligro = true) } }
        item { Campo("¿Con quién es la cita?", especialista, { especialista = it }, ayuda = "Por ejemplo: Oftalmología, Dra. López") }
        item { SelectorFecha("Fecha", fecha, { fecha = it }) }
        item { SelectorHora("Hora", hora, { hora = it }) }
        item { Campo("Lugar (opcional)", lugar, { lugar = it }) }
        item { Campo("Motivo (opcional)", motivo, { motivo = it }) }
        item { Campo("Cómo llegarás (opcional)", transporte, { transporte = it }, ayuda = "Por ejemplo: taxi adaptado, me lleva mi hija") }
        item { Campo("Notas (opcional)", notas, { notas = it }, unaLinea = false) }
        item {
            BotonGrande("Guardar", {
                when {
                    especialista.isBlank() -> error = "Escribe con quién es la cita."
                    fecha == null -> error = "Elige la fecha."
                    hora == null -> error = "Elige la hora."
                    else -> {
                        error = null
                        val body = JSONObject().put("especialista", especialista.trim()).put("fecha", fecha).put("hora", hora).put("lugar", lugar.trim()).put("motivo", motivo.trim()).put("transporte", transporte.trim()).put("notas", notas.trim())
                        vm.guardarCita(existente?.id, body, volver)
                    }
                }
            }, tono = Tono.EXITO)
        }
        item { BotonGrande("Cancelar", volver, tono = Tono.NEUTRO) }
        if (existente != null) item { BotonGrande("Eliminar esta cita", { confirmarBorrar = true }, tono = Tono.PELIGRO, icono = Icons.Filled.Delete) }
    }
    if (confirmarBorrar && existente != null) Confirmar("¿Eliminar la cita con ${existente.especialista}?", "No se puede deshacer.", "Eliminar", { confirmarBorrar = false }) { vm.borrarCita(existente.id, volver) }
}
