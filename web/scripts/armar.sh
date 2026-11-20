#!/usr/bin/env bash
# Arma .salida/: la página ya compilada + la función /api/lazo con el servidor real. Esa carpeta es la que se sube a Vercel.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/copiar-servidor.sh
npx tsc --noEmit
npx vite build --outDir .salida/tmp-dist --emptyOutDir
VINCULO=""
[ -d .salida/.vercel ] && VINCULO=$(mktemp -d) && cp -r .salida/.vercel "$VINCULO/"
rm -rf .salida/public .salida/api
mkdir -p .salida
mv .salida/tmp-dist .salida/public
cp -r api .salida/api
cat > .salida/package.json <<'J'
{ "name": "lazo-demo", "private": true, "engines": { "node": ">=20" } }
J
cat > .salida/vercel.json <<'J'
{
  "framework": null,
  "buildCommand": "",
  "outputDirectory": "public",
  "functions": { "api/lazo.js": { "maxDuration": 60, "memory": 1024 } },
  "headers": [
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "microphone=(self), camera=(), geolocation=()" }
    ] }
  ]
}
J
[ -n "$VINCULO" ] && cp -r "$VINCULO/.vercel" .salida/ && rm -rf "$VINCULO"
echo "listo: $(du -sh .salida | cut -f1) en .salida"
