// Hablar con Lazo desde el navegador: se graba una nota de voz, se transcribe con Whisper en la función
// (la misma ruta /voz/audio del servidor) y Lazo contesta en el chat y en voz alta.
import { ingestListen } from "@isla/panels/chatStore";
import { refreshKeys } from "@isla/panels/usePanelData";
import { hablar } from "@isla/voice/habla";
import { peticion } from "./motor";

let rec: MediaRecorder | null = null;
let trozos: Blob[] = [];
let id = 0;
const PANELES = ["tomas", "citas", "mediciones", "convocatorias"];

function aBase64(b: Blob): Promise<string> {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = mal;
    r.readAsDataURL(b);
  });
}

export async function microfono(encender: boolean): Promise<void> {
  if (encender) {
    if (rec) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t));
    rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    trozos = [];
    rec.ondataavailable = (e) => e.data.size && trozos.push(e.data);
    rec.start();
    ingestListen({ id: ++id, mode: "lazo", phase: "recording" });
    return;
  }
  if (!rec) return;
  const r = rec;
  rec = null;
  const listo = new Promise<void>((ok) => (r.onstop = () => ok()));
  r.stop();
  await listo;
  r.stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(trozos, { type: r.mimeType || "audio/webm" });
  const mio = id;
  ingestListen({ id: mio, mode: "lazo", phase: "thinking" });
  try {
    if (blob.size < 1500) throw { message: "No te escuché. Mantén el micrófono un poco más." };
    const j = await peticion("POST", "/voz/audio", null, { b64: await aBase64(blob), mime: blob.type.split(";")[0] || "audio/webm" });
    const reply = String(j.reply ?? "").trim() || "Lazo no respondió nada";
    ingestListen({ id: mio, mode: "lazo", phase: "done", reply: true, text: reply, heard: j.transcripcion || undefined });
    hablar(reply);
    refreshKeys(...PANELES);
  } catch (e) {
    ingestListen({ id: mio, mode: "lazo", phase: "error", text: (e as { message?: string })?.message ?? "No pude escucharte", heard: "🎤 Nota de voz" });
  }
}
