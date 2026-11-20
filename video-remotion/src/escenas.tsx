import React from "react";
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame, Easing } from "remotion";
import { C, FUENTE } from "./tema";
import { Clip, Cuenta, FondoVivo, Foto, Kicker, Logo, Marca, Puntos, Rotulo, Telefono, Titulo, useEntrada } from "./piezas";

type P = { dur: number };

/** Parte una escena en tramos: [peso, componente]. Cada tramo recibe su propia duración. */
const Tramos: React.FC<{ dur: number; partes: [number, (d: number) => React.ReactNode][] }> = ({ dur, partes }) => {
  const total = partes.reduce((a, [w]) => a + w, 0);
  let desde = 0;
  return (
    <>
      {partes.map(([w, render], i) => {
        const d = i === partes.length - 1 ? dur - desde : Math.round((dur * w) / total);
        const el = (
          <Sequence key={i} from={desde} durationInFrames={d}>
            <FundidoTramo dur={d} primero={i === 0} ultimo={i === partes.length - 1}>{render(d)}</FundidoTramo>
          </Sequence>
        );
        desde += d;
        return el;
      })}
    </>
  );
};

const FundidoTramo: React.FC<{ dur: number; primero: boolean; ultimo: boolean; children: React.ReactNode }> = ({ dur, primero, ultimo, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, primero ? 10 : 8, ultimo ? dur - 12 : dur - 1, dur], [primero ? 0 : 0.2, 1, 1, ultimo ? 0 : 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o, background: C.noche }}>{children}</AbsoluteFill>;
};

const Columna: React.FC<{ children: React.ReactNode; ancho?: number; claro?: boolean }> = ({ children, ancho = 820 }) => (
  <div style={{ position: "absolute", left: 130, top: 0, bottom: 200, width: ancho, display: "flex", flexDirection: "column", justifyContent: "center" }}>{children}</div>
);

/** Escena de la app: texto a la izquierda, teléfono con la captura real a la derecha. */
const App: React.FC<{ dur: number; cap: string; kicker: string; color: string; titulo: string; puntos: string[] }> = ({ cap, kicker, color, titulo, puntos }) => (
  <AbsoluteFill>
    <FondoVivo />
    <Marca />
    <Columna>
      <div><Kicker texto={kicker} color={color} /></div>
      <Titulo texto={titulo} size={66} />
      <Puntos items={puntos} color={color} />
    </Columna>
    <div style={{ position: "absolute", right: 230, top: 95 }}>
      <Telefono src={`cap/${cap}`} alto={800} />
    </div>
  </AbsoluteFill>
);

const ConRotulo: React.FC<{ children: React.ReactNode; kicker: string; titulo: string }> = ({ children, kicker, titulo }) => (
  <AbsoluteFill>
    {children}
    <AbsoluteFill style={{ background: "linear-gradient(0deg, rgba(11,18,32,.55) 0%, rgba(11,18,32,0) 45%)" }} />
    <Rotulo kicker={kicker} titulo={titulo} />
  </AbsoluteFill>
);

// ------------------------------------------------------------------- escenas

const Portada: React.FC<P> = () => {
  const e = useEntrada(4, 80);
  const f = useCurrentFrame();
  const sub = interpolate(f, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <FondoVivo />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 140, fontFamily: FUENTE, color: "#fff", textAlign: "center" }}>
        <div style={{ transform: `scale(${0.4 + e * 0.6}) rotate(${(1 - e) * -20}deg)`, opacity: e }}>
          <Logo size={190} style={{ borderRadius: 44, boxShadow: "0 30px 80px rgba(0,0,0,.5)" }} />
        </div>
        <Titulo texto="Lazo" size={150} desde={14} centro />
        <div style={{ fontSize: 40, lineHeight: 1.4, maxWidth: 1350, color: "#d9e2f2", opacity: sub }}>
          Un acompañante para las medicinas, las citas y el bienestar de personas con discapacidad visual, motriz o en el espectro autista, y para quienes las cuidan.
        </div>
        <div style={{ fontSize: 28, marginTop: 36, color: C.azulClaro, opacity: sub }}>Premio Estatal por la Discapacidad «Manuel Trueva Martínez 2026» · Chihuahua</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Tarjeta: React.FC<{ titulo: string; texto: string; color: string; desde: number; icono: string }> = ({ titulo, texto, color, desde, icono }) => {
  const e = useEntrada(desde, 100);
  return (
    <div style={{ flex: 1, background: "#fff", borderRadius: 32, padding: 40, borderTop: `14px solid ${color}`, transform: `translateY(${(1 - e) * 80}px)`, opacity: e, boxShadow: "0 20px 50px rgba(11,18,32,.08)" }}>
      <div style={{ fontSize: 56 }}>{icono}</div>
      <div style={{ fontSize: 42, fontWeight: 800, margin: "14px 0", color: C.texto }}>{titulo}</div>
      <div style={{ fontSize: 30, lineHeight: 1.4, color: C.texto2 }}>{texto}</div>
    </div>
  );
};

const Problema: React.FC<P> = () => (
  <AbsoluteFill>
    <FondoVivo claro />
    <Marca claro />
    <div style={{ position: "absolute", left: 130, right: 130, top: 130, fontFamily: FUENTE }}>
      <Kicker texto="El problema" color={C.rosa} />
      <Titulo texto="Cuidar la salud exige leer, recordar, tocar y coordinarse" claro size={62} />
      <div style={{ display: "flex", gap: 34, marginTop: 20 }}>
        <Tarjeta titulo="Visual" texto="Etiquetas, recetas y pantallas pequeñas que no se pueden leer." color={C.azul} desde={40} icono="👁️" />
        <Tarjeta titulo="Motriz" texto="Botones diminutos y gestos que exigen precisión." color={C.verde} desde={60} icono="✋" />
        <Tarjeta titulo="Espectro autista" texto="Cambios de rutina que angustian y llamadas difíciles." color={C.morado} desde={80} icono="🧩" />
      </div>
    </div>
  </AbsoluteFill>
);

const Cifra: React.FC<{ color: string; desde: number; grande: React.ReactNode; texto: string }> = ({ color, desde, grande, texto }) => {
  const e = useEntrada(desde, 100);
  return (
    <div style={{ flex: 1, background: "#fff", borderRadius: 32, padding: "44px 40px", border: `4px solid ${color}`, transform: `scale(${0.85 + e * 0.15})`, opacity: e }}>
      <div style={{ fontSize: 96, fontWeight: 800, color, letterSpacing: -2 }}>{grande}</div>
      <div style={{ fontSize: 30, lineHeight: 1.35, color: C.texto2, marginTop: 14 }}>{texto}</div>
    </div>
  );
};

const Datos: React.FC<P> = () => (
  <AbsoluteFill>
    <FondoVivo claro />
    <Marca claro />
    <div style={{ position: "absolute", left: 130, right: 130, top: 140, fontFamily: FUENTE }}>
      <Kicker texto="Los datos" color={C.naranja} />
      <Titulo texto="Un problema grande y cercano" claro size={64} />
      <div style={{ display: "flex", gap: 36, marginTop: 20 }}>
        <Cifra color={C.azul} desde={20} grande={<Cuenta hasta={587035} desde={24} dur={60} />} texto="personas con alguna limitación o discapacidad en Chihuahua (Plan Estatal de Desarrollo 2022-2027)" />
        <Cifra color={C.morado} desde={150} grande={<>1 de <Cuenta hasta={100} desde={155} dur={30} /></>} texto="niñas y niños en el espectro autista en el mundo (OMS)" />
        <Cifra color={C.rosa} desde={260} grande={<>≈ <Cuenta hasta={50} desde={265} dur={30} /> %</>} texto="sigue su tratamiento a largo plazo en enfermedades crónicas (OMS)" />
      </div>
    </div>
  </AbsoluteFill>
);

const Lista: React.FC<{ kicker: string; color: string; titulo: string; puntos: string[]; derecha?: React.ReactNode }> = ({ kicker, color, titulo, puntos, derecha }) => (
  <AbsoluteFill>
    <FondoVivo />
    <Marca />
    <Columna ancho={derecha ? 900 : 1500}>
      <div><Kicker texto={kicker} color={color} /></div>
      <Titulo texto={titulo} size={68} />
      <Puntos items={puntos} color={color} size={38} />
    </Columna>
    {derecha}
  </AbsoluteFill>
);

const FotoRedonda: React.FC<{ src: string }> = ({ src }) => {
  const e = useEntrada(10, 80);
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", right: 140, top: 150, width: 640, height: 640, borderRadius: "50%", overflow: "hidden", border: "10px solid rgba(255,255,255,.9)", boxShadow: "0 40px 90px rgba(0,0,0,.5)", transform: `scale(${0.7 + e * 0.3})`, opacity: e }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% 30%", transform: `scale(${1.25 + f / 3000})` }} />
    </div>
  );
};

const Objetivo: React.FC<P> = () => (
  <Lista kicker="El objetivo" color={C.verde} titulo="Autonomía para la persona, tranquilidad para quien la cuida"
    puntos={["Gratuito y de código abierto", "En el teléfono y en la computadora", "Accesible desde su diseño", "No es asistencialista: la persona decide"]}
    derecha={<FotoRedonda src="hf/s4_juntos.png" />} />
);

const Mateo: React.FC<P> = ({ dur }) => (
  <ConRotulo kicker="Persona ficticia" titulo="Mateo, un joven autista de Chihuahua">
    <Clip src="hf/clip_mateo.mp4" dur={dur} />
  </ConRotulo>
);

const Isla: React.FC<P> = ({ dur }) => {
  const f = useCurrentFrame();
  // pantalla verde del monitor en la imagen de Higgsfield (proporciones medidas)
  const M = { x: 36.76, y: 23.42, w: 39.14, h: 38.09 };
  const z = interpolate(f, [dur * 0.35, dur * 0.75], [1, 2.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const cx = M.x + M.w / 2, cy = M.y + M.h * 0.22;
  return (
    <ConRotulo kicker="Windows 11" titulo="El mismo día, también en la computadora">
      <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: `${cx}% ${cy}%` }}>
        <Img src={staticFile("hf/s5_escritorio.png")} style={{ width: "100%", height: "100%" }} />
        <div style={{ position: "absolute", left: `${M.x}%`, top: `${M.y}%`, width: `${M.w}%`, height: `${M.h}%`, background: `linear-gradient(180deg, #0b1220, #183a7a)`, overflow: "hidden" }}>
          <Img src={staticFile("cap/09_isla_windows.png")} style={{ width: "62%", position: "absolute", left: "19%", top: 0 }} />
        </div>
      </AbsoluteFill>
    </ConRotulo>
  );
};

const Metodologia: React.FC<P> = () => (
  <AbsoluteFill>
    <FondoVivo claro />
    <Marca claro />
    <div style={{ position: "absolute", left: 130, right: 130, top: 130, fontFamily: FUENTE }}>
      <Kicker texto="Lo que se construyó" color={C.petroleo} />
      <Titulo texto="Un prototipo que funciona de punta a punta" claro size={62} />
      <div style={{ display: "flex", gap: 34 }}>
        <Tarjeta titulo="Servidor" texto="Propio, sin dependencias. Guarda los datos y calcula los avisos." color={C.azul} desde={30} icono="🗄️" />
        <Tarjeta titulo="Android" texto="Alarmas locales, voz, TalkBack y modo cuidador." color={C.verde} desde={45} icono="📱" />
        <Tarjeta titulo="Windows 11" texto="Barra superior con avisos y dictado local." color={C.morado} desde={60} icono="💻" />
      </div>
      <div style={{ fontSize: 40, marginTop: 44, color: C.texto2 }}>
        <b style={{ color: C.verde, fontSize: 64 }}><Cuenta hasta={452} desde={150} dur={50} /></b> pruebas automáticas, incluidas pruebas con lector de pantalla y letra al doble.
      </div>
    </div>
  </AbsoluteFill>
);

const Metas: React.FC<P> = () => (
  <AbsoluteFill>
    <FondoVivo claro />
    <Marca claro />
    <div style={{ position: "absolute", left: 130, right: 130, top: 120, fontFamily: FUENTE }}>
      <Kicker texto="Resultados" color={C.naranja} />
      <Titulo texto="Ya se usa en casa, y esto es lo que sigue" claro size={60} />
      <div style={{ fontSize: 36, color: C.texto2, marginTop: -10, marginBottom: 30 }}>Ramón lo ha probado en el cuidado de su hijo.</div>
      <div style={{ display: "flex", gap: 36 }}>
        <Cifra color={C.azul} desde={70} grande={<Cuenta hasta={20} desde={75} dur={25} />} texto="personas y sus cuidadores en un piloto acompañado (6 meses)" />
        <Cifra color={C.verde} desde={140} grande={<Cuenta hasta={500} desde={145} dur={30} />} texto="hogares con asociaciones y DIF municipales (2 años)" />
        <Cifra color={C.morado} desde={210} grande={<Cuenta hasta={67} desde={215} dur={25} />} texto="municipios: libre para cualquier persona del estado" />
      </div>
    </div>
  </AbsoluteFill>
);

const Cierre: React.FC<P> = () => {
  const e = useEntrada(4, 80);
  return (
    <AbsoluteFill>
      <FondoVivo />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 150, fontFamily: FUENTE, color: "#fff", textAlign: "center" }}>
        <div style={{ transform: `scale(${0.5 + e * 0.5})`, opacity: e }}><Logo size={170} /></div>
        <Titulo texto="Devuelve el control a la persona" size={92} desde={10} centro />
        <div style={{ fontSize: 44, color: "#d9e2f2" }}>y tranquilidad a quien la cuida.</div>
        <div style={{ fontSize: 30, marginTop: 50, color: C.azulClaro }}>github.com/ramonnajera/lazo · Gracias por su atención</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------- mapa

export const ESCENAS: Record<string, React.FC<P>> = {
  "00_portada": Portada,
  "01_problema": Problema,
  "02_datos": Datos,
  "03_objetivo": Objetivo,
  "04_mateo": Mateo,
  "05_hoy": ({ dur }) => (
    <Tramos dur={dur} partes={[
      [0.4, (d) => <ConRotulo kicker="Hoy" titulo="Su medicina, a tiempo"><Clip src="hf/clip_pastilla.mp4" dur={d} /></ConRotulo>],
      [0.6, (d) => <App dur={d} cap="01_hoy.png" kicker="Inicio" color={C.azul} titulo="Lo primero: hablar con Lazo" puntos={["La medicina que toca, en letra grande", "Alarma sin internet, leída en voz alta", "Un solo toque: «Ya la tomé»"]} />],
    ]} />
  ),
  "06_chat": ({ dur }) => (
    <Tramos dur={dur} partes={[
      [0.35, (d) => <ConRotulo kicker="Hablar con Lazo" titulo="Por voz o por escrito"><Foto src="hf/m_telefono_hoy.png" dur={d} /></ConRotulo>],
      [0.65, (d) => <App dur={d} cap="05_hablar_con_lazo.png" kicker="Hablar con Lazo" color={C.azul} titulo="Por voz o por escrito" puntos={["Lenguaje natural: «¿qué tengo mañana?»", "Frases sugeridas para quien prefiere tocar", "Nunca diagnostica ni cambia una dosis"]} />],
    ]} />
  ),
  "07_citas": ({ dur }) => (
    <Tramos dur={dur} partes={[
      [0.45, (d) => <ConRotulo kicker="Citas" titulo="Llega tranquilo a su terapia"><Clip src="hf/clip_espera.mp4" dur={d} /></ConRotulo>],
      [0.55, (d) => <App dur={d} cap="03_citas.png" kicker="Citas" color={C.morado} titulo="Sin sorpresas" puntos={["Notas pensadas para él: sus audífonos", "Recordatorio la víspera", "Y otro dos horas antes"]} />],
    ]} />
  ),
  "08_medicinas": ({ dur }) => <App dur={dur} cap="02_medicinas.png" kicker="Medicinas" color={C.verde} titulo="Para cuántos días alcanza" puntos={["Sigue el calendario real de cada medicina", "Avisa a tiempo para resurtir"]} />,
  "09_salud": ({ dur }) => <App dur={dur} cap="04_salud.png" kicker="Cómo estoy" color={C.rosa} titulo="Anotar es fácil" puntos={["Presión, glucosa, ánimo, dolor y peso", "Botones grandes de colores", "Avisos orientativos, nunca un diagnóstico"]} />,
  "10_ayuda": ({ dur }) => <App dur={dur} cap="06_necesito_ayuda.png" kicker="Necesito ayuda" color={C.rosa} titulo="Pedir ayuda en un momento difícil" puntos={["Un botón con confirmación", "O decir: «necesito ayuda»", "Aviso inmediato al círculo y el 911"]} />,
  "11_cuidador": ({ dur }) => (
    <Tramos dur={dur} partes={[
      [0.45, (d) => <ConRotulo kicker="Círculo de cuidado" titulo="Laura recibe el aviso al instante"><Clip src="hf/clip_laura.mp4" dur={d} /></ConRotulo>],
      [0.55, (d) => <App dur={d} cap="07_cuidador_aviso.png" kicker="Círculo de cuidado" color={C.naranja} titulo="Lo que ve Laura" puntos={["Se une con un código de 6 dígitos", "Solo lectura: no cambia nada", "El pedido de ayuda, primero y con alarma"]} />],
    ]} />
  ),
  "12_isla": Isla,
  "13_accesibilidad": ({ dur }) => <App dur={dur} cap="08_alto_contraste.png" kicker="Accesibilidad" color={C.noche} titulo="El centro del proyecto" puntos={["Contraste de al menos 7 a 1", "Letra hasta el doble y alto contraste", "Botones de 64 puntos o más", "Lector de pantalla en cada elemento", "Nada se dice solo con color"]} />,
  "14_apoyos": ({ dur }) => <App dur={dur} cap="10_apoyos.png" kicker="Apoyos" color={C.naranja} titulo="Las convocatorias, en un solo lugar" puntos={["Secretaría de Desarrollo Humano y Bien Común", "Las de discapacidad, primero", "Con su enlace oficial; sin inventar fechas"]} />,
  "15_metodologia": Metodologia,
  "16_metas": ({ dur }) => (
    <Tramos dur={dur} partes={[
      [0.35, (d) => <ConRotulo kicker="Resultados" titulo="Probado en casa, en el cuidado de un hijo"><Foto src="hf/s8_terapia.png" dur={d} /></ConRotulo>],
      [0.65, (d) => <Metas dur={d} />],
    ]} />
  ),
  "17_replicable": () => (
    <Lista kicker="Replicable y sostenible" color={C.petroleo} titulo="Para los 67 municipios de Chihuahua"
      puntos={["Código abierto, sin cuentas ni pagos", "Cada municipio, DIF o asociación instala el suyo", "Cada instalación es dueña de sus datos", "Las pruebas automáticas protegen cada cambio"]} />
  ),
  "18_cierre": ({ dur }) => (
    <Tramos dur={dur} partes={[
      [0.5, (d) => <ConRotulo kicker="Lazo" titulo="Autonomía para él, tranquilidad para ella"><Clip src="hf/clip_juntos.mp4" dur={d} /></ConRotulo>],
      [0.5, (d) => <Cierre dur={d} />],
    ]} />
  ),
};
