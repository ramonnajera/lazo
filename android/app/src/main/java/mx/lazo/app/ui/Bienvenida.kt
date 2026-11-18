package mx.lazo.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import mx.lazo.app.data.Discapacidad

private enum class Paso { ELEGIR, PERSONA, CUIDADOR, DISPOSITIVO }

@Composable
fun Bienvenida(vm: AppViewModel, ui: Ui) {
    var paso by remember { mutableStateOf(Paso.ELEGIR) }
    var servidor by remember { mutableStateOf("") }
    var nombre by remember { mutableStateOf("") }
    var discapacidad by remember { mutableStateOf(Discapacidad.AMBAS) }
    var grande by remember { mutableStateOf(true) }
    var contraste by remember { mutableStateOf(false) }
    var codigo by remember { mutableStateOf("") }
    var parentesco by remember { mutableStateOf("") }
    var dispositivo by remember { mutableStateOf("Mi teléfono") }

    // La persona ve el efecto de sus preferencias desde el primer momento
    LaunchedEffect(grande, contraste) { vm.setEscala(if (grande) 1.4f else 1.0f); vm.setContraste(contraste) }

    LazyColumn(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text1("Lazo", ui) }
        item { MensajeVivo(ui.mensaje, vm::limpiarMensaje) }
        when (paso) {
            Paso.ELEGIR -> {
                item { Cuerpo("Un acompañante para tus medicinas, tus citas y cómo te sientes, que también cuida quien te cuida.") }
                item { BotonGrande("Soy la persona que usará Lazo", { paso = Paso.PERSONA }, icono = Icons.Filled.Person) }
                item { BotonGrande("Soy cuidador o familiar", { paso = Paso.CUIDADOR }, tono = Tono.NEUTRO, icono = Icons.Filled.Group) }
                item { BotonGrande("Ya uso Lazo en otro dispositivo", { paso = Paso.DISPOSITIVO }, tono = Tono.NEUTRO, icono = Icons.Filled.PhoneAndroid) }
                item { Cuerpo("Para empezar necesitas la dirección del servidor de Lazo. Quien lo instaló te la dará.", secundario = true) }
            }
            Paso.PERSONA -> {
                item { Subtitulo("Cuéntanos de ti") }
                item { Campo("Dirección del servidor", servidor, { servidor = it }, ayuda = "Por ejemplo: 192.168.1.5:18800") }
                item { Campo("Tu nombre", nombre, { nombre = it }) }
                item { Subtitulo("¿Qué te cuesta más?") }
                for (d in Discapacidad.entries) item { Ficha(d.texto, discapacidad == d, { discapacidad = d }, Modifier.fillMaxWidth()) }
                item { Interruptor("Letra grande", grande) { grande = it } }
                item { Interruptor("Alto contraste (negro y amarillo)", contraste) { contraste = it } }
                item { BotonGrande(if (ui.cargando) "Conectando…" else "Comenzar", { vm.conectarPersona(servidor, nombre, discapacidad, grande, contraste) }, habilitado = !ui.cargando) }
                item { BotonGrande("Volver", { paso = Paso.ELEGIR }, tono = Tono.NEUTRO) }
            }
            Paso.DISPOSITIVO -> {
                item { Subtitulo("Entra con tu código") }
                item { Cuerpo("En el otro dispositivo abre Lazo → Más → Conexión → «Vincular otro dispositivo». Te dará un código de 6 dígitos.", secundario = true) }
                item { Campo("Dirección del servidor", servidor, { servidor = it }, ayuda = "Por ejemplo: 192.168.1.5:18800") }
                item { Campo("Código de 6 dígitos", codigo, { codigo = it.filter(Char::isDigit).take(6) }, numerico = true) }
                item { Campo("Nombre de este dispositivo", dispositivo, { dispositivo = it }, ayuda = "Por ejemplo: Mi teléfono, Computadora de la sala") }
                item { BotonGrande(if (ui.cargando) "Conectando…" else "Vincular", { vm.conectarDispositivo(servidor, codigo, dispositivo) }, habilitado = !ui.cargando) }
                item { BotonGrande("Volver", { paso = Paso.ELEGIR }, tono = Tono.NEUTRO) }
            }
            Paso.CUIDADOR -> {
                item { Subtitulo("Únete como cuidador") }
                item { Cuerpo("Pídele a la persona que abra Lazo → Más → Mi círculo de cuidado y te dé un código de 6 dígitos.", secundario = true) }
                item { Campo("Dirección del servidor", servidor, { servidor = it }, ayuda = "Por ejemplo: 192.168.1.5:18800") }
                item { Campo("Código de 6 dígitos", codigo, { codigo = it.filter(Char::isDigit).take(6) }, numerico = true) }
                item { Campo("Tu nombre", nombre, { nombre = it }) }
                item { Campo("Parentesco (opcional)", parentesco, { parentesco = it }, ayuda = "Por ejemplo: hija, vecino, enfermera") }
                item { BotonGrande(if (ui.cargando) "Conectando…" else "Unirme", { vm.conectarCuidador(servidor, codigo, nombre, parentesco) }, habilitado = !ui.cargando) }
                item { BotonGrande("Volver", { paso = Paso.ELEGIR }, tono = Tono.NEUTRO) }
            }
        }
    }
}

@Composable
private fun Text1(texto: String, ui: Ui) = Titulo(texto)
