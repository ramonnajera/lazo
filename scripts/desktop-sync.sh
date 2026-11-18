#!/usr/bin/env bash
# Refleja desktop/ en el disco de Windows: la cadena de Rust y Tauri compila ahí (no se edita en el espejo).
#   LAZO_WIN_DIR  carpeta de destino en Windows vista desde WSL (por omisión: /mnt/c/Users/<tu usuario>/sites/lazo-desktop)
set -euo pipefail
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
USUARIO="$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')"
DESTINO="${LAZO_WIN_DIR:-/mnt/c/Users/${USUARIO}/sites/lazo-desktop}"
mkdir -p "$DESTINO"
rsync -a --delete --exclude node_modules --exclude target --exclude dist "$AQUI/desktop/" "$DESTINO/"
echo "espejo listo en $DESTINO"
