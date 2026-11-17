import React, { useCallback, useMemo, forwardRef, useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ToastAndroid } from 'react-native';
import { Text, Button, useTheme, IconButton } from 'react-native-paper';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop, BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { DoseEventWithMedication } from '../models';
import { useMedicationStore } from '../store/useMedicationStore';
import dayjs from 'dayjs';

interface DoseBottomSheetProps {
  event: DoseEventWithMedication | null;
  onClose: () => void;
}

export type DoseBottomSheetRef = BottomSheetModal;

const SNOOZE_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: '2 horas', minutes: 120 },
];

const NumberWheel = ({
  max,
  value,
  onChange,
  label,
}: {
  max: number;
  value: number;
  onChange: (val: number) => void;
  label: string;
}) => {
  const theme = useTheme();
  return (
    <View style={styles.wheelContainer}>
      <Text style={[styles.wheelLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <View style={styles.wheelControls}>
        <IconButton icon="minus" size={20} iconColor={theme.colors.onSurface} onPress={() => onChange(Math.max(0, value - 1))} />
        <View style={[styles.wheelValueBox, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]}>
          <Text variant="titleLarge" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
            {value.toString().padStart(2, '0')}
          </Text>
        </View>
        <IconButton icon="plus" size={20} iconColor={theme.colors.onSurface} onPress={() => onChange(Math.min(max, value + 1))} />
      </View>
    </View>
  );
};

export const DoseBottomSheet = forwardRef<DoseBottomSheetRef, DoseBottomSheetProps>(
  ({ event, onClose }, ref) => {
    const scheduledTime = event ? dayjs(event.scheduledAt) : dayjs();
    const isActionable = event ? (event.status === 'PENDING' || event.status === 'SNOOZED') : false;
    const theme = useTheme();
    const { markDoseTaken, markDoseSkipped, snoozeDose } = useMedicationStore();

    const [snoozeHours, setSnoozeHours] = useState(0);
    const [snoozeMinutes, setSnoozeMinutes] = useState(15);

    useEffect(() => {
      setSnoozeHours(0);
      setSnoozeMinutes(15);
    }, [event?.id]);

    // Base: la hora programada de la alarma (no "now")
    // Si ya pasó, usamos now como base para no retroceder en el tiempo
    const baseTime = scheduledTime.isBefore(dayjs()) ? dayjs() : scheduledTime;

    // Hora resultante = base + horas + minutos seleccionados
    const totalSnoozeMinutes = snoozeHours * 60 + snoozeMinutes;
    const resultingTime = baseTime.add(totalSnoozeMinutes, 'minute');

    // Label legible: si cruza medianoche, mostrar día
    const isNextDay = !resultingTime.isSame(baseTime, 'day');
    const resultingTimeLabel = isNextDay
      ? resultingTime.format('ddd DD/MM HH:mm')
      : resultingTime.format('HH:mm');

    const snapPoints = useMemo(() => ['65%', '80%'], []);

    const handleSheetChanges = useCallback(
      (index: number) => {
        if (index === -1) onClose();
      },
      [onClose]
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
      ),
      []
    );

    const handleSnooze = () => {
      if (!event || totalSnoozeMinutes === 0) return;
      snoozeDose(event.id, resultingTime.toDate());
      ToastAndroid.show('Recordatorio pospuesto', ToastAndroid.SHORT);
      onClose();
    };

    const applyPreset = (minutes: number) => {
      setSnoozeHours(Math.floor(minutes / 60));
      setSnoozeMinutes(minutes % 60);
    };

    return (
      <BottomSheetModal
        ref={ref}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.onSurfaceVariant }}
        enableDynamicSizing={false}
      >
        <BottomSheetView>
          {event ? (
            <View style={styles.contentContainer}>
              <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 2 }}>
                {event.medication.name}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
                {event.medication.dose} {event.medication.unit} • Programada: {scheduledTime.format('HH:mm')}
              </Text>

              {isActionable ? (
                <>
                  <View style={styles.actionsRow}>
                    <Button
                      mode="contained"
                      buttonColor="#4CAF50"
                      onPress={() => {
                        markDoseTaken(event.id);
                        ToastAndroid.show('Dosis tomada', ToastAndroid.SHORT);
                        onClose();
                      }}
                      style={styles.actionBtn}
                      icon="check"
                    >
                      Tomar
                    </Button>
                    <Button
                      mode="contained"
                      buttonColor="#FF9800"
                      onPress={() => {
                        markDoseSkipped(event.id);
                        ToastAndroid.show('Dosis omitida', ToastAndroid.SHORT);
                        onClose();
                      }}
                      style={styles.actionBtn}
                      icon="close"
                    >
                      Omitir
                    </Button>
                  </View>

                  <View style={[styles.snoozeSection, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Text variant="titleSmall" style={{ fontWeight: 'bold', marginBottom: 10, color: theme.colors.onSurface }}>
                      Posponer recordatorio
                    </Text>

                    {/* Quick presets */}
                    <View style={styles.presetsRow}>
                      {SNOOZE_PRESETS.map((preset) => {
                        const isSelected = totalSnoozeMinutes === preset.minutes;
                        return (
                          <TouchableOpacity
                            key={preset.minutes}
                            style={[
                              styles.presetChip,
                              {
                                backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                                borderColor: isSelected ? theme.colors.primary : theme.colors.outline,
                              },
                            ]}
                            onPress={() => applyPreset(preset.minutes)}
                          >
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: isSelected ? theme.colors.onPrimary : theme.colors.onSurface }}>
                              {preset.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Custom wheels */}
                    <View style={styles.pickersRow}>
                      <NumberWheel max={23} value={snoozeHours} onChange={setSnoozeHours} label="Horas" />
                      <View style={[styles.separator, { backgroundColor: theme.colors.outline }]} />
                      <NumberWheel max={59} value={snoozeMinutes} onChange={setSnoozeMinutes} label="Minutos" />
                    </View>

                    {/* Resulting time preview */}
                    <View style={[styles.resultPreview, { backgroundColor: theme.colors.surface }]}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Sonará a las
                      </Text>
                      <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                        {resultingTimeLabel}
                      </Text>
                      {isNextDay && (
                        <Text variant="labelSmall" style={{ color: '#FF9800', fontWeight: 'bold' }}>
                          ⚠ Pasará al día siguiente
                        </Text>
                      )}
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        ({snoozeHours > 0 ? `${snoozeHours}h ` : ''}{snoozeMinutes}m desde la hora programada)
                      </Text>
                    </View>

                    <Button
                      mode="contained"
                      icon="clock-fast"
                      buttonColor="#FFC107"
                      textColor="#000"
                      style={styles.snoozeBtn}
                      onPress={handleSnooze}
                      disabled={totalSnoozeMinutes === 0}
                    >
                      Posponer hasta las {resultingTimeLabel}
                    </Button>
                  </View>
                </>
              ) : (
                <View style={{ alignItems: 'center', marginTop: 24 }}>
                  <Text variant="titleLarge" style={{ color: theme.colors.primary }}>
                    Esta dosis ya fue {event.status === 'TAKEN' ? 'tomada ✓' : 'omitida ✗'}.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View />
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  contentContainer: { padding: 24 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  actionBtn: { flex: 1, borderRadius: 8 },
  snoozeSection: { borderRadius: 16, padding: 16 },
  presetsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, gap: 6 },
  presetChip: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  pickersRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 14, gap: 8 },
  separator: { width: 1, height: 40, opacity: 0.3, marginHorizontal: 4 },
  wheelContainer: { alignItems: 'center' },
  wheelLabel: { marginBottom: 4, fontWeight: 'bold', fontSize: 12 },
  wheelControls: { flexDirection: 'row', alignItems: 'center' },
  wheelValueBox: { borderWidth: 2, borderRadius: 8, width: 52, height: 52, justifyContent: 'center', alignItems: 'center' },
  resultPreview: { borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12 },
  snoozeBtn: { borderRadius: 8 },
});
