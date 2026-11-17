import { create } from 'zustand';
import dayjs from 'dayjs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDBConnection, initDatabase } from '../database/sqlite';
import { Medication, DoseEventWithMedication, CreateMedicationDTO } from '../models';
import { SchedulerService } from '../scheduler/SchedulerService';
import { AlarmService } from '../services/AlarmService';
import { MedicationRepository, TreatmentRepository, DoseEventRepository } from '../database/repositories';

interface MedicationStore {
  medications: Medication[];
  todayEvents: DoseEventWithMedication[];
  allEvents: DoseEventWithMedication[];
  activeAlarmEvent: DoseEventWithMedication | null;
  isLoading: boolean;
  themePreference: 'system' | 'light' | 'dark';
  
  // Actions
  initializeStore: () => Promise<void>;
  fetchMedications: () => Promise<void>;
  fetchTodayEvents: () => Promise<void>;
  fetchCalendarEvents: (yearMonth: string) => Promise<void>;
  setThemePreference: (theme: 'system' | 'light' | 'dark') => Promise<void>;
  setActiveAlarmEvent: (event: DoseEventWithMedication | null) => void;
  loadActiveAlarmEvent: (eventId: string) => Promise<void>;
  addMedicationWithTreatment: (dto: CreateMedicationDTO) => Promise<void>;
  markDoseTaken: (eventId: string) => Promise<void>;
  markDoseSkipped: (eventId: string) => Promise<void>;
  snoozeDose: (eventId: string, snoozeUntil: Date) => Promise<void>;
  deleteMedication: (medicationId: string) => Promise<void>;
  updateTreatmentStartTime: (medicationId: string, newStartTime: string) => Promise<void>;
}

export const useMedicationStore = create<MedicationStore>((set, get) => ({
  medications: [],
  todayEvents: [],
  allEvents: [],
  activeAlarmEvent: null,
  isLoading: false,
  themePreference: 'system',

  initializeStore: async () => {
    set({ isLoading: true });
    try {
      // 0. Load theme preference
      const savedTheme = await AsyncStorage.getItem('@theme_preference');
      if (savedTheme) {
        set({ themePreference: savedTheme as any });
      }

      // 1. Init Database Tables
      await initDatabase();

      // 2. Request notification permission
      try {
        const notifee = require('@notifee/react-native').default;
        await notifee.requestPermission();
      } catch (_) { /* permission request is best-effort */ }

      // 3. Open DB connection and run Scheduler to generate rolling window events
      const db = await getDBConnection();
      await SchedulerService.generateEventsForRollingWindow(db);

      // 4. Load initial state
      await get().fetchMedications();
      await get().fetchTodayEvents();
      await get().fetchCalendarEvents(dayjs().format('YYYY-MM'));
    } catch (error) {
      console.error('[Store] Failed to initialize store:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchMedications: async () => {
    try {
      const medications = await MedicationRepository.getAllWithActiveStatus();
      set({ medications });
    } catch (error) {
      console.error('[Store] Error fetching medications:', error);
    }
  },

  fetchTodayEvents: async () => {
    try {
      const todayStart = dayjs().startOf('day').toISOString();
      const todayEnd = dayjs().endOf('day').toISOString();
      const todayEvents = await DoseEventRepository.getEventsBetween(todayStart, todayEnd, true);
      set({ todayEvents });
    } catch (error) {
      console.error('[Store] Error fetching today\'s events:', error);
    }
  },

  fetchCalendarEvents: async (yearMonth: string) => {
    try {
      const monthStart = dayjs(yearMonth).startOf('month').toISOString();
      const monthEnd = dayjs(yearMonth).endOf('month').toISOString();
      const allEvents = await DoseEventRepository.getEventsBetween(monthStart, monthEnd, false);
      set({ allEvents });
    } catch (error) {
      console.error('[Store] Error fetching calendar events:', error);
    }
  },

  addMedicationWithTreatment: async (dto) => {
    set({ isLoading: true });
    try {
      await MedicationRepository.createWithTreatment(dto);

      const db = await getDBConnection();
      await SchedulerService.generateEventsForRollingWindow(db);

      await get().fetchMedications();
      await get().fetchTodayEvents();
      await get().fetchCalendarEvents(dayjs().format('YYYY-MM'));
    } catch (error) {
      console.error('[Store] Failed to save medication and treatment:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  markDoseTaken: async (eventId) => {
    try {
      const event = await DoseEventRepository.getEventById(eventId);
      if (event?.notificationId) {
        AlarmService.cancelAlarm(event.notificationId);
      }
      
      const nowIso = new Date().toISOString();
      await DoseEventRepository.updateEventStatus(eventId, 'TAKEN', { takenAt: nowIso, notificationId: null });
      
      await get().fetchTodayEvents();
      await get().fetchCalendarEvents(dayjs().format('YYYY-MM'));
    } catch (error) {
      console.error('[Store] Error marking dose taken:', error);
    }
  },

  markDoseSkipped: async (eventId) => {
    try {
      const event = await DoseEventRepository.getEventById(eventId);
      if (event?.notificationId) {
        AlarmService.cancelAlarm(event.notificationId);
      }
      
      await DoseEventRepository.updateEventStatus(eventId, 'SKIPPED', { notificationId: null });
      
      await get().fetchTodayEvents();
      await get().fetchCalendarEvents(dayjs().format('YYYY-MM'));
    } catch (error) {
      console.error('[Store] Error skipping dose:', error);
    }
  },

  snoozeDose: async (eventId, snoozeUntil) => {
    try {
      const event = await DoseEventRepository.getEventById(eventId);
      if (event) {
        if (event.notificationId) {
          AlarmService.cancelAlarm(event.notificationId);
        }

        const newNotificationId = await AlarmService.scheduleAlarm(
          eventId,
          event.medication.name,
          `${event.medication.dose} ${event.medication.unit} (Pospuesto)`,
          snoozeUntil
        );

        const snoozeTimeIso = snoozeUntil.toISOString();
        await DoseEventRepository.updateEventStatus(eventId, 'SNOOZED', { 
          snoozedUntil: snoozeTimeIso, 
          notificationId: newNotificationId || null 
        });
      }

      await get().fetchTodayEvents();
      await get().fetchCalendarEvents(dayjs().format('YYYY-MM'));
    } catch (error) {
      console.error('[Store] Error snoozing dose:', error);
    }
  },

  deleteMedication: async (medicationId) => {
    set({ isLoading: true });
    try {
      const nowIso = new Date().toISOString();
      
      const futureNotifIds = await DoseEventRepository.getFutureNotificationIds(medicationId, nowIso);
      for (const notifId of futureNotifIds) {
        AlarmService.cancelAlarm(notifId);
      }

      await MedicationRepository.softDelete(medicationId, nowIso);

      await get().fetchMedications();
      await get().fetchTodayEvents();
      await get().fetchCalendarEvents(dayjs().format('YYYY-MM'));
    } catch (error) {
      console.error('[Store] Error deleting medication:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  setThemePreference: async (theme) => {
    try {
      await AsyncStorage.setItem('@theme_preference', theme);
      set({ themePreference: theme });
    } catch (error) {
      console.error('[Store] Failed to save theme preference:', error);
    }
  },

  setActiveAlarmEvent: (event) => set({ activeAlarmEvent: event }),

  loadActiveAlarmEvent: async (eventId) => {
    try {
      const event = await DoseEventRepository.getEventById(eventId);
      if (event) {
        set({ activeAlarmEvent: event });
      }
    } catch (error) {
      console.error('[Store] Error loading active alarm event:', error);
    }
  },

  updateTreatmentStartTime: async (medicationId, newStartTime) => {
    set({ isLoading: true });
    try {
      const nowIso = new Date().toISOString();

      const futureNotifIds = await DoseEventRepository.getFutureNotificationIds(medicationId, nowIso);
      for (const notifId of futureNotifIds) {
        AlarmService.cancelAlarm(notifId);
      }

      await DoseEventRepository.deleteFutureEvents(medicationId, nowIso);
      await TreatmentRepository.updateStartTime(medicationId, newStartTime);

      const t = await TreatmentRepository.getByMedicationId(medicationId);
      if (t) {
        const todayStart = dayjs().startOf('day').toISOString();
        const todayEnd = dayjs().endOf('day').toISOString();
        const hasTodayDone = await DoseEventRepository.hasCompletedEventInWindow(t.id, todayStart, todayEnd);

        const effectiveStartDate = hasTodayDone
          ? dayjs().add(1, 'day').format('YYYY-MM-DD')
          : t.startDate;

        const db = await getDBConnection();
        await SchedulerService.generateEventsForTreatment(db, {
          ...t,
          startDate: effectiveStartDate,
          startTime: newStartTime,
        });
      }

      await get().fetchMedications();
      await get().fetchTodayEvents();
      await get().fetchCalendarEvents(dayjs().format('YYYY-MM'));
    } catch (error) {
      console.error('[Store] Error updating start time:', error);
    } finally {
      set({ isLoading: false });
    }
  },
}));
