package mx.lazo.app

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import mx.lazo.app.ui.*
import org.junit.Assert.assertTrue
import org.junit.Test

/** Los colores llamativos no pueden costar legibilidad: se comprueban los contrastes de verdad. */
class PaletaTest {
    private fun contraste(a: Color, b: Color): Double {
        val (claro, oscuro) = if (a.luminance() >= b.luminance()) a to b else b to a
        return (claro.luminance() + 0.05) / (oscuro.luminance() + 0.05)
    }

    @Test fun elIconoBlancoSobreCadaAcentoSeLeeAl4punto5() {
        for (a in Acento.entries) assertTrue("${a.name}: ${contraste(a.color, Color.White)}", contraste(a.color, Color.White) >= 4.5)
    }

    @Test fun elIconoDeColorSobreElFondoClaroSeVe() {
        for (a in Acento.entries) assertTrue("${a.name} sobre fondo", contraste(a.color, PaletaNormal.fondo) >= 4.5)
        for (a in Acento.entries) assertTrue("${a.name} sobre superficie", contraste(a.color, PaletaNormal.superficie) >= 4.5)
    }

    @Test fun elTextoSigueSuperandoSieteAUno() {
        assertTrue(contraste(PaletaNormal.texto, PaletaNormal.superficie) >= 7.0)
        assertTrue(contraste(PaletaNormal.texto, PaletaNormal.fondo) >= 7.0)
        assertTrue(contraste(PaletaNormal.textoSecundario, PaletaNormal.superficie) >= 7.0)
        assertTrue(contraste(Color.White, Acento.AZUL.color) >= 7.0) // el botón de hablar: blanco sobre el azul de la marca
    }

    @Test fun enAltoContrastoTodoPasaAAmarilloSobreNegro() {
        for (a in Acento.entries) {
            assertTrue(PaletaAltoContraste.acento(a) == Color(0xFFFFE600))
            assertTrue(contraste(PaletaAltoContraste.acento(a), PaletaAltoContraste.fondo) >= 7.0)
            assertTrue(contraste(PaletaAltoContraste.sobreAcento(), PaletaAltoContraste.acento(a)) >= 7.0)
        }
    }

    @Test fun losColoresDeLasMedicionesSonDistintosEntreSi() {
        val acentos = mx.lazo.app.data.TipoMedicion.entries.map { acentoDe(it) }
        assertTrue("cada medición debe tener su propio color", acentos.toSet().size == acentos.size)
    }
}
