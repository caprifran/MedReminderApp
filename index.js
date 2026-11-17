import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import notifee from '@notifee/react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { initCrashHandler } from './src/utils/CrashLogger';

// Inicializar el manejador de caídas global
initCrashHandler();

// Set dayjs locale globally
dayjs.locale('es');
/**
 * Notifee background handler.
 *
 * Con la nueva arquitectura nativa, las alarmas son gestionadas completamente
 * por AlarmManager → AlarmReceiver → AlarmService (proceso nativo de Kotlin).
 *
 * Este handler ya NO necesita procesar acciones de alarma (taken/snooze/skip)
 * porque esas acciones se ejecutan desde el AlarmOverlay dentro de React Native,
 * que a su vez llama a AlarmModule.stopAlarm() y a los métodos del store.
 *
 * Mantenemos el handler vacío porque Notifee lo requiere para evitar warnings
 * si alguna notificación residual de versiones anteriores aún tiene acciones.
 */
notifee.onBackgroundEvent(async () => {
  // No-op: las alarmas ahora son completamente nativas.
  // Si en el futuro se agregan otras notificaciones (no alarmas), procesarlas aquí.
});

AppRegistry.registerComponent(appName, () => App);
