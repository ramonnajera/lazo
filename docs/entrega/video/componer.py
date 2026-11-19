# Inserta capturas reales en las zonas de pantalla verde de los mockups generados.
import sys
import numpy as np
from PIL import Image, ImageFilter

def mascara_verde(im):
    a = np.asarray(im.convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (g > 170) & (r < 120) & (b < 120)
    from scipy import ndimage
    lab, n = ndimage.label(m)
    if n > 1:  # solo la zona verde más grande: la pantalla (no manchas verdes del fondo)
        tam = ndimage.sum(m, lab, range(1, n + 1))
        m = lab == (1 + int(tam.argmax()))
    return m

def componer(fondo_path, captura, salida, ancho=1920, ajuste='cover', fondo_pantalla=None, barra=0.0):
    fondo = Image.open(fondo_path).convert('RGB')
    m = mascara_verde(fondo)
    ys, xs = np.where(m)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0 + 1, y1 - y0 + 1
    cap = captura if isinstance(captura, Image.Image) else Image.open(captura).convert('RGB')
    if barra:  # barra de estado: deja libre la zona de la cámara del teléfono
        alto = int(cap.width * (h / w) * barra)
        nueva = Image.new('RGB', (cap.width, cap.height + alto), cap.getpixel((5, 5)))
        nueva.paste(cap, (0, alto)); cap = nueva
    if ajuste == 'cover':  # llena la pantalla, alineada arriba (las capturas de teléfono son altas)
        esc = max(w / cap.width, h / cap.height)
        c = cap.resize((int(cap.width * esc) + 1, int(cap.height * esc) + 1), Image.LANCZOS)
        left = (c.width - w) // 2
        c = c.crop((left, 0, left + w, h))
    else:
        c = cap.resize((w, h), Image.LANCZOS)
    capa = Image.new('RGB', fondo.size); capa.paste(c, (x0, y0))
    # máscara: verde dilatado un poco (borra el halo) y suavizado
    mk = Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    out = Image.composite(capa, fondo, mk)
    out = out.resize((ancho, int(out.height * ancho / out.width)), Image.LANCZOS)
    out.save(salida)
    print(salida, (x0, y0, w, h))

if __name__ == '__main__':
    componer(sys.argv[1], sys.argv[2], sys.argv[3], barra=float(sys.argv[4]) if len(sys.argv) > 4 else 0.0)
