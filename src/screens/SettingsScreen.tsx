import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView, NativeModules, Platform, ToastAndroid, BackHandler } from 'react-native';
import { Text, Card, List, Button, Divider, useTheme, Switch, Avatar, SegmentedButtons } from 'react-native-paper';
import { useMedicationStore } from '../store/useMedicationStore';
import { AlarmService } from '../services/AlarmService';
import { getDBConnection, initDatabase } from '../database/sqlite';
import { SchedulerService } from '../scheduler/SchedulerService';
import { FullScreenLoader } from '../components/animations/FullScreenLoader';
import { exportCrashLogs, clearCrashLogs } from '../utils/CrashLogger';

const { PermissionModule } = NativeModules;

export const SettingsScreen = () => {
  const theme = useTheme();
  const { initializeStore, themePreference, setThemePreference } = useMedicationStore();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [canFullScreen, setCanFullScreen] = useState(true);
  const [canDrawOverlays, setCanDrawOverlays] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionModule.canUseFullScreenIntent().then((res: boolean) => setCanFullScreen(res));
      PermissionModule.canDrawOverlays().then((res: boolean) => setCanDrawOverlays(res));
    }
  }, []);

  // Removed unused handleImmediateNotification
  const handleImmediateAlarm = async () => {
    if (Platform.OS === 'android') {
      const fullScreenOk = await PermissionModule.canUseFullScreenIntent();
      setCanFullScreen(fullScreenOk);

      if (!fullScreenOk) {
        Alert.alert(
          'Permisos Necesarios',
          'Para mostrar la alarma en pantalla completa, debes habilitar el permiso de alarmas a pantalla completa (Android 14+)\n\n¿Quieres ir a los ajustes a configurarlo?',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Ir a Ajustes',
              onPress: () => PermissionModule.openFullScreenIntentSettings(),
            },
          ]
        );
        return;
      }
    }
    try {
      // TEST DATA
      const eventId = 'immediate-test-alarm';
      const medName = 'Ibuprofeno';
      const dose = '600mg';

      AlarmService.triggerImmediateAlarm(
        eventId,
        medName,
        dose
      );

      console.log('[TEST] Immediate alarm triggered');
    } catch (error) {
      console.error('[TEST] Failed to trigger immediate alarm:', error);

      Alert.alert(
        'Error',
        'No se pudo disparar la alarma inmediata.'
      );
    }
  };
  /* */

  const handleTestNotification = async () => {
    try {
      const testTime = new Date(Date.now() + 5000); // 5 seconds from now
      await AlarmService.scheduleAlarm(
        'test-notification-id',
        'Prueba de Medicamento',
        '1 Dosis (Prueba de Alarma)',
        testTime
      );
      Alert.alert(
        'Recordatorio Programado',
        'Se ha programado una notificación de prueba. Sonará en 5 segundos. Puedes cerrar la app o bloquear el teléfono.'
      );
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo programar la notificación de prueba.');
    }
  };

  const handleRescheduleAlarms = async () => {
    const db = await getDBConnection();
    try {
      await SchedulerService.rescheduleAllUpcomingNotifications(db);
      Alert.alert('Éxito', 'Se han recalculado y reprogramado todas las notificaciones pendientes.');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudieron reprogramar las notificaciones.');
    } finally {
      await db.close();
    }
  };

  const handleResetDatabase = () => {
    Alert.alert(
      '¿Restablecer Base de Datos?',
      'Esta acción borrará todos tus medicamentos, tratamientos e historial. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmación Requerida',
              '¿Realmente deseas borrar todos tus datos médicos de la aplicación?',
              [
                { text: 'No', style: 'cancel' },
                {
                  text: 'Borrar Todo',
                  style: 'destructive',
                  onPress: async () => {
                    setIsResetting(true);
                    try {
                      const db = await getDBConnection();
                      // Cancel all alarms currently scheduled
                      try {
                        const [events] = await db.executeSql('SELECT id, notificationId FROM DoseEvent WHERE status = "PENDING"');
                        for (let i = 0; i < events.rows.length; i++) {
                          const event = events.rows.item(i);
                          if (event.notificationId) {
                            AlarmService.cancelAlarm(event.notificationId);
                          } else {
                            AlarmService.cancelAlarm(event.id);
                          }
                        }
                      } catch (e) {
                        console.log('No pending events to cancel or error reading them', e);
                      }
                      
                      // Drop Tables
                      await db.executeSql('DROP TABLE IF EXISTS DoseEvent;');
                      await db.executeSql('DROP TABLE IF EXISTS TreatmentSchedule;');
                      await db.executeSql('DROP TABLE IF EXISTS Treatment;');
                      await db.executeSql('DROP TABLE IF EXISTS Medication;');
                      
                      console.log('[Settings] Database wiped.');
                      
                      // Re-initialize tables
                      await db.close();
                      await initializeStore();
                      
                      ToastAndroid.show('La base de datos ha sido restablecida por completo', ToastAndroid.LONG);
                    } catch (error) {
                      console.error(error);
                      Alert.alert('Error', 'No se pudo restablecer la base de datos.');
                    } finally {
                      setIsResetting(false);
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const handleBackup = async () => {
    try {
      const result = await AlarmService.exportDatabase();
      if (result) {
        ToastAndroid.show('Copia de seguridad guardada con éxito', ToastAndroid.LONG);
      }
    } catch (e: any) {
      if (e.message && e.message.includes('CANCELLED')) return;
      Alert.alert('Error de Backup', e.message || 'Error desconocido.');
    }
  };

  const handleRestore = () => {
    Alert.alert(
      'Restaurar Copia de Seguridad',
      'Esto sobrescribirá TODOS tus datos actuales. La aplicación se cerrará automáticamente al finalizar para aplicar los cambios de forma segura.\n\n¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true);
            try {
              // 1. Cerrar conexión a la DB actual
              const db = await getDBConnection();
              await db.close();
              
              // 2. Invocar selector de archivo nativo y sobreescribir DB
              const success = await AlarmService.importDatabase();
              
              if (success) {
                ToastAndroid.show('Copia restaurada. Por favor, vuelve a abrir la app.', ToastAndroid.LONG);
                setTimeout(() => BackHandler.exitApp(), 1500);
              } else {
                setIsResetting(false);
              }
            } catch (error: any) {
              console.error(error);
              setIsResetting(false);
              if (error.message && error.message.includes('CANCELLED')) return;
              Alert.alert('Error de Restauración', error.message || 'Error desconocido.');
            }
          }
        }
      ]
    );
  };

  const handleRequestPermission = async () => {
    try {
      const notifee = require('@notifee/react-native').default;
      await notifee.requestPermission();
      Alert.alert('Permisos', 'Se ha solicitado verificar y activar los permisos de notificaciones.');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>Configuración</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Preferencias de usuario, alarmas y herramientas de datos locales.
        </Text>
      </View>

      {/* General Settings Card */}
      <Card style={styles.settingsCard} mode="outlined">
        <Card.Content style={{ paddingHorizontal: 0 }}>
          <List.Section>
            <List.Subheader>Preferencias Generales</List.Subheader>
            <List.Item
              title="Recordatorios Activos"
              description="Habilita las notificaciones en el sistema"
              left={(props) => <List.Icon {...props} icon="bell-outline" />}
              right={() => (
                <Switch
                  value={notificationsEnabled}
                  onValueChange={(val) => setNotificationsEnabled(val)}
                />
              )}
            />
            <Divider />
            <List.Item
              title="Sonido de Alarma"
              description="Reproducir sonido de alerta en recordatorios"
              left={(props) => <List.Icon {...props} icon="volume-high" />}
              right={() => (
                <Switch
                  value={soundEnabled}
                  onValueChange={(val) => setSoundEnabled(val)}
                />
              )}
            />
            <Divider />
            <List.Item
              title="Tema de la App"
              description="Selecciona cómo se visualiza la interfaz"
              left={(props) => <List.Icon {...props} icon="theme-light-dark" />}
            />
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <SegmentedButtons
                value={themePreference}
                onValueChange={(val) => setThemePreference(val as 'system' | 'light' | 'dark')}
                buttons={[
                  {
                    value: 'system',
                    label: 'Sistema',
                    icon: 'phone-android',
                  },
                  {
                    value: 'light',
                    label: 'Claro',
                    icon: 'weather-sunny',
                  },
                  {
                    value: 'dark',
                    label: 'Oscuro',
                    icon: 'weather-night',
                  },
                ]}
              />
            </View>
          </List.Section>
        </Card.Content>
      </Card>

      {/* Alarm Tools Card */}
      <Card style={styles.settingsCard} mode="outlined">
        <Card.Content style={{ paddingHorizontal: 0 }}>
          <List.Section>
            <List.Subheader>Mantenimiento & Alarmas</List.Subheader>
            <List.Item
              title="Solicitar Permisos de Notificaciones"
              description="Verificar permisos nativos en Android"
              left={(props) => <List.Icon {...props} icon="shield-check-outline" />}
              onPress={handleRequestPermission}
            />
            {Platform.OS === 'android' && (
              <>
                <Divider />
                <List.Item
                  title="Alarma sobre Pantalla Bloqueada"
                  description={canFullScreen ? "Permiso concedido (Pantalla Completa)" : "Habilitar la alarma con pantalla bloqueada"}
                  left={(props) => <List.Icon {...props} icon="cellphone-lock" color={canFullScreen ? theme.colors.primary : '#FF9800'} />}
                  right={() => <Text style={[styles.rightValueText, { color: canFullScreen ? '#4CAF50' : '#FF9800' }]}>{canFullScreen ? "Permitido" : "Configurar"}</Text>}
                  onPress={async () => {
                    if (canFullScreen) {
                      Alert.alert('Permiso Activo', 'El permiso de pantalla completa ya está concedido.');
                    } else {
                      PermissionModule.openFullScreenIntentSettings();
                      setTimeout(async () => {
                        const res = await PermissionModule.canUseFullScreenIntent();
                        setCanFullScreen(res);
                      }, 2000);
                    }
                  }}
                />
              </>
            )}
            <Divider />
            <List.Item
              title="Disparar Alarma Inmediata"
              description="Activa y muestra un recordatorio en este instante"
              left={(props) => <List.Icon {...props} icon="alarm-bell" />}
              onPress={handleImmediateAlarm}
            />
            <Divider />
            <List.Item
              title="Probar Alarma (5 Segundos)"
              description="Programa una alarma de prueba rápida"
              left={(props) => <List.Icon {...props} icon="clock-fast" />}
              onPress={handleTestNotification}
            />
            <Divider />
            <List.Item
              title="Reprogramar Alertas"
              description="Sincronizar y recalcular alarmas desde SQLite"
              left={(props) => <List.Icon {...props} icon="alarm-multiple" />}
              onPress={handleRescheduleAlarms}
            />
            <Divider />
            <List.Item
              title="Exportar Crash Logs"
              description="Compartir registros de errores técnicos"
              left={(props) => <List.Icon {...props} icon="bug-outline" />}
              onPress={exportCrashLogs}
            />
            <Divider />
            <List.Item
              title="Limpiar Crash Logs"
              description="Borrar registros de errores técnicos locales"
              left={(props) => <List.Icon {...props} icon="trash-can-outline" />}
              onPress={clearCrashLogs}
            />
          </List.Section>
        </Card.Content>
      </Card>

      {/* Dangerous Operations Card */}
      <Card style={styles.settingsCard} mode="outlined">
        <Card.Content style={{ paddingHorizontal: 0 }}>
          <List.Section>
            <List.Subheader style={{ color: '#2196F3' }}>Copias de Seguridad</List.Subheader>
            <List.Item
              title="Crear Copia de Seguridad"
              description="Guardar un respaldo de tus medicamentos"
              left={(props) => <List.Icon {...props} icon="cloud-upload-outline" color="#2196F3" />}
              onPress={handleBackup}
            />
            <Divider />
            <List.Item
              title="Restaurar Copia"
              description="Recuperar datos desde un respaldo anterior"
              left={(props) => <List.Icon {...props} icon="cloud-download-outline" color="#2196F3" />}
              onPress={handleRestore}
            />
            
            <List.Subheader style={{ color: '#F44336', marginTop: 8 }}>Datos & Seguridad</List.Subheader>
            <List.Item
              title="Restablecer Base de Datos"
              titleStyle={{ color: '#F44336' }}
              description="Eliminar permanentemente todos los datos de la app"
              left={(props) => <List.Icon {...props} icon="database-alert" color="#F44336" />}
              onPress={handleResetDatabase}
            />
          </List.Section>
        </Card.Content>
      </Card>

      {/* About Section */}
      <View style={styles.aboutContainer}>
        <Avatar.Icon size={48} icon="medical-bag" style={{ backgroundColor: theme.colors.surfaceVariant }} />
        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginTop: 12 }}>
          MedReminder App
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Versión 0.1.0 - Beta cerrada • Local-Only Architecture
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8, paddingHorizontal: 16 }}>
          Tu información de salud se guarda de forma segura únicamente en este dispositivo.
        </Text>
      </View>
      <View style={{ height: 40 }} />
      <FullScreenLoader visible={isResetting} message="Restableciendo base de datos..." />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontWeight: 'bold',
  },
  settingsCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  rightValueText: {
    alignSelf: 'center',
    marginRight: 16,
    opacity: 0.6,
  },
  aboutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
});
