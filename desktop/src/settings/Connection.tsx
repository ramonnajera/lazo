import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getTomas } from "../api/client";
import type { ApiError } from "../api/types";
import type { Config } from "../config/types";
import { Field, btnCls, inputCls } from "./ui";

interface Props {
  config: Config;
  saveConfig: (c: Config) => Promise<void>;
}

export function describeError(e: unknown): string {
  const err = e as Partial<ApiError> | undefined;
  if (err && typeof err === "object" && err.kind) {
    switch (err.kind) {
      case "offline":
        return `Sin conexión: ${err.message ?? ""}`.trim();
      case "unauthorized":
        return "Token inválido o ausente";
      case "no_token":
        return "Falta el token";
      default:
        return err.message || `Error HTTP ${err.status ?? ""}`.trim();
    }
  }
  return String(e);
}

export default function Connection({ config, saveConfig }: Props) {
  const [url, setUrl] = useState(config.connection.apiUrl);
  const [token, setToken] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");

  const persist = async () => {
    const apiUrl = url.trim().replace(/\/+$/, "");
    setUrl(apiUrl);
    if (apiUrl !== config.connection.apiUrl) {
      await saveConfig({ ...config, connection: { ...config.connection, apiUrl } });
    }
    if (token.trim()) {
      await invoke("set_token", { token: token.trim() });
      setToken("");
    }
  };

  /** Entra como la misma persona con el código de 6 dígitos de otro dispositivo (Más → Conexión → Vincular otro dispositivo). */
  const vincular = async () => {
    setBusy(true);
    setResult(null);
    try {
      await persist();
      await invoke("link_device", { code: code.trim(), name: "Computadora con Windows" });
      setCode("");
      await getTomas();
      setResult({ ok: true, text: "✓ Computadora vinculada" });
    } catch (e) {
      setResult({ ok: false, text: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const run = async (test: boolean) => {
    setBusy(true);
    setResult(null);
    try {
      await persist();
      if (!test) {
        setResult({ ok: true, text: "Guardado" });
      } else {
        await invoke("api_request", { method: "GET", path: "/health", body: null });
        await getTomas();
        setResult({ ok: true, text: "✓ Conexión correcta" });
      }
    } catch (e) {
      setResult({ ok: false, text: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md space-y-5">
      <h1 className="text-lg font-semibold">Conexión</h1>
      <Field label="URL de la API">
        <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
      </Field>
      <Field label="Token (se guarda en el Administrador de credenciales)">
        <input
          className={inputCls}
          type="password"
          value={token}
          placeholder="Dejar vacío para conservar el actual"
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="O entra con un código de 6 dígitos de otro dispositivo">
        <div className="flex gap-2">
          <input className={inputCls} inputMode="numeric" value={code} placeholder="Ej.: 123456" onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Código de 6 dígitos" />
          <button className={btnCls} disabled={busy || code.length !== 6} onClick={vincular}>
            Vincular
          </button>
        </div>
      </Field>
      <div className="flex gap-2">
        <button className={btnCls} disabled={busy} onClick={() => run(false)}>
          Guardar
        </button>
        <button className={btnCls} disabled={busy} onClick={() => run(true)}>
          Probar conexión
        </button>
      </div>
      {result && <p className={`text-sm ${result.ok ? "text-green-600" : "text-red-600"}`}>{result.text}</p>}
    </div>
  );
}
