# narrar.py — genera la voz de cada escena (edge-tts, es-MX-JorgeNeural) y src/narracion.json con textos y duraciones.
import json, os, subprocess, sys
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, os.path.join(RAIZ, "..", "docs", "entrega", "video"))
import escenas
salida = []
for i, (nombre, _, texto) in enumerate(escenas.ESCENAS):
    sid = f"{i:02d}_{nombre}"; mp3 = os.path.join(RAIZ, "public", "voz", sid + ".mp3")
    if not os.path.exists(mp3):
        subprocess.run([os.path.join(RAIZ, ".venv", "bin", "edge-tts"), "--voice", "es-MX-JorgeNeural", "--rate=-4%", "--text", texto, "--write-media", mp3], check=True, capture_output=True)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], capture_output=True, text=True).stdout)
    salida.append({"id": sid, "texto": texto, "dur": round(dur, 3)})
json.dump(salida, open(os.path.join(RAIZ, "src", "narracion.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(salida), "escenas,", round(sum(x["dur"] for x in salida) / 60, 2), "min de voz")
