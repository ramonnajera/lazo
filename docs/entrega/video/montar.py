import json, subprocess, re
W='/mnt/c/Users/avsolem/AppData/Local/Temp/lazo-video/'
meta=json.load(open('meta.json',encoding='utf-8'))
PRE, POST, FPS = 0.4, 0.7, 30
def ts(t):
    h=int(t//3600); m=int(t%3600//60); s=t%60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s-int(s))*1000)):03d}".replace(',1000',',999')
srt=[]; t0=0.0; n=1
lista=open('clips/lista.txt','w')
for m in meta:
    dur=m['dur']+PRE+POST; fr=int(round(dur*FPS))
    out=f"clips/{m['id']}.mp4"
    vf=(f"scale=3840:2160,zoompan=z='1+0.035*on/{fr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={fr}:s=1920x1080:fps={FPS},"
        f"fade=t=in:st=0:d=0.35,fade=t=out:st={dur-0.35:.3f}:d=0.35,format=yuv420p")
    subprocess.run(['ffmpeg','-y','-v','error','-loop','1','-i',W+m['id']+'.slide.png','-i',f"voz/{m['id']}.mp3",
        '-filter_complex',f"[0:v]{vf}[v];[1:a]adelay={int(PRE*1000)}|{int(PRE*1000)},apad=whole_dur={dur:.3f},aresample=48000[a]",
        '-map','[v]','-map','[a]','-t',f"{dur:.3f}",'-c:v','libx264','-preset','medium','-crf','19','-r',str(FPS),'-c:a','aac','-b:a','160k','-ac','2',out],check=True)
    lista.write(f"file '{m['id']}.mp4'\n")
    # subtítulos: frases cortas repartidas por longitud
    partes=[p.strip() for p in re.split(r'(?<=[\.\,\:\;\?\!])\s+', m['texto']) if p.strip()]
    trozos=[]
    for p in partes:
        if trozos and len(trozos[-1])+len(p)<60: trozos[-1]+=' '+p
        else: trozos.append(p)
    total=sum(len(x) for x in trozos); t=t0+PRE
    for x in trozos:
        d=m['dur']*len(x)/total
        srt.append(f"{n}\n{ts(t)} --> {ts(t+d-0.05)}\n{x}\n"); n+=1; t+=d
    t0+=dur
lista.close()
open('subs.srt','w',encoding='utf-8').write('\n'.join(srt))
print('duración total', round(t0/60,2),'min')
