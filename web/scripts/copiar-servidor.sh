#!/usr/bin/env bash
# Copia el servidor real de Lazo dentro de la función de Vercel (api/_lazo). No se edita a mano: se regenera.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf api/_lazo && mkdir -p api/_lazo
cp ../server/src/*.js api/_lazo/
rm -f api/_lazo/index.js
cp ../server/scripts/demo-autismo.js api/_lazo/
