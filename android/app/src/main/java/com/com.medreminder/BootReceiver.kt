package com.medreminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * BootReceiver — BroadcastReceiver que se activa cuando el dispositivo reinicia.
 *
 * Implementación de FASE 1: HARDENING
 * Ahora lee DIRECTAMENTE la base de datos SQLite de React Native en Kotlin
 * y reprograma las alarmas exactas, sin necesidad de arrancar el motor JS.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "BootReceiver"
        const val DB_NAME = "medreminder.db"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON" ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == "com.medreminder.TEST_BOOT"
        ) {
            Log.d(TAG, "Device rebooted — starting native SQLite restore")
            logToFile(context, "Device rebooted — starting native SQLite restore")

            // Realizamos la lectura IO en un hilo separado
            Thread {
                restoreAlarmsFromSQLite(context)
            }.start()
        }
    }

    private fun logToFile(context: Context, message: String) {
        try {
            val file = File(context.getExternalFilesDir(null), "boot_debug.txt")
            file.appendText("${Date()}: $message\n")
        } catch (e: Exception) {}
    }

    private fun restoreAlarmsFromSQLite(context: Context) {
        val dbFile = context.getDatabasePath(DB_NAME)
        if (!dbFile.exists()) {
            Log.e(TAG, "Database file not found at ${dbFile.absolutePath}")
            return
        }

        var db: SQLiteDatabase? = null
        try {
            db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
            
            // Queremos: DoseEvent.id, DoseEvent.scheduledAt, Medication.name, Medication.dose
            // Donde el evento esté PENDING.
            val query = """
                SELECT 
                    e.id AS eventId, 
                    e.scheduledAt, 
                    m.name AS medName, 
                    m.dose AS medDose
                FROM DoseEvent e
                INNER JOIN Treatment t ON e.treatmentId = t.id
                INNER JOIN Medication m ON t.medicationId = m.id
                WHERE e.status = 'PENDING'
            """.trimIndent()

            val cursor = db.rawQuery(query, null)
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            // SDF para parsear ISO strings: "2026-05-22T08:00:00.000Z"
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val sdfFallback = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }

            val now = System.currentTimeMillis()
            var restoredCount = 0

            while (cursor.moveToNext()) {
                val eventId = cursor.getString(0)
                val scheduledAtStr = cursor.getString(1)
                val medName = cursor.getString(2)
                val medDose = cursor.getString(3)

                var triggerMs: Long = 0
                try {
                    val date = sdf.parse(scheduledAtStr)
                    if (date != null) triggerMs = date.time
                } catch (e: Exception) {
                    try {
                        val date = sdfFallback.parse(scheduledAtStr)
                        if (date != null) triggerMs = date.time
                    } catch (e2: Exception) {
                        Log.e(TAG, "Error parsing date: $scheduledAtStr", e2)
                    }
                }

                // Reprogramamos si es en el futuro, o en el pasado reciente (hasta 2 horas)
                // para que la alarma suene tarde antes que perderse por completo.
                val twoHoursAgo = now - (2 * 60 * 60 * 1000L)

                if (triggerMs > twoHoursAgo) {
                    val alarmIntent = Intent(context, AlarmReceiver::class.java).apply {
                        this.action = "com.medreminder.ALARM_TRIGGER"
                        putExtra(AlarmModule.EXTRA_EVENT_ID, eventId)
                        putExtra(AlarmModule.EXTRA_MED_NAME, medName)
                        putExtra(AlarmModule.EXTRA_DOSE, medDose)
                    }

                    val pendingIntent = PendingIntent.getBroadcast(
                        context,
                        eventId.hashCode(),
                        alarmIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )

                    val canSchedule = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        alarmManager.canScheduleExactAlarms()
                    } else {
                        true
                    }

                    if (canSchedule) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, pendingIntent)
                        restoredCount++
                    } else {
                        Log.w(TAG, "Cannot schedule exact alarm for $eventId: Permission denied")
                    }
                }
            }
            cursor.close()
            Log.d(TAG, "Successfully restored $restoredCount pending alarms from SQLite natively")
            logToFile(context, "Successfully restored $restoredCount pending alarms")

        } catch (e: Exception) {
            Log.e(TAG, "Error reading SQLite database in BootReceiver", e)
            logToFile(context, "ERROR: ${e.message}")
        } finally {
            db?.close()
        }
    }
}
