# Lazo — asistente de Windows 11

Barra superior (Tauri 2: Rust + React) con **Hoy** (siguiente toma con «Ya la tomé»), **Citas**, **Salud**, **Apoyos**
(convocatorias) y **Hablar con Lazo**, más la configuración. Dictado y órdenes por voz **locales** (modelo Parakeet, sin enviar
audio a internet) y lectura en voz alta con las voces de Windows.

## Compilar (desde WSL)
La cadena de Rust y Tauri compila en el disco de Windows:
```bash
./scripts/desktop-sync.sh                                  # refleja desktop/ en C:\Users\<tú>\sites\lazo-desktop
cd /mnt/c/Users/<tú>/sites/lazo-desktop
scripts/win.sh "npm install"
scripts/win.sh "npx vitest run"        # 137 pruebas de la interfaz
scripts/win.sh "cargo test -p lazo-desktop"
scripts/win.sh "npm run tauri build"   # instalador en target\release\bundle\nsis\
```
(Si compilas directamente en Windows, usa `npm install`, `npx vitest run`, `cargo test` y `npm run tauri build` en esta carpeta.)

## Primer uso
1. Instala y abre Lazo; la barra aparece al pasar el cursor por el borde superior central.
2. **Configuración → Conexión:** dirección del servidor y el **token**, o un **código de 6 dígitos** de otro dispositivo (teléfono: Más → Conexión → Vincular otro dispositivo).
3. **Configuración → Voz y modelo:** descarga el modelo de voz local (≈ 640 MB) para el dictado y las órdenes por voz. Sin él, Lazo avisa que falta en vez de enviar el audio a ningún servicio.
4. Teclas: la del dictado y la de «Hablar con Lazo» se eligen en **Configuración → Teclas**.

Las órdenes de **sitios, programas y carpetas** («abre youtube», «abre descargas») siguen funcionando en **Configuración → Órdenes**.
Lo demás que digas («ya la tomé», «qué sigue», «mis citas») lo entiende el servidor de Lazo.
