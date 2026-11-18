package mx.lazo.app.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
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
