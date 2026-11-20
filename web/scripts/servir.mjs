// Servidor local para probar .salida como en Vercel: archivos de public/ y la función api/lazo.js.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const raiz = path.resolve(process.argv[2] || ".salida");
const fn = createRequire(import.meta.url)(path.join(raiz, "api/lazo.js"));
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".ttf": "font/ttf" };
http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/lazo")) {
    const partes = []; for await (const c of req) partes.push(c);
    req.body = JSON.parse(Buffer.concat(partes).toString() || "{}");
    res.status = (s) => ((res.statusCode = s), res);
    res.json = (j) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(j)); };
    return fn(req, res);
  }
  const p = path.join(raiz, "public", decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  try { const d = await readFile(p); res.setHeader("Content-Type", tipos[path.extname(p)] || "application/octet-stream"); res.end(d); }
  catch { res.statusCode = 404; res.end("no"); }
}).listen(4747, () => console.log("http://localhost:4747"));
