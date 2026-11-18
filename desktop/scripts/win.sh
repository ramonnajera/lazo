#!/usr/bin/env bash
# Corre un comando en el espejo de Windows con la cadena de Rust y Node de Windows (npm, cargo, tauri).
#   LAZO_WIN_DIR  el espejo visto desde WSL (por omisión: /mnt/c/Users/<tu usuario>/sites/lazo-desktop)
# El espejo se llena con scripts/desktop-sync.sh (en la raíz del repositorio).
USUARIO="$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')"
cd "${LAZO_WIN_DIR:-/mnt/c/Users/${USUARIO}/sites/lazo-desktop}" || exit 1
exec cmd.exe /c "call scripts\\env.cmd && $*"
