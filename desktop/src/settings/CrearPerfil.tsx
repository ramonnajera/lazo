import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { describeError } from "./Connection";

const OPCIONES = [
  { valor: "ambas", texto: "Visual y motriz" },
  { valor: "visual", texto: "Visual" },
  { valor: "motriz", texto: "Motriz" },
  { valor: "otra", texto: "Otra" },
];

/** Primer uso: crea el perfil en el servidor de Lazo (ya configurado) sin pedir ninguna dirección. */
export default function CrearPerfil({ onListo }: { onListo?: () => void }) {
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
        <span className="text-xs text-white/60">Tu nombre</span>
        <input className="rounded-md bg-white/10 px-3 py-2 outline-none" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Tu nombre" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/60">¿Qué te cuesta más?</span>
        <select className="rounded-md bg-white/10 px-3 py-2 outline-none" value={discapacidad} onChange={(e) => setDiscapacidad(e.target.value)} aria-label="Qué te cuesta más">
          {OPCIONES.map((o) => (
            <option key={o.valor} value={o.valor} className="text-black">
              {o.texto}
            </option>
          ))}
        </select>
      </label>
      <button className="rounded-md bg-white/15 px-3 py-2 font-medium hover:bg-white/25 disabled:opacity-50" disabled={busy || !nombre.trim()} onClick={crear}>
        {busy ? "Creando…" : "Crear mi perfil"}
      </button>
      {error && <p className="text-red-300">{error}</p>}
    </div>
  );
}
