# escenas.py — guion del video de Lazo: cada escena tiene su diapositiva (HTML 1920×1080) y su narración.
# Persona ficticia del demo: Mateo, joven autista. Nada de datos reales.

AZUL, VERDE, MORADO, ROSA, NARANJA, PETROLEO, NOCHE = "#0B3D91", "#12803C", "#7A2FC0", "#D0124F", "#C2410C", "#0B7285", "#0B1220"

LOGO = """<svg viewBox="0 0 108 108" class="logo"><rect width="108" height="108" rx="25" fill="#0B3D91"/><g transform="translate(54 54) scale(1.22) translate(-54 -54)" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M54,60 C40,46 32,36 38,28 C44,20 56,26 54,40 C52,26 64,20 70,28 C76,36 68,46 54,60 Z"/><path d="M54,60 L42,86 M54,60 L66,86"/></g></svg>"""

CSS = """
@font-face { font-family: Inter; src: url(Inter.ttf); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1920px; height: 1080px; overflow: hidden; font-family: Inter, sans-serif; color: #0B1220; }
body { background: #F4F6FA; }
.marca { position: absolute; top: 44px; right: 72px; display: flex; align-items: center; gap: 16px; font-weight: 800; font-size: 34px; color: #0B3D91; }
.marca .logo { width: 56px; height: 56px; }
.lienzo { position: absolute; inset: 60px 0 200px 0; display: flex; align-items: center; padding: 0 140px; gap: 90px; }
.kicker { display: inline-block; font-size: 30px; font-weight: 700; color: #fff; padding: 10px 26px; border-radius: 999px; margin-bottom: 28px; }
h1 { font-size: 86px; line-height: 1.05; font-weight: 800; letter-spacing: -1.5px; }
h2 { font-size: 64px; line-height: 1.1; font-weight: 800; letter-spacing: -1px; margin-bottom: 30px; }
p.lead { font-size: 38px; line-height: 1.4; color: #3B4658; margin-top: 26px; max-width: 1150px; }
ul { list-style: none; padding: 0; margin-top: 8px; }
li { font-size: 36px; line-height: 1.35; margin: 18px 0; padding-left: 52px; position: relative; color: #1c2638; }
li::before { content: ""; position: absolute; left: 0; top: 14px; width: 24px; height: 24px; border-radius: 50%; background: var(--c); }
.telefono { flex: none; width: 380px; height: 780px; border-radius: 56px; background: #0B1220; padding: 16px; box-shadow: 0 40px 80px rgba(11,18,32,.28); }
.telefono img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 42px; display: block; }
.texto { flex: 1; }
.cifras { display: flex; gap: 40px; margin-top: 40px; }
.cifra { flex: 1; background: #fff; border-radius: 32px; padding: 44px 40px; border: 3px solid var(--c); }
.cifra b { display: block; font-size: 92px; font-weight: 800; color: var(--c); letter-spacing: -2px; }
.cifra span { display: block; font-size: 30px; line-height: 1.35; color: #3B4658; margin-top: 14px; }
.tarjetas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 34px; margin-top: 36px; }
.tarjeta { background: #fff; border-radius: 30px; padding: 38px; border-top: 12px solid var(--c); }
.tarjeta b { display: block; font-size: 38px; margin-bottom: 14px; }
.tarjeta span { font-size: 29px; line-height: 1.4; color: #3B4658; }
.oscuro { background: radial-gradient(circle at 30% 20%, #16306b 0%, #0B1220 60%); color: #fff; }
.oscuro p.lead, .oscuro li { color: #d9e2f2; }
.oscuro .marca { color: #fff; }
.centro { flex-direction: column; justify-content: center; text-align: center; }
"""


def pagina(cuerpo, oscuro=False, marca=True):
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><style>{CSS}</style></head>
<body class="{'oscuro' if oscuro else ''}">{f'<div class="marca">{LOGO}Lazo</div>' if marca else ''}{cuerpo}</body></html>"""


def telefono(img, kicker, color, titulo, puntos):
    lis = "".join(f"<li>{p}</li>" for p in puntos)
    return pagina(f"""<div class="lienzo"><div class="telefono"><img src="{img}"></div>
<div class="texto" style="--c:{color}"><span class="kicker" style="background:{color}">{kicker}</span><h2>{titulo}</h2><ul>{lis}</ul></div></div>""")


ESCENAS = [
    ("portada", pagina(f"""<div class="lienzo centro"><div style="width:170px;height:170px">{LOGO.replace('class="logo"', 'style="width:170px;height:170px"')}</div>
<h1 style="font-size:130px;margin-top:26px">Lazo</h1>
<p class="lead" style="max-width:1400px;text-align:center">Un acompañante para las medicinas, las citas y el bienestar de personas con discapacidad visual, motriz o en el espectro autista, y para quienes las cuidan.</p>
<p class="lead" style="font-size:28px;margin-top:40px;color:#8FB4FF">Premio Estatal por la Discapacidad «Manuel Trueva Martínez 2026» · Chihuahua</p></div>""", oscuro=True, marca=False),
     "Lazo. Un acompañante para las medicinas, las citas y el bienestar de personas con discapacidad visual, motriz o en el espectro autista, y para quienes las cuidan."),

    ("problema", pagina(f"""<div class="lienzo"><div class="texto"><span class="kicker" style="background:{ROSA}">El problema</span>
<h2>Cuidar la salud exige leer, recordar, tocar y coordinarse</h2>
<div class="tarjetas"><div class="tarjeta" style="--c:{AZUL}"><b>Visual</b><span>Etiquetas, recetas y pantallas pequeñas que no se pueden leer.</span></div>
<div class="tarjeta" style="--c:{VERDE}"><b>Motriz</b><span>Botones diminutos y gestos que exigen precisión.</span></div>
<div class="tarjeta" style="--c:{MORADO}"><b>Espectro autista</b><span>Cambios de rutina que angustian y llamadas difíciles.</span></div></div></div></div>"""),
     "Cuidar la salud todos los días exige leer, recordar, tocar botones pequeños y coordinarse con otras personas. Para una persona con discapacidad visual o motriz, o para una persona autista, cada uno de esos pasos puede ser una barrera. Cuando falla uno, falla el tratamiento: se omite una dosis, se pierde una cita, o quien cuida se entera tarde."),

    ("datos", pagina(f"""<div class="lienzo"><div class="texto"><span class="kicker" style="background:{NARANJA}">Los datos</span><h2>Un problema grande y cercano</h2>
<div class="cifras"><div class="cifra" style="--c:{AZUL}"><b>587,035</b><span>personas con alguna limitación o discapacidad en Chihuahua (Plan Estatal de Desarrollo 2022-2027)</span></div>
<div class="cifra" style="--c:{MORADO}"><b>1 de 100</b><span>niñas y niños en el espectro autista en el mundo (OMS)</span></div>
<div class="cifra" style="--c:{ROSA}"><b>≈ 50 %</b><span>sigue su tratamiento a largo plazo en enfermedades crónicas (OMS)</span></div></div></div></div>"""),
     "En Chihuahua, el Plan Estatal de Desarrollo reporta más de quinientas ochenta y siete mil personas con alguna limitación o discapacidad. La Organización Mundial de la Salud estima que alrededor de una de cada cien niñas y niños está en el espectro autista, y que en las enfermedades crónicas solo cerca de la mitad de las personas sigue su tratamiento a largo plazo."),

    ("objetivo", pagina(f"""<div class="lienzo"><div class="texto" style="--c:{VERDE}"><span class="kicker" style="background:{VERDE}">El objetivo</span>
<h2>Autonomía para la persona,<br>tranquilidad para quien la cuida</h2>
<ul><li>Gratuito y de código abierto</li><li>En el teléfono y en la computadora</li><li>Accesible desde su diseño, no como un añadido</li><li>No es asistencialista: la persona decide y actúa</li></ul></div></div>"""),
     "El objetivo de Lazo es dar autonomía en el cuidado diario de la salud, y mantener informado a quien acompaña, con una herramienta gratuita, de código abierto y accesible desde su diseño, en el teléfono y en la computadora. No es asistencialista: la persona decide y actúa, y la tecnología se adapta a ella."),

    ("mateo", pagina(f"""<div class="lienzo"><div class="texto" style="--c:{MORADO}"><span class="kicker" style="background:{MORADO}">La demostración</span>
<h2>Conozcamos a Mateo</h2><p class="lead" style="margin-top:0">Una persona ficticia: un joven autista.</p>
<ul><li>Toma risperidona: vigila su peso y su glucosa</li><li>Terapia ocupacional y de lenguaje</li><li>Su mamá, Laura, lo acompaña</li></ul></div></div>"""),
     "Para mostrarlo, conozcamos a Mateo, una persona ficticia. Es un joven autista. Toma risperidona, por eso vigila su peso y su glucosa, y lleva terapia ocupacional y de lenguaje. Su mamá, Laura, lo acompaña."),

    ("hoy", telefono("01_hoy.png", "Inicio", AZUL, "Lo primero: hablar con Lazo", ["La medicina que toca, en letra grande", "Alarma sin internet, leída en voz alta", "Un solo toque: «Ya la tomé»"]),
     "Esta es la pantalla de inicio. Lo primero que Mateo alcanza es el botón para hablar con Lazo. Abajo aparece la medicina que toca ahora, en letra grande. La alarma suena aunque no haya internet, se lee en voz alta, y se confirma con un solo toque: ya la tomé."),

    ("chat", telefono("05_hablar_con_lazo.png", "Hablar con Lazo", AZUL, "Por voz o por escrito", ["Lenguaje natural: «¿qué tengo mañana?»", "Frases sugeridas para quien prefiere tocar", "Nunca diagnostica ni cambia una dosis"]),
     "Mateo puede hablar con Lazo con su voz, o escribir si lo prefiere, y tocar frases sugeridas. Lazo entiende el lenguaje natural: le dice qué tiene mañana, registra sus tomas y agenda sus citas. Nunca diagnostica ni cambia una dosis."),

    ("citas", telefono("03_citas.png", "Citas", MORADO, "Sin sorpresas", ["Notas pensadas para él: sus audífonos", "Recordatorio la víspera", "Y otro dos horas antes"]),
     "Los cambios inesperados pueden generar ansiedad. Por eso cada cita guarda notas pensadas para él, como llevar sus audífonos de cancelación de ruido, y Lazo se la recuerda la víspera y dos horas antes."),

    ("medicinas", telefono("02_medicinas.png", "Medicinas", VERDE, "Para cuántos días alcanza", ["Sigue el calendario real de cada medicina", "Avisa a tiempo para resurtir"]),
     "En medicinas, Lazo calcula para cuántos días alcanza cada una, siguiendo su calendario real, y avisa cuando hay que resurtir."),

    ("salud", telefono("04_salud.png", "Cómo estoy", ROSA, "Anotar es fácil", ["Presión, glucosa, ánimo, dolor y peso", "Botones grandes de colores", "Avisos orientativos, nunca un diagnóstico"]),
     "En cómo estoy, Mateo anota su presión, glucosa, ánimo, dolor y peso con botones grandes de colores. Si un valor sale de rango, aparece un aviso orientativo, nunca un diagnóstico, para llevarlo a su consulta."),

    ("ayuda", telefono("06_necesito_ayuda.png", "Necesito ayuda", ROSA, "Pedir ayuda, en un momento difícil", ["Un botón con confirmación", "O decir: «necesito ayuda»", "Aviso inmediato al círculo y llamada al 911"]),
     "Si Mateo necesita ayuda, basta con un botón, que pide confirmación para evitar toques accidentales, o con decir: necesito ayuda. Lazo avisa de inmediato a su círculo de cuidado y le ofrece llamar al nueve, uno, uno."),

    ("cuidador", telefono("07_cuidador_aviso.png", "Círculo de cuidado", NARANJA, "Lo que ve Laura", ["Se une con un código de 6 dígitos", "Solo lectura: no cambia nada", "El pedido de ayuda, primero y con alarma"]),
     "Su mamá, Laura, se unió al círculo con un código de seis dígitos. Ve, solo en lectura, sus tomas, sus citas y sus avisos, y el pedido de ayuda aparece primero, con alarma. Mateo puede quitarle el acceso cuando quiera."),

    ("isla", pagina(f"""<div class="lienzo centro" style="gap:28px"><span class="kicker" style="background:{AZUL};margin:0">Windows 11</span>
<h2 style="margin:0">El mismo día, también en la computadora</h2>
<img src="09_isla_windows.png" style="width:720px;border-radius:28px;box-shadow:0 40px 80px rgba(0,0,0,.45)"></div>""", oscuro=True),
     "En la computadora, Lazo vive en una barra en la parte superior de la pantalla. Muestra el mismo día, sincronizado con el teléfono, avisa de las tomas y de las citas, y el dictado por voz se procesa en la propia computadora."),

    ("accesibilidad", telefono("08_alto_contraste.png", "Accesibilidad", NOCHE, "El centro del proyecto", ["Contraste de al menos 7 a 1", "Letra hasta el doble y alto contraste", "Botones de 64 puntos o más", "Lector de pantalla en cada elemento", "Nada se dice solo con color"]),
     "La accesibilidad es el centro del proyecto: contraste de al menos siete a uno, modo amarillo sobre negro, letra hasta el doble de tamaño, botones de al menos sesenta y cuatro puntos, lector de pantalla en cada elemento, y ningún estado que se comunique solo con color."),

    ("apoyos", telefono("10_apoyos.png", "Apoyos", NARANJA, "Las convocatorias, en un solo lugar", ["Secretaría de Desarrollo Humano y Bien Común", "Las de discapacidad, primero", "Con su enlace oficial; sin inventar fechas"]),
     "Lazo también reúne las convocatorias de apoyo de la Secretaría de Desarrollo Humano y Bien Común, con las de discapacidad primero y el enlace oficial de cada una. No inventa fechas."),

    ("metodologia", pagina(f"""<div class="lienzo"><div class="texto"><span class="kicker" style="background:{PETROLEO}">Lo que se construyó</span><h2>Un prototipo que funciona de punta a punta</h2>
<div class="tarjetas"><div class="tarjeta" style="--c:{AZUL}"><b>Servidor</b><span>Propio, sin dependencias. Guarda los datos y calcula los avisos.</span></div>
<div class="tarjeta" style="--c:{VERDE}"><b>Android</b><span>Alarmas locales, voz, TalkBack y modo cuidador.</span></div>
<div class="tarjeta" style="--c:{MORADO}"><b>Windows 11</b><span>Barra superior con avisos y dictado local.</span></div></div>
<p class="lead"><b style="color:{VERDE}">452 pruebas automáticas</b>, incluidas pruebas de pantalla con lector y con letra al doble.</p></div></div>"""),
     "El prototipo funciona de punta a punta: un servidor propio, la aplicación para Android y el asistente para Windows. Está respaldado por cuatrocientas cincuenta y dos pruebas automáticas, incluidas pruebas de pantalla con lector y con letra al doble."),

    ("metas", pagina(f"""<div class="lienzo"><div class="texto"><span class="kicker" style="background:{NARANJA}">Resultados esperados</span><h2>Metas, con honestidad</h2>
<div class="cifras"><div class="cifra" style="--c:{AZUL}"><b>20</b><span>personas y sus cuidadores en un piloto acompañado (6 meses)</span></div>
<div class="cifra" style="--c:{VERDE}"><b>500</b><span>hogares con asociaciones y DIF municipales (2 años)</span></div>
<div class="cifra" style="--c:{MORADO}"><b>67</b><span>municipios: libre para cualquier persona del estado</span></div></div></div></div>"""),
     "Aún no hay resultados con personas usuarias reales, así que, con honestidad, estas son metas: un piloto con veinte personas y sus cuidadores en seis meses, quinientos hogares en dos años con asociaciones y DIF municipales, y libre para cualquier persona del estado."),

    ("replicable", pagina(f"""<div class="lienzo"><div class="texto" style="--c:{PETROLEO}"><span class="kicker" style="background:{PETROLEO}">Replicable y sostenible</span>
<h2>Para los 67 municipios de Chihuahua</h2><ul><li>Código abierto, sin cuentas ni pagos</li><li>Cada municipio, DIF o asociación instala el suyo</li><li>Cada instalación es dueña de sus datos</li><li>Las pruebas automáticas protegen cada cambio</li></ul></div></div>"""),
     "Lazo es código abierto, sin cuentas ni pagos. Cualquier municipio, DIF o asociación puede instalar su propio servidor, con sus propios datos, en los sesenta y siete municipios de Chihuahua."),

    ("cierre", pagina(f"""<div class="lienzo centro"><div style="width:160px;height:160px">{LOGO.replace('class="logo"', 'style="width:160px;height:160px"')}</div>
<h1 style="margin-top:34px;font-size:88px">Devuelve el control a la persona</h1><p class="lead" style="text-align:center;max-width:1400px">y tranquilidad a quien la cuida.</p>
<p class="lead" style="font-size:30px;margin-top:50px;color:#8FB4FF">github.com/ramonnajera/lazo · Gracias por su atención</p></div>""", oscuro=True, marca=False),
     "Lazo devuelve el control a la persona, y tranquilidad a quien la cuida. Gracias por su atención."),
]
