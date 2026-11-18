package mx.lazo.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import mx.lazo.app.BuildConfig
import mx.lazo.app.data.Rol
import mx.lazo.app.domain.AYUDA_VOZ
import mx.lazo.app.domain.codigoEspaciado
import mx.lazo.app.domain.fechaCorta
import mx.lazo.app.domain.horaCorta

@Composable
fun PantallaMas(ui: Ui, abrir: (Pantalla) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Más") }
        if (ui.rol == Rol.PERSONA) {
            item { BotonGrande("Mi círculo de cuidado", { abrir(Pantalla.Circulo) }, tono = Tono.NEUTRO, icono = Icons.Filled.Group) }
            item { BotonGrande("Apoyos y convocatorias", { abrir(Pantalla.Convocatorias) }, tono = Tono.NEUTRO, icono = Icons.Filled.Campaign) }
            item { BotonGrande("Qué puedo decirle a Lazo", { abrir(Pantalla.Ayuda) }, tono = Tono.NEUTRO, icono = Icons.Filled.Mic) }
        }
        item { BotonGrande("Letra, contraste y voz", { abrir(Pantalla.Accesibilidad) }, tono = Tono.NEUTRO, icono = Icons.Filled.Accessibility) }
        item { BotonGrande("Conexión", { abrir(Pantalla.Conexion) }, tono = Tono.NEUTRO, icono = Icons.Filled.Settings) }
        item { Cuerpo("Lazo ${BuildConfig.VERSION_NAME}. Tus datos están en tu servidor y solo los ve quien tú invites.", secundario = true) }
    }
}

@Composable
fun PantallaCirculo(vm: AppViewModel, ui: Ui) {
    var quitar by remember { mutableStateOf<mx.lazo.app.data.Cuidador?>(null) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Mi círculo de cuidado") }
        item { Cuerpo("Tus cuidadores pueden ver cómo vas con tus medicinas, tus citas y cómo te sientes, pero no pueden cambiar nada.") }
        item { BotonGrande("Invitar a un cuidador", vm::nuevaInvitacion, icono = Icons.Filled.PersonAdd) }
        ui.codigo?.let { c ->
            item {
                TarjetaLegible("Código de invitación: ${codigoEspaciado(c)}. Sirve una sola vez y vence en 24 horas.") {
                    Cuerpo("Díselo a tu cuidador:", secundario = true)
                    Text(codigoEspaciado(c), style = MaterialTheme.typography.displayLarge, color = LocalPaleta.current.texto)
                    Cuerpo("Sirve una sola vez y vence en 24 horas.", secundario = true)
                    BotonGrande("Leer el código en voz alta", { vm.hablar("El código es ${codigoEspaciado(c).replace(" ", ", ")}.") }, tono = Tono.NEUTRO, icono = Icons.Filled.VolumeUp)
                }
            }
        }
        item { Subtitulo("Quién te acompaña") }
        if (ui.cuidadores.isEmpty()) item { Cuerpo("Todavía nadie. Invita a alguien de confianza.", secundario = true) }
        items(ui.cuidadores, key = { it.id }) { c ->
            TarjetaLegible("${c.nombre}${if (c.parentesco.isNotBlank()) ", ${c.parentesco}" else ""}.") {
                Text(c.nombre, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto)
                if (c.parentesco.isNotBlank()) Cuerpo(c.parentesco, secundario = true)
                BotonGrande("Quitar acceso", { quitar = c }, tono = Tono.NEUTRO, descripcion = "Quitar el acceso a ${c.nombre}")
            }
        }
    }
    quitar?.let { c -> Confirmar("¿Quitar el acceso a ${c.nombre}?", "Dejará de ver tu información.", "Quitar acceso", { quitar = null }) { vm.revocar(c) } }
}

@Composable
fun PantallaConvocatorias(vm: AppViewModel, ui: Ui) {
    val ctx = LocalContext.current
    fun abrir(url: String) = try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: Exception) { vm.avisar("No pude abrir el enlace.") }
    val lista = ui.convocatorias
    val nuevas = lista?.nuevas ?: emptySet()
    val paraDiscapacidad = lista?.items?.filter { it.discapacidad } ?: emptyList()
    val otras = lista?.items?.filter { !it.discapacidad } ?: emptyList()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Apoyos y convocatorias") }
        item { Cuerpo("Convocatorias de la Secretaría de Desarrollo Humano y Bien Común del Estado de Chihuahua.") }
        if (ui.rol == Rol.PERSONA) item { BotonGrande(if (ui.cargando) "Actualizando…" else "Buscar convocatorias nuevas", vm::actualizarConvocatorias, icono = Icons.Filled.Refresh, habilitado = !ui.cargando) }
        lista?.error?.let { item { Aviso("No pude actualizar desde la página de la Secretaría ($it). Estás viendo la última lista guardada.") } }
        if (lista == null || lista.items.isEmpty()) item { Cuerpo("Todavía no hay convocatorias guardadas. Pulsa «Buscar convocatorias nuevas» con conexión a internet.", secundario = true) }
        if (paraDiscapacidad.isNotEmpty()) item { Subtitulo("Para personas con discapacidad") }
        items(paraDiscapacidad, key = { it.id }) { c -> TarjetaConvocatoria(c, c.id in nuevas, ::abrir) }
        if (otras.isNotEmpty()) item { Subtitulo("Otras convocatorias") }
        items(otras, key = { it.id }) { c -> TarjetaConvocatoria(c, c.id in nuevas, ::abrir) }
        item {
            Cuerpo("Lazo no inventa fechas: la Secretaría no las publica en esta lista. Abre cada convocatoria para ver los requisitos y la fecha límite.", secundario = true)
            lista?.ultimaLectura?.let { Cuerpo("Última lectura: ${fechaCorta(it.take(10))} ${horaCorta(it.substring(11, 16))}", secundario = true) }
        }
    }
}

@Composable
private fun TarjetaConvocatoria(c: mx.lazo.app.data.Convocatoria, nueva: Boolean, abrir: (String) -> Unit) {
    TarjetaLegible("${if (nueva) "Nueva. " else ""}${c.nombre}. ${c.dependencia}.${if (c.discapacidad) " Para personas con discapacidad." else ""}") {
        if (nueva) Aviso("Nueva")
        Text(c.nombre, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto)
        Cuerpo(c.dependencia, secundario = true)
        BotonGrande(if (c.tipoDocumento == "imagen") "Abrir la convocatoria (imagen)" else "Abrir la convocatoria (PDF)", { abrir(c.documento) }, icono = Icons.Filled.OpenInNew, descripcion = "Abrir la convocatoria ${c.nombre}")
        c.ficha?.let { BotonGrande("Más información", { abrir(it) }, tono = Tono.NEUTRO, descripcion = "Más información de ${c.nombre}") }
    }
}

@Composable
fun PantallaAccesibilidad(vm: AppViewModel, ui: Ui) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Letra, contraste y voz") }
        item { Subtitulo("Tamaño de la letra") }
        item {
            Slider(
                value = ui.escala, onValueChange = vm::setEscala, valueRange = 1f..2f, steps = 9,
                modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp).semantics { contentDescription = "Tamaño de la letra"; stateDescription = "${(ui.escala * 100).toInt()} por ciento" },
            )
            Cuerpo("${(ui.escala * 100).toInt()} %", secundario = true)
        }
        item { Interruptor("Alto contraste (negro y amarillo)", ui.altoContraste, vm::setContraste) }
        item { Interruptor("Que Lazo me hable (avisos y confirmaciones)", ui.voz, vm::setVoz) }
        item { Subtitulo("Velocidad de la voz") }
        item {
            Slider(
                value = ui.velocidad, onValueChange = vm::setVelocidad, valueRange = 0.5f..1.5f, steps = 9,
                modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp).semantics { contentDescription = "Velocidad de la voz"; stateDescription = "${(ui.velocidad * 100).toInt()} por ciento" },
            )
        }
        item { BotonGrande("Probar la voz", { vm.hablar("Hola. Así sonará Lazo cuando sea la hora de tu medicina.") }, icono = Icons.Filled.VolumeUp, tono = Tono.NEUTRO) }
    }
}

@Composable
fun PantallaConexion(vm: AppViewModel, ui: Ui) {
    var cerrar by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Conexión") }
        item {
            Tarjeta {
                Cuerpo("Eres: ${if (ui.rol == Rol.PERSONA) "la persona que usa Lazo" else "cuidador"}")
                Cuerpo("Nombre: ${ui.nombre}", secundario = true)
                Cuerpo(if (ui.sinConexion) "Estado: sin conexión" else "Estado: conectado", secundario = true)
                if (ui.sinEnviar > 0) Cuerpo("Pendientes de enviar: ${ui.sinEnviar}", secundario = true)
            }
        }
        item { BotonGrande("Actualizar ahora", vm::refrescar, icono = Icons.Filled.Refresh, tono = Tono.NEUTRO) }
        if (ui.rol == Rol.PERSONA) {
            item { Subtitulo("Otros dispositivos") }
            item { BotonGrande("Vincular otro dispositivo", vm::nuevaVinculacion, icono = Icons.Filled.PhoneAndroid) }
            ui.codigoVinculo?.let { c ->
                item {
                    TarjetaLegible("Código para vincular otro dispositivo: ${codigoEspaciado(c)}. Sirve una sola vez y vence en 24 horas.") {
                        Cuerpo("Escríbelo en el otro dispositivo:", secundario = true)
                        Text(codigoEspaciado(c), style = MaterialTheme.typography.displayLarge, color = LocalPaleta.current.texto)
                        Cuerpo("Sirve una sola vez y vence en 24 horas.", secundario = true)
                    }
                }
            }
            items(ui.dispositivos, key = { it.id }) { d ->
                TarjetaLegible("Dispositivo con acceso: ${d.nombre}.") {
                    Text(d.nombre, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto)
                    BotonGrande("Quitar acceso", { vm.quitarDispositivo(d) }, tono = Tono.NEUTRO, descripcion = "Quitar el acceso a ${d.nombre}")
                }
            }
        }
        item { BotonGrande("Cerrar sesión en este teléfono", { cerrar = true }, tono = Tono.PELIGRO) }
    }
    if (cerrar) Confirmar("¿Cerrar sesión?", "Este teléfono dejará de avisarte de tus medicinas hasta que vuelvas a conectarlo.", "Cerrar sesión", { cerrar = false }) { vm.cerrarSesion() }
}

@Composable
fun PantallaAyuda(vm: AppViewModel) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("Qué puedo decirle a Lazo") }
        item { Cuerpo("En «Hoy», pulsa «Hablar con Lazo» y di una de estas frases:") }
        for (f in listOf("«Ya la tomé»", "«Pospón diez minutos»", "«Omitir»", "«Qué sigue»", "«Qué tengo hoy»", "«Mis citas»", "«Convocatorias»")) item { Tarjeta { Text(f, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto) } }
        item { BotonGrande("Leer en voz alta", { vm.hablar(AYUDA_VOZ) }, icono = Icons.Filled.VolumeUp, tono = Tono.NEUTRO) }
    }
}
