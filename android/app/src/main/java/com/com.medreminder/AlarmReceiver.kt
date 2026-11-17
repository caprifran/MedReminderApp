package com.medreminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log

/**
 * AlarmReceiver — BroadcastReceiver que recibe el trigger del AlarmManager.
 *
 * ¿Por qué necesitamos un BroadcastReceiver?
 * AlarmManager solo puede enviar un broadcast, no iniciar un Service directamente.
 * Este receiver recibe ese broadcast (incluso con la app cerrada) y arranca el
 * AlarmService como Foreground Service.
 *
 * Regla de los 10 segundos: onReceive() debe completarse en < 10s.
 * Por eso solo iniciamos el Service y no hacemos trabajo pesado aquí.
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "AlarmReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val tStart = System.currentTimeMillis()
        Log.d(TAG, "[ALARM_DEBUG] Alarm broadcast received at T=${tStart}ms: ${intent.action}")

        val eventId = intent.getStringExtra(AlarmModule.EXTRA_EVENT_ID)
        if (eventId == null) {
            Log.e(TAG, "Received alarm without eventId — ignoring")
            return
        }

        val medName = intent.getStringExtra(AlarmModule.EXTRA_MED_NAME) ?: "Medicamento"
        val dose    = intent.getStringExtra(AlarmModule.EXTRA_DOSE) ?: ""

        Log.d(TAG, "[ALARM_DEBUG] Starting AlarmService for event: $eventId at T=${System.currentTimeMillis() - tStart}ms")

        // Construimos el Intent para iniciar el AlarmService con los datos de la alarma
        val serviceIntent = Intent(context, AlarmService::class.java).apply {
            putExtra(AlarmModule.EXTRA_EVENT_ID, eventId)
            putExtra(AlarmModule.EXTRA_MED_NAME, medName)
            putExtra(AlarmModule.EXTRA_DOSE, dose)
        }

        // WAKELOCK HAND-OFF:
        // Android puede dormir el procesador aquí mismo si la pantalla está apagada.
        // Adquirimos un WakeLock temporal de 10 segundos para garantizar que el
        // AlarmService tenga tiempo de iniciar y adquirir su propio WakeLock.
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MedReminder::ReceiverWakeLock")
        wakeLock.acquire(10000) // 10s timeout por seguridad
        Log.d(TAG, "[ALARM_DEBUG] Temporary WakeLock acquired in Receiver")

        // En Android 8+ (API 26+) debemos usar startForegroundService() para que
        // el Service pueda llamar startForeground() dentro de los primeros 5 segundos.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
