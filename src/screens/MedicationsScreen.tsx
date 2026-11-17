import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { Text, Card, FAB, Portal, useTheme, Avatar, IconButton, Chip } from 'react-native-paper';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useMedicationStore } from '../store/useMedicationStore';
import { MedicationStatus } from '../models';
import { SkeletonBase } from '../components/animations/SkeletonBase';
import { FadeInStagger } from '../components/animations/FadeInStagger';
import { FullScreenLoader } from '../components/animations/FullScreenLoader';
import { MedicationWizardModal } from '../components/MedicationWizardModal';
import dayjs from 'dayjs';

export const MedicationsScreen = () => {
  const theme = useTheme();
  const { medications, addMedicationWithTreatment, deleteMedication, fetchMedications, updateTreatmentStartTime, isLoading } = useMedicationStore();
  
  const [statusFilter, setStatusFilter] = useState<MedicationStatus | 'all'>('active');
  const [modalVisible, setModalVisible] = useState(false);

  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState(new Date());
  const [showEditTimePicker, setShowEditTimePicker] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const filteredMedications = useMemo(() => {
    if (statusFilter === 'all') return medications;
    return medications.filter(m => m.treatmentStatus === statusFilter);
  }, [medications, statusFilter]);

  useEffect(() => {
    const init = async () => {
      await fetchMedications();
      setTimeout(() => setIsInitializing(false), 300);
    };
    init();
  }, []);

  const handleOpenModal = useCallback(() => {
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleDelete = useCallback((id: string, medicationName: string) => {
    Alert.alert(
      'Dar de Baja Medicamento',
      `¿Estás seguro de que deseas dar de baja ${medicationName}?\n\nSe cancelarán TODAS las dosis programadas a partir de ahora (incluyendo las de hoy aún no tomadas), conservando el historial pasado en el Calendario.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Dar de Baja', 
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteMedication(id);
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }, [deleteMedication]);

  const handleEditStartTime = useCallback((medicationId: string, currentTime: string) => {
    const [h, m] = (currentTime || '08:00').split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    setEditStartTime(d);
    setEditingMedId(medicationId);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: d,
        mode: 'time',
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) {
            setEditStartTime(date);
            const newTime = dayjs(date).format('HH:mm');
            setIsUpdating(true);
            updateTreatmentStartTime(medicationId, newTime).then(() => {
              setIsUpdating(false);
              setEditingMedId(null);
              Alert.alert('Actualizado', `Hora de inicio cambiada a ${newTime}. Las próximas dosis han sido reprogramadas.`);
            });
          } else {
            // dismissed
            setEditingMedId(null);
          }
        },
      });
    } else {
      setShowEditTimePicker(true);
    }
  }, [updateTreatmentStartTime]);

  const confirmEditStartTime = async () => {
    if (!editingMedId) return;
    const newTime = dayjs(editStartTime).format('HH:mm');
    setIsUpdating(true);
    await updateTreatmentStartTime(editingMedId, newTime);
    setIsUpdating(false);
    setEditingMedId(null);
    Alert.alert('Actualizado', `Hora de inicio cambiada a ${newTime}. Las próximas dosis han sido reprogramadas.`);
  };

  const renderMedicationItem = useCallback(({ item, index }: { item: typeof medications[0], index: number }) => {
    const statusConfig = {
      active: { label: 'Activo', color: '#4CAF50' },
      finished: { label: 'Finalizado', color: '#607D8B' },
      inactive: { label: 'Inactivo', color: '#F44336' },
    };
    const sc = statusConfig[item.treatmentStatus || 'active'];
    return (
    <FadeInStagger index={index}>
      <Card style={styles.medCard} mode="outlined">
        <Card.Content style={styles.cardContent}>
          <Avatar.Icon 
            size={40} 
            icon="pill" 
            style={{ backgroundColor: item.treatmentStatus === 'inactive' ? '#9E9E9E' : item.color }} 
            color="#fff" 
          />
          <View style={styles.medDetails}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.name}</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.dose} {item.unit} - {item.createdAt ? dayjs(item.createdAt).format('DD MMM YYYY') : 'Fecha desconocida'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Chip compact textStyle={{fontSize: 10, color: '#fff', fontWeight: 'bold', lineHeight: 12}} style={{ backgroundColor: sc.color, minHeight: 22, paddingVertical: 0}}>{sc.label}</Chip>
              {item.foodInstruction === 'fasting' && (
                <Chip compact textStyle={{ fontSize: 10, lineHeight: 12}} style={{ height: 22, minHeight: 22, paddingVertical: 0 }}>⚠️ Ayunas</Chip>
              )}
              {item.foodInstruction === 'with_food' && (
                <Chip compact textStyle={{ fontSize: 10, lineHeight: 12 }} style={{ height: 22, minHeight: 22, paddingVertical: 0 }}>🍲 Con Comida</Chip>
              )}
            </View>
          </View>
          {item.treatmentStatus === 'active' && (
            <View style={styles.cardActions}>
              <IconButton
                icon="clock-edit-outline"
                iconColor={theme.colors.primary}
                size={22}
                onPress={() => handleEditStartTime(item.id, item.startTime || '08:00')}
                tooltip="Cambiar hora de inicio"
              />
              <IconButton 
                icon="trash-can-outline" 
                iconColor="#F44336" 
                size={22} 
                onPress={() => handleDelete(item.id, item.name)} 
              />
            </View>
          )}
          {item.treatmentStatus === 'finished' && (
            <IconButton 
              icon="trash-can-outline" 
              iconColor="#F44336" 
              size={22} 
              onPress={() => handleDelete(item.id, item.name)} 
            />
          )}
        </Card.Content>
      </Card>
    </FadeInStagger>
    );
  }, [theme, handleDelete, handleEditStartTime]);

  const renderSkeletons = () => {
    return Array.from({ length: 4 }).map((_, i) => (
      <View key={`skeleton-${i}`} style={{ marginBottom: 12 }}>
        <SkeletonBase height={80} borderRadius={12} />
      </View>
    ));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>Mis Medicamentos</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Lista de tratamientos. Presiona + para agregar uno nuevo.
        </Text>
      </View>

      {/* Filter Chips */}
      <View
        style={{
          height: 42,
          justifyContent: 'center',
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{
            flexGrow: 0,
          }}
          contentContainerStyle={{
            gap: 8,
            alignItems: 'center',
            paddingVertical: 0,
          }}
        >
          {([
            ['all', 'Todos'],
            ['active', 'Activos'],
            ['finished', 'Finalizados'],
            ['inactive', 'Inactivos'],
          ] as const).map(([val, label]) => (
            <Chip
              key={val}
              compact
              selected={statusFilter === val}
              onPress={() => setStatusFilter(val)}
              showSelectedCheck={false}
              style={[
                {
                  height: 32,
                  justifyContent: 'center',
                },
                statusFilter === val
                  ? { backgroundColor: theme.colors.primary }
                  : {},
              ]}
              textStyle={[
                {
                  fontSize: 13,
                  lineHeight: 16,
                  includeFontPadding: false,
                },
                statusFilter === val
                  ? {
                      color: theme.colors.onPrimary,
                      fontWeight: 'bold',
                    }
                  : {},
              ]}
            >
              {label}
            </Chip>
          ))}
        </ScrollView>
      </View>

      {isInitializing ? (
        <View style={styles.listContainer}>
          {renderSkeletons()}
        </View>
      ) : filteredMedications.length === 0 ? (
        <FadeInStagger index={0} style={{ flex: 1 }}>
          <View style={styles.emptyContainer}>
            <Avatar.Icon size={64} icon="pill-off" style={{ backgroundColor: theme.colors.surfaceVariant }} />
            <Text variant="titleMedium" style={styles.emptyText}>No hay medicamentos agregados</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
              Registra tus medicamentos y configura los horarios para recibir recordatorios.
            </Text>
          </View>
        </FadeInStagger>
      ) : (
        <Animated.FlatList
          data={filteredMedications}
          renderItem={renderMedicationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          itemLayoutAnimation={LinearTransition}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={true}
        />
      )}

      <FullScreenLoader visible={isDeleting} message="Dando de baja el tratamiento..." />
      <FullScreenLoader visible={isUpdating} message="Reprogramando horarios..." />

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="#fff"
        onPress={handleOpenModal}
      />

      <Portal>
        {/* Edit Start Time — iOS only (Android uses imperative API in handleEditStartTime) */}
        {Platform.OS === 'ios' && showEditTimePicker && (
          <DateTimePicker
            value={editStartTime}
            mode="time"
            is24Hour={true}
            display="default"
            onChange={(event: DateTimePickerEvent, date?: Date) => {
              setShowEditTimePicker(false);
              if (event.type === 'dismissed') { setEditingMedId(null); return; }
              if (date && editingMedId) {
                const newTime = dayjs(date).format('HH:mm');
                setIsUpdating(true);
                updateTreatmentStartTime(editingMedId, newTime).then(() => {
                  setIsUpdating(false);
                  setEditingMedId(null);
                  Alert.alert('Actualizado', `Hora de inicio cambiada a ${newTime}. Las próximas dosis han sido reprogramadas.`);
                });
              } else {
                setEditingMedId(null);
              }
            }}
          />
        )}

        <MedicationWizardModal visible={modalVisible} onDismiss={handleCloseModal} />
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { marginBottom: 12, marginTop: 10 },
  title: { fontWeight: 'bold' },
  filterRow: { marginBottom: 8 },
  listContainer: { paddingBottom: 80 },
  medCard: { marginBottom: 12, borderRadius: 12 },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  medDetails: { marginLeft: 12, flex: 1 },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  editTimeModal: { margin: 24, borderRadius: 20, padding: 24 },
});
