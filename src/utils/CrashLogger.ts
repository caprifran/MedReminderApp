import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share, Alert } from 'react-native';

const CRASH_LOG_KEY = '@medreminder_crashes';

/**
 * Inicializa el manejador global de errores en JS.
 * Captura crashes no manejados y los guarda localmente.
 */
export const initCrashHandler = () => {
  // @ts-ignore - ErrorUtils is injected by React Native global object
  const originalHandler = global.ErrorUtils?.getGlobalHandler?.();

  // @ts-ignore
  if (global.ErrorUtils?.setGlobalHandler) {
    // @ts-ignore
    global.ErrorUtils.setGlobalHandler(async (error: any, isFatal: boolean) => {
      try {
        const existingLogs = await AsyncStorage.getItem(CRASH_LOG_KEY);
        const logs = existingLogs ? JSON.parse(existingLogs) : [];
        
        const newLog = {
          timestamp: new Date().toISOString(),
          message: error.message || String(error),
          stack: error.stack || 'No stack trace available',
          isFatal
        };
        
        logs.unshift(newLog);
        
        // Mantener solo los últimos 20 errores para no saturar memoria
        const trimmedLogs = logs.slice(0, 20);
        
        await AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(trimmedLogs, null, 2));
      } catch (e) {
        console.error('Error al guardar crash log localmente', e);
      }

      // Llamar al manejador original de React Native para que la app se cierre o muestre el Redbox
      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  }
};

/**
 * Exporta los logs guardados usando la funcionalidad nativa de Compartir.
 */
export const exportCrashLogs = async () => {
  try {
    const logs = await AsyncStorage.getItem(CRASH_LOG_KEY);
    if (!logs || JSON.parse(logs).length === 0) {
      Alert.alert('Diagnóstico', 'No hay registros de caídas en el sistema.');
      return;
    }

    await Share.share({
      title: 'Crash Logs MedReminder',
      message: `MedReminder Error Logs:\n\n${logs}`,
    });
  } catch (error) {
    Alert.alert('Error', 'No se pudieron exportar los logs.');
  }
};

/**
 * Limpia los logs del sistema.
 */
export const clearCrashLogs = async () => {
  try {
    await AsyncStorage.removeItem(CRASH_LOG_KEY);
    Alert.alert('Limpieza', 'Logs de caídas eliminados correctamente.');
  } catch (error) {
    console.error('Error al limpiar logs', error);
  }
};
