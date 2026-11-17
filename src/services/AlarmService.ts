/**
 * AlarmService.ts — Wrapper TypeScript del módulo nativo AlarmModule.
 *
 * Este servicio reemplaza a NotificationService para el scheduling de alarmas.
 * En lugar de delegar a Notifee (que usa el notification audio stream y tiene
 * limitaciones en background), delega directamente al AlarmModule nativo de Kotlin
 * que usa AlarmManager.setExactAndAllowWhileIdle() con MediaPlayer + STREAM_ALARM.
 *
 * Flujo:
 * AlarmService.ts (JS) → AlarmModule.kt (Kotlin) → AlarmManager (Android OS)
 *   → AlarmReceiver.kt → AlarmService.kt → MediaPlayer + WakeLock + SharedPreferences
 *   → MainActivity → App.tsx (AlarmOverlay)
 */

import { NativeModules, Platform } from 'react-native';

const { AlarmModule } = NativeModules;

export class AlarmService {
  /**
   * Programa una alarma exacta que se disparará en el momento indicado.
   * Usa AlarmManager.RTC_WAKEUP + setExactAndAllowWhileIdle() para garantizar
   * que la alarma se dispare incluso en Doze Mode.
   *
   * @param eventId  ID del DoseEvent en SQLite (también sirve como ID único de la alarma)
   * @param medName  Nombre del medicamento (para la notificación del foreground service)
   * @param doseString  Dosis como string (ej: "1 tableta 500mg")
   * @param scheduledTime  Momento exacto de disparo
   * @returns eventId si se programó correctamente, string vacío si no se pudo programar
   */
  static async scheduleAlarm(
    eventId: string,
    medName: string,
    doseString: string,
    scheduledTime: Date
  ): Promise<string> {
    if (Platform.OS !== 'android') return eventId;

    const timestamp = scheduledTime.getTime();

    if (timestamp <= Date.now()) {
      console.warn(`[AlarmService] No se puede programar en el pasado: ${eventId}`);
      return '';
    }

    try {
      // timestamp se pasa como número (double en Kotlin)
      const result = await AlarmModule.scheduleAlarm(
        eventId,
        medName,
        doseString,
        timestamp
      );
      console.log(`[AlarmService] Alarma programada: ${eventId} a las ${scheduledTime.toISOString()}`);
      return result as string;
    } catch (error: any) {
      if (error?.code === 'PERMISSION_DENIED') {
        console.warn('[AlarmService] Permiso de alarmas exactas no concedido. Guiar al usuario a Ajustes.');
      } else {
        console.error('[AlarmService] Error al programar alarma:', error);
      }
      throw error;
    }
  }

  /**
   * Cancela una alarma programada antes de que se dispare.
   * Usa el mismo eventId.hashCode() como requestCode del PendingIntent.
   */
  static cancelAlarm(eventId: string): void {
    if (Platform.OS !== 'android' || !eventId) return;
    try {
      AlarmModule.cancelAlarm(eventId);
      console.log(`[AlarmService] Alarma cancelada: ${eventId}`);
    } catch (error) {
      console.error('[AlarmService] Error al cancelar alarma:', error);
    }
  }

  /**
   * Detiene una alarma que ya está sonando.
   * Envía un broadcast al AlarmService.kt para que detenga MediaPlayer,
   * libere el WakeLock, y se detenga a sí mismo.
   */
  static stopAlarm(eventId: string): void {
    if (Platform.OS !== 'android') return;
    try {
      AlarmModule.stopAlarm(eventId);
      console.log(`[AlarmService] Señal de parada enviada: ${eventId}`);
    } catch (error: unknown) {
      console.error('[AlarmService] Failed to stop alarm:', error);
    }
  }

  /**
   * Dispara el AlarmService nativo de forma inmediata, sin pasar por AlarmManager.
   * Inicia directamente el Foreground Service con MediaPlayer + WakeLock.
   * Usado por los botones de prueba en SettingsScreen.
   *
   * @param eventId  Usar 'immediate-test-alarm' para el evento mock de App.tsx
   * @param medName  Nombre del medicamento a mostrar
   * @param dose     Dosis como string
   */
  static triggerImmediateAlarm(
    eventId: string,
    medName: string,
    dose: string
  ): void {
    if (Platform.OS !== 'android') return;
    try {
      AlarmModule.triggerImmediateAlarm(eventId, medName, dose);
      console.log(`[AlarmService] Alarma inmediata disparada: ${eventId}`);
    } catch (error) {
      console.error('[AlarmService] Failed to trigger immediate alarm:', error);
    }
  }

  /**
   * Lee el ID de la alarma activa desde SharedPreferences nativos.
   * Retorna null si no hay ninguna alarma activa.
   * Se usa al montar la app para detectar si una alarma se disparó mientras
   * la app estaba cerrada o en background.
   */
  static async getActiveAlarmId(): Promise<string | null> {
    if (Platform.OS !== 'android') return null;
    try {
      return await AlarmModule.getActiveAlarmId() as string | null;
    } catch (error) {
      console.error('[AlarmService] Error al leer alarma activa:', error);
      return null;
    }
  }

  static async getActiveAlarm(): Promise<{ eventId: string; medName: string; dose: string } | null> {
    if (Platform.OS !== 'android') return null;
    try {
      const eventId = await AlarmModule.getActiveAlarmId();
      if (!eventId) return null;

      return { eventId, medName: '', dose: '' };
    } catch (error) {
      console.error('[AlarmService] Error al leer alarma activa:', error);
      return null;
    }
  }

  /**
   * Limpia el estado de alarma activa de SharedPreferences.
   */
  static clearActiveAlarm(): void {
    if (Platform.OS !== 'android') return;
    try {
      AlarmModule.clearActiveAlarm();
    } catch (error) {
      console.error('[AlarmService] Error al limpiar alarma activa:', error);
    }
  }

  /**
   * Exporta la base de datos local usando el framework nativo (SAF)
   */
  static async exportDatabase(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      if (!AlarmModule.exportDatabase) {
        throw new Error("El módulo nativo no está actualizado. Por favor compila la app de nuevo (Rebuild).");
      }
      await AlarmModule.exportDatabase();
      return true;
    } catch (e: any) {
      console.warn("Export error:", e.message);
      throw e;
    }
  }

  /**
   * Importa una base de datos local reemplazando la actual usando el framework nativo (SAF)
   */
  static async importDatabase(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      if (!AlarmModule.importDatabase) {
        throw new Error("El módulo nativo no está actualizado. Por favor compila la app de nuevo (Rebuild).");
      }
      await AlarmModule.importDatabase();
      return true;
    } catch (e: any) {
      console.warn("Import error:", e.message);
      throw e;
    }
  }

  /**
   * Verifica si la app puede programar alarmas exactas.
   * En Android 12+ requiere permiso explícito del usuario.
   */
  static async canScheduleExactAlarms(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      return await AlarmModule.canScheduleExactAlarms() as boolean;
    } catch {
      return false;
    }
  }

  /**
   * Abre los Ajustes de Android para que el usuario conceda el permiso
   * de alarmas exactas (SCHEDULE_EXACT_ALARM).
   */
  static openExactAlarmSettings(): void {
    if (Platform.OS !== 'android') return;
    AlarmModule.openExactAlarmSettings();
  }

  /**
   * Solicita al usuario que exima esta app de la optimización de batería.
   * Crítico para Xiaomi, Huawei, Samsung y OnePlus que matan procesos agresivamente.
   * Abre la pantalla del sistema para que el usuario quite la optimización de batería
   */
  static requestIgnoreBatteryOptimizations(): void {
    if (Platform.OS !== 'android') return;
    AlarmModule.requestIgnoreBatteryOptimizations();
  }

  /**
   * Consulta al SO si la app está exenta de la optimización de batería
   */
  static async isIgnoringBatteryOptimizations(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      return await AlarmModule.isIgnoringBatteryOptimizations();
    } catch (error) {
      console.warn('[AlarmService] Error checking battery optimizations', error);
      return true; // Por defecto asumimos true en simuladores o errores
    }
  }

  /**
   * Verifica si hay pendiente una reprogramación de alarmas (tras reinicio del dispositivo).
   * AlarmManager borra todas las alarmas al apagar el teléfono.
   * BootReceiver marca esta flag para que SchedulerService las reprograme.
   */
  static async needsReschedule(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const id = await AlarmModule.getActiveAlarmId(); // Reutiliza getSharedPreferences
      // La flag la leemos directamente comprobando la SharedPreference via un método dedicado
      // Por ahora retornamos false y lo manejamos en initializeStore
      return false;
    } catch {
      return false;
    }
  }
}
