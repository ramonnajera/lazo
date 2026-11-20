import { continueRender, delayRender, staticFile } from "remotion";

export const FPS = 30;
export const ANCHO = 1920;
export const ALTO = 1080;
/** Silencio antes y después de la voz de cada escena (segundos). */
export const ANTES = 0.4;
export const DESPUES = 0.8;

export const C = {
  azul: "#0B3D91",
  azulClaro: "#8FB4FF",
  verde: "#12803C",
  morado: "#7A2FC0",
  rosa: "#D0124F",
  naranja: "#C2410C",
  petroleo: "#0B7285",
  noche: "#0B1220",
  fondo: "#F4F6FA",
  texto: "#0B1220",
  texto2: "#3B4658",
};

export const FUENTE = "Inter, sans-serif";

// Inter empaquetada (la misma de la app de escritorio): se carga antes de pintar el primer cuadro.
const espera = delayRender("Cargando Inter");
const inter = new FontFace("Inter", `url(${staticFile("Inter.ttf")}) format("truetype")`, { weight: "100 900" });
inter
  .load()
  .then((f) => {
    document.fonts.add(f);
    continueRender(espera);
  })
  .catch(() => continueRender(espera));
