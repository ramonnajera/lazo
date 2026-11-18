// habla.ts — lectura en voz alta con las voces de Windows (Web Speech del propio WebView): sin enviar nada a internet.

const KEY = "lazo.voz";

/** La persona puede apagar la voz; por omisión está encendida. */
export const vozActiva = () => {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
};

export function setVozActiva(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* sin almacenamiento */
  }
  if (!on) callar();
}

/** Elige una voz en español, de preferencia mexicana. */
export function elegirVoz(voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const es = voces.filter((v) => v.lang.toLowerCase().startsWith("es"));
  return es.find((v) => v.lang.toLowerCase().replace("_", "-") === "es-mx") ?? es.find((v) => v.lang.toLowerCase().startsWith("es-")) ?? es[0] ?? null;
}

export function hablar(texto: string, { forzar = false }: { forzar?: boolean } = {}): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !texto.trim()) return;
  if (!forzar && !vozActiva()) return;
  const s = window.speechSynthesis;
  s.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-MX";
  u.rate = 0.95;
  const v = elegirVoz(s.getVoices());
  if (v) u.voice = v;
  s.speak(u);
}

export function callar(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
