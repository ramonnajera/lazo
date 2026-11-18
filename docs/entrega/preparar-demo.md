# Preparar la demostración (con datos ficticios)

1. **(Solo si quieres datos de demostración locales)** Servidor de demostración (Node 20 o superior):
   ```bash
   cd server
   LAZO_HOST=0.0.0.0 node scripts/demo.js
   ```
   Imprime la dirección, el **token** de la persona y un **código de cuidador**. Cada arranque crea datos nuevos con horas
   relativas al momento actual, así que siempre hay una toma «que toca ahora». Usa `LAZO_HOST=0.0.0.0` solo en una red de confianza.
2. **Teléfono Android:** instala `android/app/build/outputs/apk/release/app-release.apk`, abre Lazo →
   «Soy la persona que usará Lazo» → tu nombre → Comenzar. **No pide ninguna dirección**: la app ya viene conectada al
   servidor de Lazo (`https://optiplex3090.tailcf0c15.ts.net/lazo`) y cada persona tiene su propio espacio. Para grabar el video
   sin datos personales crea una persona de prueba («Ana Ejemplo») desde la app.
3. **Cuidador:** en la app → «Soy cuidador» → el código de 6 dígitos que imprimió el servidor (vale 24 h y un solo uso).
4. **Windows:** instala el asistente (`desktop`, ver su README), al abrirlo pide tu nombre y crea el perfil (o, si ya usas Lazo en el teléfono, Configuración → Conexión → código de 6 dígitos). Tampoco pide dirección.
5. **Antes de grabar:** `node scripts/demo.js` de nuevo si pasó mucho tiempo (las horas se calculan al arrancar).
