package mx.lazo.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sos
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import mx.lazo.app.domain.textoAyudaEnviada
import mx.lazo.app.domain.textoAyudaFallida

/** Abre el marcador con el 911 escrito (ACTION_DIAL: no necesita permiso de llamada; la persona solo pulsa «llamar»). */
fun llamar911(context: Context): Boolean = try {
    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:911")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
} catch (e: Exception) { false }

/**
 * «Necesito ayuda» en Hoy. Rojo y a la vista, pero un toque accidental no avisa a nadie: el primer toque abre una
 * confirmación y el «Sí» queda más abajo que el botón original, así que un doble toque tampoco lo confirma.
 */
@Composable
fun PanelAyuda(vm: AppViewModel, ui: Ui, abrir: (Pantalla) -> Unit) {
    val ctx = LocalContext.current
    fun llamar() { if (!llamar911(ctx)) vm.avisar("No pude abrir el teléfono. Marca el 911 desde tu teléfono.") }
    when (val e = ui.ayuda) {
        EstadoAyuda.Inactiva -> BotonGrande(
            "Necesito ayuda", vm::pedirAyuda, tono = Tono.PELIGRO, icono = Icons.Filled.Sos,
            descripcion = "Necesito ayuda. Avisa a tus cuidadores; antes te pedirá confirmar.",
        )
        EstadoAyuda.Confirmando -> CajaAyuda {
            Subtitulo("¿Aviso a tus cuidadores?")
            Cuerpo("Les llegará un aviso urgente de que necesitas ayuda.")
            BotonGrande("Sí, avisar a mis cuidadores", { vm.confirmarAyuda() }, Modifier.heightIn(min = 88.dp), tono = Tono.PELIGRO, icono = Icons.Filled.Sos)
            BotonGrande("No, cancelar", vm::cancelarAyuda, tono = Tono.NEUTRO, icono = Icons.Filled.Close)
        }
        EstadoAyuda.Enviando -> CajaAyuda { Subtitulo("Avisando a tus cuidadores…") }
        is EstadoAyuda.Enviada -> CajaAyuda {
            Text(textoAyudaEnviada(e.cuidadores), style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
            BotonGrande("Llamar al 911", ::llamar, tono = Tono.PELIGRO, icono = Icons.Filled.Call, descripcion = "Llamar al 911. Abre el teléfono con el número escrito.")
            if (e.cuidadores == 0) BotonGrande("Invitar a un cuidador", { vm.cancelarAyuda(); abrir(Pantalla.Circulo) }, icono = Icons.Filled.PersonAdd)
            BotonGrande("Listo", vm::cancelarAyuda, tono = Tono.NEUTRO)
        }
        is EstadoAyuda.Fallida -> CajaAyuda {
            Text(textoAyudaFallida(e.sinConexion), style = MaterialTheme.typography.titleLarge, color = LocalPaleta.current.texto, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
            BotonGrande("Llamar al 911", ::llamar, tono = Tono.PELIGRO, icono = Icons.Filled.Call, descripcion = "Llamar al 911. Abre el teléfono con el número escrito.")
            BotonGrande("Intentar avisar otra vez", { vm.cancelarAyuda(); vm.pedirAyuda(); vm.confirmarAyuda() }, tono = Tono.NEUTRO, icono = Icons.Filled.Refresh)
            BotonGrande("Cerrar", vm::cancelarAyuda, tono = Tono.NEUTRO)
        }
    }
}

@Composable
private fun CajaAyuda(contenido: @Composable ColumnScope.() -> Unit) {
    val p = LocalPaleta.current
    Surface(shape = RoundedCornerShape(20.dp), color = p.fondoPeligro, border = BorderStroke(3.dp, p.peligro), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp), content = contenido)
    }
}
