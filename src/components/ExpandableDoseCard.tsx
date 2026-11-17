import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Card, Text, Avatar, useTheme, IconButton, Button, Chip } from 'react-native-paper';
import { DoseEventWithMedication } from '../models';
import { useMedicationStore } from '../store/useMedicationStore';
import dayjs from 'dayjs';

interface Props {
  event: DoseEventWithMedication;
  showDate?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

const ITEM_HEIGHT = 40; // For the sliding wheel

export const NumberWheel = React.memo(({ max, value, onChange, label }: { max: number, value: number, onChange: (val: number) => void, label: string }) => {
  const theme = useTheme();
  return (
    <View style={styles.wheelContainer}>
      <Text style={[styles.wheelLabel, { color: theme.colors.onSurface }]}>{label}</Text>
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
});

export const ExpandableDoseCard = React.memo(({ event, showDate = false }: Props) => {
  const theme = useTheme();
  const { markDoseTaken, markDoseSkipped, snoozeDose } = useMedicationStore();
  const [expanded, setExpanded] = useState(false);
  
  // Snooze state
  const [snoozeHours, setSnoozeHours] = useState(0);
  const [snoozeMinutes, setSnoozeMinutes] = useState(0); // default 0 min

  const scheduledTime = dayjs(event.scheduledAt);
  const isPast = scheduledTime.isBefore(dayjs());
  const color = event.medication.color || theme.colors.primary;

  const handleSnooze = () => {
    const totalMinutes = (snoozeHours * 60) + snoozeMinutes;
    if (totalMinutes === 0) return;
    snoozeDose(event.id, totalMinutes);
    setExpanded(false);
  };

  let statusText = 'Pendiente';
  let statusColor = theme.colors.primary;
  let statusIcon = 'clock-outline';

  if (event.status === 'TAKEN') {
    statusText = `Tomada a las ${dayjs(event.takenAt).format('HH:mm')}`;
    statusColor = '#4CAF50';
    statusIcon = 'check-circle';
  } else if (event.status === 'SKIPPED') {
    statusText = 'Omitida';
    statusColor = '#FF9800';
    statusIcon = 'close-circle';
  } else if (event.status === 'SNOOZED') {
    statusText = `Pospuesta (Suena a las ${dayjs(event.snoozedUntil).format('HH:mm')})`;
    statusColor = '#FFC107';
    statusIcon = 'clock-fast';
  } else if (isPast && event.status === 'PENDING') {
    statusText = 'Perdida / No Tomada';
    statusColor = '#F44336';
    statusIcon = 'alert-circle';
  }

  const isActionable = event.status === 'PENDING' || event.status === 'SNOOZED';

  return (
    <Card style={styles.card} mode="outlined" onPress={() => isActionable && setExpanded(!expanded)}>
      <Card.Content>
        <View style={styles.row}>
          <Avatar.Icon size={48} icon="pill" style={{ backgroundColor: color }} color="#fff" />
          <View style={styles.details}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{event.medication.name}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {event.medication.dose} {event.medication.unit} {event.medication.foodInstruction === 'fasting' ? '• En Ayunas' : event.medication.foodInstruction === 'with_food' ? '• Con Comida' : ''}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {showDate ? scheduledTime.format('DD/MM/YYYY HH:mm') : `Programada: ${scheduledTime.format('HH:mm')}`}
            </Text>
          </View>
          {isActionable && (
            <IconButton
              icon={expanded ? "chevron-up" : "chevron-down"}
              size={24}
              onPress={() => setExpanded(!expanded)}
            />
          )}
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusChip, { backgroundColor: statusColor }]}>
            <Avatar.Icon
              size={16}
              icon={statusIcon}
              color="#fff"
              style={{ backgroundColor: 'transparent' }}
            />
            <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', marginLeft: 4 }}>
              {statusText}
            </Text>
          </View>
        </View>

        {expanded && isActionable && (
          <View style={styles.expandedSection}>
            <View style={styles.actionsRow}>
              <Button mode="contained" buttonColor="#4CAF50" onPress={() => markDoseTaken(event.id)} style={styles.actionBtn}>
                Tomar
              </Button>
              <Button mode="contained" buttonColor="#FF9800" onPress={() => markDoseSkipped(event.id)} style={styles.actionBtn}>
                Omitir
              </Button>
            </View>
            
            <View style={[styles.snoozeSection, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Text variant="titleSmall" style={{ fontWeight: 'bold', marginBottom: 8, textAlign: 'center', color: theme.colors.onSurface }}>Posponer Alarma</Text>
              
              <View style={styles.pickersRow}>
                <NumberWheel max={23} value={snoozeHours} onChange={setSnoozeHours} label="Horas" />
                <NumberWheel max={59} value={snoozeMinutes} onChange={setSnoozeMinutes} label="Minutos" />
              </View>

              <Button 
                mode="contained" 
                icon="clock-fast" 
                buttonColor="#FFC107"
                textColor="#000"
                style={styles.snoozeBtn}
                onPress={handleSnooze}
                disabled={snoozeHours === 0 && snoozeMinutes === 0}
              >
                Posponer {snoozeHours > 0 ? `${snoozeHours}h ` : ''}{snoozeMinutes}m
              </Button>
            </View>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.event.id === nextProps.event.id &&
    prevProps.event.status === nextProps.event.status &&
    prevProps.event.snoozedUntil === nextProps.event.snoozedUntil &&
    prevProps.showDate === nextProps.showDate
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 16,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  details: {
    flex: 1,
    marginLeft: 16,
  },
  statusRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  expandedSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 8,
  },
  snoozeSection: {
    borderRadius: 12,
    padding: 16,
  },
  pickersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  wheelContainer: {
    alignItems: 'center',
  },
  wheelLabel: {
    marginBottom: 4,
    fontWeight: 'bold',
  },
  wheelControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wheelValueBox: {
    borderWidth: 2,
    borderRadius: 8,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  snoozeBtn: {
    borderRadius: 8,
  },
});
