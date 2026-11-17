package com.medreminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * AlarmModule — Native Module que expone el sistema de alarmas nativo a JavaScript.
 *
 * ¿Por qué necesitamos un Native Module?
 * React Native no tiene acceso directo al AlarmManager de Android ni a los
 * SharedPreferences nativos. Este módulo actúa como puente, exponiendo métodos
 * que JavaScript puede llamar via NativeModules.AlarmModule.*
 *
 * También puede emitir eventos hacia JavaScript usando DeviceEventEmitter,
 * lo que permite notificar al proceso RN cuando una alarma se dispara
 * sin que JS necesite hacer polling.
 */
class AlarmModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "AlarmModule"

        // Extras del Intent — claves compartidas entre AlarmModule, AlarmReceiver y AlarmService
        const val EXTRA_EVENT_ID = "event_id"
        const val EXTRA_MED_NAME = "med_name"
        const val EXTRA_DOSE     = "dose"

        // Singleton para poder emitir eventos desde AlarmService (que no tiene ReactContext)
        private var moduleInstance: AlarmModule? = null

        fun emitAlarmFired(eventId: String, medName: String, dose: String) {
            moduleInstance?.sendAlarmFiredEvent(eventId, medName, dose)
        }
    }

    private var backupPromise: Promise? = null
    private var restorePromise: Promise? = null
    private val EXPORT_REQ_CODE = 9002
    private val IMPORT_REQ_CODE = 9003

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: android.app.Activity, requestCode: Int, resultCode: Int, intent: Intent?) {
            if (requestCode == EXPORT_REQ_CODE) {
                if (resultCode == android.app.Activity.RESULT_OK && intent?.data != null) {
                    try {
                        val dbFile = reactApplicationContext.getDatabasePath("medreminder.db")
                        reactApplicationContext.contentResolver.openOutputStream(intent.data!!)?.use { outStream ->
                            dbFile.inputStream().use { inStream ->
                                inStream.copyTo(outStream)
                            }
                        }
                        backupPromise?.resolve(true)
                    } catch (e: Exception) {
                        backupPromise?.reject("EXPORT_ERROR", e.message)
                    }
                } else {
                    backupPromise?.reject("CANCELLED", "Export cancelled")
                }
                backupPromise = null
            } else if (requestCode == IMPORT_REQ_CODE) {
                if (resultCode == android.app.Activity.RESULT_OK && intent?.data != null) {
                    try {
                        val intentData = intent.data!!
                        
                        // 1. Validar que el archivo sea una BD de SQLite válida
                        reactApplicationContext.contentResolver.openInputStream(intentData)?.use { inStream ->
                            val header = ByteArray(16)
                            val bytesRead = inStream.read(header, 0, 16)
                            if (bytesRead < 16) {
                                restorePromise?.reject("INVALID_FORMAT", "El archivo está vacío o corrupto.")
                                restorePromise = null
                                return
                            }
                            val headerString = String(header)
                            if (!headerString.startsWith("SQLite format 3")) {
                                restorePromise?.reject("INVALID_FORMAT", "El archivo seleccionado no es una copia de seguridad válida.")
                                restorePromise = null
                                return
                            }
                        }

                        // 2. Si es válido, lo copiamos reemplazando la base actual
                        val dbFile = reactApplicationContext.getDatabasePath("medreminder.db")
                        reactApplicationContext.contentResolver.openInputStream(intentData)?.use { inStream ->
                            dbFile.outputStream().use { outStream ->
                                inStream.copyTo(outStream)
                            }
                        }
                        restorePromise?.resolve(true)
                    } catch (e: Exception) {
                        restorePromise?.reject("IMPORT_ERROR", e.message)
                    }
                } else {
                    restorePromise?.reject("CANCELLED", "Import cancelled")
                }
                restorePromise = null
            }
        }
    }

    init {
        moduleInstance = this
        reactApplicationContext.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = "AlarmModule"

    /**
     * Emite el evento 'AlarmFired' hacia JavaScript.
     * En App.tsx: DeviceEventEmitter.addListener('AlarmFired', handler)
     */
    private fun sendAlarmFiredEvent(eventId: String, medName: String, dose: String) {
        try {
            val params = Arguments.createMap().apply {
                putString("eventId", eventId)
                putString("medName", medName)
                putString("dose", dose)
            }
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("AlarmFired", params)
            Log.d(TAG, "AlarmFired event emitted for: $eventId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit AlarmFired event (bridge may not be ready)", e)
        }
    }

    // ─── Métodos expuestos a JavaScript ──────────────────────────────────────

    /**
     * Programa una alarma exacta con AlarmManager.
     *
     * ¿Por qué setExactAndAllowWhileIdle()?
     * - setExact() puede ser diferido en Doze Mode (cuando el teléfono lleva tiempo inmóvil)
     * - setExactAndAllowWhileIdle() se garantiza que dispara incluso en Doze
     * - RTC_WAKEUP despierta la CPU y pantalla en el momento exacto
     *
     * @param eventId ID del DoseEvent en SQLite
     * @param medName Nombre del medicamento (para mostrar en la notificación de foreground)
     * @param dose Dosis como string (ej: "1 tableta 500mg")
     * @param timestamp Milisegundos epoch del momento de disparo
     */
    @ReactMethod
    fun scheduleAlarm(eventId: String, medName: String, dose: String, timestamp: Double, promise: Promise) {
        try {
            val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            // En Android 12+ se requiere permiso explícito del usuario para alarmas exactas
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                promise.reject("PERMISSION_DENIED", "El permiso SCHEDULE_EXACT_ALARM no fue concedido. Llama openExactAlarmSettings() para guiar al usuario.")
                return
            }

            val intent = Intent(reactApplicationContext, AlarmReceiver::class.java).apply {
                action = "com.medreminder.ALARM_TRIGGER"
                putExtra(EXTRA_EVENT_ID, eventId)
                putExtra(EXTRA_MED_NAME, medName)
                putExtra(EXTRA_DOSE, dose)
            }

            // FLAG_IMMUTABLE: requerido en Android 12+.
            // FLAG_UPDATE_CURRENT: si ya existía un PendingIntent con el mismo requestCode,
            // lo actualiza con los nuevos datos en lugar de crear uno duplicado.
            // requestCode = eventId.hashCode() — cada evento tiene su propio PendingIntent único.
            val pendingIntent = PendingIntent.getBroadcast(
                reactApplicationContext,
                eventId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val triggerMs = timestamp.toLong()
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, pendingIntent)

            Log.d(TAG, "Alarm scheduled: $eventId at $triggerMs ms")
            promise.resolve(eventId)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule alarm: $eventId", e)
            promise.reject("SCHEDULE_ERROR", e.message)
        }
    }

    /**
     * Cancela una alarma programada.
     * Usa el mismo requestCode (eventId.hashCode()) para encontrar el PendingIntent correcto.
     * FLAG_NO_CREATE: si no existe el PendingIntent, devuelve null en vez de crear uno nuevo.
     */
    @ReactMethod
    fun cancelAlarm(eventId: String) {
        try {
            val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(reactApplicationContext, AlarmReceiver::class.java).apply {
                action = "com.medreminder.ALARM_TRIGGER"
            }
            val pendingIntent = PendingIntent.getBroadcast(
                reactApplicationContext,
                eventId.hashCode(),
                intent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )
            pendingIntent?.let { alarmManager.cancel(it) }
            Log.d(TAG, "Alarm cancelled: $eventId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cancel alarm: $eventId", e)
        }
    }

    @ReactMethod
    fun stopAlarm(eventId: String) {
        val tStart = System.currentTimeMillis()
        try {
            val intent = Intent(AlarmService.ACTION_STOP_ALARM).apply {
                setPackage(reactApplicationContext.packageName)
            }
            reactApplicationContext.sendBroadcast(intent)
            Log.d(TAG, "[ALARM_DEBUG] Stop broadcast sent instantly for: $eventId at T=${System.currentTimeMillis() - tStart}ms")
        } catch (e: Exception) {
            Log.e(TAG, "[ALARM_DEBUG] Failed to stop alarm: $eventId", e)
        }
    }

    /**
     * Lee el ID de la alarma activa desde SharedPreferences.
     * React Native llama este método al montar la app para detectar si una alarma
     * se disparó mientras la app estaba cerrada o en background.
     */
    @ReactMethod
    fun getActiveAlarmId(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(AlarmService.PREFS_NAME, Context.MODE_PRIVATE)
            val id = prefs.getString(AlarmService.KEY_ACTIVE_ALARM_ID, null)
            promise.resolve(id)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    /**
     * Limpia el estado de alarma activa de SharedPreferences.
     * Se llama cuando el usuario interactúa con el AlarmOverlay (Tomada/Posponer/Omitir).
     */
    @ReactMethod
    fun clearActiveAlarm() {
        try {
            reactApplicationContext
                .getSharedPreferences(AlarmService.PREFS_NAME, Context.MODE_PRIVATE)
                .edit().clear().apply()
            Log.d(TAG, "Active alarm cleared from SharedPreferences")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear active alarm", e)
        }
    }

    /**
     * Verifica si la app puede programar alarmas exactas (Android 12+ requiere permiso explícito).
     */
    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            promise.resolve(alarmManager.canScheduleExactAlarms())
        } else {
            promise.resolve(true) // Siempre permitido en versiones anteriores
        }
    }

    /**
     * Abre la pantalla de Ajustes de Android para conceder el permiso de alarmas exactas.
     */
    @ReactMethod
    fun openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
        }
    }

    /**
     * Abre el diálogo para que el usuario exima la app de optimización de batería.
     * Crítico en Xiaomi, Huawei, Samsung y OnePlus donde el sistema mata los procesos
     * agresivamente para ahorrar batería.
     */
    @ReactMethod
    fun requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = android.net.Uri.parse("package:${reactApplicationContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
        }
    }

    /**
     * Verifica si la app está ignorando las optimizaciones de batería.
     */
    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            promise.resolve(pm.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun exportDatabase(promise: Promise) {
        val activity = getCurrentActivity()
        if (activity == null) {
            promise.reject("ERR", "No activity found")
            return
        }
        backupPromise = promise
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/octet-stream"
            putExtra(Intent.EXTRA_TITLE, "MedReminder_Backup.db")
        }
        activity.startActivityForResult(intent, EXPORT_REQ_CODE)
    }

    @ReactMethod
    fun importDatabase(promise: Promise) {
        val activity = getCurrentActivity()
        if (activity == null) {
            promise.reject("ERR", "No activity found")
            return
        }
        restorePromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }
        activity.startActivityForResult(intent, IMPORT_REQ_CODE)
    }

    /**
     * Comprueba si la app tiene habilitado el permiso USE_FULL_SCREEN_INTENT.
     * En Android 14+ está desactivado por defecto para apps instaladas via USB (sideloaded).
     */
    @ReactMethod
    fun canUseFullScreenIntent(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val nm = reactApplicationContext.getSystemService(android.app.NotificationManager::class.java)
            promise.resolve(nm.canUseFullScreenIntent())
        } else {
            promise.resolve(true)
        }
    }

    /**
     * Dispara una alarma de prueba de forma inmediata, sin pasar por AlarmManager.
     * Inicia AlarmService directamente. Útil para pruebas en SettingsScreen.
     *
     * @param eventId  ID a usar (usa 'immediate-test-alarm' para el mock de prueba)
     * @param medName  Nombre del medicamento para mostrar en la notificación
     * @param dose     Dosis como string
     */
    @ReactMethod
    fun triggerImmediateAlarm(eventId: String, medName: String, dose: String) {
        try {
            val serviceIntent = Intent(reactApplicationContext, AlarmService::class.java).apply {
                putExtra(AlarmModule.EXTRA_EVENT_ID, eventId)
                putExtra(AlarmModule.EXTRA_MED_NAME, medName)
                putExtra(AlarmModule.EXTRA_DOSE, dose)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(serviceIntent)
            } else {
                reactApplicationContext.startService(serviceIntent)
            }
            Log.d(TAG, "Immediate alarm triggered: $eventId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger immediate alarm", e)
        }
    }

    @ReactMethod
    fun getActiveAlarm(promise: Promise) {
        try {
            val prefs = reactApplicationContext
                .getSharedPreferences("alarm_prefs", Context.MODE_PRIVATE)

            val eventId = prefs.getString("active_event_id", null)

            if (eventId == null) {
                promise.resolve(null)
                return
            }

            val map = Arguments.createMap().apply {
                putString("eventId", eventId)
                putString("medName", prefs.getString("active_med_name", ""))
                putString("dose", prefs.getString("active_dose", ""))
            }

            promise.resolve(map)

        } catch (e: Exception) {
            promise.reject("GET_ACTIVE_ALARM_ERROR", e)
        }
    }

    // Requerido por el sistema de eventos de React Native
    @ReactMethod
    fun addListener(eventName: String) { /* No-op requerido por RN */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* No-op requerido por RN */ }
}
