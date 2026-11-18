import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Config } from "./types";

export function useConfig(): { config: Config | null; saveConfig: (c: Config) => Promise<void> } {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    invoke<Config>("get_config").then((c) => alive && setConfig((prev) => prev ?? c));
    listen<Config>("config-changed", (e) => setConfig(e.payload)).then((u) => {
      if (alive) unlisten = u;
      else u();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  const saveConfig = useCallback(async (cfg: Config) => {
    await invoke("set_config", { cfg });
  }, []);

  return { config, saveConfig };
}
