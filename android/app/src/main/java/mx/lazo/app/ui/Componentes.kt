package mx.lazo.app.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalContext
import mx.lazo.app.R
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import mx.lazo.app.data.Estado
import mx.lazo.app.domain.fechaCorta
import mx.lazo.app.domain.horaCorta
import java.time.LocalDate

/** Áreas táctiles de al menos 64 dp, bordes visibles y texto grande: pensado para baja visión y poca precisión motriz. */
val ALTO_BOTON = 72.dp
private val FORMA = RoundedCornerShape(20.dp)

enum class Tono { PRIMARIO, EXITO, NEUTRO, PELIGRO }

@Composable
fun BotonGrande(texto: String, alPulsar: () -> Unit, modifier: Modifier = Modifier, tono: Tono = Tono.PRIMARIO, icono: ImageVector? = null, habilitado: Boolean = true, descripcion: String? = null) {
    val p = LocalPaleta.current
    val (fondo, tinta) = when (tono) {
        Tono.PRIMARIO -> p.primario to p.sobrePrimario
        Tono.EXITO -> p.exito to p.sobreExito
        Tono.PELIGRO -> p.peligro to (if (p.altoContraste) Color.Black else Color.White)
        Tono.NEUTRO -> p.superficie to p.texto
    }
    Button(
        onClick = alPulsar, enabled = habilitado, shape = FORMA,
        colors = ButtonDefaults.buttonColors(containerColor = fondo, contentColor = tinta, disabledContainerColor = p.fondo, disabledContentColor = p.textoSecundario),
        border = BorderStroke(if (p.altoContraste || tono == Tono.NEUTRO) 3.dp else 0.dp, if (tono == Tono.NEUTRO) p.borde else p.texto),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 14.dp),
        modifier = modifier.fillMaxWidth().heightIn(min = ALTO_BOTON).semantics { role = Role.Button; if (descripcion != null) contentDescription = descripcion },
    ) {
        if (icono != null) { Icon(icono, contentDescription = null, modifier = Modifier.size(32.dp)); Spacer(Modifier.width(12.dp)) }
        Text(texto, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center)
    }
}

@Composable
fun Tarjeta(modifier: Modifier = Modifier, fondo: Color = LocalPaleta.current.superficie, contenido: @Composable ColumnScope.() -> Unit) {
    val p = LocalPaleta.current
    Surface(shape = FORMA, color = fondo, border = BorderStroke(2.dp, p.borde), modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = contenido)
    }
}

/** Una tarjeta que TalkBack lee de una sola vez («Metformina, 8 pm, pendiente») en vez de elemento por elemento. */
@Composable
fun TarjetaLegible(descripcion: String, modifier: Modifier = Modifier, fondo: Color = LocalPaleta.current.superficie, contenido: @Composable ColumnScope.() -> Unit) =
    Tarjeta(modifier.semantics(mergeDescendants = true) { contentDescription = descripcion }, fondo, contenido)

@Composable
fun Titulo(texto: String, modifier: Modifier = Modifier) =
    Text(texto, style = MaterialTheme.typography.headlineMedium, color = LocalPaleta.current.texto, modifier = modifier.semantics { heading() })

@Composable
fun Subtitulo(texto: String, modifier: Modifier = Modifier) =
    Text(texto, style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto, modifier = modifier.semantics { heading() })

@Composable
fun Cuerpo(texto: String, modifier: Modifier = Modifier, secundario: Boolean = false) =
    Text(texto, style = MaterialTheme.typography.bodyLarge, color = if (secundario) LocalPaleta.current.textoSecundario else LocalPaleta.current.texto, modifier = modifier)

/** Estado de una toma: ícono + texto + color. Nunca solo color. */
@Composable
fun EtiquetaEstado(estado: Estado, texto: String, modifier: Modifier = Modifier) {
    val p = LocalPaleta.current
    val (icono, fondo, tinta) = when (estado) {
        Estado.TOMADA -> Triple(Icons.Filled.CheckCircle, p.exito, p.sobreExito)
        Estado.ATRASADA -> Triple(Icons.Filled.Warning, p.peligro, if (p.altoContraste) Color.Black else Color.White)
        Estado.AHORA -> Triple(Icons.Filled.Notifications, p.primario, p.sobrePrimario)
        Estado.OMITIDA -> Triple(Icons.Filled.Cancel, p.textoSecundario, p.fondo)
        Estado.POSPUESTA -> Triple(Icons.Filled.Snooze, p.aviso, if (p.altoContraste) Color.Black else Color.White)
        Estado.PENDIENTE -> Triple(Icons.Filled.Schedule, p.superficie, p.texto)
    }
    Surface(shape = RoundedCornerShape(50), color = fondo, contentColor = tinta, border = BorderStroke(2.dp, p.borde), modifier = modifier) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icono, contentDescription = null, modifier = Modifier.size(22.dp))
            Text(texto, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
fun Aviso(texto: String, peligro: Boolean = false, modifier: Modifier = Modifier) {
    val p = LocalPaleta.current
    Surface(shape = RoundedCornerShape(16.dp), color = if (peligro) p.fondoPeligro else p.fondoAviso, border = BorderStroke(2.dp, if (peligro) p.peligro else p.aviso), modifier = modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (peligro) Icons.Filled.Error else Icons.Filled.Info, contentDescription = null, tint = if (peligro) p.peligro else p.aviso, modifier = Modifier.size(28.dp))
            Text(texto, style = MaterialTheme.typography.bodyLarge, color = p.texto)
        }
    }
}

/** Mensaje que TalkBack anuncia solo al aparecer. */
@Composable
fun MensajeVivo(texto: String?, alCerrar: () -> Unit) {
    if (texto == null) return
    // El aviso se anuncia al instante (TalkBack) y se quita solo a los 8 s; «Entendido» lo cierra antes.
    LaunchedEffect(texto) { kotlinx.coroutines.delay(8_000); alCerrar() }
    Column(Modifier.semantics { liveRegion = LiveRegionMode.Assertive }) {
        Aviso(texto)
        TextButton(onClick = alCerrar, modifier = Modifier.heightIn(min = 56.dp)) { Text("Entendido", style = MaterialTheme.typography.labelLarge) }
    }
}

@Composable
fun Campo(etiqueta: String, valor: String, alCambiar: (String) -> Unit, modifier: Modifier = Modifier, ayuda: String? = null, numerico: Boolean = false, unaLinea: Boolean = true) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(etiqueta, style = MaterialTheme.typography.titleMedium, color = LocalPaleta.current.texto)
        OutlinedTextField(
            value = valor, onValueChange = alCambiar, singleLine = unaLinea, modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp).semantics { contentDescription = etiqueta },
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = LocalPaleta.current.texto),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = if (numerico) androidx.compose.ui.text.input.KeyboardType.Number else androidx.compose.ui.text.input.KeyboardType.Text),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = LocalPaleta.current.primario, unfocusedBorderColor = LocalPaleta.current.borde),
            shape = RoundedCornerShape(16.dp),
        )
        if (ayuda != null) Text(ayuda, style = MaterialTheme.typography.bodyMedium, color = LocalPaleta.current.textoSecundario)
    }
}

/** Hora con el selector del sistema (TalkBack y el teclado ya lo manejan bien). `valor` en «HH:MM». */
@Composable
fun SelectorHora(etiqueta: String, valor: String?, alElegir: (String) -> Unit, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    BotonGrande(
        texto = "$etiqueta: ${valor?.let { horaCorta(it) } ?: "elegir"}", icono = Icons.Filled.Schedule, tono = Tono.NEUTRO, modifier = modifier,
        alPulsar = {
            val (h, m) = (valor ?: "08:00").split(":").map { it.toInt() }
            TimePickerDialog(ctx, { _, hh, mm -> alElegir("%02d:%02d".format(hh, mm)) }, h, m, false).show()
        },
    )
}

@Composable
fun SelectorFecha(etiqueta: String, valor: String?, alElegir: (String) -> Unit, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    BotonGrande(
        texto = "$etiqueta: ${valor?.let { fechaCorta(it) } ?: "elegir"}", icono = Icons.Filled.CalendarMonth, tono = Tono.NEUTRO, modifier = modifier,
        alPulsar = {
            val f = valor?.let { LocalDate.parse(it) } ?: LocalDate.now()
            DatePickerDialog(ctx, { _, y, m, d -> alElegir(LocalDate.of(y, m + 1, d).toString()) }, f.year, f.monthValue - 1, f.dayOfMonth).show()
        },
    )
}

/** Fila completa que se activa con un toque (TalkBack la anuncia como interruptor con su estado). */
@Composable
fun Interruptor(etiqueta: String, valor: Boolean, alCambiar: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = ALTO_BOTON).toggleable(value = valor, role = Role.Switch, onValueChange = alCambiar),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(etiqueta, style = MaterialTheme.typography.titleMedium, color = LocalPaleta.current.texto, modifier = Modifier.weight(1f))
        Switch(checked = valor, onCheckedChange = null, modifier = Modifier.padding(start = 12.dp))
    }
}

/** Opción de una lista (días de la semana, niveles): grande, con borde y marca visible, anunciada como casilla. */
@Composable
fun Ficha(texto: String, seleccionada: Boolean, alCambiar: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPaleta.current
    Surface(
        shape = RoundedCornerShape(16.dp), color = if (seleccionada) p.primario else p.superficie, contentColor = if (seleccionada) p.sobrePrimario else p.texto,
        border = BorderStroke(if (seleccionada) 3.dp else 2.dp, p.borde),
        modifier = modifier.heightIn(min = 60.dp).toggleable(value = seleccionada, role = Role.Checkbox, onValueChange = alCambiar),
    ) {
        Row(Modifier.padding(horizontal = 18.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            if (seleccionada) { Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(24.dp)); Spacer(Modifier.width(8.dp)) }
            Text(texto, style = MaterialTheme.typography.labelLarge)
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Color con significado: un chip de ícono por tema, filas de acción y el botón de hablar con Lazo.

/** Círculo de color con el ícono en blanco (negro sobre amarillo en alto contraste). Solo decora: el texto siempre va al lado. */
@Composable
fun IconoChip(icono: ImageVector, acento: Acento, modifier: Modifier = Modifier, tam: androidx.compose.ui.unit.Dp = 48.dp) {
    val p = LocalPaleta.current
    Box(modifier.size(tam).clip(androidx.compose.foundation.shape.CircleShape).background(p.acento(acento)), contentAlignment = Alignment.Center) {
        Icon(icono, contentDescription = null, tint = p.sobreAcento(), modifier = Modifier.size(tam * 0.58f))
    }
}

/** La marca de Lazo: el lazo blanco sobre el azul de la app (el mismo dibujo del ícono de la aplicación). */
@Composable
fun LogoLazo(modifier: Modifier = Modifier, tam: androidx.compose.ui.unit.Dp = 48.dp) {
    val p = LocalPaleta.current
    Box(modifier.size(tam).clip(RoundedCornerShape(tam * 0.23f)).background(p.acento(Acento.AZUL)).semantics { contentDescription = "Lazo" }, contentAlignment = Alignment.Center) {
        Image(painterResource(R.drawable.ic_launcher_foreground), contentDescription = null, modifier = Modifier.size(tam * 1.0f), colorFilter = if (p.altoContraste) androidx.compose.ui.graphics.ColorFilter.tint(Color.Black) else null)
    }
}

/** Fila de acción: chip de color + texto a la izquierda + flecha. Texto oscuro sobre blanco (≥ 7:1); el color va en el chip y el borde. */
@Composable
fun FilaAccion(texto: String, icono: ImageVector, acento: Acento, alPulsar: () -> Unit, modifier: Modifier = Modifier, detalle: String? = null, descripcion: String? = null) {
    val p = LocalPaleta.current
    Surface(
        onClick = alPulsar, shape = FORMA, color = p.superficie, border = BorderStroke(if (p.altoContraste) 3.dp else 2.dp, if (p.altoContraste) p.texto else p.acento(acento)),
        modifier = modifier.fillMaxWidth().heightIn(min = ALTO_BOTON).semantics { role = Role.Button; if (descripcion != null) contentDescription = descripcion },
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            IconoChip(icono, acento)
            Column(Modifier.weight(1f)) {
                Text(texto, style = MaterialTheme.typography.labelLarge, color = p.texto)
                if (detalle != null) Text(detalle, style = MaterialTheme.typography.bodyMedium, color = p.textoSecundario)
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = p.textoSecundario, modifier = Modifier.size(28.dp))
        }
    }
}

/** El botón principal de la app: hablar con Lazo. Grande, azul, con el micrófono bien a la vista. */
@Composable
fun BotonHablar(alPulsar: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPaleta.current
    Surface(
        onClick = alPulsar, shape = FORMA, color = p.acento(Acento.AZUL).let { if (p.altoContraste) p.primario else it }, contentColor = if (p.altoContraste) p.sobrePrimario else Color.White,
        border = if (p.altoContraste) BorderStroke(3.dp, p.texto) else null,
        modifier = modifier.fillMaxWidth().heightIn(min = 88.dp).semantics { role = Role.Button; contentDescription = "Hablar con Lazo. Pulsa y dime qué necesitas: por ejemplo, ya la tomé, qué sigue, o mis citas." },
    ) {
        Row(Modifier.padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(Modifier.size(56.dp).clip(androidx.compose.foundation.shape.CircleShape).background(if (p.altoContraste) p.sobrePrimario else Color.White), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Mic, contentDescription = null, tint = if (p.altoContraste) p.primario else p.acento(Acento.AZUL), modifier = Modifier.size(34.dp))
            }
            Column(Modifier.weight(1f)) {
                Text("Hablar con Lazo", style = MaterialTheme.typography.titleLarge)
                Text("Pregunta o di «ya la tomé»", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

/** Botón flotante de hablar, siempre a la mano en las pestañas principales. */
@Composable
fun FabHablar(alPulsar: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPaleta.current
    ExtendedFloatingActionButton(
        onClick = alPulsar, modifier = modifier.heightIn(min = 64.dp).semantics { contentDescription = "Hablar con Lazo" },
        containerColor = if (p.altoContraste) p.primario else p.acento(Acento.AZUL), contentColor = if (p.altoContraste) p.sobrePrimario else Color.White,
        icon = { Icon(Icons.Filled.Mic, contentDescription = null, modifier = Modifier.size(30.dp)) },
        text = { Text("Hablar", style = MaterialTheme.typography.labelLarge) },
    )
}

/** Margen de las pantallas con pestañas: deja sitio abajo para el botón flotante de hablar. */
val RellenoPantalla = PaddingValues(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 104.dp)
