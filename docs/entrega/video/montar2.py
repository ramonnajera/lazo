# montar2.py — arma el video v2: diapositivas, mockups con pantallas reales y clips de Higgsfield, con narración y subtítulos.
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import escenas
from visuales import VISUALES, html_heroe, html_rotulo

AQUI = os.path.dirname(os.path.abspath(__file__))
HF = os.path.join(AQUI, "hf")
W = "/mnt/c/Users/avsolem/AppData/Local/Temp/lazo-video/"
WWIN = r"C:\Users\avsolem\AppData\Local\Temp\lazo-video"
PRE, POST, FPS = 0.4, 0.7, 30
TMP = os.path.join(AQUI, "v2"); os.makedirs(TMP, exist_ok=True)
SALIDA = "/mnt/c/Users/avsolem/sites/lazo-muestra/PMT2026_Lazo.mp4"

def sh(*a): subprocess.run(a, check=True)
def ff(*a): sh("ffmpeg", "-y", "-v", "error", *a)

# 1) HTML de mockups y rótulos → PNG con Edge
for f in os.listdir(HF):
    if f.endswith(".png") and (f.startswith("heroe_") or f.startswith("m_") or f.startswith("s")):
        sh("cp", os.path.join(HF, f), W)
sh("cp", "/home/avsolem/sites/lazo/docs/entrega/capturas/lazo_logo.png", W)
for i, (n, h, t) in enumerate(escenas.ESCENAS):  # re-escribe las diapositivas (por si cambió el texto)
    open(W + f"{i:02d}_{n}.html", "w", encoding="utf-8").write(h)
renders = []  # (html, png, transparente)
for sid, piezas in VISUALES.items():
    for k, (_, p) in enumerate(piezas):
        if p[0] == "heroe":
            nom = f"{sid}_{k}_heroe"; open(W + nom + ".html", "w", encoding="utf-8").write(html_heroe(*p[1:])); renders.append((nom, False))
        elif p[0] in ("foto", "clip"):
            nom = f"{sid}_{k}_rotulo"; open(W + nom + ".html", "w", encoding="utf-8").write(html_rotulo(p[2], p[3])); renders.append((nom, True))
for i, (n, _, _) in enumerate(escenas.ESCENAS):
    renders.append((f"{i:02d}_{n}", False))
ps = ";".join(
    f'Start-Process $e -ArgumentList "--headless=new","--disable-gpu","--hide-scrollbars","--force-device-scale-factor=1","--window-size=1920,1080","--virtual-time-budget=3000","--allow-file-access-from-files",{chr(34)+"--default-background-color=00000000"+chr(34)+"," if tr else ""}"--screenshot={WWIN}\\{nom}.png","file:///{WWIN.replace(chr(92), "/")}/{nom}.html" -Wait'
    for nom, tr in renders)
sh("powershell.exe", "-NoProfile", "-Command", '$e="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";' + ps)

# 2) Piezas de video
meta = json.load(open(os.path.join(AQUI, "meta.json"), encoding="utf-8"))
def kenburns(img, dur, out, overlay=None):
    fr = int(round(dur * FPS))
    vf = f"scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='1+0.04*on/{fr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={fr}:s=1920x1080:fps={FPS}"
    if overlay:
        ff("-loop", "1", "-i", img, "-loop", "1", "-i", overlay, "-filter_complex", f"[0:v]{vf}[b];[b][1:v]overlay=0:0,format=yuv420p", "-t", f"{dur:.3f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-an", out)
    else:
        ff("-loop", "1", "-i", img, "-vf", vf + ",format=yuv420p", "-t", f"{dur:.3f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-an", out)
def clip(video, dur, out, overlay):
    lento = min(2.0, max(1.0, dur / 5.0))  # cámara lenta hasta 2x; si aún falta, se queda en el último cuadro
    vf = f"setpts={lento:.3f}*PTS,fps={FPS},scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration=30"
    ff("-i", video, "-loop", "1", "-i", overlay, "-filter_complex", f"[0:v]{vf}[b];[b][1:v]overlay=0:0,format=yuv420p", "-t", f"{dur:.3f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-an", out)

lista = open(os.path.join(TMP, "lista.txt"), "w")
srt, n_sub, t0 = [], 1, 0.0
def ts(t):
    ms = int(round(t * 1000)); return f"{ms//3600000:02d}:{ms%3600000//60000:02d}:{ms%60000//1000:02d},{ms%1000:03d}"
for m in meta:
    sid = m["id"]; dur = m["dur"] + PRE + POST
    piezas = VISUALES[sid]; total = sum(w for w, _ in piezas)
    partes = []
    for k, (w, p) in enumerate(piezas):
        d = dur * w / total; out = os.path.join(TMP, f"{sid}_{k}.mp4")
        if p[0] == "slide": kenburns(W + sid + ".png", d, out)
        elif p[0] == "heroe": kenburns(W + f"{sid}_{k}_heroe.png", d, out)
        elif p[0] == "foto": kenburns(os.path.join(HF, p[1]), d, out, W + f"{sid}_{k}_rotulo.png")
        elif p[0] == "clip": clip(os.path.join(HF, p[1]), d, out, W + f"{sid}_{k}_rotulo.png")
        partes.append((out, d))
    # une las piezas con un fundido corto y agrega la voz
    entradas, filtros, prev, acum = [], [], None, 0.0
    for j, (f, d) in enumerate(partes):
        entradas += ["-i", f]
        if j == 0: prev = "[0:v]"; acum = d; continue
        acum -= 0.3
        filtros.append(f"{prev}[{j}:v]xfade=transition=fade:duration=0.3:offset={acum:.3f}[x{j}]"); prev = f"[x{j}]"; acum += d
    a = len(partes)
    filtros.append(f"{prev}fade=t=in:st=0:d=0.35,fade=t=out:st={dur-0.35:.3f}:d=0.35,tpad=stop_mode=clone:stop_duration=2[v]")
    filtros.append(f"[{a}:a]adelay={int(PRE*1000)}|{int(PRE*1000)},apad=whole_dur={dur:.3f},aresample=48000[au]")
    escena = os.path.join(TMP, f"{sid}.mp4")
    ff(*entradas, "-i", os.path.join(AQUI, "voz", sid + ".mp3"), "-filter_complex", ";".join(filtros), "-map", "[v]", "-map", "[au]",
       "-t", f"{dur:.3f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-c:a", "aac", "-b:a", "160k", "-ac", "2", escena)
    lista.write(f"file '{sid}.mp4'\n")
    # subtítulos de una línea
    trozos, cur = [], ""
    for w_ in m["texto"].split():
        if cur and (len(cur) + 1 + len(w_) > 52 or re.search(r"[\.\:\;\?\!]$", cur)): trozos.append(cur); cur = w_
        else: cur = (cur + " " + w_).strip()
    if cur: trozos.append(cur)
    tot = sum(len(x) for x in trozos); t = t0 + PRE
    for x in trozos:
        d = m["dur"] * len(x) / tot; srt.append(f"{n_sub}\n{ts(t)} --> {ts(t+d-0.04)}\n{x}\n"); n_sub += 1; t += d
    t0 += dur
    print("escena", sid, round(dur, 1), "s")
lista.close()
open(os.path.join(TMP, "subs.srt"), "w", encoding="utf-8").write("\n".join(srt))
ff("-f", "concat", "-safe", "0", "-i", os.path.join(TMP, "lista.txt"), "-c", "copy", os.path.join(TMP, "junto.mp4"))
estilo = "FontName=Inter Variable,FontSize=13,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H1A20120B,BackColour=&H1A20120B,BorderStyle=3,Outline=7,Shadow=0,MarginV=26,Alignment=2"
ff("-i", os.path.join(TMP, "junto.mp4"), "-vf", f"subtitles={os.path.join(TMP,'subs.srt')}:fontsdir=/home/avsolem/.fonts:force_style='{estilo}'",
   "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-c:a", "copy", SALIDA)
print("listo:", round(t0 / 60, 2), "min")
