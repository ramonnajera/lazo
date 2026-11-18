package mx.lazo.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import mx.lazo.app.data.Rol
import mx.lazo.app.data.TipoMedicion

sealed interface Pantalla {
    data object Hoy : Pantalla
    data object Medicinas : Pantalla
    data object Citas : Pantalla
    data object Seguimiento : Pantalla
    data object Mas : Pantalla
    data object Resumen : Pantalla
    data object Alertas : Pantalla
    data object Convocatorias : Pantalla
    data object Circulo : Pantalla
    data object Accesibilidad : Pantalla
    data object Conexion : Pantalla
    data object Ayuda : Pantalla
    data class FormMed(val id: String?) : Pantalla
    data class FormCita(val id: String?) : Pantalla
    data class FormMedicion(val tipo: TipoMedicion) : Pantalla
}

private data class Pestana(val pantalla: Pantalla, val texto: String, val icono: ImageVector)

private val PESTANAS_PERSONA = listOf(
    Pestana(Pantalla.Hoy, "Hoy", Icons.Filled.Today), Pestana(Pantalla.Medicinas, "Medicinas", Icons.Filled.Medication),
    Pestana(Pantalla.Citas, "Citas", Icons.Filled.CalendarMonth), Pestana(Pantalla.Seguimiento, "Salud", Icons.Filled.MonitorHeart),
    Pestana(Pantalla.Mas, "Más", Icons.Filled.MoreHoriz),
)

private val PESTANAS_CUIDADOR = listOf(
    Pestana(Pantalla.Resumen, "Resumen", Icons.Filled.Dashboard), Pestana(Pantalla.Alertas, "Avisos", Icons.Filled.Notifications),
    Pestana(Pantalla.Citas, "Citas", Icons.Filled.CalendarMonth), Pestana(Pantalla.Convocatorias, "Apoyos", Icons.Filled.Campaign),
    Pestana(Pantalla.Mas, "Más", Icons.Filled.MoreHoriz),
)

@Composable
fun LazoRaiz(vm: AppViewModel, escuchar: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LazoTema(ui.altoContraste, ui.escala) {
        Surface(color = LocalPaleta.current.fondo, modifier = Modifier.fillMaxSize()) {
            if (!ui.conectado) Bienvenida(vm, ui) else Principal(vm, ui, escuchar)
        }
    }
}

@Composable
fun Principal(vm: AppViewModel, ui: Ui, escuchar: () -> Unit) {
    val pestanas = if (ui.rol == Rol.CUIDADOR) PESTANAS_CUIDADOR else PESTANAS_PERSONA
    val pila = remember(ui.rol) { mutableStateListOf<Pantalla>(pestanas.first().pantalla) }
    val actual = pila.last()
    BackHandler(enabled = pila.size > 1) { pila.removeAt(pila.lastIndex) }
    fun abrir(p: Pantalla) { if (pestanas.any { it.pantalla == p }) { pila.clear(); pila.add(p) } else pila.add(p) }

    // Una orden por voz puede pedir abrir una pantalla
    LaunchedEffect(ui.destino) {
        if (ui.destino == "convocatorias") { abrir(Pantalla.Convocatorias); vm.consumirDestino() }
    }
    // Mientras la app está a la vista se refresca sola: la persona cada minuto, el cuidador cada 30 s
    val dueno = LocalLifecycleOwner.current
    LaunchedEffect(dueno, ui.rol) {
        dueno.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) { vm.refrescar(); delay(if (ui.rol == Rol.CUIDADOR) 30_000 else 60_000) }
        }
    }

    // Con letra grande una barra de cinco pestañas no cabe: se vuelve un solo botón «Menú» que abre una lista de botones grandes
    val densidad = LocalDensity.current
    val grande = densidad.fontScale >= 1.5f
    var menu by remember { mutableStateOf(false) }
    LaunchedEffect(actual) { menu = false }
    val tituloActual = pestanas.firstOrNull { it.pantalla == actual }?.texto ?: ""

    Scaffold(
        containerColor = LocalPaleta.current.fondo,
        bottomBar = {
            if (pila.size == 1) {
                if (grande) Surface(color = LocalPaleta.current.superficie, border = BorderStroke(2.dp, LocalPaleta.current.borde)) {
                    Box(Modifier.navigationBarsPadding().padding(12.dp)) {
                        BotonGrande(if (menu) "Cerrar el menú" else "Menú · $tituloActual", { menu = !menu }, icono = if (menu) Icons.Filled.Close else Icons.Filled.Menu)
                    }
                } else CompositionLocalProvider(LocalDensity provides Density(densidad.density, 1f)) {
                    NavigationBar(containerColor = LocalPaleta.current.superficie, contentColor = LocalPaleta.current.texto) {
                        for (t in pestanas) NavigationBarItem(
                            selected = actual == t.pantalla, onClick = { abrir(t.pantalla) }, alwaysShowLabel = true,
                            icon = { Icon(t.icono, contentDescription = null, modifier = Modifier.size(30.dp)) },
                            label = { Text(t.texto, style = MaterialTheme.typography.labelMedium.copy(fontSize = 13.sp, letterSpacing = 0.sp), maxLines = 1) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = LocalPaleta.current.sobrePrimario, selectedTextColor = LocalPaleta.current.texto, indicatorColor = LocalPaleta.current.primario,
                                unselectedIconColor = LocalPaleta.current.texto, unselectedTextColor = LocalPaleta.current.texto,
                            ),
                        )
                    }
                }
            }
        },
    ) { relleno ->
        Column(Modifier.padding(relleno).fillMaxSize()) {
            if (ui.sinConexion) Aviso(
                if (ui.sinEnviar > 0) "Sin conexión. Lo que hagas se guardará y se enviará después (${ui.sinEnviar} pendiente${if (ui.sinEnviar == 1) "" else "s"})." else "Sin conexión. Estás viendo lo último que se guardó.",
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            MensajeVivo(ui.mensaje, vm::limpiarMensaje)
            Box(Modifier.weight(1f)) {
                if (menu && grande) MenuGrande(pestanas, actual) { abrir(it) } else when (val p = actual) {
                    Pantalla.Hoy -> PantallaHoy(vm, ui, escuchar, ::abrir)
                    Pantalla.Medicinas -> PantallaMedicinas(ui, ::abrir)
                    is Pantalla.FormMed -> FormMedicamento(vm, ui, p.id) { pila.removeAt(pila.lastIndex) }
                    Pantalla.Citas -> PantallaCitas(ui, ::abrir)
                    is Pantalla.FormCita -> FormCita(vm, ui, p.id) { pila.removeAt(pila.lastIndex) }
                    Pantalla.Seguimiento -> PantallaSeguimiento(vm, ui, ::abrir)
                    is Pantalla.FormMedicion -> FormMedicion(vm, p.tipo) { pila.removeAt(pila.lastIndex) }
                    Pantalla.Mas -> PantallaMas(ui, ::abrir)
                    Pantalla.Resumen -> PantallaResumen(vm, ui)
                    Pantalla.Alertas -> PantallaAlertas(vm, ui)
                    Pantalla.Convocatorias -> PantallaConvocatorias(vm, ui)
                    Pantalla.Circulo -> PantallaCirculo(vm, ui)
                    Pantalla.Accesibilidad -> PantallaAccesibilidad(vm, ui)
                    Pantalla.Conexion -> PantallaConexion(vm, ui)
                    Pantalla.Ayuda -> PantallaAyuda(vm)
                }
            }
        }
    }
}

@Composable
private fun MenuGrande(pestanas: List<Pestana>, actual: Pantalla, ir: (Pantalla) -> Unit) {
    androidx.compose.foundation.lazy.LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Titulo("¿A dónde vamos?") }
        items(pestanas.size) { i -> val t = pestanas[i]; BotonGrande(t.texto, { ir(t.pantalla) }, tono = if (t.pantalla == actual) Tono.PRIMARIO else Tono.NEUTRO, icono = t.icono) }
    }
}
