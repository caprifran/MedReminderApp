import React, { useEffect } from 'react';
import { useColorScheme, StatusBar, AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { MD3LightTheme, MD3DarkTheme, PaperProvider } from 'react-native-paper';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer
} from '@react-navigation/native';
import notifee, { EventType } from '@notifee/react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useMedicationStore } from './src/store/useMedicationStore';
import { AlarmOverlay } from './src/screens/AlarmOverlay';
import { AlarmService } from './src/services/AlarmService';
import { DoseEventWithMedication } from './src/models';
import { BottomSheetDiagnosticScreen } from './src/screens/BottomSheetDiagnostic';

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 DIAGNÓSTICO: Cambiar a true para aislar y probar BottomSheet solo
// ═══════════════════════════════════════════════════════════════════════════
const DIAGNOSTIC_MODE = false;

// Custom React Native Paper themes based on Stitch Design System
export const customPaperLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#2196f3',       // Stitch Primary Blue
    secondary: '#4caf50',     // Stitch Success Green
    accent: '#ffc107',        // Stitch Warning Yellow
    background: '#fbf9f9',    // Stitch Light Surface/Background
    surface: '#ffffff',       // White surface container lowest
    onSurface: '#1b1c1c',     // Stitch Dark Text
    onSurfaceVariant: '#404752', // Stitch Muted Text
    outline: '#bfc7d4',       // Stitch Border (outline variant)
  },
};

export const customPaperDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#9ecaff',       // Stitch Dark Primary
    secondary: '#78dc77',     // Stitch Dark Success Green
    accent: '#fabd00',        // Stitch Dark Warning
    background: '#121212',    // Deep Charcoal Background
    surface: '#1e1e1e',       // Dark Card Surface
    onSurface: '#e3e1e6',     // Light Text
    onSurfaceVariant: '#bfc7d4', // Muted Text
    outline: 'rgba(255, 255, 255, 0.15)',
  },
};

// Custom React Navigation themes based on Stitch Design System
export const customNavLightTheme = {
  ...NavigationDefaultTheme,
  colors: {
    ...NavigationDefaultTheme.colors,
    primary: '#2196f3',
    background: '#fbf9f9',
    card: '#ffffff',
    text: '#1b1c1c',
    border: '#bfc7d4',
  },
};

export const customNavDarkTheme = {
  ...NavigationDarkTheme,
  colors: {
    ...NavigationDarkTheme.colors,
    primary: '#9ecaff',
    background: '#121212',
    card: '#1e1e1e',
    text: '#e3e1e6',
    border: 'rgba(255, 255, 255, 0.15)',
  },
};

export const mockDoseEvent: DoseEventWithMedication = {
  id: 'immediate-test-alarm',
  treatmentId: 'mock-treatment',
  scheduledAt: new Date().toISOString(),
  takenAt: undefined,
  status: 'PENDING',
  snoozedUntil: undefined,
  notificationId: 'immediate-test-alarm',
  createdAt: new Date().toISOString(),
  medication: {
    id: 'mock-med',
    name: 'Ibuprofeno',
    dose: '1 tableta',
    unit: '(600mg)',
    color: '#2196f3', // Stitch Primary Blue
    notes: 'Prueba de Alarma',
    createdAt: new Date().toISOString(),
  },
  treatment: {
    id: 'mock-treatment',
    medicationId: 'mock-med',
    frequencyType: 'daily',
    intervalHours: undefined,
    timesPerDay: 1,
    daysOfWeek: undefined,
    startDate: new Date().toISOString(),
    endDate: undefined,
    isIndefinite: true,
    active: true,
    createdAt: new Date().toISOString(),
  },
};

function App(): React.JSX.Element {
  const { themePreference, initializeStore, loadActiveAlarmEvent, setActiveAlarmEvent } = useMedicationStore();
  const isSystemDark = useColorScheme() === 'dark';
  const isDarkMode = themePreference === 'system' ? isSystemDark : themePreference === 'dark';

  useEffect(() => {
    initializeStore();

    /**
     * checkAlarmFromNative — Lee SharedPreferences nativos via AlarmModule.
     *
     * Esta es la forma correcta de detectar una alarma activa cuando:
     * - La app se abre desde cero (AlarmService la lanzó mientras estaba cerrada)
     * - La app vuelve al primer plano (AppState 'active') tras haber estado en background
     *
     * SharedPreferences (nativo) es más confiable que AsyncStorage (JS) porque:
     * - AlarmService.kt escribe en él directamente desde el proceso nativo
     * - Está disponible inmediatamente, sin esperar que el JS bridge esté listo
     */
    const checkAlarmFromNative = async () => {
      try {
        const activeId = await AlarmService.getActiveAlarmId();
        if (activeId) {
          console.log('[App] Active alarm found in SharedPreferences:', activeId);
          if (activeId === 'immediate-test-alarm' || activeId === 'test-notification-id') {
            setActiveAlarmEvent(mockDoseEvent);
          } else {
            await loadActiveAlarmEvent(activeId);
          }
        }
      } catch (error) {
        console.error('[App] Error checking alarm from SharedPreferences:', error);
      }
    };

    // Verificar inmediatamente en el mount (cubre lanzamiento desde alarma)
    checkAlarmFromNative();

    // Verificar cada vez que la app vuelve al primer plano
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkAlarmFromNative();
      }
    });

    /**
     * Listener de DeviceEventEmitter para AlarmFired.
     *
     * Cuando la app ya está en primer plano y AlarmService.kt lanza el evento,
     * este listener lo captura directamente sin necesidad de leer SharedPreferences.
     * Es el camino más rápido cuando el JS bridge ya está activo.
     */
    const alarmFiredSub = DeviceEventEmitter.addListener(
      'AlarmFired',
      async ({ eventId }: { eventId: string }) => {
        console.log('[App] AlarmFired event received via DeviceEventEmitter:', eventId);
        if (eventId === 'immediate-test-alarm' || eventId === 'test-notification-id') {
          setActiveAlarmEvent(mockDoseEvent);
        } else {
          await loadActiveAlarmEvent(eventId);
        }
      }
    );

    return () => {
      subscription.remove();
      alarmFiredSub.remove();
    };
  }, [initializeStore, loadActiveAlarmEvent, setActiveAlarmEvent]);



  const paperTheme = isDarkMode ? customPaperDarkTheme : customPaperLightTheme;
  const navTheme = isDarkMode ? customNavDarkTheme : customNavLightTheme;

  // ── MODO DIAGNÓSTICO ─────────────────────────────────────────────────────
  if (DIAGNOSTIC_MODE) {
    // La pantalla de prueba tiene sus propios GestureHandlerRootView y
    // BottomSheetModalProvider para probar completamente aislada.
    return <BottomSheetDiagnosticScreen />;
  }
  // ────────────────────────────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <BottomSheetModalProvider>
            <NavigationContainer theme={navTheme}>
              <StatusBar 
                barStyle={isDarkMode ? 'light-content' : 'dark-content'} 
                backgroundColor={navTheme.colors.card}
              />
              <AppNavigator />
            </NavigationContainer>
            <AlarmOverlay />
          </BottomSheetModalProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
