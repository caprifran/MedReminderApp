# 📦 Generar APK en React Native CLI (Android)

Esta guía explica paso a paso cómo generar un APK de prueba o producción para distribuir la aplicación Android en distintos dispositivos físicos.

---

# 📌 Tipos de APK

## 🔹 APK Debug
Ideal para:
- pruebas rápidas
- desarrollo
- testing personal

### Ventajas
- rápido de generar
- no requiere firma

### Desventajas
- menos optimizado
- más pesado
- comportamiento diferente al real
- depende del entorno de desarrollo

---

## 🔹 APK Release
Ideal para:
- testers
- distribución real
- validación final
- producción

### Ventajas
- optimizado
- más liviano
- más rápido
- comportamiento real
- no depende de Metro Bundler

### Desventajas
- requiere configuración inicial

---

# 🚀 Generar APK Debug

## 1. Entrar a la carpeta Android

```bash
cd android
```

---

## 2. Generar APK Debug

```bash
gradlew assembleDebug
```

---

## 3. Ubicación del APK generado

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Instalar APK

Copiar el archivo APK al dispositivo Android e instalarlo manualmente.

⚠️ Android solicitará habilitar:
- "Instalar aplicaciones desconocidas"

---

# 🚀 Generar APK Release (Recomendado)

---

# 🔐 Paso 1 — Generar Keystore

La Keystore es necesaria para firmar la aplicación.

## Ejecutar desde:

```text
android/app
```

## Comando:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore medreminder-release-key.keystore -alias medreminder-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

---

# ⚠️ IMPORTANTE

Guardar:
- contraseña
- alias
- archivo `.keystore`

Si se pierde:
❌ no se podrá actualizar la aplicación en el futuro.

---

# 📁 Paso 2 — Guardar Keystore

Guardar el archivo generado en:

```text
android/app
```

---

# ⚙️ Paso 3 — Configurar gradle.properties

Archivo:

```text
android/gradle.properties
```

Agregar:

```properties
MYAPP_UPLOAD_STORE_FILE=medreminder-release-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=medreminder-key-alias
MYAPP_UPLOAD_STORE_PASSWORD=TU_PASSWORD
MYAPP_UPLOAD_KEY_PASSWORD=TU_PASSWORD
```

---

# ⚙️ Paso 4 — Configurar SigningConfig

Archivo:

```text
android/app/build.gradle
```

---

## Dentro de `android {}` agregar:

```gradle
signingConfigs {
    release {
        if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
            storeFile file(MYAPP_UPLOAD_STORE_FILE)
            storePassword MYAPP_UPLOAD_STORE_PASSWORD
            keyAlias MYAPP_UPLOAD_KEY_ALIAS
            keyPassword MYAPP_UPLOAD_KEY_PASSWORD
        }
    }
}
```

---

# ⚙️ Paso 5 — Configurar Build Release

Dentro de:

```gradle
buildTypes {
```

Modificar `release`:

```gradle
release {
    signingConfig signingConfigs.release
    minifyEnabled false
    shrinkResources false
}
```

---

# 🏗️ Paso 6 — Generar APK Release

```bash
cd android
gradlew assembleRelease
```

---

# 📦 APK generado

```text
android/app/build/outputs/apk/release/app-release.apk
```

---

# 📲 Instalación en dispositivos

Copiar el archivo:

```text
app-release.apk
```

al dispositivo Android e instalar manualmente.

---

# ⚠️ IMPORTANTE SOBRE ANDROID 13 / 14

Los usuarios deberán permitir manualmente:

- Alarmas exactas
- Full Screen Intent
- Mostrar sobre otras aplicaciones
- Ignorar optimización de batería

---

# 🧹 Limpiar Build (Opcional pero recomendado)

Si ocurre algún error extraño:

```bash
cd android
gradlew clean
```

---

# 🚀 Ejecutar nuevamente

```bash
npx react-native run-android
```

---

# 📦 Diferencias entre Debug y Release

| Característica | Debug | Release |
|---|---|---|
| Optimización | ❌ | ✅ |
| Tamaño | Más grande | Más pequeño |
| Rendimiento | Menor | Mayor |
| Metro Bundler | Necesario | No necesario |
| Ideal para producción | ❌ | ✅ |

---

# 📌 Recomendación

Para aplicaciones que utilizan:
- alarmas
- foreground services
- wake locks
- overlays
- ejecución en segundo plano

✅ siempre probar utilizando APK Release.

Muchas APIs Android funcionan distinto en modo Debug.

---

# 🏪 Futuro: Publicar en Google Play

Cuando la app esté lista para producción:

## Generar Android App Bundle (AAB)

```bash
gradlew bundleRelease
```

Archivo generado:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

El formato `.aab` es el requerido por Google Play Store.

---

# ✅ Recomendaciones finales

## Antes de distribuir:

- probar alarmas con pantalla apagada
- probar con batería optimizada
- probar reinicio del dispositivo
- probar modo ahorro de energía
- validar permisos manuales
- probar comportamiento en segundo plano

---

# 📱 Testing recomendado

Probar en:
- Samsung
- Xiaomi
- Motorola
- Pixel

Cada fabricante modifica agresivamente Android y el manejo de alarmas/background.

---

