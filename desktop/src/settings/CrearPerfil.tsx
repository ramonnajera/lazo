import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { describeError } from "./Connection";
import { btnCls, inputCls } from "./ui";

const OPCIONES = [
  { valor: "ambas", texto: "Visual y motriz" },
  { valor: "visual", texto: "Visual" },
  { valor: "motriz", texto: "Motriz" },
  { valor: "otra", texto: "Otra" },
];

/** Estilos de la isla (fondo azul noche) y de Configuración (fondo claro u oscuro según el tema). */
const ISLA = { lbl: "text-xs text-white/60", in: "rounded-md bg-white/10 px-3 py-2 outline-none", btn: "rounded-md bg-white/15 px-3 py-2 font-medium hover:bg-white/25 disabled:opacity-50", err: "text-red-300" };
const CONFIG = { lbl: "text-xs text-neutral-500 dark:text-neutral-400", in: inputCls, btn: btnCls, err: "text-red-600" };

/**
 * Primer uso: crea el perfil en el servidor de Lazo (ya configurado) sin pedir ninguna dirección.
 * `enConfig`: dentro de la ventana de Configuración (en tema claro el texto blanco no se veía).
 */
export default function CrearPerfil({ onListo, enConfig = false }: { onListo?: () => void; enConfig?: boolean }) {
  const c = enConfig ? CONFIG : ISLA;
  const [nombre, setNombre] = useState("");
  const [discapacidad, setDiscapacidad] = useState("ambas");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke("create_profile", { name: nombre.trim(), disability: discapacidad });
      onListo?.();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-sm flex-col gap-2 text-sm">
      <label className="flex flex-col gap-1">
        <span className={c.lbl}>Tu nombre</span>
        <input className={c.in} value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Tu nombre" />
      </label>
      <label className="flex flex-col gap-1">
        <span className={c.lbl}>¿Qué te cuesta más?</span>
        <select className={c.in} value={discapacidad} onChange={(e) => setDiscapacidad(e.target.value)} aria-label="Qué te cuesta más">
          {OPCIONES.map((o) => (
            <option key={o.valor} value={o.valor} className="text-black">
              {o.texto}
            </option>
          ))}
        </select>
      </label>
      <button className={c.btn} disabled={busy || !nombre.trim()} onClick={crear}>
        {busy ? "Creando…" : "Crear mi perfil"}
      </button>
      {error && <p className={c.err}>{error}</p>}
    </div>
  );
}
