import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Avatar, useTheme } from 'react-native-paper';
import { DoseEventWithMedication } from '../models';
import dayjs from 'dayjs';

interface Props {
  event: DoseEventWithMedication;
  showDate?: boolean;
  onPress?: (event: DoseEventWithMedication) => void;
}

export const SimpleDoseCard = React.memo(({ event, showDate = false, onPress }: Props) => {
  const theme = useTheme();

  const scheduledTime = dayjs(event.scheduledAt);
  const isPast = scheduledTime.isBefore(dayjs());
  const color = event.medication.color || theme.colors.primary;

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

  return (
    <Card 
      style={styles.card} 
      mode="outlined" 
      onPress={() => onPress && onPress(event)}
    >
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
});
