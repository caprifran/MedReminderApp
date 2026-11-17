import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Modal, Animated, Easing, TouchableOpacity, ToastAndroid } from 'react-native';
import { Text, Avatar, useTheme } from 'react-native-paper';
import { useMedicationStore } from '../store/useMedicationStore';
import { AlarmService } from '../services/AlarmService';
import { NumberWheel } from '../components/ExpandableDoseCard';
import dayjs from 'dayjs';

export const AlarmOverlay = () => {
  const theme = useTheme();
  const isDarkMode = theme.dark;
  const { activeAlarmEvent, setActiveAlarmEvent, markDoseTaken, markDoseSkipped, snoozeDose } = useMedicationStore();

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Snooze state
  const [snoozeHours, setSnoozeHours] = useState(0);
  const [snoozeMinutes, setSnoozeMinutes] = useState(15);
  const [isMuted, setIsMuted] = useState(false);

  const SNOOZE_PRESETS = [
    { label: '15 min', minutes: 15 },
    { label: '30 min', minutes: 30 },
    { label: '1 hora', minutes: 60 },
    { label: '2 horas', minutes: 120 },
  ];

  const applyPreset = useCallback((minutes: number) => {
    setSnoozeHours(Math.floor(minutes / 60));
    setSnoozeMinutes(minutes % 60);
  }, []);

  const handleInteraction = useCallback(() => {
    if (!isMuted && activeAlarmEvent) {
      AlarmService.stopAlarm(activeAlarmEvent.id);
      setIsMuted(true);
    }
  }, [isMuted, activeAlarmEvent]);

  useEffect(() => {
    // NOTE: El sonido de alarma es gestionado completamente por AlarmService.kt
    // (Foreground Service con MediaPlayer + STREAM_ALARM). React Native NO necesita
    // iniciar ni detener el audio — solo enviar la señal de parada cuando el usuario
    // interactúa. El audio se detiene en el lado nativo al recibir el broadcast STOP_ALARM.

    if (activeAlarmEvent) {
      // Loop pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
            easing: Easing.bezier(0.4, 0, 0.6, 1),
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
            easing: Easing.bezier(0.4, 0, 0.6, 1),
          }),
        ])
      ).start();

      // Loop shake animation for alert icon
      Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 2, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -2, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 2, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
          Animated.delay(1500),
        ])
      ).start();
    }
  }, [activeAlarmEvent, pulseAnim, shakeAnim]);

  if (!activeAlarmEvent) return null;

  const handleTaken = async () => {
    // Detiene el MediaPlayer y libera WakeLock en el proceso nativo
    AlarmService.stopAlarm(activeAlarmEvent.id);
    // Limpia SharedPreferences para que al reabrir la app no vuelva a mostrar el overlay
    AlarmService.clearActiveAlarm();
    // Actualiza DB y refresca listas (markDoseTaken ya cancela la alarma internamente)
    await markDoseTaken(activeAlarmEvent.id);
    ToastAndroid.show('Dosis tomada', ToastAndroid.SHORT);
    setActiveAlarmEvent(null);
  };

  const handleSnooze = async () => {
    const totalMinutes = (snoozeHours * 60) + snoozeMinutes;
    if (totalMinutes === 0) return;
    // Base: now (la alarma está sonando en este momento)
    const snoozeUntil = dayjs().add(totalMinutes, 'minute').toDate();
    AlarmService.stopAlarm(activeAlarmEvent.id);
    AlarmService.clearActiveAlarm();
    await snoozeDose(activeAlarmEvent.id, snoozeUntil);
    ToastAndroid.show('Alarma pospuesta', ToastAndroid.SHORT);
    setActiveAlarmEvent(null);
  };

  const handleSkip = async () => {
    AlarmService.stopAlarm(activeAlarmEvent.id);
    AlarmService.clearActiveAlarm();
    await markDoseSkipped(activeAlarmEvent.id);
    ToastAndroid.show('Dosis omitida', ToastAndroid.SHORT);
    setActiveAlarmEvent(null);
  };

  const scheduledTime = dayjs(activeAlarmEvent.scheduledAt);
  const medColor = activeAlarmEvent.medication.color || theme.colors.primary;

  return (
    <Modal
      visible={activeAlarmEvent !== null}
      transparent={true}
      animationType="fade"
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.6)' }]}>
        <View style={[styles.card, { backgroundColor: isDarkMode ? '#1e1e1e' : '#ffffff' }]}>
          
          {/* Animated Pulsing Bell Header */}
          <View style={styles.pulseContainer}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }], backgroundColor: isDarkMode ? 'rgba(33, 150, 243, 0.1)' : 'rgba(33, 150, 243, 0.15)' }]} />
            <Animated.View style={[styles.iconContainer, { backgroundColor: isDarkMode ? '#1b2d4a' : '#e3f2fd', transform: [{ translateX: shakeAnim }] }]}>
              <Avatar.Icon
                size={72}
                icon="bell-ring"
                color={theme.colors.primary}
                style={{ backgroundColor: 'transparent' }}
              />
            </Animated.View>
          </View>

          {/* Announcement Headers */}
          <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
            ¡Es hora de tu medicación!
          </Text>
          <Text variant="bodyLarge" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            Revisa los detalles abajo
          </Text>

          {/* Medication Specifics Panel */}
          <View style={[styles.detailsPanel, { 
            backgroundColor: isDarkMode ? '#282828' : '#f5f3f3',
            borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
          }]}>
            <View style={styles.medRow}>
              <Avatar.Icon
                size={56}
                icon="pill"
                color="#ffffff"
                style={{ backgroundColor: medColor }}
              />
              <View style={styles.medTextContainer}>
                <Text variant="headlineSmall" style={styles.medName}>
                  {activeAlarmEvent.medication.name}
                </Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
                  {activeAlarmEvent.medication.dose} {activeAlarmEvent.medication.unit}
                </Text>
              </View>
            </View>

            {/* Chips Container */}
            <View style={styles.chipsContainer}>
              {activeAlarmEvent.medication.notes ? (
                <View style={[styles.chip, { backgroundColor: isDarkMode ? '#4a3200' : '#ffdf9e' }]}>
                  <Avatar.Icon 
                    size={16} 
                    icon="food-apple" 
                    color={isDarkMode ? '#ffb834' : '#785900'} 
                    style={{ backgroundColor: 'transparent', marginRight: 4 }} 
                  />
                  <Text variant="labelMedium" style={{ color: isDarkMode ? '#ffb834' : '#261a00', fontWeight: 'bold' }}>
                    {activeAlarmEvent.medication.notes}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.chip, { backgroundColor: isDarkMode ? '#003366' : '#d1e4ff' }]}>
                <Avatar.Icon 
                  size={16} 
                  icon="clock-outline" 
                  color={isDarkMode ? '#9ecaff' : '#0061a4'} 
                  style={{ backgroundColor: 'transparent', marginRight: 4 }} 
                />
                <Text variant="labelMedium" style={{ color: isDarkMode ? '#9ecaff' : '#001d36', fontWeight: 'bold' }}>
                  {scheduledTime.format('HH:mm')}
                </Text>
              </View>
            </View>
          </View>

          {/* Action Button Cluster */}
          <View style={styles.buttonCluster}>
            
            {/* Primary: Take Now */}
            <TouchableOpacity 
              activeOpacity={0.9} 
              onPress={handleTaken} 
              style={[styles.btnPrimary, { backgroundColor: '#4caf50' }]}
            >
              <Avatar.Icon size={28} icon="check-circle" color="#ffffff" style={{ backgroundColor: 'transparent' }} />
              <Text style={styles.btnPrimaryText}>Tomar Ahora</Text>
            </TouchableOpacity>

            {/* Secondary: Custom Snooze */}
            <View 
              onTouchStart={handleInteraction}
              style={[styles.snoozeSection, { backgroundColor: isDarkMode ? '#2d2d2d' : '#f5f3f3', width: '100%' }]}
            >
              <Text variant="titleSmall" style={{ fontWeight: 'bold', marginBottom: 10, textAlign: 'center', color: theme.colors.onSurface }}>Posponer Alarma</Text>

              {/* Quick presets */}
              <View style={styles.presetsRow}>
                {SNOOZE_PRESETS.map((preset) => {
                  const totalSnoozeMinutes = snoozeHours * 60 + snoozeMinutes;
                  const isSelected = totalSnoozeMinutes === preset.minutes;
                  return (
                    <TouchableOpacity
                      key={preset.minutes}
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : (isDarkMode ? '#3a3a3a' : '#ffffff'),
                          borderColor: isSelected ? theme.colors.primary : (isDarkMode ? '#555' : '#ddd'),
                        },
                      ]}
                      onPress={() => applyPreset(preset.minutes)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: isSelected ? '#fff' : theme.colors.onSurface }}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.pickersRow}>
                <NumberWheel max={23} value={snoozeHours} onChange={setSnoozeHours} label="Horas" />
                <NumberWheel max={59} value={snoozeMinutes} onChange={setSnoozeMinutes} label="Minutos" />
              </View>

              {/* Resulting time preview */}
              {(() => {
                const total = snoozeHours * 60 + snoozeMinutes;
                const resultTime = dayjs().add(total, 'minute');
                return (
                  <View style={[styles.resultPreview, { backgroundColor: isDarkMode ? '#1a1a1a' : '#fff' }]}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Sonará a las</Text>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                      {resultTime.format('HH:mm')}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      ({snoozeHours > 0 ? `${snoozeHours}h ` : ''}{snoozeMinutes}m desde ahora)
                    </Text>
                  </View>
                );
              })()}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleSnooze}
                disabled={snoozeHours === 0 && snoozeMinutes === 0}
                style={[styles.btnSecondary, { backgroundColor: isDarkMode ? '#3b2f15' : '#ffdf9e', opacity: (snoozeHours === 0 && snoozeMinutes === 0) ? 0.5 : 1 }]}
              >
                <Avatar.Icon size={24} icon="clock-fast" color={isDarkMode ? '#fabd00' : '#785900'} style={{ backgroundColor: 'transparent' }} />
                <Text style={[styles.btnSecondaryText, { color: isDarkMode ? '#fabd00' : '#261a00' }]}>
                  Posponer hasta las {dayjs().add(snoozeHours * 60 + snoozeMinutes, 'minute').format('HH:mm')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tertiary: Skip */}
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={handleSkip} 
              style={[styles.btnTertiary, { backgroundColor: isDarkMode ? '#2d2d2d' : '#efeded' }]}
            >
              <Avatar.Icon size={24} icon="close-circle-outline" color="#ba1a1a" style={{ backgroundColor: 'transparent' }} />
              <Text style={styles.btnTertiaryText}>Omitir toma</Text>
            </TouchableOpacity>

          </View>

          {/* Footer Active Alert Notification Indicator */}
          <View style={styles.footer}>
            <Avatar.Icon
              size={18}
              icon="volume-high"
              color={theme.colors.onSurfaceVariant}
              style={{ backgroundColor: 'transparent', opacity: 0.6 }}
            />
            <Text variant="labelMedium" style={[styles.footerText, { color: theme.colors.onSurfaceVariant }]}>
              Sonido de alerta activo
            </Text>
          </View>

        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.58,
    shadowRadius: 16.00,
  },
  pulseContainer: {
    position: 'relative',
    height: 120,
    width: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  pulseRing: {
    position: 'absolute',
    height: 110,
    width: 110,
    borderRadius: 55,
  },
  iconContainer: {
    height: 80,
    width: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 24,
    textAlign: 'center',
  },
  detailsPanel: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  medTextContainer: {
    marginLeft: 16,
    flex: 1,
  },
  medName: {
    fontWeight: 'bold',
  },
  chipsContainer: {
    flexDirection: 'row',
    marginTop: 16,
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
  },
  buttonCluster: {
    width: '100%',
    gap: 12,
  },
  btnPrimary: {
    width: '100%',
    height: 72,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#4caf50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  btnSecondary: {
    width: '100%',
    height: 60,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  btnTertiary: {
    width: '100%',
    height: 60,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTertiaryText: {
    color: '#ba1a1a',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    opacity: 0.7,
  },
  snoozeSection: {
    borderRadius: 24,
    padding: 16,
    marginTop: 8,
  },
  pickersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 6,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  resultPreview: {
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  footerText: {
    marginLeft: 6,
  },
});
