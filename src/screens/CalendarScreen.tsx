import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Text, Card, Avatar, useTheme } from 'react-native-paper';
import { Calendar, DateData } from 'react-native-calendars';
import { useMedicationStore } from '../store/useMedicationStore';
import dayjs from 'dayjs';

import { SimpleDoseCard } from '../components/SimpleDoseCard';
import { DoseBottomSheet, DoseBottomSheetRef } from '../components/DoseBottomSheet';
import { SkeletonBase } from '../components/animations/SkeletonBase';
import { FadeInStagger } from '../components/animations/FadeInStagger';
import { DoseEventWithMedication } from '../models';
import { MD3Theme } from 'react-native-paper';
import { MarkedDates } from 'react-native-calendars/src/types';

const CalendarHeader = React.memo(({ theme }: { theme: MD3Theme }) => (
  <View style={styles.header}>
    <Text variant="headlineSmall" style={styles.title}>
      Calendario de Adherencia
    </Text>
    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
      Visualiza tu cumplimiento mensual y detalles diarios.
    </Text>
  </View>
));

const CalendarLegend = React.memo(({ theme }: { theme: MD3Theme }) => (
  <View style={styles.legendContainer}>
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
      <Text variant="labelSmall">Tomada</Text>
    </View>
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
      <Text variant="labelSmall">Perdida</Text>
    </View>
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} />
      <Text variant="labelSmall">Omitida</Text>
    </View>
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
      <Text variant="labelSmall">Pendiente</Text>
    </View>
  </View>
));

export const CalendarScreen = () => {
  const theme = useTheme();
  const bottomSheetRef = React.useRef<DoseBottomSheetRef>(null);

  const { allEvents, fetchCalendarEvents } = useMedicationStore();
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [currentMonth, setCurrentMonth] = useState(dayjs().format('YYYY-MM'));
  
  const [isLoading, setIsLoading] = useState(true);
  const [isListLoading, setIsListLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState<DoseEventWithMedication | null>(null);

  useEffect(() => {
    if (selectedEvent) {
      setTimeout(() => {
        bottomSheetRef.current?.present();
      }, 50);
    }
  }, [selectedEvent]);

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      await fetchCalendarEvents(currentMonth);
      setIsLoading(false);
    };
    fetch();
  }, [currentMonth]);

  const handleDayPress = useCallback((day: DateData) => {
    setSelectedDate(prev => {
      if (day.dateString !== prev) {
        setIsListLoading(true);
        setTimeout(() => setIsListLoading(false), 200);
        return day.dateString;
      }
      return prev;
    });
  }, []);

  const handleMonthChange = useCallback((month: DateData) => {
    setCurrentMonth(prev => {
      const newMonth = dayjs(month.dateString).format('YYYY-MM');
      if (newMonth !== prev) {
        setIsLoading(true);
        return newMonth;
      }
      return prev;
    });
  }, []);

  const calendarTheme = useMemo(() => ({
    backgroundColor: theme.colors.background,
    calendarBackground: theme.colors.surface,
    textSectionTitleColor: theme.colors.onSurfaceVariant,
    selectedDayBackgroundColor: theme.colors.primary,
    selectedDayTextColor: theme.colors.onPrimary,
    todayTextColor: theme.colors.primary,
    dayTextColor: theme.colors.onSurface,
    textDisabledColor: theme.colors.outlineVariant,
    dotColor: theme.colors.primary,
    selectedDotColor: theme.colors.onPrimary,
    arrowColor: theme.colors.primary,
    monthTextColor: theme.colors.onSurface,
    indicatorColor: theme.colors.primary,
  }), [theme]);

  const handleCardPress = useCallback((event: DoseEventWithMedication) => {
    setSelectedEvent(event);
  }, []);

  const { markedDates, eventsByDate } = useMemo(() => {
    const mDates: MarkedDates = {};
    const eByDate: { [key: string]: DoseEventWithMedication[] } = {};

    allEvents.forEach((event) => {
      const dateStr = dayjs(event.scheduledAt).format('YYYY-MM-DD');
      if (!eByDate[dateStr]) {
        eByDate[dateStr] = [];
      }
      eByDate[dateStr].push(event);
    });

    Object.keys(eByDate).forEach((dateStr) => {
      const dayEvents = eByDate[dateStr];
      const dots: { key: string; color: string; selectedDotColor?: string }[] = [];
      
      const hasTaken = dayEvents.some(e => e.status === 'TAKEN');
      const hasSkipped = dayEvents.some(e => e.status === 'SKIPPED');
      const hasPendingFuture = dayEvents.some(e => (e.status === 'PENDING' || e.status === 'SNOOZED') && dayjs(e.scheduledAt).isAfter(dayjs()));
      const hasMissed = dayEvents.some(e => (e.status === 'PENDING' || e.status === 'SNOOZED') && dayjs(e.scheduledAt).isBefore(dayjs()));

      if (hasTaken) {
        dots.push({ key: 'taken', color: '#4CAF50', selectedDotColor: '#4CAF50' });
      }
      if (hasSkipped) {
        dots.push({ key: 'skipped', color: '#FF9800', selectedDotColor: '#FF9800' });
      }
      if (hasMissed) {
        dots.push({ key: 'missed', color: '#F44336', selectedDotColor: '#F44336' });
      }
      if (hasPendingFuture) {
        dots.push({ key: 'pending', color: theme.colors.primary, selectedDotColor: theme.colors.primary });
      }

      mDates[dateStr] = {
        dots,
        marked: dots.length > 0,
      };
    });
    
    return { markedDates: mDates, eventsByDate: eByDate };
  }, [allEvents, theme.colors.primary]);

  const finalMarkedDates = useMemo(() => {
    return {
      ...markedDates,
      [selectedDate]: {
        ...markedDates[selectedDate],
        selected: true,
        selectedColor: theme.colors.primary,
      }
    };
  }, [markedDates, selectedDate, theme.colors.primary]);

  const selectedDayEvents = eventsByDate[selectedDate] || [];

  const renderEventItem = useCallback(({ item, index }: { item: typeof allEvents[0], index: number }) => {
    return (
      <FadeInStagger index={index}>
        <SimpleDoseCard event={item} showDate={false} onPress={handleCardPress} />
      </FadeInStagger>
    );
  }, [handleCardPress]);

  const renderListSkeletons = () => {
    return Array.from({ length: 3 }).map((_, i) => (
      <View key={`skeleton-list-${i}`} style={{ marginBottom: 12 }}>
        <SkeletonBase height={85} borderRadius={16} />
      </View>
    ));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <CalendarHeader theme={theme} />

      {isLoading ? (
        <View style={styles.calendarSkeletonContainer}>
          <SkeletonBase height={320} borderRadius={12} />
        </View>
      ) : (
        <Calendar
          key={theme.dark ? 'dark' : 'light'}
          current={currentMonth + '-01'}
          onDayPress={handleDayPress}
          onMonthChange={handleMonthChange}
          markedDates={finalMarkedDates}
          markingType="multi-dot"
          theme={calendarTheme}
          style={styles.calendar}
        />
      )}

      <CalendarLegend theme={theme} />

      <Text variant="titleMedium" style={styles.selectedDayTitle}>
        Tomas para el {dayjs(selectedDate).format('DD [de] MMMM, YYYY')}
      </Text>

      {isListLoading || isLoading ? (
        <View style={styles.listContainer}>
          {renderListSkeletons()}
        </View>
      ) : selectedDayEvents.length === 0 ? (
        <FadeInStagger index={0}>
          <View style={styles.emptyContainer}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No hay tomas registradas para este día.
            </Text>
          </View>
        </FadeInStagger>
      ) : (
        <FlatList
          data={selectedDayEvents}
          renderItem={renderEventItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={true}
        />
      )}

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
    padding: 16,
  },
  header: {
    marginBottom: 16,
    marginTop: 10,
  },
  title: {
    fontWeight: 'bold',
  },
  calendar: {
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    marginBottom: 12,
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  selectedDayTitle: {
    fontWeight: 'bold',
    marginBottom: 10,
  },
  listContainer: {
    paddingBottom: 24,
  },
  eventCard: {
    marginBottom: 8,
    borderRadius: 8,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  medDetails: {
    marginLeft: 12,
    flex: 1,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  calendarSkeletonContainer: {
    marginBottom: 12,
  },
});
