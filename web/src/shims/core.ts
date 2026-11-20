// Sustituye a invoke() de Tauri en la demo web. Solo implementa lo que usan los paneles de la isla.
import { peticion } from "../motor";
import { microfono } from "../microfono";

const CONFIG = {
  general: { autostart: false, openOnHover: true, monitor: null, theme: "dark", sounds: false },
  keys: { dictation: "", lazo: "", openIsland: "", chat: "" },
  dictation: { handsFreeDoubleTap: false, restoreClipboard: false, dictionary: [], replacements: [] },
  voice: { microphone: null, language: "es" },
  commands: { sites: [], programs: [], folders: [], searchEngines: [], systemEnabled: false, confirmPower: true },
  alerts: { eventLeadMin: 10, todosTime: "09:00", dndFrom: null, dndTo: null, dndFullscreen: false },
  music: { show: false, preferredApp: null },
  connection: { apiUrl: "/api/lazo", refreshSec: 120 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invoke<T = any>(cmd: string, args: Record<string, any> = {}): Promise<T> {
  switch (cmd) {
    case "api_request":
      if (args.path === "/convocatorias/actualizar") return (await peticion("GET", "/convocatorias")) as T; // en la demo, la lista es una copia fija
      return (await peticion(args.method, args.path, args.body)) as T;
    case "get_config":
      return CONFIG as T;
    case "lazo_mic":
      return (await microfono(!!args.on)) as T;
    default:
      return null as T;
  }
}
