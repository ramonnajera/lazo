import React from "react";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FUENTE } from "./tema";

/** Entrada con resorte: 0 → 1 a partir de `desde` cuadros. */
export const useEntrada = (desde = 0, rigidez = 120) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - desde, fps, config: { damping: 18, stiffness: rigidez, mass: 0.8 } });
};

/** Aparece y desaparece suave en los bordes de la escena. */
export const Fundido: React.FC<{ children: React.ReactNode; dur: number }> = ({ children, dur }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 10, dur - 12, dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Logo: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <svg viewBox="0 0 108 108" width={size} height={size} style={style}>
    <rect width="108" height="108" rx="25" fill={C.azul} />
    <g transform="translate(54 54) scale(1.22) translate(-54 -54)" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M54,60 C40,46 32,36 38,28 C44,20 56,26 54,40 C52,26 64,20 70,28 C76,36 68,46 54,60 Z" />
      <path d="M54,60 L42,86 M54,60 L66,86" />
    </g>
  </svg>
);

/** Fondo azul noche con manchas de color que se mueven despacio (los colores de la app). */
export const FondoVivo: React.FC<{ claro?: boolean }> = ({ claro }) => {
  const frame = useCurrentFrame();
  const m = (f: number, a: number) => Math.sin((frame + f) / 70) * a;
  const manchas = [
    { c: C.verde, x: -8 + m(0, 3), y: -18 + m(40, 4), s: 46 },
    { c: C.morado, x: 78 + m(80, 3), y: -12 + m(10, 4), s: 40 },
    { c: C.rosa, x: -10 + m(30, 4), y: 70 + m(90, 3), s: 44 },
    { c: C.naranja, x: 82 + m(60, 3), y: 72 + m(20, 4), s: 40 },
  ];
  return (
    <AbsoluteFill style={{ background: claro ? C.fondo : `radial-gradient(circle at 30% 25%, #17357a 0%, ${C.noche} 65%)`, overflow: "hidden" }}>
      {manchas.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute", left: `${b.x}%`, top: `${b.y}%`, width: `${b.s}vw`, height: `${b.s}vw`, borderRadius: "50%",
            background: b.c, opacity: claro ? 0.1 : 0.55, filter: "blur(120px)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

export const Marca: React.FC<{ claro?: boolean }> = ({ claro }) => (
  <div style={{ position: "absolute", top: 44, left: 130, display: "flex", alignItems: "center", gap: 14, fontFamily: FUENTE, fontWeight: 800, fontSize: 32, color: claro ? C.azul : "#fff" }}>
    <Logo size={52} />
    Lazo
  </div>
);

export const Kicker: React.FC<{ texto: string; color: string; desde?: number }> = ({ texto, color, desde = 0 }) => {
  const e = useEntrada(desde);
  return (
    <div style={{ display: "inline-block", fontFamily: FUENTE, fontSize: 30, fontWeight: 700, color: "#fff", background: color, padding: "10px 26px", borderRadius: 999, transform: `translateY(${(1 - e) * 30}px)`, opacity: e, boxShadow: "0 0 0 2px rgba(255,255,255,.25)" }}>
      {texto}
    </div>
  );
};

export const Titulo: React.FC<{ texto: string; claro?: boolean; size?: number; desde?: number; centro?: boolean }> = ({ texto, claro, size = 64, desde = 6, centro }) => {
  const palabras = texto.split(" ");
  return (
    <h2 style={{ fontFamily: FUENTE, fontSize: size, lineHeight: 1.1, fontWeight: 800, letterSpacing: -1, color: claro ? C.texto : "#fff", margin: "28px 0 30px", textAlign: centro ? "center" : "left" }}>
      {palabras.map((p, i) => (
        <PalabraAnimada key={i} texto={p} desde={desde + i * 2} />
      ))}
    </h2>
  );
};

const PalabraAnimada: React.FC<{ texto: string; desde: number }> = ({ texto, desde }) => {
  const e = useEntrada(desde, 150);
  return <span style={{ display: "inline-block", marginRight: "0.25em", transform: `translateY(${(1 - e) * 40}px)`, opacity: e }}>{texto}</span>;
};

export const Puntos: React.FC<{ items: string[]; color: string; claro?: boolean; desde?: number; size?: number }> = ({ items, color, claro, desde = 20, size = 34 }) => (
  <div>
    {items.map((t, i) => (
      <Punto key={i} texto={t} color={color} claro={claro} desde={desde + i * 9} size={size} />
    ))}
  </div>
);

const Punto: React.FC<{ texto: string; color: string; claro?: boolean; desde: number; size: number }> = ({ texto, color, claro, desde, size }) => {
  const e = useEntrada(desde);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, margin: "18px 0", fontFamily: FUENTE, fontSize: size, color: claro ? "#1c2638" : "#e3e9f5", transform: `translateX(${(1 - e) * -40}px)`, opacity: e }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff", boxShadow: `inset 0 0 0 8px ${color}`, flex: "none" }} />
      {texto}
    </div>
  );
};

/** Un teléfono con la captura real de Lazo: entra desde abajo con resorte y flota apenas. */
export const Telefono: React.FC<{ src: string; desde?: number; alto?: number }> = ({ src, desde = 4, alto = 860 }) => {
  const frame = useCurrentFrame();
  const e = useEntrada(desde, 90);
  const flota = Math.sin(frame / 40) * 6;
  const ancho = alto * 0.48;
  return (
    <div
      style={{
        width: ancho, height: alto, borderRadius: alto * 0.07, background: "#05080f", padding: alto * 0.018,
        boxShadow: "0 50px 100px rgba(0,0,0,.45), 0 0 0 3px #2a3348", transform: `translateY(${(1 - e) * 500 + flota}px) rotate(${(1 - e) * 8}deg)`, opacity: Math.min(1, e * 1.5),
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: alto * 0.055, overflow: "hidden", background: "#fff" }}>
        <Img src={staticFile(src)} style={{ width: "100%", position: "absolute", top: alto * 0.035, left: 0 }} />
        <div style={{ position: "absolute", top: alto * 0.012, left: "50%", width: ancho * 0.3, height: alto * 0.03, marginLeft: -ancho * 0.15, borderRadius: 99, background: "#05080f" }} />
      </div>
    </div>
  );
};

/** Clip de Higgsfield: cámara lenta para llenar la duración; si aún sobra, se queda en el último cuadro. */
export const Clip: React.FC<{ src: string; dur: number }> = ({ src, dur }) => {
  const { fps } = useVideoConfig();
  const largo = 5 * fps; // los clips miden 5 s
  const ritmo = Math.max(0.5, Math.min(1, largo / dur));
  const reproduce = Math.floor(largo / ritmo) - 2;
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, dur], [1, 1.06]);
  return (
    <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
      <Sequence durationInFrames={reproduce}>
        <OffthreadVideo src={staticFile(src)} playbackRate={ritmo} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Sequence>
      {dur > reproduce && (
        <Sequence from={reproduce}>
          <Freeze frame={reproduce - 1}>
            <OffthreadVideo src={staticFile(src)} playbackRate={ritmo} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Freeze>
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

/** Foto a pantalla completa con un acercamiento lento. */
export const Foto: React.FC<{ src: string; dur: number }> = ({ src, dur }) => {
  const frame = useCurrentFrame();
  const z = interpolate(frame, [0, dur], [1.02, 1.1], { easing: Easing.inOut(Easing.quad) });
  return <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})` }} />;
};

/** Rótulo inferior con el logo, sobre fotos y clips. */
export const Rotulo: React.FC<{ kicker: string; titulo: string; desde?: number }> = ({ kicker, titulo, desde = 8 }) => {
  const e = useEntrada(desde);
  return (
    <div style={{ position: "absolute", left: 100, bottom: 200, display: "flex", alignItems: "center", gap: 22, padding: "24px 36px", borderRadius: 26, background: "rgba(11,18,32,.82)", transform: `translateX(${(1 - e) * -120}px)`, opacity: e, fontFamily: FUENTE }}>
      <Logo size={64} />
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.azulClaro, textTransform: "uppercase", letterSpacing: 1.5 }}>{kicker}</div>
        <div style={{ fontSize: 46, fontWeight: 800, color: "#fff", marginTop: 4 }}>{titulo}</div>
      </div>
    </div>
  );
};

/** Número que cuenta desde 0. */
export const Cuenta: React.FC<{ hasta: number; desde?: number; prefijo?: string; sufijo?: string; dur?: number }> = ({ hasta, desde = 10, prefijo = "", sufijo = "", dur = 45 }) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame, [desde, desde + dur], [0, hasta], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <>
      {prefijo}
      {Math.round(v).toLocaleString("en-US")}
      {sufijo}
    </>
  );
};
