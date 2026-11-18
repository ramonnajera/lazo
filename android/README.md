# Lazo — app de Android

Kotlin + Jetpack Compose. `minSdk 30` (Android 11), `targetSdk 35`. Paquete `mx.lazo.app`.

```bash
./gradlew testDebugUnitTest      # 44 pruebas (lógica, datos, pantallas con capturas y servidor real)
./gradlew assembleRelease        # APK en app/build/outputs/apk/release/ (firmado con la llave de depuración)
```
Las capturas de las pruebas de pantalla quedan en `app/build/pantallas/`. La prueba `ServidorRealTest` necesita `node` y levanta
el servidor de `../server`.

**Instalar:** copia el APK al teléfono y ábrelo (permite «instalar apps de origen desconocido»), o `adb install -r app-release.apk`.
Lazo pide permiso de **notificaciones** (Android 13+): sin él las alarmas de medicina no se verían.

**Conectar:** la primera pantalla pide la dirección del servidor (por ejemplo `192.168.1.5:18800`). Se permite `http://`
para redes locales; usa `https://` o una VPN cuando salgas de casa.

Notas de diseño: las alarmas son exactas y locales (`USE_EXACT_ALARM`); la lectura usa el motor de voz del teléfono; el
reconocimiento de voz abre el del sistema. El token se guarda en el almacenamiento privado de la app.
