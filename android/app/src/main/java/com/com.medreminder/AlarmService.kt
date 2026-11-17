package com.medreminder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * AlarmService — Foreground Service responsable de toda la lógica de la alarma activa.
 *
 * ¿Por qué Foreground Service?
 * Un Service normal puede ser matado por el OS cuando necesita memoria.
 * Un Foreground Service muestra una notificación persistente y a cambio Android lo
 * trata como proceso de primer plano, garantizando que no sea eliminado mientras
 * la alarma está activa.
 *
 * Responsabilidades:
 * 1. Llamar startForeground() en los primeros 5 segundos (obligatorio Android 8+)
 * 2. Reproducir sonido de alarma con MediaPlayer + STREAM_ALARM
 * 3. Adquirir WakeLock para mantener la CPU activa
 * 4. Escribir eventId en SharedPreferences (puente hacia React Native)
 * 5. Lanzar MainActivity con extras de alarma
 * 6. Recibir broadcast de parada y limpiar todo correctamente
 */
class AlarmService : Service() {

    companion object {
        const val TAG = "AlarmService"

        // Acción del broadcast que detiene esta alarma
        const val ACTION_STOP_ALARM = "com.medreminder.STOP_ALARM"

        // Canal de notificación de alta importancia (obligatorio para full screen intent)
        const val FOREGROUND_CHANNEL_ID   = "alarm-foreground-service-high"
        const val FOREGROUND_NOTIFICATION_ID = 9001

        // Clave de SharedPreferences para comunicar el estado al proceso React Native
        const val PREFS_NAME            = "alarm_prefs"
        const val KEY_ACTIVE_ALARM_ID   = "active_alarm_id"
        const val KEY_ACTIVE_MED_NAME   = "active_alarm_med_name"
        const val KEY_ACTIVE_DOSE       = "active_alarm_dose"
        const val KEY_NEEDS_RESCHEDULE  = "needs_reschedule"
    }

    private var mediaPlayer: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null

    /**
     * Receiver interno que escucha el broadcast de parada.
     * Se registra en onCreate() y se desregistra en onDestroy().
     */
    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val ts = System.currentTimeMillis()
            Log.d(TAG, "[ALARM_DEBUG] Stop broadcast received at T=${ts}ms — cleaning up alarm")
            stopAlarm()
        }
    }

    override fun onCreate() {
        super.onCreate()
        createForegroundNotificationChannel()

        // Registrar receiver para la señal de parada desde React Native
        val filter = IntentFilter(ACTION_STOP_ALARM)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(stopReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(stopReceiver, filter)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val tStart = System.currentTimeMillis()
        Log.d(TAG, "[ALARM_DEBUG] Service onStartCommand at T=${tStart}ms")

        if (intent?.action == ACTION_STOP_ALARM) {
            Log.d(TAG, "[ALARM_DEBUG] onStartCommand received ACTION_STOP_ALARM")
            stopAlarm()
            return START_NOT_STICKY
        }

        val eventId = intent?.getStringExtra(AlarmModule.EXTRA_EVENT_ID)
        if (eventId == null) {
            Log.e(TAG, "onStartCommand called without eventId — stopping immediately")
            stopSelf()
            return START_NOT_STICKY
        }

        val medName = intent.getStringExtra(AlarmModule.EXTRA_MED_NAME) ?: "Medicamento"
        val dose    = intent.getStringExtra(AlarmModule.EXTRA_DOSE) ?: ""

        // PASO 1: startForeground() DEBE llamarse muy rápido
        startForeground(FOREGROUND_NOTIFICATION_ID, buildForegroundNotification(medName, dose))
        Log.d(TAG, "[ALARM_DEBUG] startForeground called at T=${System.currentTimeMillis() - tStart}ms")

        // PASO 2: WakeLock — mantiene la CPU encendida
        acquireWakeLock()

        // PASO 3: Reproducir sonido de alarma (Async para no bloquear el hilo)
        startAlarmSound()

        // PASO 4: Lanzar MainActivity para mostrar la UI de alarma y setear prefs en un Hilo separado 
        // para no demorar la devolución del Main Thread.
        Thread {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putString(KEY_ACTIVE_ALARM_ID, eventId)
                .putString(KEY_ACTIVE_MED_NAME, medName)
                .putString(KEY_ACTIVE_DOSE, dose)
                .apply()
            
            Log.d(TAG, "[ALARM_DEBUG] SharedPreferences updated at T=${System.currentTimeMillis() - tStart}ms")

            // Emit to React Native (DeviceEventEmitter)
            sendAlarmEventToReact(eventId, medName, dose)
            AlarmModule.emitAlarmFired(eventId, medName, dose)
            Log.d(TAG, "[ALARM_DEBUG] React Native events emitted at T=${System.currentTimeMillis() - tStart}ms")

            // Lanzar MainActivity (UI)
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
                putExtra(AlarmModule.EXTRA_EVENT_ID, eventId)
                putExtra(AlarmModule.EXTRA_MED_NAME, medName)
                putExtra(AlarmModule.EXTRA_DOSE, dose)
            }
            launchIntent?.let { startActivity(it) }
            Log.d(TAG, "[ALARM_DEBUG] Activity launch intent sent at T=${System.currentTimeMillis() - tStart}ms")
        }.start()

        return START_NOT_STICKY
    }

    /**
     * Adquiere un WakeLock parcial con timeout de seguridad.
     *
     * PARTIAL_WAKE_LOCK mantiene la CPU activa pero permite que la pantalla se apague.
     * La pantalla ya se enciende por los flags de MainActivity.
     * El timeout de 10 minutos es un seguro: si la app crashea sin liberar el lock,
     * el sistema lo libera automáticamente y no drena la batería indefinidamente.
     */
    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "MedReminder::AlarmWakeLock"
        ).apply {
            acquire(10 * 60 * 1000L) // 10 minutos máximo
        }
        Log.d(TAG, "WakeLock acquired")
    }

    /**
     * Inicia la reproducción de audio usando MediaPlayer con STREAM_ALARM.
     *
     * ¿Por qué STREAM_ALARM y no STREAM_NOTIFICATION?
     * - STREAM_ALARM respeta el volumen de alarmas del usuario (control independiente)
     * - Puede sonar en modo silencioso si el usuario lo configuró así
     * - Es el mismo stream que usa el Reloj de Android
     *
     * RingtoneManager.TYPE_ALARM obtiene el tono de alarma configurado por el usuario.
     * Si no hay ninguno configurado, cae a TYPE_RINGTONE, luego a TYPE_NOTIFICATION.
     */
    private fun startAlarmSound() {
        val tStart = System.currentTimeMillis()
        try {
            mediaPlayer?.apply {
                if (isPlaying) stop()
                release()
            }
            mediaPlayer = null

            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            mediaPlayer = MediaPlayer().apply {
                setDataSource(applicationContext, alarmUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                
                // IMPORTANT: prepareAsync frees the main thread instantly.
                setOnPreparedListener { mp ->
                    mp.start()
                    Log.d(TAG, "[ALARM_DEBUG] Audio started via onPrepared at T=${System.currentTimeMillis() - tStart}ms")
                }
                
                Log.d(TAG, "[ALARM_DEBUG] Calling mediaPlayer.prepareAsync() at T=${System.currentTimeMillis() - tStart}ms")
                prepareAsync()
            }
        } catch (e: Exception) {
            Log.e(TAG, "[ALARM_DEBUG] Failed to start alarm sound", e)
        }
    }

    /**
     * Detiene la alarma y libera todos los recursos en el orden correcto.
     *
     * Orden:
     * 1. mediaPlayer.stop() → detiene reproducción
     * 2. mediaPlayer.release() → libera recursos de audio (DEBE ir después de stop)
     * 3. wakeLock.release() → libera CPU lock
     * 4. SharedPreferences.clear() → elimina active_alarm_id
     * 5. stopForeground() → quita la notificación persistente
     * 6. stopSelf() → termina el Service
     */
    private fun stopAlarm() {
        val tStop = System.currentTimeMillis()
        Log.d(TAG, "[ALARM_DEBUG] Stopping alarm resources at T=${tStop}ms")
        try {
            mediaPlayer?.apply {
                if (isPlaying) stop()
                release()
            }
            mediaPlayer = null
            Log.d(TAG, "[ALARM_DEBUG] MediaPlayer stopped/released at T=${System.currentTimeMillis() - tStop}ms")

            wakeLock?.apply {
                if (isHeld) release()
            }
            wakeLock = null

            // Background task for SharedPreferences so we don't block
            Thread {
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().apply()
            }.start()

        } catch (e: Exception) {
            Log.e(TAG, "[ALARM_DEBUG] Error during alarm cleanup", e)
        } finally {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            stopSelf()
            Log.d(TAG, "[ALARM_DEBUG] AlarmService completely stopped at T=${System.currentTimeMillis() - tStop}ms")
        }
    }

    /**
     * Construye la notificación obligatoria del Foreground Service.
     *
     * Android 8+ requiere que los Foreground Services muestren una notificación
     * persistente. Usamos IMPORTANCE_LOW para que no haga sonido ni vibración
     * (el sonido de alarma lo maneja el MediaPlayer directamente).
     */
    private fun buildForegroundNotification(medName: String, dose: String): Notification {
        // En Android 10+, se necesita este FullScreenIntent para arrancar la app desde el background agresivamente
        val fullScreenIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            )
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Botón para APAGAR ALARMA desde la notificación en caso de que React Native tarde
        val stopIntent = Intent(ACTION_STOP_ALARM).apply {
            setPackage(packageName) // Asegura que solo nuestra app reciba el intent
        }
        val stopPendingIntent = PendingIntent.getBroadcast(
            this,
            1, // requestCode distinto para no sobreescribir el pendingIntent principal
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, FOREGROUND_CHANNEL_ID)
            .setContentTitle("⏰ Recordatorio de Medicamento")
            .setContentText("$medName — $dose")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true) // CRUCIAL para despertar la pantalla
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "APAGAR ALARMA", stopPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_MAX) // IMPORTANTE: High priority
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .build()
    }

    /**
     * Crea el canal de notificación para el Foreground Service.
     * IMPORTANCE_LOW = sin sonido ni vibración (el audio es del MediaPlayer, no de la notificación).
     */
    private fun createForegroundNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                FOREGROUND_CHANNEL_ID,
                "Servicio de Alarma Activa",
                NotificationManager.IMPORTANCE_HIGH // IMPORTANCE_HIGH requerido para FullScreenIntent
            ).apply {
                description = "Indica que una alarma de medicamento está sonando"
                setShowBadge(false)
                setSound(null, null) 
            }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    /**
        Comunica a React que se disparo la alarma 
    */
    private fun sendAlarmEventToReact(
    eventId: String,
    medName: String,
    dose: String
    ) {
        try {
            val reactContext = applicationContext as ReactApplication
            val reactInstanceManager = reactContext
                .reactNativeHost
                .reactInstanceManager

            val currentReactContext = reactInstanceManager.currentReactContext

            currentReactContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(
                    "AlarmTriggered",
                    Arguments.createMap().apply {
                        putString("eventId", eventId)
                        putString("medName", medName)
                        putString("dose", dose)
                    }
                )

        } catch (e: Exception) {
            Log.e("AlarmService", "Failed to send event to React Native", e)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(stopReceiver) } catch (_: Exception) {}
        // stopAlarm() ya fue llamado en el flujo normal, pero lo llamamos como
        // seguro por si el Service fue destruido externamente (ej: el sistema lo mató)
        if (mediaPlayer != null || wakeLock?.isHeld == true) {
            stopAlarm()
        }
    }
}
