package mx.lazo.app.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

private val SUGERENCIAS = listOf("¿Qué sigue?", "¿Qué tengo hoy?", "Mis citas", "Ya la tomé", "Convocatorias", "Ayuda")

/**
 * Conversación con Lazo, como el chat de Alice: se habla (un toque para empezar, otro para enviar), se escribe o se
 * toca una frase sugerida. Lazo responde por escrito y en voz alta. Cada mensaje dice quién habla con texto, no solo con color.
 */
@Composable
fun PantallaChat(vm: AppViewModel, ui: Ui) {
    val contexto = LocalContext.current
    val permiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) vm.empezarGrabacion() else vm.avisar("Sin el permiso del micrófono no puedo escucharte. Actívalo en los ajustes del teléfono, o escribe tu orden.")
    }
    fun alternarMicrofono() {
        when {
            ui.grabando -> vm.terminarGrabacion()
            ContextCompat.checkSelfPermission(contexto, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED -> vm.empezarGrabacion()
            else -> permiso.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
    DisposableEffect(Unit) { onDispose { vm.cancelarGrabacion() } }

    var texto by remember { mutableStateOf("") }
    val lista = rememberLazyListState()
    LaunchedEffect(ui.chat.size, ui.chatOcupado) { if (ui.chat.isNotEmpty()) lista.animateScrollToItem(lista.layoutInfo.totalItemsCount.coerceAtLeast(1) - 1) }

    Column(Modifier.fillMaxSize().imePadding()) {
        LazyColumn(Modifier.weight(1f), state = lista, contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Titulo("Hablar con Lazo") }
            item { Burbuja(MensajeChat(false, "Hola${if (ui.nombre.isNotBlank()) ", ${ui.nombre.substringBefore(' ')}" else ""}. Pulsa el micrófono y dime qué necesitas, o escribe. Por ejemplo: «¿qué sigue?» o «ya la tomé».")) }
            items(ui.chat) { Burbuja(it) }
            if (ui.chatOcupado) item { Cuerpo("Lazo está pensando su respuesta…", secundario = true, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        }
        LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(SUGERENCIAS) { s -> Sugerencia(s, habilitada = !ui.chatOcupado) { vm.enviarAlChat(s) } }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = texto, onValueChange = { texto = it.take(300) }, modifier = Modifier.weight(1f).heightIn(min = 64.dp).semantics { contentDescription = "Escribe tu orden para Lazo" },
                placeholder = { Text("Escribe aquí") }, singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { vm.enviarAlChat(texto); texto = "" }),
            )
            FilledIconButton(
                onClick = { vm.enviarAlChat(texto); texto = "" }, enabled = texto.isNotBlank() && !ui.chatOcupado,
                modifier = Modifier.size(64.dp).semantics { contentDescription = "Enviar mensaje" },
            ) { Icon(Icons.Filled.Send, contentDescription = null) }
        }
        BotonGrande(
            if (ui.grabando) "Te escucho… pulsa para enviar" else "Pulsa para hablar", ::alternarMicrofono,
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 12.dp),
            tono = if (ui.grabando) Tono.PELIGRO else Tono.PRIMARIO, icono = if (ui.grabando) Icons.Filled.Stop else Icons.Filled.Mic,
            habilitado = !ui.chatOcupado,
            descripcion = if (ui.grabando) "Estoy grabando. Pulsa para enviar tu mensaje a Lazo." else "Pulsa para empezar a hablar con Lazo. Vuelve a pulsar cuando termines.",
        )
    }
}

/** Frase sugerida: un botón (TalkBack la anuncia como botón, no como casilla), grande y con borde. */
@Composable
private fun Sugerencia(texto: String, habilitada: Boolean, alPulsar: () -> Unit) {
    val p = LocalPaleta.current
    Surface(
        onClick = alPulsar, enabled = habilitada, shape = RoundedCornerShape(16.dp), color = p.superficie, contentColor = p.texto, border = BorderStroke(2.dp, p.borde),
        modifier = Modifier.heightIn(min = 64.dp).semantics { role = Role.Button; contentDescription = "Decir: $texto" },
    ) {
        Box(Modifier.padding(horizontal = 18.dp, vertical = 12.dp), contentAlignment = Alignment.Center) { Text(texto, style = MaterialTheme.typography.labelLarge) }
    }
}

@Composable
fun Burbuja(m: MensajeChat) {
    val p = LocalPaleta.current
    val quien = if (m.delUsuario) "Tú" else "Lazo"
    val descripcion = "$quien dice: ${m.texto}"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (m.delUsuario) Arrangement.End else Arrangement.Start) {
        Surface(
            color = when { m.error -> p.fondoPeligro; m.delUsuario -> p.primario; else -> p.superficie },
            contentColor = when { m.error -> p.peligro; m.delUsuario -> p.sobrePrimario; else -> p.texto },
            shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, p.borde),
            modifier = Modifier.widthIn(max = 320.dp).semantics(mergeDescendants = true) { contentDescription = descripcion },
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(if (m.delUsuario && m.audio) "Tú (por voz)" else quien, style = MaterialTheme.typography.labelLarge)
                Text(m.texto, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}
