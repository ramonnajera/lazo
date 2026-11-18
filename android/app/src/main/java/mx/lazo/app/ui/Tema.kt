package mx.lazo.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp

/**
 * Colores de Lazo. Todos los pares texto/fondo superan 7:1 (WCAG AAA). Y nada se comunica solo con color:
 * cada estado lleva además un texto y un ícono.
 */
@Immutable
data class Paleta(
    val fondo: Color, val superficie: Color, val texto: Color, val textoSecundario: Color, val borde: Color,
    val primario: Color, val sobrePrimario: Color, val exito: Color, val sobreExito: Color,
    val aviso: Color, val fondoAviso: Color, val peligro: Color, val fondoPeligro: Color, val altoContraste: Boolean,
)

val PaletaNormal = Paleta(
    fondo = Color(0xFFF4F6FA), superficie = Color(0xFFFFFFFF), texto = Color(0xFF0B1220), textoSecundario = Color(0xFF3B4658), borde = Color(0xFF8A94A6),
    primario = Color(0xFF0B3D91), sobrePrimario = Color(0xFFFFFFFF), exito = Color(0xFF065F2C), sobreExito = Color(0xFFFFFFFF),
    aviso = Color(0xFF6B3A00), fondoAviso = Color(0xFFFFF1D6), peligro = Color(0xFF8F1313), fondoPeligro = Color(0xFFFFE3E3), altoContraste = false,
)

val PaletaAltoContraste = Paleta(
    fondo = Color(0xFF000000), superficie = Color(0xFF000000), texto = Color(0xFFFFFFFF), textoSecundario = Color(0xFFE8E8E8), borde = Color(0xFFFFFFFF),
    primario = Color(0xFFFFE600), sobrePrimario = Color(0xFF000000), exito = Color(0xFF00FF7F), sobreExito = Color(0xFF000000),
    aviso = Color(0xFFFFD166), fondoAviso = Color(0xFF000000), peligro = Color(0xFFFF8A8A), fondoPeligro = Color(0xFF000000), altoContraste = true,
)

val LocalPaleta = staticCompositionLocalOf { PaletaNormal }

private fun esquema(p: Paleta): ColorScheme {
    val base = if (p.altoContraste) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = p.primario, onPrimary = p.sobrePrimario, background = p.fondo, onBackground = p.texto, surface = p.superficie, onSurface = p.texto,
        onSurfaceVariant = p.textoSecundario, outline = p.borde, error = p.peligro, secondaryContainer = p.primario, onSecondaryContainer = p.sobrePrimario,
        surfaceVariant = p.fondo, surfaceContainer = p.superficie,
    )
}

private val Tipos = Typography(
    displayLarge = TextStyle(fontSize = 40.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 46.sp),
    headlineLarge = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold, lineHeight = 38.sp),
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, lineHeight = 34.sp),
    titleLarge = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp),
    titleMedium = TextStyle(fontSize = 21.sp, fontWeight = FontWeight.SemiBold, lineHeight = 27.sp),
    bodyLarge = TextStyle(fontSize = 20.sp, lineHeight = 28.sp),
    bodyMedium = TextStyle(fontSize = 18.sp, lineHeight = 25.sp),
    labelLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold, lineHeight = 26.sp),
    labelMedium = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp),
)

/** `escala`: el factor de texto que eligió la persona, sobre el del sistema (tope: 2.2 en total). */
@Composable
fun LazoTema(altoContraste: Boolean, escala: Float, contenido: @Composable () -> Unit) {
    val paleta = if (altoContraste) PaletaAltoContraste else PaletaNormal
    val d = LocalDensity.current
    val densidad = Density(d.density, (d.fontScale * escala).coerceIn(1f, 2.2f))
    CompositionLocalProvider(LocalPaleta provides paleta, LocalDensity provides densidad) {
        MaterialTheme(colorScheme = esquema(paleta), typography = Tipos, content = contenido)
    }
}
