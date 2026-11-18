import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ApiError } from "../api/types";
import { hora12 } from "./format";

export function OfflineBanner({ stale, fetchedAt }: { stale: boolean; fetchedAt: number | null }) {
  if (!stale || fetchedAt === null) return null;
  const d = new Date(fetchedAt);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="cbanner">
      Sin conexión · datos de las {hora12(`${p(d.getHours())}:${p(d.getMinutes())}`)}
    </div>
  );
}

function ErrorView({ error }: { error: ApiError }) {
  if (error.kind === "unauthorized" || error.kind === "no_token") {
    return (
      <div className="flex flex-col items-start gap-2 py-2 text-sm">
        <span className="text-red-300">{error.kind === "unauthorized" ? "Token inválido" : "Falta el token"}</span>
        <button
          className="rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
          onClick={() => invoke("open_settings", { section: "connection" })}
        >
          Abrir configuración
        </button>
      </div>
    );
  }
  return <div className="text-sm text-white/60">{error.kind === "offline" ? "Sin conexión y sin datos guardados." : error.message}</div>;
}

interface FrameProps<T> {
  panel: { data: T | null; fetchedAt: number | null; stale: boolean; error: ApiError | null; loading: boolean };
  children: (data: T) => ReactNode;
}

/** Marco común: banner sin conexión, errores, carga y contenido con scroll interno. */
export function PanelFrame<T>({ panel, children }: FrameProps<T>) {
  return (
    <div className="pf">
      <OfflineBanner stale={panel.stale} fetchedAt={panel.fetchedAt} />
      {panel.error && !panel.data ? (
        <ErrorView error={panel.error} />
      ) : panel.data ? (
        <>
          {panel.error && <div className="mb-2"><ErrorView error={panel.error} /></div>}
          {children(panel.data)}
        </>
      ) : (
        <div className="text-sm text-white/40">Cargando…</div>
      )}
    </div>
  );
}

export function Section({ title, trailing, children }: { title: string; trailing?: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wide text-white/50">
        <span>{title}</span>
        {trailing && <span>{trailing}</span>}
      </h3>
      <div className="divide-y divide-white/5 rounded-lg bg-white/5">{children}</div>
    </section>
  );
}

export function Row({ left, children, right, actions }: { left?: ReactNode; children: ReactNode; right?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm">
      {left !== undefined && <span className="min-w-[3rem] shrink-0 tabular-nums text-white/60">{left}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {right !== undefined && <span className="shrink-0 text-xs text-white/50">{right}</span>}
      {actions && <span className="flex shrink-0 items-center gap-1">{actions}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-1 py-2 text-sm text-white/40">{children}</div>;
}
