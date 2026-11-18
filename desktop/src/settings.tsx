import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { useConfig } from "./config/useConfig";
import { useTheme } from "./config/useTheme";
import General from "./settings/General";
import Connection from "./settings/Connection";
import Voice from "./settings/Voice";
import Keys from "./settings/Keys";
import Dictation from "./settings/Dictation";
import Commands from "./settings/Commands";
import About from "./settings/About";
import "./index.css";

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "keys", label: "Teclas" },
  { id: "dictation", label: "Dictado" },
  { id: "commands", label: "Órdenes" },
  { id: "voice", label: "Voz y modelo" },
  { id: "connection", label: "Conexión" },
  { id: "about", label: "Acerca de" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

function Settings() {
  const { config, saveConfig } = useConfig();
  const [section, setSection] = useState<SectionId>("general");
  useTheme(config?.general.theme);

  useEffect(() => {
    const p = listen<string | null>("settings-section", (e) => {
      const s = SECTIONS.find((x) => x.id === e.payload);
      if (s) setSection(s.id);
    });
    return () => void p.then((u) => u());
  }, []);

  return (
    <div className="flex h-screen bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <nav className="w-44 shrink-0 space-y-1 border-r border-neutral-200 p-3 dark:border-neutral-700">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
              section === s.id ? "bg-neutral-200 font-medium dark:bg-neutral-700" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        {!config ? (
          <p className="text-sm text-neutral-500">Cargando…</p>
        ) : section === "general" ? (
          <General config={config} saveConfig={saveConfig} />
        ) : section === "keys" ? (
          <Keys config={config} saveConfig={saveConfig} />
        ) : section === "dictation" ? (
          <Dictation config={config} saveConfig={saveConfig} />
        ) : section === "commands" ? (
          <Commands config={config} saveConfig={saveConfig} />
        ) : section === "voice" ? (
          <Voice config={config} saveConfig={saveConfig} />
        ) : section === "connection" ? (
          <Connection config={config} saveConfig={saveConfig} />
        ) : (
          <About />
        )}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>,
);
