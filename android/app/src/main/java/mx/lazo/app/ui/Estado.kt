package mx.lazo.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mx.lazo.app.alarm.Alarmas
import mx.lazo.app.alarm.AlertasJobService
import mx.lazo.app.alarm.Notificaciones
import mx.lazo.app.alarm.RecordatoriosCitas
import mx.lazo.app.alarm.Sincronizacion
import mx.lazo.app.data.*
import mx.lazo.app.domain.*
import mx.lazo.app.speech.Grabadora
import mx.lazo.app.speech.Voz
import org.json.JSONArray
import org.json.JSONObject

data class Ui(
    val rol: Rol? = null, val nombre: String = "", val perfil: Perfil? = null,
    val medicamentos: List<Medicamento> = emptyList(), val tomas: List<Dosis> = emptyList(), val proxima: Dosis? = null,
    val hoy: String = "", val citas: List<Cita> = emptyList(), val mediciones: List<Medicion> = emptyList(), val alertas: List<Alerta> = emptyList(),
    val resumen: Resumen? = null, val convocatorias: ListaConvocatorias? = null, val cuidadores: List<Cuidador> = emptyList(), val codigo: String? = null, val codigoVinculo: String? = null, val dispositivos: List<Cuidador> = emptyList(),
    val cargando: Boolean = false, val mensaje: String? = null, val sinConexion: Boolean = false, val sinEnviar: Int = 0, val destino: String? = null,
    val escala: Float = 1.25f, val altoContraste: Boolean = false, val voz: Boolean = true, val velocidad: Float = 0.9f,
    val chat: List<MensajeChat> = emptyList(), val chatOcupado: Boolean = false, val grabando: Boolean = false, val guardando: Boolean = false,
    val ayuda: EstadoAyuda = EstadoAyuda.Inactiva, val resurtir: Map<String, Resurtir> = emptyMap(),
) {
    val conectado get() = rol != null
}

/** Los pasos de «Necesito ayuda»: pedirlo, confirmarlo con un segundo toque, enviarlo y decir qué pasó. */
sealed interface EstadoAyuda {
    data object Inactiva : EstadoAyuda
    data object Confirmando : EstadoAyuda
    data object Enviando : EstadoAyuda
    data class Enviada(val cuidadores: Int) : EstadoAyuda
    data class Fallida(val sinConexion: Boolean) : EstadoAyuda
}

/** Un mensaje de la conversación con Lazo. `delUsuario` distingue quién habla sin depender solo del color. */
data class MensajeChat(val delUsuario: Boolean, val texto: String, val error: Boolean = false, val audio: Boolean = false)

/** Un solo lugar para el estado de la app: abre al instante con lo guardado, refresca, y no pierde nada sin conexión. */
class AppViewModel(private val app: Application) : AndroidViewModel(app) {
    private val prefs = Prefs.de(app)
    private val cache = Cache(app)
    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()
    private val voz by lazy { Voz(app, { prefs.velocidadVoz }) }
    private val grabadora by lazy { Grabadora(app) }

    init {
        _ui.update { it.copy(rol = if (prefs.conectado) prefs.rol else null, nombre = prefs.nombre, hoy = hoyIso(), escala = prefs.escalaTexto, altoContraste = prefs.altoContraste, voz = prefs.voz, velocidad = prefs.velocidadVoz) }
        if (prefs.conectado) { cargarCache(); refrescar() }
    }

    private fun api() = LazoApi(prefs.servidor, prefs.token)
    private var ultimoError: String? = null

    // ---------- caché ----------
    private fun <T> JSONObject?.lista(clave: String, f: (JSONObject) -> T): List<T> = this?.optJSONArray(clave)?.let { a -> (0 until a.length()).map { f(a.getJSONObject(it)) } } ?: emptyList()

    private fun cargarCache() {
        val tomas = aplicarLocal(cache.read("tomas").lista("tomas", Dosis::de))
        _ui.update {
            it.copy(
                perfil = cache.read("perfil")?.optJSONObject("perfil")?.let(Perfil::de), medicamentos = cache.read("medicamentos").lista("medicamentos", Medicamento::de),
                tomas = tomas, proxima = proximaDe(cache.read("proxima")?.optJSONObject("dosis")?.let(Dosis::de), tomas), citas = cache.read("citas").lista("citas", Cita::de),
                mediciones = cache.read("mediciones").lista("mediciones", Medicion::de), alertas = cache.read("alertas").lista("alertas", Alerta::de),
                resumen = cache.read("resumen")?.let(Resumen::de), convocatorias = cache.read("convocatorias")?.let(ListaConvocatorias::de),
                sinEnviar = prefs.cola().size,
                resurtir = cache.read("resurtir").lista("medicamentos", Resurtir::de).associateBy { it.id },
                cuidadores = cache.read("circulo").lista("cuidadores") { c -> Cuidador(c.getString("id"), c.getString("nombre"), c.optString("parentesco")) },
                dispositivos = cache.read("dispositivos").lista("dispositivos") { c -> Cuidador(c.getString("id"), c.getString("nombre"), "") },
            )
        }
    }

    /** Lo que la persona ya resolvió en este teléfono manda sobre una respuesta vieja. */
    private fun aplicarLocal(tomas: List<Dosis>): List<Dosis> {
        val resueltas = prefs.resueltas()
        return tomas.map { if (it.clave in resueltas && it.estado != Estado.TOMADA && it.estado != Estado.OMITIDA) it.copy(estado = Estado.TOMADA) else it }
    }

    private fun proximaDe(servidor: Dosis?, tomas: List<Dosis>): Dosis? {
        val local = tomas.firstOrNull { it.estado.requiereAtencion } ?: tomas.firstOrNull { it.estado == Estado.PENDIENTE || it.estado == Estado.POSPUESTA }
        return if (servidor != null && servidor.clave !in prefs.resueltas()) servidor else local ?: servidor?.takeIf { it.clave !in prefs.resueltas() }
    }

    // ---------- refrescar ----------
    fun refrescar() {
        if (!prefs.conectado) return
        viewModelScope.launch {
            _ui.update { it.copy(cargando = true, hoy = hoyIso()) }
            withContext(Dispatchers.IO) { runCatching { Sincronizacion.vaciarCola(app) } }
            var sinRed = false
            var error: String? = null
            suspend fun pedir(clave: String, llamada: suspend () -> JSONObject): JSONObject? = try {
                llamada().also { cache.write(clave, it) }
            } catch (e: ApiException) {
                if (e.codigo == 0) sinRed = true else if (error == null) error = e.message
                null
            }
            coroutineScope {
                val a = api()
                val persona = prefs.rol == Rol.PERSONA
                val perfil = async { pedir("perfil") { a.perfil() } }
                val citas = async { pedir("citas") { a.citas() } }
                val alertas = async { pedir("alertas") { a.alertas() } }
                val conv = async { pedir("convocatorias") { a.convocatorias() } }
                val meds = async { if (persona) pedir("medicamentos") { a.medicamentos() } else null }
                val tomas = async { if (persona) pedir("tomas") { a.tomas() } else null }
                val prox = async { if (persona) pedir("proxima") { a.proxima() } else null }
                val meds2 = async { if (persona) pedir("mediciones") { a.mediciones() } else null }
                val res = async { if (!persona) pedir("resumen") { a.resumen() } else null }
                val cir = async { if (persona) pedir("circulo") { a.circulo() } else null }
                val disp = async { if (persona) pedir("dispositivos") { a.dispositivos() } else null }
                val resurtir = async { if (persona) pedir("resurtir") { a.resurtir() } else null }
                listOf(perfil, citas, alertas, conv, meds, tomas, prox, meds2, res, cir, disp, resurtir).forEach { it.await() }
            }
            cargarCache()
            // Un error que no cambia (p. ej. el servidor caído) se muestra una vez, no cada minuto que la app se refresca sola
            val nuevoError = error?.takeIf { it != ultimoError }
            ultimoError = error
            _ui.update { it.copy(cargando = false, sinConexion = sinRed, mensaje = nuevoError ?: it.mensaje, sinEnviar = prefs.cola().size, hoy = hoyIso()) }
            if (prefs.rol == Rol.PERSONA) Alarmas.reprogramar(app)
            RecordatoriosCitas.reprogramar(app)
            // El cuidador con la app abierta se entera de un pedido de ayuda al instante (sin esperar al trabajo de cada 15 min)
            if (prefs.rol == Rol.CUIDADOR) AlertasJobService.notificar(app, Rol.CUIDADOR, _ui.value.alertas, soloAyuda = true)
        }
    }

    // ---------- conectar ----------
    fun conectarPersona(servidor: String, nombre: String, discapacidad: Discapacidad, textoGrande: Boolean, altoContraste: Boolean) {
        val url = normalizarUrl(servidor) ?: return avisar("La dirección del servidor no es válida. Revisa las opciones avanzadas.")
        if (nombre.isBlank()) return avisar("Escribe tu nombre.")
        viewModelScope.launch {
            _ui.update { it.copy(cargando = true, mensaje = null) }
            try {
                val r = LazoApi(url).crearPerfil(nombre.trim(), discapacidad, textoGrande, altoContraste)
                cancelarAlarmasYBorrar(app); cache.clear()
                prefs.servidor = url; prefs.token = r.getString("token"); prefs.nombre = nombre.trim(); prefs.rol = Rol.PERSONA
                prefs.escalaTexto = if (textoGrande) 1.4f else 1.0f; prefs.altoContraste = altoContraste
                _ui.update { it.copy(rol = Rol.PERSONA, nombre = nombre.trim(), escala = prefs.escalaTexto, altoContraste = altoContraste, cargando = false, mensaje = null) }
                AlertasJobService.programar(app)
                refrescar()
            } catch (e: ApiException) {
                _ui.update { it.copy(cargando = false, mensaje = when (e.codigo) { 409 -> "Este servidor es de una sola persona. Si eres cuidador, elige «Soy cuidador»."; 503 -> "Este servidor ya no admite más personas."; 429 -> "Hay demasiados registros en este momento. Intenta en unos minutos."; else -> e.message }) }
            }
        }
    }

    fun conectarCuidador(servidor: String, codigo: String, nombre: String, parentesco: String) {
        val url = normalizarUrl(servidor) ?: return avisar("La dirección del servidor no es válida. Revisa las opciones avanzadas.")
        if (codigo.length != 6 || nombre.isBlank()) return avisar("Escribe el código de 6 dígitos y tu nombre.")
        viewModelScope.launch {
            _ui.update { it.copy(cargando = true, mensaje = null) }
            try {
                val r = LazoApi(url).unirse(codigo, nombre.trim(), parentesco.trim())
                cancelarAlarmasYBorrar(app); cache.clear()
                prefs.servidor = url; prefs.token = r.getString("token"); prefs.nombre = nombre.trim(); prefs.rol = Rol.CUIDADOR
                _ui.update { it.copy(rol = Rol.CUIDADOR, nombre = nombre.trim(), cargando = false, mensaje = null) }
                AlertasJobService.programar(app)
                refrescar()
            } catch (e: ApiException) {
                _ui.update { it.copy(cargando = false, mensaje = e.message) }
            }
        }
    }

    /** Entra como la misma persona desde otro dispositivo, con el código de 6 dígitos que generó el primero. */
    fun conectarDispositivo(servidor: String, codigo: String, nombreDispositivo: String) {
        val url = normalizarUrl(servidor) ?: return avisar("La dirección del servidor no es válida. Revisa las opciones avanzadas.")
        if (codigo.length != 6) return avisar("Escribe el código de 6 dígitos.")
        viewModelScope.launch {
            _ui.update { it.copy(cargando = true, mensaje = null) }
            try {
                val r = LazoApi(url).vincularDispositivo(codigo, nombreDispositivo.ifBlank { "Mi dispositivo" }.trim())
                val perfil = Perfil.de(r.getJSONObject("perfil"))
                cancelarAlarmasYBorrar(app); cache.clear()
                prefs.servidor = url; prefs.token = r.getString("token"); prefs.nombre = perfil.nombre; prefs.rol = Rol.PERSONA
                prefs.escalaTexto = if (perfil.textoGrande) 1.4f else 1.0f; prefs.altoContraste = perfil.altoContraste
                _ui.update { it.copy(rol = Rol.PERSONA, nombre = perfil.nombre, escala = prefs.escalaTexto, altoContraste = perfil.altoContraste, cargando = false, mensaje = null) }
                AlertasJobService.programar(app)
                refrescar()
            } catch (e: ApiException) {
                _ui.update { it.copy(cargando = false, mensaje = e.message) }
            }
        }
    }

    fun nuevaVinculacion() {
        viewModelScope.launch {
            try {
                val c = api().invitacionDispositivo().getString("codigo")
                _ui.update { it.copy(codigoVinculo = c) }
                hablar("El código es ${c.toList().joinToString(", ")}.", forzar = true)
            } catch (e: ApiException) { avisar(e.message ?: "") }
        }
    }

    fun quitarDispositivo(d: Cuidador) = accion("Se quitó el acceso a ${d.nombre}.") { api().quitarDispositivo(d.id) }

    fun cerrarSesion() {
        cancelarAlarmasYBorrar(app); cache.clear()
        AlertasJobService.programar(app)
        _ui.value = Ui(hoy = hoyIso(), escala = prefs.escalaTexto, altoContraste = prefs.altoContraste, voz = prefs.voz, velocidad = prefs.velocidadVoz)
    }

    // ---------- tomas ----------
    private fun accionable(): Dosis? = _ui.value.let { u -> u.tomas.firstOrNull { it.estado.requiereAtencion } ?: u.tomas.firstOrNull { it.estado == Estado.PENDIENTE || it.estado == Estado.POSPUESTA } }

    fun registrar(d: Dosis, estado: Estado, minutos: Int? = null) {
        val ahora = ahoraLocal()
        when (estado) {
            Estado.TOMADA, Estado.OMITIDA -> { prefs.resolver(d.clave); prefs.quitarPospuesta(d.clave) }
            Estado.POSPUESTA -> prefs.pospuesta(d.clave, ahora.plusMinutes((minutos ?: 10).toLong()).aMillis())
            else -> { prefs.desresolver(d.clave); prefs.quitarPospuesta(d.clave) }
        }
        codigosDe(d.clave).forEach { Notificaciones.cancelar(app, it) }
        val hora = horaActual()
        val nueva = d.copy(estado = estado, horaReal = if (estado == Estado.TOMADA) hora else null, hastaHora = if (estado == Estado.POSPUESTA) ahora.plusMinutes((minutos ?: 10).toLong()).toLocalTime().let { "%02d:%02d".format(it.hour, it.minute) } else null)
        _ui.update { u ->
            val tomas = u.tomas.map { if (it.clave == d.clave) nueva else it }
            u.copy(tomas = tomas, proxima = proximaDe(null, tomas))
        }
        Alarmas.reprogramar(app)
        if (prefs.voz) hablar(when (estado) {
            Estado.TOMADA -> "Listo. Registré ${textoDosis(d.nombre, d.dosis)} como tomada."
            Estado.OMITIDA -> "De acuerdo. Marqué ${d.nombre} como omitida."
            Estado.POSPUESTA -> "Te lo recuerdo en ${minutos ?: 10} minutos."
            else -> "Deshecho."
        }, forzar = true)
        val accion = AccionPendiente(d.medicamentoId, d.fecha, d.hora, estado.clave, if (estado == Estado.POSPUESTA) (minutos ?: 10) else null)
        viewModelScope.launch {
            val enviado = withContext(Dispatchers.IO) { Sincronizacion.enviarOEncolar(app, accion) }
            _ui.update { it.copy(sinEnviar = prefs.cola().size, sinConexion = !enviado || it.sinConexion) }
            if (enviado) refrescar()
        }
    }

    fun procesarVoz(frase: String) {
        val u = _ui.value
        val d = accionable()
        when (val c = interpretar(frase)) {
            Comando.Tomada -> if (d != null) registrar(d, Estado.TOMADA) else hablar("No tienes ninguna toma pendiente.")
            is Comando.Posponer -> if (d != null) registrar(d, Estado.POSPUESTA, c.minutos) else hablar("No tienes ninguna toma pendiente.")
            Comando.Omitir -> if (d != null) registrar(d, Estado.OMITIDA) else hablar("No tienes ninguna toma pendiente.")
            Comando.Siguiente -> hablar(fraseSiguiente(u.proxima, u.hoy))
            Comando.Hoy -> hablar(fraseHoy(u.tomas, u.hoy))
            Comando.Citas -> hablar(fraseCitas(u.citas, u.hoy))
            Comando.Convocatorias -> {
                val n = u.convocatorias?.items?.count { it.discapacidad } ?: 0
                hablar(if (n == 0) "Todavía no hay convocatorias guardadas. Abro la lista para que las actualices." else "Hay ${plural(n, "convocatoria", "convocatorias")} para personas con discapacidad. Abro la lista.")
                _ui.update { it.copy(destino = "convocatorias") }
            }
            Comando.PedirAyuda -> viewModelScope.launch { avisarAyuda(frase) }
            Comando.Ayuda -> hablar(AYUDA_VOZ)
            Comando.Desconocido -> hablar("No te entendí. Di ayuda para saber qué puedes pedirme.")
        }
    }

    // ---------- conversación con Lazo (texto y audio, como el chat de Alice) ----------
    private fun mensajeChat(m: MensajeChat) = _ui.update { it.copy(chat = (it.chat + m).takeLast(60)) }

    /** Respuesta del servidor a una orden: se muestra, se lee en voz alta y, si cambió algo, se refresca la pantalla. */
    private fun alResponder(r: JSONObject) {
        val reply = r.optString("reply")
        mensajeChat(MensajeChat(false, reply))
        if (prefs.voz) hablar(reply, forzar = false)
        val accion = r.optJSONObject("accion")
        if (accion?.optBoolean("hecho") == true) {
            // Lo dijo por voz y el servidor ya avisó: se pide otra vez (no se duplica) para saber a cuántos llegó y ofrecer el 911
            if (accion.optString("tipo") == "pedir-ayuda") viewModelScope.launch { avisarAyuda(null, leer = false) }
            if (accion.optString("tipo") == "convocatorias") _ui.update { it.copy(destino = "convocatorias") }
            refrescar()
        }
    }

    private fun falloChat(e: ApiException) = mensajeChat(MensajeChat(false, e.message ?: "No pude conectar con el servidor.", error = true))

    fun enviarAlChat(texto: String) {
        val t = texto.trim()
        if (t.isEmpty() || _ui.value.chatOcupado) return
        mensajeChat(MensajeChat(true, t))
        _ui.update { it.copy(chatOcupado = true) }
        viewModelScope.launch {
            // Un pedido de ayuda escrito va directo a POST /ayuda: así, aun sin conexión, la respuesta ofrece llamar al 911
            if (interpretar(t) == Comando.PedirAyuda) mensajeChat(MensajeChat(false, avisarAyuda(t)))
            else try { alResponder(api().vozTexto(t)) } catch (e: ApiException) { falloChat(e) }
            _ui.update { it.copy(chatOcupado = false) }
        }
    }

    /** Empieza a grabar (la pantalla ya pidió el permiso del micrófono). */
    fun empezarGrabacion() {
        if (_ui.value.chatOcupado || _ui.value.grabando) return
        voz.detener()
        if (grabadora.empezar()) _ui.update { it.copy(grabando = true) }
        else avisar("No pude usar el micrófono. Revisa que ninguna otra app lo esté usando.")
    }

    fun terminarGrabacion() {
        if (!_ui.value.grabando) return
        _ui.update { it.copy(grabando = false) }
        val archivo = grabadora.terminar() ?: return avisar("Fue muy corto. Pulsa el micrófono, habla y vuelve a pulsarlo.")
        _ui.update { it.copy(chatOcupado = true) }
        viewModelScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { archivo.readBytes().also { archivo.delete() } }
                val r = api().vozAudio(bytes)
                val dicho = r.optString("transcripcion")
                if (dicho.isNotBlank()) mensajeChat(MensajeChat(true, dicho, audio = true))
                alResponder(r)
            } catch (e: ApiException) {
                runCatching { archivo.delete() }
                falloChat(e)
            }
            _ui.update { it.copy(chatOcupado = false) }
        }
    }

    fun cancelarGrabacion() { if (_ui.value.grabando) { grabadora.cancelar(); _ui.update { it.copy(grabando = false) } } }

    // ---------- datos de la persona ----------
    /** Una sola operación de guardado a la vez: un segundo toque mientras la primera viaja por internet se ignora (así no se duplica nada). */
    private fun accion(exito: String? = null, bloque: suspend () -> Unit) {
        if (_ui.value.guardando) return
        _ui.update { it.copy(guardando = true) }
        viewModelScope.launch {
            try { bloque(); if (exito != null) avisar(exito); refrescar() } catch (e: ApiException) { avisar(e.message ?: "No se pudo completar.") }
            finally { _ui.update { it.copy(guardando = false) } }
        }
    }

    fun guardarMedicamento(id: String?, body: JSONObject, alTerminar: () -> Unit) = accion("Medicina guardada.") { api().guardarMedicamento(id, body); alTerminar() }
    fun borrarMedicamento(id: String, alTerminar: () -> Unit) = accion("Medicina eliminada.") { api().borrarMedicamento(id); alTerminar() }
    fun guardarCita(id: String?, body: JSONObject, alTerminar: () -> Unit) = accion("Cita guardada.") { api().guardarCita(id, body); alTerminar() }
    fun borrarCita(id: String, alTerminar: () -> Unit) = accion("Cita eliminada.") { api().borrarCita(id); alTerminar() }
    fun registrarMedicion(tipo: TipoMedicion, valor: JSONObject, nota: String, alTerminar: (Aviso?) -> Unit) {
        if (_ui.value.guardando) return
        _ui.update { it.copy(guardando = true) }
        viewModelScope.launch {
            try {
                val r = api().registrarMedicion(tipo, valor, nota)
                val aviso = r.optJSONObject("aviso")?.let { Aviso(it.optString("nivel"), it.optString("texto")) }
                alTerminar(aviso); refrescar()
            } catch (e: ApiException) { avisar(e.message ?: "No se pudo guardar.") }
            finally { _ui.update { it.copy(guardando = false) } }
        }
    }
    fun borrarMedicion(id: String) = accion("Medición eliminada.") { api().borrarMedicion(id) }
    fun marcarVista(a: Alerta) = accion { api().alertaVista(a.id) }

    fun nuevaInvitacion() { viewModelScope.launch { try { val c = api().invitacion().getString("codigo"); _ui.update { it.copy(codigo = c) }; hablar("El código es ${c.toList().joinToString(", ")}.", forzar = true) } catch (e: ApiException) { avisar(e.message ?: "") } } }
    fun revocar(c: Cuidador) = accion("Se quitó el acceso a ${c.nombre}.") { api().revocarCuidador(c.id) }

    fun actualizarConvocatorias() {
        viewModelScope.launch {
            _ui.update { it.copy(cargando = true, mensaje = null) }
            try {
                val r = api().actualizarConvocatorias()
                if (!r.optBoolean("ok", true)) avisar("No pude leer la página de la Secretaría: ${r.optString("error")}. Se conserva la lista anterior.")
            } catch (e: ApiException) { avisar(e.message ?: "") }
            refrescar()
        }
    }

    // ---------- «Necesito ayuda» ----------
    /** Primer toque: solo pide confirmación (un toque accidental no avisa a nadie). */
    fun pedirAyuda() { if (_ui.value.ayuda == EstadoAyuda.Inactiva) { _ui.update { it.copy(ayuda = EstadoAyuda.Confirmando) }; hablar("¿Aviso a tus cuidadores que necesitas ayuda? Pulsa el botón rojo para confirmar.", forzar = false) } }

    fun cancelarAyuda() = _ui.update { it.copy(ayuda = EstadoAyuda.Inactiva) }

    /** Segundo toque: avisa a los cuidadores. Sin conexión, igual ofrece llamar al 911. */
    fun confirmarAyuda(mensaje: String? = null) {
        if (_ui.value.ayuda != EstadoAyuda.Confirmando) return
        viewModelScope.launch { avisarAyuda(mensaje) }
    }

    /**
     * Envía el pedido de ayuda (POST /ayuda) y deja la pantalla ofreciendo el 911. Lo usan el botón (tras confirmar) y la voz
     * («necesito ayuda», «auxilio»…: decirlo ya es la intención). El servidor no duplica un pedido repetido en el mismo minuto,
     * así que repetirlo solo sirve para saber a cuántos cuidadores llegó. Devuelve el texto del resultado.
     */
    private suspend fun avisarAyuda(mensaje: String?, leer: Boolean = true): String {
        _ui.update { it.copy(ayuda = EstadoAyuda.Enviando) }
        val estado = try {
            EstadoAyuda.Enviada(api().pedirAyuda(mensaje).optInt("cuidadores", 0))
        } catch (e: ApiException) {
            EstadoAyuda.Fallida(sinConexion = e.codigo == 0)
        }
        _ui.update { it.copy(ayuda = estado, sinConexion = if (estado is EstadoAyuda.Fallida && estado.sinConexion) true else it.sinConexion) }
        val texto = if (estado is EstadoAyuda.Enviada) textoAyudaEnviada(estado.cuidadores) else textoAyudaFallida((estado as EstadoAyuda.Fallida).sinConexion)
        // Siempre en voz alta: quien no ve la pantalla tiene que saber si su aviso llegó
        if (leer) hablar(texto, forzar = true)
        return texto
    }

    // ---------- accesibilidad ----------
    fun setEscala(v: Float) { prefs.escalaTexto = v; _ui.update { it.copy(escala = prefs.escalaTexto) } }
    fun setContraste(v: Boolean) { prefs.altoContraste = v; _ui.update { it.copy(altoContraste = v) } }
    fun setVoz(v: Boolean) { prefs.voz = v; _ui.update { it.copy(voz = v) } }
    fun setVelocidad(v: Float) { prefs.velocidadVoz = v; _ui.update { it.copy(velocidad = prefs.velocidadVoz) } }

    fun hablar(texto: String, forzar: Boolean = true) { if (forzar || prefs.voz) voz.hablar(texto) }
    fun callar() = voz.detener()
    fun avisar(texto: String) = _ui.update { it.copy(mensaje = texto) }
    fun limpiarMensaje() = _ui.update { it.copy(mensaje = null) }
    fun consumirDestino() = _ui.update { it.copy(destino = null) }

    companion object {
        /** Cierra la sesión local (conserva letra, contraste y voz): primero cancela las alarmas de tomas y citas (sus códigos viven en las preferencias), luego borra. */
        fun cancelarAlarmasYBorrar(context: android.content.Context) {
            val prefs = Prefs.de(context)
            prefs.rol = null
            Alarmas.reprogramar(context)
            RecordatoriosCitas.reprogramar(context)
            // La letra, el contraste y la voz son de quien usa el teléfono, no de la cuenta: se conservan
            val escala = prefs.escalaTexto; val contraste = prefs.altoContraste; val voz = prefs.voz; val velocidad = prefs.velocidadVoz
            prefs.cerrarSesion()
            prefs.escalaTexto = escala; prefs.altoContraste = contraste; prefs.voz = voz; prefs.velocidadVoz = velocidad
        }
    }

    override fun onCleared() { runCatching { voz.cerrar() }; runCatching { grabadora.cancelar() } }
}
