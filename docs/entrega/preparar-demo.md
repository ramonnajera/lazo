# Preparar la demostración (con datos ficticios)

1. **Servidor de demostración** (Node 20 o superior):
   ```bash
   cd server
   LAZO_HOST=0.0.0.0 node scripts/demo.js
   ```
   Imprime la dirección, el **token** de la persona y un **código de cuidador**. Cada arranque crea datos nuevos con horas
   relativas al momento actual, así que siempre hay una toma «que toca ahora». Usa `LAZO_HOST=0.0.0.0` solo en una red de confianza.
2. **Teléfono Android:** instala `android/app/build/outputs/apk/release/app-release.apk`, abre Lazo →
   «Soy la persona» → pega la dirección (`IP-de-tu-computadora:18800`). La demostración ya creó a «Ana Ejemplo»: para
   entrar como esa persona usa **Más → Conexión** en un teléfono ya conectado, o arranca el servidor **sin** datos
   (`node src/index.js`) y crea tu propia persona de prueba desde la app.
3. **Cuidador:** en la app → «Soy cuidador» → dirección + el código de 6 dígitos que imprimió el servidor (vale 24 h y un solo uso).
4. **Windows:** instala el asistente (`desktop`, ver su README), en Configuración → Conexión pega la dirección y el token.
5. **Antes de grabar:** `node scripts/demo.js` de nuevo si pasó mucho tiempo (las horas se calculan al arrancar).
