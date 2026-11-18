#!/usr/bin/env python3
"""Genera el ensayo de postulación en Word con el formato que piden las bases del Premio Estatal por la Discapacidad
«Manuel Trueva Martínez 2026»: Arial 12, interlineado 1.5 y texto justificado.

    python3 construir_ensayo.py        →  PMT2026_Lazo_ensayo.docx
"""
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt, Cm, RGBColor

# Cifras de las pruebas automáticas del prototipo (se actualizan al cerrar la entrega)
PRUEBAS = {"servidor": 60, "android": 44, "escritorio_web": 137, "escritorio_rust": 84}
TOTAL_PRUEBAS = sum(PRUEBAS.values())

doc = Document()
sec = doc.sections[0]
sec.left_margin = sec.right_margin = Cm(2.5)
sec.top_margin = sec.bottom_margin = Cm(2.5)

normal = doc.styles["Normal"]
normal.font.name = "Arial"
normal.font.size = Pt(12)
normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")


def formato(p, sangria=0.0, espacio_despues=6):
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.space_after = Pt(espacio_despues)
    p.paragraph_format.left_indent = Cm(sangria)
    return p


def _run(p, texto, negrita=False, cursiva=False, color=None):
    r = p.add_run(texto)
    r.font.name = "Arial"
    r.font.size = Pt(12)
    r._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    r.bold = negrita
    r.italic = cursiva
    if color:
        r.font.color.rgb = RGBColor(*color)
    return r


def titulo(texto):
    p = formato(doc.add_paragraph(), espacio_despues=4)
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.keep_with_next = True
    _run(p, texto, negrita=True)


def parrafo(texto):
    p = formato(doc.add_paragraph())
    # **negrita** simple dentro del texto
    partes = texto.split("**")
    for i, t in enumerate(partes):
        if t:
            _run(p, t, negrita=(i % 2 == 1))


def vineta(texto):
    p = formato(doc.add_paragraph(), sangria=0.9, espacio_despues=3)
    p.paragraph_format.first_line_indent = Cm(-0.5)
    partes = ("• " + texto).split("**")
    for i, t in enumerate(partes):
        if t:
            _run(p, t, negrita=(i % 2 == 1))


def marca(texto):
    """Dato que solo la persona postulante puede llenar: se ve en amarillo para que no se escape."""
    p = formato(doc.add_paragraph())
    r = _run(p, texto)
    rpr = r._element.get_or_add_rPr()
    from docx.oxml import OxmlElement
    h = OxmlElement("w:highlight")
    h.set(qn("w:val"), "yellow")
    rpr.append(h)


# ---------------------------------------------------------------- contenido

p = formato(doc.add_paragraph())
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
_run(p, "Premio Estatal por la Discapacidad «Manuel Trueva Martínez 2026»", negrita=True)
p = formato(doc.add_paragraph())
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
_run(p, "Ensayo de postulación", cursiva=True)

titulo("Título del proyecto")
parrafo("**Lazo**: un acompañante para las medicinas, las citas y el bienestar de personas con discapacidad visual o motriz, y para quienes las cuidan.")

titulo("Datos generales")
marca("Nombre de la persona postulante: [ESCRIBE AQUÍ TU NOMBRE COMPLETO]")
marca("Dirección y datos de contacto: [DOMICILIO EN EL ESTADO DE CHIHUAHUA · TELÉFONO · CORREO ELECTRÓNICO]")
parrafo("Persona física con domicilio en el Estado de Chihuahua.")

titulo("Descripción del proyecto")
parrafo("**Objetivo general.** Dar autonomía a las personas con discapacidad visual o motriz en el cuidado cotidiano de su salud (tomar sus medicamentos a tiempo, llegar a sus consultas y registrar cómo se sienten) y mantener informada a la persona que las acompaña, mediante una herramienta gratuita, de código abierto y accesible desde su diseño, que funciona en el teléfono y en la computadora.")
parrafo("**Objetivos específicos.**")
vineta("Que cada toma de medicamento llegue como una alarma que funciona sin internet, que se lea en voz alta y que se confirme con un solo toque grande o con la voz.")
vineta("Que la persona lleve su agenda de consultas y un seguimiento sencillo (presión, glucosa, ánimo, dolor y peso) sin depender de otra persona para leer o anotar.")
vineta("Que el cuidador (familiar, vecino o profesional) reciba avisos oportunos, por ejemplo una dosis sin confirmar, sin poder modificar ni ver más de lo que la persona decida compartir.")
vineta("Reunir en la aplicación y en el asistente de escritorio las convocatorias de apoyo de la Secretaría de Desarrollo Humano y Bien Común, con las de discapacidad primero y con el enlace oficial de cada una.")
vineta("Publicar el proyecto como software libre para que cualquier municipio u organización lo aloje con sus propios datos.")
parrafo("**Justificación.** Una persona con discapacidad visual no puede leer con facilidad la etiqueta de un medicamento, una receta o una pantalla pequeña. Una persona con discapacidad motriz puede tener dificultad para tocar con precisión un botón pequeño o para deslizar el dedo. Las aplicaciones de recordatorios más comunes suponen buena vista y destreza. El resultado son dosis omitidas, citas olvidadas, dependencia de terceros y un cuidador que se entera tarde. Lazo parte de la idea contraria: la persona decide y actúa; la tecnología se adapta a ella. Por eso no entrega bienes ni servicios asistenciales: entrega una herramienta que le devuelve el control.")
parrafo("**Personas beneficiadas.** Personas con **discapacidad visual** (baja visión y ceguera) y con **discapacidad motriz** (movilidad reducida de manos y brazos, temblor, fuerza limitada), así como sus cuidadores y sus familias. De forma secundaria, quien tenga dificultades de memoria o de rutinas se beneficia de los mismos recordatorios, aunque ese no es el foco del proyecto.")

titulo("Contexto y problema")
parrafo("**Descripción de la problemática.** Cuidar la salud todos los días exige leer, recordar, manipular objetos y coordinarse con otras personas. Para quien tiene una discapacidad visual o motriz cada una de esas acciones puede ser una barrera. Cuando falla una, falla el tratamiento: se omite una dosis, se pierde una cita o un cambio importante pasa inadvertido para quien cuida.")
parrafo("**Barreras que se pretenden eliminar.**")
vineta("**De lectura:** etiquetas, recetas y pantallas pequeñas. Lazo lee en voz alta, usa letra grande y un modo de alto contraste.")
vineta("**De manipulación:** botones diminutos y gestos de precisión. Lazo usa botones de al menos 64 dp, una acción principal por pantalla («Ya la tomé») y órdenes por voz.")
vineta("**De información:** las convocatorias de apoyo están dispersas y varias se publican solo como imagen. Lazo las reúne y las muestra con su enlace oficial.")
vineta("**De comunicación con el cuidador:** hoy depende de llamadas o mensajes manuales. Lazo avisa de forma automática y solo en lectura.")
vineta("**Económicas y de conectividad:** muchas aplicaciones piden suscripción, cuenta o conexión permanente. Lazo es gratuito, sin cuentas y sus alarmas funcionan sin internet.")
parrafo("**Evidencias y datos que lo sustentan.**")
vineta("El Plan Estatal de Desarrollo 2022-2027, citado en un documento del Congreso del Estado de Chihuahua, reporta **587,035 personas con alguna limitación o discapacidad** en el estado, de 3,741,869 habitantes según el Censo 2020 (alrededor del 15.7 %; es una categoría más amplia que «discapacidad»).")
vineta("A nivel nacional, el Censo 2020 del INEGI, citado por la Comisión Nacional de los Derechos Humanos, contabiliza 6,179,890 personas con discapacidad, el 4.9 % de la población.")
vineta("La Organización Mundial de la Salud ha señalado que, en los países desarrollados, la observancia de los tratamientos a largo plazo en enfermedades crónicas es de solo alrededor del 50 % (informe «Adherencia a los tratamientos a largo plazo», 2003). Es un dato general, no específico de discapacidad, pero muestra la dimensión del problema.")
vineta("Observación propia al revisar el portal de convocatorias de la Secretaría de Desarrollo Humano y Bien Común el 18 de noviembre de 2026: 18 convocatorias vigentes, de las cuales 3 son para personas con discapacidad y 6 se publican únicamente como imagen; la lista no indica fechas límite ni estado.")

titulo("Acciones y metodología")
parrafo("**Actividades realizadas.** Se construyó un prototipo funcional con tres piezas que trabajan juntas: (1) un servidor propio, sin dependencias externas y sin servicios de inteligencia artificial de terceros, que guarda los datos y calcula los avisos; (2) una aplicación para Android con alarmas locales, lectura en voz alta y órdenes por voz; y (3) un asistente para Windows 11, una barra superior con dictado y órdenes por voz locales, avisos de dosis y la sección de convocatorias. El conjunto cuenta con " + str(TOTAL_PRUEBAS) + " pruebas automáticas que pasan (" + str(PRUEBAS["servidor"]) + " del servidor, " + str(PRUEBAS["android"]) + " de Android y " + str(PRUEBAS["escritorio_web"] + PRUEBAS["escritorio_rust"]) + " del asistente de escritorio), entre ellas pruebas de pantalla con el lector de pantalla y con letra al doble de tamaño.")
parrafo("**Metodología.** Diseño centrado en la accesibilidad desde el primer día, no como un añadido: contraste de al menos 7:1, objetivos táctiles de 64 dp o más, descripciones para TalkBack en cada elemento, estados que nunca se comunican solo con color (siempre llevan texto y un signo), y una navegación que se convierte en un menú de botones grandes cuando la letra se amplía. Las decisiones se verifican con pruebas automáticas y con capturas revisadas a distintos tamaños de letra. Los avisos de valores fuera de rango son orientativos y nunca un diagnóstico.")
parrafo("**Cronograma (opcional).**")
vineta("**Fase 1 (realizada):** prototipo funcional de servidor, Android y Windows, con datos ficticios.")
vineta("**Fase 2 (meses 1 y 2):** piloto con personas con discapacidad visual y motriz y con sus cuidadores, con apoyo de organizaciones de la sociedad civil; ajustes según lo que aprendan al usarlo.")
vineta("**Fase 3 (meses 3 y 4):** revisión de accesibilidad con las propias personas usuarias, guía de instalación para municipios y asociaciones.")
vineta("**Fase 4 (meses 5 y 6):** avisos instantáneos al cuidador, versión para iOS y publicación de la versión 1.0.")

titulo("Resultados o expectativas")
parrafo("**Impacto logrado.** El proyecto está en etapa de desarrollo avanzado: existe un prototipo que funciona de punta a punta (se crea una persona, se programan medicinas, suena y se lee la alarma, se confirma con un toque o con la voz, el cuidador recibe el aviso y ambos pueden consultar las convocatorias de la Secretaría). Todavía no hay resultados con personas usuarias reales; por honestidad, los resultados siguientes son metas y no logros.")
parrafo("**Número estimado de personas beneficiadas (metas propuestas).**")
vineta("**Corto plazo (6 meses):** 20 personas con discapacidad y 20 cuidadores en un piloto acompañado.")
vineta("**Mediano plazo (2 años):** 500 hogares en varios municipios del estado, a través de asociaciones y DIF municipales.")
vineta("**Largo plazo:** cualquier persona del estado que lo necesite, porque el proyecto es libre y se puede instalar sin costo de licencia.")

titulo("Replicabilidad y sostenibilidad")
parrafo("**¿Se puede replicar en los 67 municipios del Estado?** Sí. El servidor no tiene dependencias y se inicia con un solo comando; la aplicación se instala desde un archivo APK; no hay cuentas, suscripciones ni servicios de pago; los textos están en español y las convocatorias se leen del portal estatal, que es el mismo para todos los municipios. Cada municipio o asociación puede alojar su propio servidor, con sus propios datos, en una computadora sencilla o en un servicio de bajo costo.")
parrafo("**¿Cómo se mantiene en el tiempo?** Con código abierto y documentado, con " + str(TOTAL_PRUEBAS) + " pruebas automáticas que protegen cada cambio, con un costo de operación mínimo y sin depender de un proveedor. Los datos pertenecen a cada instalación. La ruta de continuidad propone mantenimiento comunitario y, si la Secretaría lo considera conveniente, un convenio para vincular el proyecto con otras dependencias que puedan apoyar su implementación.")

titulo("Material de apoyo")
vineta("Video de presentación y demostración de 3 a 10 minutos (archivo PMT2026_Lazo, en Google Drive).")
vineta("Código fuente y documentación del proyecto (servidor, Android y Windows).")
vineta("Capturas de pantalla a tamaño normal, con alto contraste y con letra al doble de tamaño.")
parrafo("Toda la demostración usa personas y datos ficticios; el proyecto no contiene información de personas reales.")

doc.save("PMT2026_Lazo_ensayo.docx")
print("listo: PMT2026_Lazo_ensayo.docx")
