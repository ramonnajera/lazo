import { useEffect, useState, type ReactNode } from "react";
import { pedirAyuda } from "../api/client";
import { hablar } from "../voice/habla";

/** «Avisé a 2 cuidadores…», en singular si es uno; sin cuidadores, cómo pedir ayuda de otra forma. */
export function textoAyuda(cuidadores: number): string {
  if (cuidadores <= 0)
    return "Todavía no tienes cuidadores registrados: nadie recibió el aviso. Si es una emergencia, llama al 911.";
  return `Avisé a ${cuidadores} ${cuidadores === 1 ? "cuidador" : "cuidadores"}. Si es una emergencia, llama al 911.`;
}

type Paso =
  | { k: "inicio" }
  | { k: "confirmar" }
  | { k: "enviando" }
  | { k: "listo"; texto: string }
  | { k: "error"; texto: string };

/** La confirmación se retira sola si nadie la acepta (evita un aviso por un clic olvidado). */
const CONFIRM_MS = 15_000;

/**
 * «Necesito ayuda»: rojo pero discreto, en dos pasos (pedir → confirmar) para que un clic por error no
 * alarme a nadie. El resultado también se lee en voz alta. `children`: lo que va a la izquierda del botón
 * en el encabezado de la sección (título y fecha).
 */
export function AyudaBoton({ children }: { children?: ReactNode }) {
  const [paso, setPaso] = useState<Paso>({ k: "inicio" });

  useEffect(() => {
    if (paso.k !== "confirmar") return;
    const t = window.setTimeout(() => setPaso({ k: "inicio" }), CONFIRM_MS);
    return () => window.clearTimeout(t);
  }, [paso.k]);

  const enviar = () => {
    setPaso({ k: "enviando" });
    pedirAyuda()
      .then((r) => {
        const texto = textoAyuda(r.cuidadores);
        setPaso({ k: "listo", texto });
        hablar(texto, { forzar: true });
      })
      .catch(() => {
        const texto =
          "No pude enviar el aviso. Revisa tu conexión. Si es una emergencia, llama al 911.";
        setPaso({ k: "error", texto });
        hablar(texto, { forzar: true });
      });
  };

  const head = (
    <div className="pf-head">
      {children}
      <button
        type="button"
        className="ayuda-b"
        aria-expanded={paso.k !== "inicio"}
        onClick={() =>
          setPaso(paso.k === "inicio" ? { k: "confirmar" } : { k: "inicio" })
        }
      >
        Necesito ayuda
      </button>
    </div>
  );
  if (paso.k === "inicio") return head;
  if (paso.k === "confirmar" || paso.k === "enviando") {
    const enviando = paso.k === "enviando";
    return (
      <>
        {head}
        <div
          className="ayuda-on"
          role="group"
          aria-label="Confirmar aviso de ayuda"
        >
          <div className="ayuda-q">
            ¿Aviso a tus cuidadores que necesitas ayuda?
          </div>
          <div className="ayuda-btns">
            <button
              type="button"
              className="fm-b"
              disabled={enviando}
              onClick={() => setPaso({ k: "inicio" })}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="fm-b ayuda-si"
              disabled={enviando}
              autoFocus
              onClick={enviar}
            >
              {enviando ? "Enviando…" : "Sí, avisar"}
            </button>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {head}
      <div className="ayuda-on">
        <div className="ayuda-q" role="status">
          {paso.texto}
        </div>
        <div className="ayuda-btns">
          {paso.k === "error" && (
            <button type="button" className="fm-b ayuda-si" onClick={enviar}>
              Reintentar
            </button>
          )}
          <button
            type="button"
            className="fm-b"
            onClick={() => setPaso({ k: "inicio" })}
          >
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
