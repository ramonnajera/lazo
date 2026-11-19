# Preparar la demostración (con datos ficticios)

La demostración ya está cargada en el servidor de Lazo (`https://optiplex3090.tailcf0c15.ts.net/lazo`), en el único perfil,
que comparten el teléfono y la isla de Windows. Todo es ficticio:

- **Persona:** Mateo Ruiz, un joven autista (discapacidad «Otra»), con letra grande y voz activadas.
- **Medicinas:** Risperidona 0.5 mg (8 am y 8 pm, con alimentos; quedan 5: sale el aviso de resurtir), Sertralina 25 mg (9 am),
  Melatonina 3 mg (9:30 pm, con luz baja) y Omega 3 (lunes, miércoles y viernes, 2 pm). Historial de 10 días con tres dosis omitidas.
- **Citas:** terapia ocupacional (integración sensorial), terapia de lenguaje, psiquiatría (control de risperidona), laboratorio en
  ayunas y psicología, cada una con notas pensadas para él (audífonos de cancelación de ruido, avisarle con anticipación, pedir el último turno).
- **Salud:** peso que sube poco a poco (71.8 → 72.9 kg), glucosa en ayunas, presión normal, ánimo diario con un día bajo
  («cambio de rutina, mucho ruido») y un dolor de cabeza ese mismo día.
- **Círculo:** Laura Ruiz (mamá). Sin teléfono propio: «Necesito ayuda» dice «Avisé a 1 cuidador», pero nadie lo recibe.

## Antes de grabar
1. **Teléfono:** abre Lazo; debe saludar «Hola, Mateo». La toma de la noche aparece como «Es hora de tu medicina».
   Si ya la marcaste en una prueba, usa «Deshacer» en la lista de tomas para volver a mostrarla.
2. **Ver la vista del cuidador** (opcional, para la escena de «Necesito ayuda»): en el teléfono de Mateo, Más → Mi círculo de
   cuidado → Invitar a un cuidador. En un segundo teléfono instala el APK → «Soy cuidador o familiar» → el código de 6 dígitos.
   Después de grabar puedes quitarle el acceso desde la misma pantalla.
3. **Windows:** la isla ya está conectada al mismo perfil; pasa el cursor por el borde superior al centro.
4. **La hora importa:** las tomas y citas son de noviembre de 2026 y el día «de hoy» es el 18. Si grabas otro día, vuelve a cargar la
   demostración ese día con `node server/scripts/demo-autismo.js <token> <url>` sobre un perfil vacío (las fechas se calculan desde
   el día en que se corre), para que haya una toma «que toca ahora».

## Demostración local (opcional, sin el servidor del OptiPlex)
`cd server && LAZO_HOST=0.0.0.0 node scripts/demo.js` crea en tu computadora otra persona ficticia («Ana Ejemplo») con horas
relativas al momento del arranque e imprime su token y un código de cuidador. Úsalo solo en una red de confianza.
