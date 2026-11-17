import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import {
  Text,
  Card,
  useTheme,
  ProgressBar,
  Avatar,
  IconButton,
} from 'react-native-paper';

import { useMedicationStore } from '../store/useMedicationStore';
import { SimpleDoseCard } from '../components/SimpleDoseCard';
import { DoseBottomSheet, DoseBottomSheetRef } from '../components/DoseBottomSheet';
import { SkeletonBase } from '../components/animations/SkeletonBase';
import { FadeInStagger } from '../components/animations/FadeInStagger';
import { DoseEventWithMedication } from '../models';
import { AlarmService } from '../services/AlarmService';

export const HomeScreen = () => {
  const theme = useTheme();
  const bottomSheetRef = React.useRef<DoseBottomSheetRef>(null);

  const {
    todayEvents,
    initializeStore,
  } = useMedicationStore();

  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState<DoseEventWithMedication | null>(null);
  const [showBatteryWarning, setShowBatteryWarning] = React.useState(false);

  useEffect(() => {
    const checkBattery = async () => {
      const isIgnoring = await AlarmService.isIgnoringBatteryOptimizations();
      setShowBatteryWarning(!isIgnoring);
    };
    checkBattery();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      setTimeout(() => {
        bottomSheetRef.current?.present();
      }, 50);
    }
  }, [selectedEvent]);

  useEffect(() => {
    const init = async () => {
      await initializeStore();
      // Pequeño delay intencional para mostrar la transición premium si carga demasiado rápido
      setTimeout(() => setIsLoading(false), 300);
    };
    init();
  }, []);

  const handleCardPress = useCallback((event: DoseEventWithMedication) => {
    setSelectedEvent(event);
  }, []);

  const totalDoses = todayEvents.length;

  const takenDoses = todayEvents.filter(
    (e) => e.status === 'TAKEN'
  ).length;

  const skippedDoses = todayEvents.filter(
    (e) => e.status === 'SKIPPED'
  ).length;

  const pendingDoses = todayEvents.filter(
    (e) =>
      e.status === 'PENDING' ||
      e.status === 'SNOOZED'
  ).length;

  const progress =
    totalDoses > 0
      ? takenDoses / totalDoses
      : 0;

  const renderDoseItem = useCallback(({ item, index }: { item: typeof todayEvents[0], index: number }) => {
    return (
      <FadeInStagger index={index}>
        <SimpleDoseCard
          event={item}
          showDate={false}
          onPress={handleCardPress}
        />
      </FadeInStagger>
    );
  }, [handleCardPress]);

  const renderSkeletons = () => {
    return Array.from({ length: 3 }).map((_, i) => (
      <View key={`skeleton-${i}`} style={{ marginBottom: 12 }}>
        <SkeletonBase height={85} borderRadius={16} />
      </View>
    ));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <Text
          variant="headlineMedium"
          style={styles.welcomeText}
        >
          ¡Hola!
        </Text>

        <Text
          variant="bodyLarge"
          style={{
            color:
              theme.colors.onSurfaceVariant,
          }}
        >
          Aquí tienes tu plan de medicación
          para hoy.
        </Text>
      </View>

      {/* BATTERY WARNING */}
      {showBatteryWarning && (
        <Card
          mode="elevated"
          style={{ backgroundColor: theme.colors.errorContainer, marginBottom: 16, borderRadius: 16 }}
          onPress={() => AlarmService.requestIgnoreBatteryOptimizations()}
        >
          <Card.Content style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Avatar.Icon 
              size={40} 
              icon="alert-circle-outline" 
              color={theme.colors.error} 
              style={{ backgroundColor: 'transparent', marginLeft: -8 }} 
            />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text variant="titleSmall" style={{ color: theme.colors.onErrorContainer, fontWeight: 'bold' }}>
                Atención: Alarmas en riesgo
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, marginTop: 2 }}>
                Android bloqueará tus alarmas al cerrar la app. Toca aquí para desactivar la optimización de batería.
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* SUMMARY */}
      <Card
        style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}
        mode="elevated"
      >
        <Card.Content>
          <View style={styles.summaryHeader}>
            <Text
              variant="titleMedium"
              style={styles.summaryTitle}
            >
              Adherencia de Hoy
            </Text>

            <Text
              variant="titleLarge"
              style={[
                styles.summaryPercent,
                {
                  color: theme.colors.primary,
                },
              ]}
            >
              {Math.round(progress * 100)}%
            </Text>
          </View>

          <ProgressBar
            progress={progress}
            color={theme.colors.primary}
            style={styles.progressBar}
          />

          <View style={styles.statsContainer}>
            <Text
              variant="bodySmall"
              style={{
                color:
                  theme.colors.onSurfaceVariant,
              }}
            >
              Completadas:{' '}
              <Text
                style={{
                  fontWeight: 'bold',
                  color: '#4CAF50',
                }}
              >
                {takenDoses}
              </Text>
            </Text>

            <Text
              variant="bodySmall"
              style={{
                color:
                  theme.colors.onSurfaceVariant,
              }}
            >
              Pendientes:{' '}
              <Text
                style={{
                  fontWeight: 'bold',
                  color: theme.colors.primary,
                }}
              >
                {pendingDoses}
              </Text>
            </Text>

            <Text
              variant="bodySmall"
              style={{
                color:
                  theme.colors.onSurfaceVariant,
              }}
            >
              Omitidas:{' '}
              <Text
                style={{
                  fontWeight: 'bold',
                  color: '#F44336',
                }}
              >
                {skippedDoses}
              </Text>
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* SECTION HEADER */}
      <View style={styles.sectionHeader}>
        <Text
          variant="titleLarge"
          style={styles.sectionTitle}
        >
          Tomas del Día
        </Text>

        <IconButton
          icon="refresh"
          size={20}
          onPress={async () => {
            setIsRefreshing(true);
            await useMedicationStore.getState().fetchTodayEvents();
            setTimeout(() => setIsRefreshing(false), 300);
          }}
        />
      </View>

      {/* EMPTY STATE OR LIST OR SKELETONS */}
      {isLoading || isRefreshing ? (
        <View style={styles.listContainer}>
          {renderSkeletons()}
        </View>
      ) : todayEvents.length === 0 ? (
        <FadeInStagger index={0}>
          <Card
            mode="outlined"
            style={[
              styles.emptyCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <Card.Content style={styles.emptyContent}>
              <View
                style={[
                  styles.emptyIconWrapper,
                  { backgroundColor: theme.colors.surfaceVariant },
                ]}
              >
                <Avatar.Icon
                  size={52}
                  icon="calendar-check"
                  color={theme.colors.primary}
                  style={{ backgroundColor: 'transparent' }}
                />
              </View>
              <Text variant="titleMedium" style={styles.emptyText}>
                No tienes medicamentos programados para hoy
              </Text>
              <Text
                variant="bodyMedium"
                style={[styles.emptyDescription, { color: theme.colors.onSurfaceVariant }]}
              >
                Agrega medicamentos en la pestaña "Medicamentos" para comenzar a gestionar tu tratamiento.
              </Text>
            </Card.Content>
          </Card>
        </FadeInStagger>
      ) : (
        <FlatList
          data={todayEvents}
          renderItem={renderDoseItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={styles.listContainer}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={true}
        />
      )}

      <View style={styles.bottomSpacer} />
      </ScrollView>

      <DoseBottomSheet 
        ref={bottomSheetRef} 
        event={selectedEvent} 
        onClose={() => {
          bottomSheetRef.current?.dismiss();
          setSelectedEvent(null);
        }} 
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  contentContainer: {
    padding: 16,
    paddingBottom: 0,
  },

  header: {
    marginTop: 10,
    marginBottom: 24,
  },

  welcomeText: {
    fontWeight: 'bold',
  },

  summaryCard: {
    marginBottom: 28,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 2,
  },

  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  summaryTitle: {
    fontWeight: 'bold',
  },

  summaryPercent: {
    fontWeight: 'bold',
  },

  progressBar: {
    height: 10,
    borderRadius: 999,
    marginBottom: 16,
  },

  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  sectionTitle: {
    fontWeight: 'bold',
  },

  listContainer: {
    paddingBottom: 12,
  },

  emptyCard: {
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    overflow: 'hidden',
  },

  emptyContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
  },

  emptyIconWrapper: {
    width: 82,
    height: 82,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },

  emptyText: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },

  emptyDescription: {
    textAlign: 'center',
    lineHeight: 22,
  },

  bottomSpacer: {
    height: 40,
  },
});