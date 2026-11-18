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
import mx.lazo.app.alarm.Sincronizacion
import mx.lazo.app.data.*
import mx.lazo.app.domain.*
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
) {
    val conectado get() = rol != null
}

/** Un solo lugar para el estado de la app: abre al instante con lo guardado, refresca, y no pierde nada sin conexión. */
class AppViewModel(private val app: Application) : AndroidViewModel(app) {
    private val prefs = Prefs.de(app)
    private val cache = Cache(app)
    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()
    private val voz by lazy { Voz(app, { prefs.velocidadVoz }) }

    init {
        _ui.update { it.copy(rol = if (prefs.conectado) prefs.rol else null, nombre = prefs.nombre, hoy = hoyIso(), escala = prefs.escalaTexto, altoContraste = prefs.altoContraste, voz = prefs.voz, velocidad = prefs.velocidadVoz) }
        if (prefs.conectado) { cargarCache(); refrescar() }
    }

    private fun api() = LazoApi(prefs.servidor, prefs.token)

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
                listOf(perfil, citas, alertas, conv, meds, tomas, prox, meds2, res, cir, disp).forEach { it.await() }
            }
            cargarCache()
            val cuidadores = cache.read("circulo").lista("cuidadores") { Cuidador(it.getString("id"), it.getString("nombre"), it.optString("parentesco")) }
            val dispositivos = cache.read("dispositivos").lista("dispositivos") { Cuidador(it.getString("id"), it.getString("nombre"), "") }
            _ui.update { it.copy(cargando = false, sinConexion = sinRed, mensaje = error ?: it.mensaje, cuidadores = cuidadores, dispositivos = dispositivos, sinEnviar = prefs.cola().size, hoy = hoyIso()) }
            if (prefs.rol == Rol.PERSONA) Alarmas.reprogramar(app)
        }
    }

    // ---------- conectar ----------
    fun conectarPersona(servidor: String, nombre: String, discapacidad: Discapacidad, textoGrande: Boolean, altoContraste: Boolean) {
        val url = normalizarUrl(servidor) ?: return avisar("Escribe la dirección del servidor, por ejemplo 192.168.1.5:18800.")
        if (nombre.isBlank()) return avisar("Escribe tu nombre.")
        viewModelScope.launch {
            _ui.update { it.copy(cargando = true) }
            try {
                val r = LazoApi(url).crearPerfil(nombre.trim(), discapacidad, textoGrande, altoContraste)
                prefs.cerrarSesion(); cache.clear()
                prefs.servidor = url; prefs.token = r.getString("token"); prefs.nombre = nombre.trim(); prefs.rol = Rol.PERSONA
                prefs.escalaTexto = if (textoGrande) 1.4f else 1.0f; prefs.altoContraste = altoContraste
                _ui.update { it.copy(rol = Rol.PERSONA, nombre = nombre.trim(), escala = prefs.escalaTexto, altoContraste = altoContraste, cargando = false) }
                AlertasJobService.programar(app)
                refrescar()
            } catch (e: ApiException) {
                _ui.update { it.copy(cargando = false, mensaje = if (e.codigo == 409) "Este servidor ya tiene una persona. Si eres cuidador, elige «Soy cuidador»." else e.message) }
            }
        }
    }

    fun conectarCuidador(servidor: String, codigo: String, nombre: String, parentesco: String) {
        val url = normalizarUrl(servidor) ?: return avisar("Escribe la dirección del servidor, por ejemplo 192.168.1.5:18800.")
        if (codigo.length != 6 || nombre.isBlank()) return avisar("Escribe el código de 6 dígitos y tu nombre.")
        viewModelScope.launch {
            _ui.update { it.copy(cargando = true) }
            try {
                val r = LazoApi(url).unirse(codigo, nombre.trim(), parentesco.trim())
                prefs.cerrarSesion(); cache.clear()
                prefs.servidor = url; prefs.token = r.getString("token"); prefs.nombre = nombre.trim(); prefs.rol = Rol.CUIDADOR
                _ui.update { it.copy(rol = Rol.CUIDADOR, nombre = nombre.trim(), cargando = false) }
                AlertasJobService.programar(app)
                refrescar()
            } catch (e: ApiException) {
                _ui.update { it.copy(cargando = false, mensaje = e.message) }
            }
        }
    }

    /** Entra como la misma persona desde otro dispositivo, con el código de 6 dígitos que generó el primero. */
    fun conectarDispositivo(servidor: String, codigo: String, nombreDispositivo: String) {
        val url = normalizarUrl(servidor) ?: return avisar("Escribe la dirección del servidor, por ejemplo 192.168.1.5:18800.")
        if (codigo.length != 6) return avisar("Escribe el código de 6 dígitos.")
        viewModelScope.launch {
            _ui.update { it.copy(cargando = true) }
            try {
                val r = LazoApi(url).vincularDispositivo(codigo, nombreDispositivo.ifBlank { "Mi dispositivo" }.trim())
                val perfil = Perfil.de(r.getJSONObject("perfil"))
                prefs.cerrarSesion(); cache.clear()
                prefs.servidor = url; prefs.token = r.getString("token"); prefs.nombre = perfil.nombre; prefs.rol = Rol.PERSONA
                prefs.escalaTexto = if (perfil.textoGrande) 1.4f else 1.0f; prefs.altoContraste = perfil.altoContraste
                _ui.update { it.copy(rol = Rol.PERSONA, nombre = perfil.nombre, escala = prefs.escalaTexto, altoContraste = perfil.altoContraste, cargando = false) }
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
        prefs.cerrarSesion(); cache.clear()
        Alarmas.reprogramar(app); AlertasJobService.programar(app)
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
            Comando.Ayuda -> hablar(AYUDA_VOZ)
            Comando.Desconocido -> hablar("No te entendí. Di ayuda para saber qué puedes pedirme.")
        }
    }

    // ---------- datos de la persona ----------
    private fun accion(exito: String? = null, bloque: suspend () -> Unit) {
        viewModelScope.launch {
            try { bloque(); if (exito != null) avisar(exito); refrescar() } catch (e: ApiException) { avisar(e.message ?: "No se pudo completar.") }
        }
    }

    fun guardarMedicamento(id: String?, body: JSONObject, alTerminar: () -> Unit) = accion("Medicina guardada.") { api().guardarMedicamento(id, body); alTerminar() }
    fun borrarMedicamento(id: String, alTerminar: () -> Unit) = accion("Medicina eliminada.") { api().borrarMedicamento(id); alTerminar() }
    fun guardarCita(id: String?, body: JSONObject, alTerminar: () -> Unit) = accion("Cita guardada.") { api().guardarCita(id, body); alTerminar() }
    fun borrarCita(id: String, alTerminar: () -> Unit) = accion("Cita eliminada.") { api().borrarCita(id); alTerminar() }
    fun registrarMedicion(tipo: TipoMedicion, valor: JSONObject, nota: String, alTerminar: (Aviso?) -> Unit) {
        viewModelScope.launch {
            try {
                val r = api().registrarMedicion(tipo, valor, nota)
                val aviso = r.optJSONObject("aviso")?.let { Aviso(it.optString("nivel"), it.optString("texto")) }
                alTerminar(aviso); refrescar()
            } catch (e: ApiException) { avisar(e.message ?: "No se pudo guardar.") }
        }
    }
    fun borrarMedicion(id: String) = accion("Medición eliminada.") { api().borrarMedicion(id) }
    fun marcarVista(a: Alerta) = accion { api().alertaVista(a.id) }

    fun nuevaInvitacion() { viewModelScope.launch { try { val c = api().invitacion().getString("codigo"); _ui.update { it.copy(codigo = c) }; hablar("El código es ${c.toList().joinToString(", ")}.", forzar = true) } catch (e: ApiException) { avisar(e.message ?: "") } } }
    fun revocar(c: Cuidador) = accion("Se quitó el acceso a ${c.nombre}.") { api().revocarCuidador(c.id) }

    fun actualizarConvocatorias() {
        viewModelScope.launch {
            _ui.update { it.copy(cargando = true) }
            try {
                val r = api().actualizarConvocatorias()
                if (!r.optBoolean("ok", true)) avisar("No pude leer la página de la Secretaría: ${r.optString("error")}. Se conserva la lista anterior.")
            } catch (e: ApiException) { avisar(e.message ?: "") }
            refrescar()
        }
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

    override fun onCleared() { runCatching { voz.cerrar() } }
}
