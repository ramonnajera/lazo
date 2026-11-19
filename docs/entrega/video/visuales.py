# visuales.py — qué se ve en cada escena (v2, con imágenes y clips de Higgsfield).
# Cada escena es una lista de piezas que reparten su duración por peso:
#   ("slide", id)                        → la diapositiva original de escenas.py
#   ("heroe", archivo, kicker, color, titulo, [puntos])  → mockup con la pantalla real y texto encima
#   ("foto", archivo, kicker, titulo)    → foto de Higgsfield a pantalla completa con rótulo inferior
#   ("clip", archivo, kicker, titulo)    → clip animado de Higgsfield (cámara lenta y luego cuadro fijo) con rótulo
AZUL, VERDE, MORADO, ROSA, NARANJA, PETROLEO, NOCHE = "#0B3D91", "#12803C", "#7A2FC0", "#D0124F", "#C2410C", "#0B7285", "#0B1220"

VISUALES = {
    "00_portada": [(1, ("slide",))],
    "01_problema": [(1, ("slide",))],
    "02_datos": [(1, ("slide",))],
    "03_objetivo": [(1, ("slide",))],
    "04_mateo": [(1, ("clip", "clip_mateo.mp4", "Persona ficticia", "Mateo, un joven autista de Chihuahua"))],
    "05_hoy": [(0.4, ("clip", "clip_pastilla.mp4", "Hoy", "Su medicina, a tiempo")),
               (0.6, ("heroe", "heroe_01_hoy.png", "Inicio", AZUL, "Lo primero: hablar con Lazo", ["La medicina que toca, en letra grande", "Alarma sin internet, leída en voz alta", "Un solo toque: «Ya la tomé»"]))],
    "06_chat": [(0.35, ("foto", "m_telefono_hoy.png", "Hablar con Lazo", "Por voz o por escrito")),
                (0.65, ("heroe", "heroe_05_hablar_con_lazo.png", "Hablar con Lazo", AZUL, "Por voz o por escrito", ["Lenguaje natural: «¿qué tengo mañana?»", "Frases sugeridas para quien prefiere tocar", "Nunca diagnostica ni cambia una dosis"]))],
    "07_citas": [(0.45, ("clip", "clip_espera.mp4", "Citas", "Llega tranquilo a su terapia")),
                 (0.55, ("heroe", "heroe_03_citas.png", "Citas", MORADO, "Sin sorpresas", ["Notas pensadas para él: sus audífonos", "Recordatorio la víspera", "Y otro dos horas antes"]))],
    "08_medicinas": [(1, ("heroe", "heroe_02_medicinas.png", "Medicinas", VERDE, "Para cuántos días alcanza", ["Sigue el calendario real de cada medicina", "Avisa a tiempo para resurtir"]))],
    "09_salud": [(1, ("heroe", "heroe_04_salud.png", "Cómo estoy", ROSA, "Anotar es fácil", ["Presión, glucosa, ánimo, dolor y peso", "Botones grandes de colores", "Avisos orientativos, nunca un diagnóstico"]))],
    "10_ayuda": [(1, ("heroe", "heroe_06_necesito_ayuda.png", "Necesito ayuda", ROSA, "Pedir ayuda, en un momento difícil", ["Un botón con confirmación", "O decir: «necesito ayuda»", "Aviso inmediato al círculo y llamada al 911"]))],
    "11_cuidador": [(0.45, ("clip", "clip_laura.mp4", "Círculo de cuidado", "Laura recibe el aviso al instante")),
                    (0.55, ("heroe", "heroe_07_cuidador_aviso.png", "Círculo de cuidado", NARANJA, "Lo que ve Laura", ["Se une con un código de 6 dígitos", "Solo lectura: no cambia nada", "El pedido de ayuda, primero y con alarma"]))],
    "12_isla": [(1, ("foto", "m_escritorio.png", "Windows 11", "El mismo día, también en la computadora"))],
    "13_accesibilidad": [(1, ("heroe", "heroe_08_alto_contraste.png", "Accesibilidad", NOCHE, "El centro del proyecto", ["Contraste de al menos 7 a 1", "Letra hasta el doble y alto contraste", "Botones de 64 puntos o más", "Lector de pantalla en cada elemento", "Nada se dice solo con color"]))],
    "14_apoyos": [(1, ("heroe", "heroe_10_apoyos.png", "Apoyos", NARANJA, "Las convocatorias, en un solo lugar", ["Secretaría de Desarrollo Humano y Bien Común", "Las de discapacidad, primero", "Con su enlace oficial; sin inventar fechas"]))],
    "15_metodologia": [(1, ("slide",))],
    "16_metas": [(0.4, ("foto", "s8_terapia.png", "Resultados", "Probado en casa, en el cuidado de un hijo")), (0.6, ("slide",))],
    "17_replicable": [(1, ("slide",))],
    "18_cierre": [(0.5, ("clip", "clip_juntos.mp4", "Lazo", "Autonomía para él, tranquilidad para ella")), (0.5, ("slide",))],
}

FUENTE = "@font-face { font-family: Inter; src: url(Inter.ttf); font-weight: 100 900; }"


def html_heroe(fondo, kicker, color, titulo, puntos):
    lis = "".join(f"<li>{p}</li>" for p in puntos)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FUENTE}
* {{ margin:0; box-sizing:border-box; }} html,body {{ width:1920px; height:1080px; overflow:hidden; font-family:Inter,sans-serif; }}
body {{ background:url({fondo}) center/cover; }}
.sombra {{ position:absolute; inset:0; background:linear-gradient(90deg, rgba(11,18,32,.92) 0%, rgba(11,18,32,.75) 38%, rgba(11,18,32,0) 62%); }}
.texto {{ position:absolute; left:110px; top:190px; width:760px; color:#fff; }}
.kicker {{ display:inline-block; font-size:30px; font-weight:700; padding:10px 26px; border-radius:999px; margin-bottom:28px; background:{color}; box-shadow:0 0 0 2px rgba(255,255,255,.35); }}
h2 {{ font-size:58px; line-height:1.1; font-weight:800; letter-spacing:-1px; margin-bottom:34px; }}
ul {{ list-style:none; padding:0; }} li {{ font-size:31px; line-height:1.35; margin:16px 0; padding-left:52px; position:relative; color:#e3e9f5; }}
li::before {{ content:""; position:absolute; left:0; top:13px; width:24px; height:24px; border-radius:50%; background:#fff; box-shadow:inset 0 0 0 7px {color}; }}
.marca {{ position:absolute; top:44px; left:110px; font-weight:800; font-size:32px; color:#fff; display:flex; gap:14px; align-items:center; }}
</style></head><body><div class="sombra"></div><div class="marca"><img src="lazo_logo.png" style="width:52px;height:52px;border-radius:12px">Lazo</div>
<div class="texto"><span class="kicker">{kicker}</span><h2>{titulo}</h2><ul>{lis}</ul></div></body></html>"""


def html_rotulo(kicker, titulo):
    """Rótulo inferior con fondo transparente, para poner encima de fotos y clips."""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FUENTE}
* {{ margin:0; }} html,body {{ width:1920px; height:1080px; overflow:hidden; background:transparent; font-family:Inter,sans-serif; }}
.caja {{ position:absolute; left:110px; bottom:190px; padding:26px 38px; border-radius:26px; background:rgba(11,18,32,.80); color:#fff; display:flex; gap:22px; align-items:center; }}
.caja img {{ width:64px; height:64px; border-radius:15px; }}
.k {{ font-size:26px; font-weight:700; color:#8FB4FF; text-transform:uppercase; letter-spacing:1.5px; }}
.t {{ font-size:46px; font-weight:800; margin-top:4px; }}
</style></head><body><div class="caja"><img src="lazo_logo.png"><div><div class="k">{kicker}</div><div class="t">{titulo}</div></div></div></body></html>"""
