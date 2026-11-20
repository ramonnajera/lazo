import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// La demo reutiliza los paneles de la isla de escritorio (../desktop/src) tal cual: las llamadas a Tauri
// se cambian por «shims» del navegador que hablan con la función /api/lazo.
const aqui = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tauri-apps/api/core": aqui("./src/shims/core.ts"),
      "@tauri-apps/api/event": aqui("./src/shims/event.ts"),
      "@tauri-apps/plugin-opener": aqui("./src/shims/opener.ts"),
      "@isla": aqui("../desktop/src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: { fs: { allow: [".."] } },
});
