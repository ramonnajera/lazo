import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import narracion from "./narracion.json";
import { ESCENAS } from "./escenas";
import { ANTES, C, DESPUES, FPS, FUENTE } from "./tema";
import { Fundido } from "./piezas";

type Escena = { id: string; texto: string; dur: number };
const lista = narracion as Escena[];

/** Duración (en cuadros) y comienzo de cada escena. */
export const PLAN = (() => {
  let desde = 0;
  return lista.map((e) => {
    const dur = Math.ceil((e.dur + ANTES + DESPUES) * FPS);
    const p = { ...e, desde, cuadros: dur };
    desde += dur;
    return p;
  });
})();
export const TOTAL = PLAN.reduce((a, e) => a + e.cuadros, 0);

/** Subtítulos de un renglón: la frase se reparte en trozos de ≤ 52 letras, con tiempo proporcional a su largo. */
const trozos = (texto: string) => {
  const out: string[] = [];
  let cur = "";
  for (const w of texto.split(/\s+/)) {
    if (cur && (cur.length + 1 + w.length > 52 || /[.:;?!]$/.test(cur))) {
      out.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out;
};

const Subtitulos: React.FC<{ texto: string; voz: number }> = ({ texto, voz }) => {
  const f = useCurrentFrame() - ANTES * FPS;
  const ts = trozos(texto);
  const total = ts.reduce((a, t) => a + t.length, 0);
  let t0 = 0;
  let actual = "";
  for (const t of ts) {
    const d = (voz * FPS * t.length) / total;
    if (f >= t0 && f < t0 + d) actual = t;
    t0 += d;
  }
  if (!actual) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 60 }}>
      <div style={{ fontFamily: FUENTE, fontSize: 40, fontWeight: 700, color: "#fff", background: "rgba(11,18,32,.88)", padding: "12px 30px", borderRadius: 16, boxShadow: `0 0 0 2px ${C.azul}` }}>{actual}</div>
    </AbsoluteFill>
  );
};

export const LazoVideo: React.FC = () => (
  <AbsoluteFill style={{ background: C.noche }}>
    {PLAN.map((e) => {
      const Escena = ESCENAS[e.id];
      return (
        <Sequence key={e.id} from={e.desde} durationInFrames={e.cuadros} name={e.id}>
          <Fundido dur={e.cuadros}>
            <Escena dur={e.cuadros} />
          </Fundido>
          <Sequence from={Math.round(ANTES * FPS)}>
            <Audio src={staticFile(`voz/${e.id}.mp3`)} />
          </Sequence>
          <Subtitulos texto={e.texto} voz={e.dur} />
        </Sequence>
      );
    })}
  </AbsoluteFill>
);
