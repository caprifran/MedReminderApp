# Arquitectura de Alarmas Nativas Android — Guía de Referencia

> Proyecto: MedReminder — React Native CLI + TypeScript + Android
> Esta guía explica la arquitectura completa de alarmas nativas Android, por qué cada componente es necesario, y cómo todo se integra con React Native.

---

## ¿Por qué falla el enfoque JS-only?

Android tiene tres capas de restricciones de background que se activan progresivamente:

| Restricción | API | Efecto |
|-------------|-----|--------|
| **Background App Standby** | 23+ | Limita actividad de red y alarmas de apps inactivas |
| **Doze Mode** | 23+ | Congela `setTimeout`, `setInterval`, jobs, alarmas normales cuando el dispositivo lleva tiempo inmóvil y apagado |
| **OEM Task Killers** | Todos | Xiaomi/Huawei/Samsung matan procesos para ahorrar batería |

**Resultado**: sin una cadena nativa completa, las alarmas desaparecen silenciosamente.

**Por qué Notifee falla para alarmas médicas:**
- Usa el notification audio stream (`STREAM_NOTIFICATION`), no el de alarma (`STREAM_ALARM`)
- El sonido `'alarm'` busca un archivo local `alarm.mp3` en `res/raw` — si no existe, solo vibra
- `fullScreenAction` en Android 14+ requiere `USE_FULL_SCREEN_INTENT` que está desactivado para apps sideloaded
- Si el proceso JS está muerto, Notifee no puede disparar nada

---

## La cadena nativa correcta

```
AlarmManager
    ↓  PendingIntent (RTC_WAKEUP + setExactAndAllowWhileIdle)
AlarmReceiver (BroadcastReceiver)
    ↓  startForegroundService()
AlarmService (Foreground Service)
    ├── MediaPlayer (STREAM_ALARM, looping)
    ├── WakeLock (CPU despierto)
    ├── Foreground Notification (obligatoria por Android)
    ├── SharedPreferences (persiste eventId para RN)
    └── startActivity(MainActivity)
         ↓
React Native App
    ├── Lee SharedPreferences via AlarmModule.getActiveAlarmId()
    ├── Carga evento de SQLite
    └── Muestra AlarmOverlay (diseño Stitch)
         ↓
Usuario presiona botón (Taken / Snooze / Skip)
    ↓  AlarmModule.stopAlarm()
    ↓  broadcast STOP_ALARM
AlarmService.cleanup()
    ├── mediaPlayer.stop() + release()
    ├── wakeLock.release()
    ├── stopForeground(STOP_FOREGROUND_REMOVE)
    └── stopSelf()
```

---

## PASO 3 — Foreground Service (`AlarmService.kt`)

### ¿Qué es un Foreground Service?

Un **Service normal** puede ser matado por Android si el sistema necesita memoria. Un **Foreground Service** es diferente:

- Al iniciar, **debe mostrar una notificación persistente** en la barra de estado
- A cambio, Android lo trata como proceso de primer plano — no lo mata
- Puede reproducir audio, mantener WakeLocks, y ejecutar código indefinidamente

### Por qué es obligatorio para alarmas

Sin Foreground Service:
- El proceso muere → el audio se corta
- El WakeLock se libera → la CPU entra en sleep
- La alarma desaparece en silencio

Con Foreground Service:
- Proceso garantizado mientras la alarma suena
- Audio continuo con `MediaPlayer`
- WakeLock activo para mantener CPU y pantalla

### Responsabilidades

1. Llamar `startForeground()` **dentro de los primeros 5 segundos** de `onStartCommand` (obligatorio en Android 8+, si falla → ANR)
2. Iniciar `MediaPlayer` con `AudioAttributes.USAGE_ALARM`
3. Adquirir `PowerManager.WakeLock` con timeout de seguridad
4. Escribir `eventId` en `SharedPreferences`
5. Lanzar `MainActivity` con el `eventId` como extra
6. Registrar un `BroadcastReceiver` interno para escuchar la señal de parada
7. Al recibir STOP: limpiar MediaPlayer → liberar WakeLock → `stopForeground()` → `stopSelf()`

### Archivo
```
android/app/src/main/java/com/com.medreminder/AlarmService.kt
```

---

## PASO 4 — BroadcastReceiver (`AlarmReceiver.kt`)

### ¿Qué es un BroadcastReceiver?

Un `BroadcastReceiver` es un componente Android que puede recibir mensajes del sistema o de otras apps, **incluso cuando la app está completamente cerrada**.

### ¿Por qué AlarmManager necesita un BroadcastReceiver?

`AlarmManager` no puede iniciar un Service directamente. Solo puede enviar un **broadcast** (mensaje del sistema). El BroadcastReceiver recibe ese broadcast y puede iniciar el Service.

### ¿Qué es un PendingIntent?

Un `PendingIntent` es un "recibo" que el sistema guarda. Cuando programas una alarma no guardas código JS — guardas este recibo que contiene:
- La acción a ejecutar (iniciar AlarmReceiver)
- Los datos de la alarma (eventId, medName, dose)

El sistema puede usar este recibo aunque la app esté cerrada, ya que está almacenado en el proceso del sistema, no en el proceso de la app.

### Regla de los 10 segundos

El `BroadcastReceiver.onReceive()` **debe completarse en menos de 10 segundos**. Por eso solo inicia el Service y no hace trabajo pesado.

### Archivo
```
android/app/src/main/java/com/com.medreminder/AlarmReceiver.kt
```

---

## PASO 5 — AlarmManager con alarmas exactas (`AlarmModule.kt`)

### Tipos de alarmas Android

| Método | Exactitud | Doze Mode |
|--------|-----------|-----------|
| `set()` | Inexacta, puede retrasarse | Diferida |
| `setExact()` | Exacta | Diferida en Doze |
| `setExactAndAllowWhileIdle()` | Exacta | ✅ Se dispara en Doze |

### ¿Por qué `RTC_WAKEUP`?

El tipo `RTC_WAKEUP` despierta el dispositivo del sleep cuando llega el momento. Sin `WAKEUP`, la alarma se acumula hasta que el usuario despierta el teléfono por su cuenta — inaceptable para alarmas médicas.

### Permiso en Android 12+

En Android 12+ (`targetSdk >= 31`), `SCHEDULE_EXACT_ALARM` requiere que el **usuario lo conceda manualmente** en Ajustes. La app debe:
1. Verificar con `alarmManager.canScheduleExactAlarms()`
2. Si no está concedido, guiar al usuario con `Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM`

### Native Module Bridge

`AlarmModule.kt` es el puente entre JavaScript y el `AlarmManager` nativo. JavaScript llama:
```typescript
NativeModules.AlarmModule.scheduleAlarm(eventId, medName, dose, timestamp)
NativeModules.AlarmModule.cancelAlarm(eventId)
NativeModules.AlarmModule.stopAlarm(eventId)
```

### Archivos
```
android/app/src/main/java/com/com.medreminder/AlarmModule.kt
android/app/src/main/java/com/com.medreminder/AlarmPackage.kt
```

---

## PASO 6 — Fullscreen Activity (integrada en MainActivity)

En esta implementación, en lugar de una `AlarmActivity` separada, `AlarmService` lanza directamente `MainActivity`. `MainActivity` ya tiene los flags de ventana correctos:

- `setShowWhenLocked(true)`: Muestra la Activity sobre el lock screen
- `setTurnScreenOn(true)`: Enciende la pantalla si está apagada
- `FLAG_KEEP_SCREEN_ON`: Mantiene la pantalla encendida
- `FLAG_DISMISS_KEYGUARD`: Descarta el keyguard (dispositivos sin PIN)

### ¿Por qué es diferente a una notificación?

Una notificación solo aparece en la barra de notificaciones — no puede desbloquear la pantalla ni encenderla. Una Activity con estos flags puede aparecer sobre todo, similar a una llamada entrante.

---

## PASO 7 — Sonido nativo con MediaPlayer

### ¿Por qué MediaPlayer y no RingtoneManager o Notifee?

| Método | Stream | Looping | Control | Problema |
|--------|--------|---------|---------|---------|
| Notifee `sound: 'alarm'` | STREAM_NOTIFICATION | Limitado | Ninguno | Busca archivo local inexistente |
| RingtoneManager | STREAM_ALARM | Solo API 28+ | Limitado | Sin integración AudioFocus |
| **MediaPlayer** | **STREAM_ALARM** | **Completo** | **Total** | **Ninguno** |

### Por qué `STREAM_ALARM` es obligatorio

Android tiene streams de audio separados con volúmenes independientes:
- `STREAM_NOTIFICATION`: Respeta modo silencioso, afectado por volumen de notificaciones
- `STREAM_ALARM`: Puede sonar en modo silencioso (según config del usuario), usa el volumen de alarmas

El `MediaPlayer` con `AudioAttributes.USAGE_ALARM` usa explícitamente `STREAM_ALARM`.

### Código clave

```kotlin
MediaPlayer().apply {
    setDataSource(context, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
    setAudioAttributes(
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
    )
    isLooping = true
    prepare()
    start()
}
```

---

## PASO 8 — WakeLocks

### ¿Qué es un WakeLock?

Una "promesa" al sistema operativo: "mantén la CPU encendida aunque el usuario no esté interactuando". Sin WakeLock:
- CPU entra en sleep → código deja de ejecutarse → audio se corta

### Tipos utilizados

| Tipo | Efecto | Dónde se usa |
|------|--------|-------------|
| `PARTIAL_WAKE_LOCK` | CPU encendida, pantalla puede apagarse | `AlarmService` |

### Peligros

- **No llamar `release()`** → batería drenada hasta apagar el dispositivo
- Por eso se usa `acquire(timeout)` con límite de seguridad (10 minutos)
- Se libera explícitamente en `stopAlarm()`

---

## PASO 9 — Integración React Native

### Flujo de comunicación

**JS → Nativo** (Native Modules):
```
JS: NativeModules.AlarmModule.scheduleAlarm(...)
→ Kotlin: AlarmModule.scheduleAlarm() → AlarmManager
```

**Nativo → JS** (SharedPreferences + AppState):
```
AlarmService → escribe en SharedPreferences
→ App resume → AlarmModule.getActiveAlarmId()
→ loadActiveAlarmEvent(id) → store → AlarmOverlay visible
```

**Nativo → JS** (DeviceEventEmitter — cuando app está en primer plano):
```
AlarmService → AlarmModule.emitAlarmFired()
→ DeviceEventEmitter.emit('AlarmFired', data)
→ App.tsx listener → store → AlarmOverlay visible
```

### Tabla de responsabilidades

| Capa | Responsabilidad |
|------|----------------|
| `AlarmModule.kt` | Bridge: schedule/cancel/stop/getActiveId |
| `AlarmReceiver.kt` | Recibir trigger del AlarmManager |
| `AlarmService.kt` | Audio + WakeLock + SharedPrefs + lanzar UI |
| `src/services/AlarmService.ts` | Wrapper TS del NativeModule |
| `SchedulerService.ts` | Llama AlarmService.ts en vez de NotificationService |
| `useMedicationStore.ts` | Cancela/reprograma alarmas en acciones del usuario |
| `AlarmOverlay.tsx` | UI Stitch, botones que llaman stopAlarm |
| `App.tsx` | Lee SharedPrefs en mount/resume, muestra overlay |

---

## PASO 10 — AndroidManifest

### Todos los permisos

```xml
<!-- CPU wakelock durante alarma -->
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Android 13+: mostrar notificaciones -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Android 12+: alarmas exactas -->
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />

<!-- Android 13+: alarmas exactas sin diálogo al usuario (para apps de alarma) -->
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />

<!-- Mostrar UI sobre lock screen -->
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />

<!-- Declarar uso de foreground service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<!-- Tipo específico: service con reproducción de audio -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<!-- Reschedule tras reinicio -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

### Declaraciones de componentes

```xml
<receiver android:name=".AlarmReceiver" android:exported="false">
    <intent-filter>
        <action android:name="com.medreminder.ALARM_TRIGGER" />
    </intent-filter>
</receiver>

<service
    android:name=".AlarmService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="false" />

<receiver android:name=".BootReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
        <action android:name="android.intent.action.QUICKBOOT_POWERON" />
    </intent-filter>
</receiver>
```

---

## PASO 11 — Restricciones de fabricantes

### Por qué Xiaomi/Huawei/Samsung matan las alarmas

Los OEM añaden capas de gestión de batería **por encima** del AOSP (Android base):

| Fabricante | Restricción | Solución |
|-----------|-------------|---------|
| **Xiaomi MIUI** | AutoStart desactivado por defecto, AlarmManager puede ser bloqueado | Pedir al usuario activar AutoStart en Ajustes MIUI |
| **Huawei EMUI** | "Protected Apps" — lista blanca necesaria | Guiar al usuario a la pantalla de Protected Apps |
| **Samsung One UI** | "Adaptive Battery" puede suspender alarmas | Desactivar optimización de batería para la app |
| **OnePlus** | Battery Optimization agresivo | Desactivar optimización |

### Cómo mitigarlo en código

```kotlin
// Pedir al usuario que desactive la optimización de batería
val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
    data = Uri.parse("package:$packageName")
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
startActivity(intent)
```

```kotlin
// BootReceiver: reschedule al reiniciar
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Escribir flag en SharedPreferences
        // La app, al abrirse, detecta la flag y reschedule todas las alarmas pendientes
        context.getSharedPreferences("alarm_prefs", Context.MODE_PRIVATE)
            .edit().putBoolean("needs_reschedule", true).apply()
    }
}
```

---

## PASO 12 — Flujo de parada (cleanup)

### Orden correcto de cleanup

```
1. mediaPlayer.stop()         → detiene reproducción
2. mediaPlayer.release()      → libera recursos de audio (DEBE ser después de stop)
3. wakeLock.release()         → libera CPU lock (DEBE ser después de confirmar UI)
4. SharedPreferences.clear()  → elimina active_alarm_id
5. stopForeground(REMOVE)     → quita notificación de foreground
6. stopSelf()                 → termina el Service
```

**¿Por qué este orden?**
- `release()` invalida el objeto `MediaPlayer` — no se puede llamar `stop()` después
- Si liberas el WakeLock antes de que la UI confirme, la pantalla puede apagarse en medio de la transición
- `stopForeground()` antes de `stopSelf()` — en algunos dispositivos, sin esto la notificación queda huérfana

---

## Debugging

```bash
# Ver logs de todos los componentes de alarma en tiempo real
adb logcat -s AlarmService AlarmReceiver AlarmModule BootReceiver

# Ver todas las alarmas programadas en el sistema
adb shell dumpsys alarm | grep medreminder

# Ver si el foreground service está activo
adb shell dumpsys activity services | grep AlarmService

# Ver SharedPreferences de la app
adb shell run-as com.medreminder cat /data/data/com.medreminder/shared_prefs/alarm_prefs.xml

# Forzar Doze Mode para pruebas
adb shell dumpsys battery unplug
adb shell dumpsys deviceidle force-idle

# Salir de Doze
adb shell dumpsys deviceidle unforce
```

---

## Diferencias por versión Android

| API Level | Versión | Cambio relevante |
|-----------|---------|-----------------|
| 21-22 | Android 5.x | Sin restricciones de background, `setExact()` suficiente |
| 23 | Android 6 | Doze Mode activo → usar `setExactAndAllowWhileIdle` |
| 26 | Android 8 | `startForegroundService()` obligatorio; Service debe llamar `startForeground()` en 5s |
| 28 | Android 9 | `NotificationChannel` obligatorio para foreground service |
| 29 | Android 10 | `foregroundServiceType` obligatorio en manifest |
| 31 | Android 12 | `SCHEDULE_EXACT_ALARM` requiere permiso del usuario |
| 33 | Android 13 | `POST_NOTIFICATIONS` requiere permiso en runtime; `USE_EXACT_ALARM` disponible para apps de alarma |
| 34 | Android 14 | `USE_FULL_SCREEN_INTENT` desactivado para sideloaded apps; `FOREGROUND_SERVICE_MEDIA_PLAYBACK` obligatorio |

---

## Testing en dispositivo físico

| Escenario | Resultado esperado |
|-----------|-------------------|
| App en primer plano | Overlay Stitch aparece, suena alarma |
| App minimizada | App se abre, overlay aparece, suena alarma |
| Pantalla bloqueada (sin PIN) | Pantalla enciende, overlay aparece, suena alarma |
| Pantalla bloqueada (con PIN) | Notificación en lock screen; al abrir con PIN, overlay aparece |
| App completamente cerrada | MainActivity abre, overlay aparece, suena alarma |
| Doze Mode (30+ min sin uso) | Alarma se dispara puntual con `setExactAndAllowWhileIdle` |
| Después de reinicio | BootReceiver activa flag, app reschedule al abrir |
| Botón "Tomada" | Alarma para, MediaPlayer liberado, WakeLock liberado, overlay desaparece |
| Botón "Posponer" | Alarma para, nueva alarma programada en 10 min |
| Botón "Omitir" | Alarma para, evento marcado como SKIPPED |
