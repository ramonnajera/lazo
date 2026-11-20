import Demo from "./Demo";

const REPO = "https://github.com/ramonnajera/lazo";

function Logo({ size = 40 }: { size?: number }) {
  return <img src="/img/logo.svg" width={size} height={size} alt="" className="logo" />;
}

const FUNCIONES = [
  { img: "01_hoy", color: "c-hoy", t: "Hoy, de un vistazo", d: "La siguiente medicina en grande, con «Ya la tomé», «Pospón» u «Omitir». Al llegar la hora, una alarma que no se pierde." },
  { img: "05_hablar_con_lazo", color: "c-voz", t: "Hablar con Lazo", d: "Notas de voz como en un chat: «ya me la tomé», «anota mi presión», «¿cuándo es mi cita?». Lazo entiende y contesta en voz alta." },
  { img: "03_citas", color: "c-citas", t: "Citas sin sorpresas", d: "Cada cita con lugar, transporte y notas: «llevar audífonos», «avisarle un día antes». Recordatorio el día anterior." },
  { img: "04_salud", color: "c-salud", t: "Salud y ánimo", d: "Presión, glucosa, peso, ánimo y dolor en pocos toques. Si un dato sale de rango, Lazo lo dice con palabras, no solo con color." },
  { img: "06_necesito_ayuda", color: "c-ayuda", t: "Necesito ayuda", d: "Un botón siempre visible que avisa al círculo de cuidado al instante, con el mensaje que la persona quiera." },
  { img: "07_cuidador_aviso", color: "c-cuida", t: "Quien cuida, tranquilo", d: "La mamá, el hermano o el terapeuta ven si se tomó la medicina y reciben aviso si se omite o si hay un dato fuera de rango." },
];

const ACCESIBLE = [
  { n: "7:1", t: "Contraste mínimo en textos y botones" },
  { n: "2×", t: "Letra hasta el doble de tamaño sin romper pantallas" },
  { n: "64 pt", t: "Botones grandes, fáciles para manos con temblor" },
  { n: "100 %", t: "Elementos con nombre para TalkBack y lectores de pantalla" },
];

export default function App() {
  return (
    <>
      <header className="nav">
        <a href="#" className="nav-marca" aria-label="Lazo, inicio">
          <Logo size={34} /> Lazo
        </a>
        <nav aria-label="Secciones">
          <a href="#probar">Probar</a>
          <a href="#video">Video</a>
          <a href="#como">Cómo funciona</a>
          <a href="#accesible">Accesibilidad</a>
          <a href={REPO} target="_blank" rel="noopener">Código</a>
        </nav>
      </header>

      <main>
        <section className="heroe" id="probar">
          <div className="manchas" aria-hidden />
          <div className="heroe-in">
            <div className="heroe-txt">
              <span className="kicker">Premio Estatal por la Discapacidad 2026 · Chihuahua</span>
              <h1>
                Tus medicinas, tus citas y tu bienestar, <span className="resalta">a una voz de distancia.</span>
              </h1>
              <p className="lead">
                Lazo acompaña el cuidado diario de la salud de personas con discapacidad visual, motriz o en el espectro autista, y mantiene
                tranquilo a quien las cuida. Gratuito, de código abierto y accesible desde su diseño.
              </p>
              <ul className="heroe-puntos">
                <li>Esta es la app real de Lazo, funcionando aquí mismo.</li>
                <li>Toca «Ya la tomé», cambia de sección o háblale con el micrófono.</li>
                <li>Sin cuentas: tus cambios viven solo en tu navegador.</li>
              </ul>
              <div className="botones">
                <a className="btn pri" href="#video">▶ Ver el video (5 min)</a>
                <a className="btn" href={REPO} target="_blank" rel="noopener">Ver el código</a>
              </div>
            </div>
            <Demo />
          </div>
        </section>

        <section className="bloque" id="video">
          <div className="ancho">
            <span className="kicker oscuro">Presentación</span>
            <h2>Lazo en cinco minutos</h2>
            <p className="sub">El problema, la propuesta y la app funcionando, con la historia de Mateo y su mamá.</p>
            <div className="video">
              <video controls preload="metadata" poster="/video/portada.jpg" playsInline>
                <source src="/video/lazo.mp4" type="video/mp4" />
                Tu navegador no puede reproducir el video. <a href="/video/lazo.mp4">Descárgalo aquí</a>.
              </video>
            </div>
          </div>
        </section>

        <section className="bloque claro2">
          <div className="ancho dos">
            <img className="foto" src="/img/mateo.webp" alt="Mateo, un joven con audífonos de cancelación de ruido, sentado en la mesa de su casa junto a su pastillero y su agenda visual." decoding="async" />
            <div>
              <span className="kicker oscuro">El problema</span>
              <h2>Cuando falla un paso, falla el tratamiento</h2>
              <p>
                Cuidar la salud todos los días exige leer, recordar, tocar botones pequeños y coordinarse con otras personas. Para una persona con
                discapacidad visual o motriz, o para una persona autista, cada uno de esos pasos puede ser una barrera.
              </p>
              <p>Se omite una dosis, se pierde una cita, o quien cuida se entera tarde. Lazo existe para que eso no pase.</p>
              <div className="cifras">
                <div>
                  <b>587,035</b>
                  <span>personas con alguna limitación o discapacidad en Chihuahua</span>
                </div>
                <div>
                  <b>1 de 100</b>
                  <span>niñas y niños está en el espectro autista (OMS)</span>
                </div>
                <div>
                  <b>~50 %</b>
                  <span>sigue su tratamiento crónico a largo plazo (OMS)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bloque" id="como">
          <div className="ancho">
            <span className="kicker oscuro">Cómo funciona</span>
            <h2>Todo lo del día, en una sola app</h2>
            <p className="sub">En el teléfono Android y en la computadora con Windows, con los mismos datos sincronizados.</p>
            <div className="funciones">
              {FUNCIONES.map((f) => (
                <article key={f.img} className={`funcion ${f.color}`}>
                  <div className="cel">
                    <img src={`/img/${f.img}.webp`} alt={`Pantalla de Lazo: ${f.t}`} loading="lazy" />
                  </div>
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bloque oscuro" id="accesible">
          <div className="ancho dos invertido">
            <div>
              <span className="kicker">Accesibilidad</span>
              <h2>Accesible desde el diseño, no como agregado</h2>
              <p>
                Modo amarillo sobre negro, voz para leer el día completo, y ningún estado que se comunique solo con color: cada aviso lleva
                palabra y signo. La persona decide y actúa; la tecnología se adapta a ella.
              </p>
              <div className="acc">
                {ACCESIBLE.map((a) => (
                  <div key={a.n}>
                    <b>{a.n}</b>
                    <span>{a.t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="cel grande">
              <img src="/img/08_alto_contraste.webp" alt="Lazo en modo de alto contraste: letras amarillas sobre fondo negro." loading="lazy" />
            </div>
          </div>
        </section>

        <section className="bloque">
          <div className="ancho dos">
            <img className="foto" src="/img/09_isla_windows.webp" alt="La isla de Lazo en Windows: una barra arriba de la pantalla con la siguiente medicina y botones de colores." decoding="async" />
            <div>
              <span className="kicker oscuro">En la computadora</span>
              <h2>La isla de Lazo para Windows</h2>
              <p>
                Una barra discreta en la parte de arriba de la pantalla muestra la siguiente medicina. Con una tecla se abre para hablar con Lazo,
                ver las citas o registrar un dato, sin dejar lo que estás haciendo. Es la misma que estás probando arriba.
              </p>
              <p>Reconoce la voz en la propia computadora, sin enviar el audio a internet.</p>
            </div>
          </div>
        </section>

        <section className="bloque claro2">
          <div className="ancho dos invertido">
            <div>
              <span className="kicker oscuro">Lo que sigue</span>
              <h2>Ya se usa en casa, y esto es lo que sigue</h2>
              <p>
                Lazo ya se ha probado en casa: Ramón lo ha usado en el cuidado de su hijo. El prototipo funciona de punta a punta, con servidor
                propio, app para Android y asistente para Windows, respaldado por 452 pruebas automáticas.
              </p>
              <div className="cifras">
                <div>
                  <b>20</b>
                  <span>personas y sus cuidadores en un piloto de seis meses</span>
                </div>
                <div>
                  <b>500</b>
                  <span>hogares en dos años, con asociaciones y DIF municipales</span>
                </div>
                <div>
                  <b>67</b>
                  <span>municipios de Chihuahua pueden instalar su propio servidor</span>
                </div>
              </div>
            </div>
            <img className="foto" src="/img/juntos.webp" alt="Mateo y su mamá, Laura, abrazados en la sala de su casa." decoding="async" />
          </div>
        </section>

        <section className="cta">
          <Logo size={64} />
          <h2>Código abierto, sin cuentas ni pagos</h2>
          <p>Cualquier municipio, DIF o asociación puede instalar su propio servidor, con sus propios datos.</p>
          <div className="botones centro">
            <a className="btn pri" href={REPO} target="_blank" rel="noopener">Ver Lazo en GitHub</a>
            <a className="btn claro" href="#probar">Probar la demo</a>
          </div>
        </section>
      </main>

      <footer className="pie">
        <p>
          <b>Lazo</b> · Proyecto para el Premio Estatal por la Discapacidad «Manuel Trueva Martínez» 2026, Chihuahua.
        </p>
        <p>Mateo, Laura y sus datos son ficticios; las imágenes de personas fueron generadas para ilustrar. Licencia MIT.</p>
      </footer>
    </>
  );
}
