import SQLite from 'react-native-sqlite-storage';
import dayjs from 'dayjs';
import uuid from 'react-native-uuid';
import { Medication, Treatment, TreatmentSchedule, DoseEvent } from '../models';
import { AlarmService } from '../services/AlarmService';

export class SchedulerService {
  /**
   * Generates upcoming dose events for active treatments for the next 7 days.
   * Runs on startup and after creating or editing a treatment.
   */
  static async generateEventsForRollingWindow(db: SQLite.SQLiteDatabase) {
    console.log('[Scheduler] Running rolling window generator...');
    const now = dayjs();
    const windowStart = now.startOf('day');
    const windowEnd = now.add(7, 'day').endOf('day');

    try {
      // 1. Get all active treatments
      const [treatmentsResult] = await db.executeSql(
        'SELECT * FROM Treatment WHERE active = 1;'
      );
      const treatments: Treatment[] = [];
      for (let i = 0; i < treatmentsResult.rows.length; i++) {
        const item = treatmentsResult.rows.item(i);
        treatments.push({
          ...item,
          isIndefinite: item.isIndefinite === 1,
          active: item.active === 1,
        });
      }

      for (const treatment of treatments) {
        // 2. Fetch Medication info
        const [medResult] = await db.executeSql(
          'SELECT * FROM Medication WHERE id = ?;',
          [treatment.medicationId]
        );
        if (medResult.rows.length === 0) continue;
        const medication: Medication = medResult.rows.item(0);

        // 3. We no longer use TreatmentSchedule table. We use treatment.startTime directly.
        // 4. Fetch already existing events in this window to prevent duplicates
        const [existingEventsResult] = await db.executeSql(
          'SELECT scheduledAt FROM DoseEvent WHERE treatmentId = ? AND scheduledAt >= ?;',
          [treatment.id, windowStart.toISOString()]
        );
        const existingDates = new Set<string>();
        for (let i = 0; i < existingEventsResult.rows.length; i++) {
          existingDates.add(existingEventsResult.rows.item(i).scheduledAt);
        }

        // 5. Generate target times depending on frequencyType
        const targetDatetimes: dayjs.Dayjs[] = [];
        const startDay = dayjs(treatment.startDate).startOf('day');
        const endDay = treatment.endDate ? dayjs(treatment.endDate).endOf('day') : null;

        const [startHourStr, startMinuteStr] = (treatment.startTime || '08:00').split(':');
        const startHour = parseInt(startHourStr, 10);
        const startMinute = parseInt(startMinuteStr, 10);

        if (treatment.frequencyType === 'interval' && treatment.intervalHours) {
          // Handled separately: strictly continuous interval since startDate + startTime
          const firstDoseTime = startDay.hour(startHour).minute(startMinute).second(0).millisecond(0);
          
          let nextDoseTime = firstDoseTime.clone();
          // Advance until it enters our window (or is after now)
          while (nextDoseTime.isBefore(now)) {
            nextDoseTime = nextDoseTime.add(treatment.intervalHours, 'hour');
          }

          // Generate doses within our window
          while (nextDoseTime.isBefore(windowEnd) || nextDoseTime.isSame(windowEnd)) {
            if (!endDay || nextDoseTime.isBefore(endDay) || nextDoseTime.isSame(endDay)) {
              targetDatetimes.push(nextDoseTime.clone());
            }
            nextDoseTime = nextDoseTime.add(treatment.intervalHours, 'hour');
          }
        } else {
          // Loop day-by-day in the 7-day window
          let currentDay = windowStart.clone();
          while (currentDay.isBefore(windowEnd) || currentDay.isSame(windowEnd, 'day')) {
            // Check if treatment is active during this day
            if (currentDay.isBefore(startDay, 'day')) {
              currentDay = currentDay.add(1, 'day');
              continue;
            }
            if (endDay && currentDay.isAfter(endDay, 'day')) {
              currentDay = currentDay.add(1, 'day');
              continue;
            }

            let shouldScheduleOnDay = false;

            switch (treatment.frequencyType) {
              case 'daily':
                shouldScheduleOnDay = true;
                break;

              case 'specific_days':
                if (treatment.daysOfWeek) {
                  // daysOfWeek is e.g. "1,4" where 0=Sunday, 1=Monday...
                  const dayNum = currentDay.day();
                  const activeDays = treatment.daysOfWeek.split(',').map(Number);
                  if (activeDays.includes(dayNum)) {
                    shouldScheduleOnDay = true;
                  }
                }
                break;

              case 'alternate_days':
                // Every 2 days since startDate
                const daysDiff = currentDay.diff(startDay, 'day');
                if (daysDiff >= 0 && daysDiff % 2 === 0) {
                  shouldScheduleOnDay = true;
                }
                break;
            }

            if (shouldScheduleOnDay) {
              let doseTime = currentDay.hour(startHour).minute(startMinute).second(0).millisecond(0);
              
              if (treatment.frequencyType === 'specific_days' && treatment.intervalHours && treatment.intervalHours > 0) {
                // Generate multiple doses on this specific day
                const timesOnDay = Math.floor(24 / treatment.intervalHours);
                for (let i = 0; i < timesOnDay; i++) {
                  if (doseTime.isAfter(now)) {
                    targetDatetimes.push(doseTime.clone());
                  }
                  doseTime = doseTime.add(treatment.intervalHours, 'hour');
                }
              } else {
                // Just once on this day
                if (doseTime.isAfter(now)) {
                  targetDatetimes.push(doseTime.clone());
                }
              }
            }

            currentDay = currentDay.add(1, 'day');
          }
        }

        // 6. Insert new events and schedule notifications
        for (const targetTime of targetDatetimes) {
          const isoString = targetTime.toISOString();
          
          // Skip if already generated
          if (existingDates.has(isoString)) {
            continue;
          }

          const eventId = uuid.v4() as string;
          const doseString = `${medication.dose} ${medication.unit}`;

          // Schedule native alarm with AlarmManager (exact, works in Doze mode)
          let notificationId = '';
          try {
            notificationId = await AlarmService.scheduleAlarm(
              eventId,
              medication.name,
              doseString,
              targetTime.toDate()
            );
          } catch (alarmError) {
            console.warn(`[Scheduler] Could not schedule alarm for event ${eventId}:`, alarmError);
          }

          // Save event in DB
          await db.executeSql(
            `INSERT INTO DoseEvent (id, treatmentId, scheduledAt, status, notificationId, createdAt)
             VALUES (?, ?, ?, ?, ?, ?);`,
            [
              eventId,
              treatment.id,
              isoString,
              'PENDING',
              notificationId || null,
              now.toISOString(),
            ]
          );
          
          console.log(`[Scheduler] Generated event ${eventId} for treatment ${treatment.id} scheduled at ${isoString}`);
        }
      }
      console.log('[Scheduler] Rolling window generation completed successfully.');
    } catch (error) {
      console.error('[Scheduler] Error during rolling window event generation:', error);
    }
  }

  /**
   * Reschedules all upcoming notifications (useful on system boot or app settings change)
   */
  static async rescheduleAllUpcomingNotifications(db: SQLite.SQLiteDatabase) {
    try {
      console.log('[Scheduler] Rescheduling all upcoming notifications...');
      // Cancel all scheduled alarms individually (AlarmManager has no 'cancel all' API)

      const nowIso = new Date().toISOString();
      const [eventsResult] = await db.executeSql(
        `SELECT de.*, m.name as medName, m.dose, m.unit 
         FROM DoseEvent de
         JOIN Treatment t ON de.treatmentId = t.id
         JOIN Medication m ON t.medicationId = m.id
         WHERE de.status = 'PENDING' AND de.scheduledAt > ?;`,
        [nowIso]
      );

      for (let i = 0; i < eventsResult.rows.length; i++) {
        const item = eventsResult.rows.item(i);
        const scheduledTime = new Date(item.scheduledAt);
        const doseString = `${item.dose} ${item.unit}`;

        let notificationId = '';
        try {
          // Cancel old alarm first (in case it's still scheduled)
          AlarmService.cancelAlarm(item.id);
          notificationId = await AlarmService.scheduleAlarm(
            item.id,
            item.medName,
            doseString,
            scheduledTime
          );
        } catch (alarmError) {
          console.warn(`[Scheduler] Could not reschedule alarm for event ${item.id}:`, alarmError);
        }

        // Update database with new notification ID
        await db.executeSql(
          'UPDATE DoseEvent SET notificationId = ? WHERE id = ?;',
          [notificationId || null, item.id]
        );
      }
      console.log('[Scheduler] Rescheduled all notifications successfully.');
    } catch (error) {
      console.error('[Scheduler] Error rescheduling notifications:', error);
    }
  }

  /**
   * Generates upcoming dose events for a single treatment within the next 7 days.
   * Used when updating a treatment's startTime.
   */
  static async generateEventsForTreatment(db: SQLite.SQLiteDatabase, treatment: Treatment) {
    const now = dayjs();
    const windowStart = now.startOf('day');
    const windowEnd = now.add(7, 'day').endOf('day');

    try {
      const [medResult] = await db.executeSql('SELECT * FROM Medication WHERE id = ?;', [treatment.medicationId]);
      if (medResult.rows.length === 0) return;
      const medication: Medication = medResult.rows.item(0);

      const existingDates = new Set<string>();
      const [existingEventsResult] = await db.executeSql(
        'SELECT scheduledAt FROM DoseEvent WHERE treatmentId = ? AND scheduledAt >= ?;',
        [treatment.id, windowStart.toISOString()]
      );
      for (let i = 0; i < existingEventsResult.rows.length; i++) {
        existingDates.add(existingEventsResult.rows.item(i).scheduledAt);
      }

      const targetDatetimes: dayjs.Dayjs[] = [];
      const startDay = dayjs(treatment.startDate).startOf('day');
      const endDay = treatment.endDate ? dayjs(treatment.endDate).endOf('day') : null;
      const [startHourStr, startMinuteStr] = (treatment.startTime || '08:00').split(':');
      const startHour = parseInt(startHourStr, 10);
      const startMinute = parseInt(startMinuteStr, 10);

      if (treatment.frequencyType === 'interval' && treatment.intervalHours) {
        const firstDoseTime = startDay.hour(startHour).minute(startMinute).second(0).millisecond(0);
        let nextDoseTime = firstDoseTime.clone();
        while (nextDoseTime.isBefore(now)) {
          nextDoseTime = nextDoseTime.add(treatment.intervalHours, 'hour');
        }
        while (nextDoseTime.isBefore(windowEnd) || nextDoseTime.isSame(windowEnd)) {
          if (!endDay || nextDoseTime.isBefore(endDay) || nextDoseTime.isSame(endDay)) {
            targetDatetimes.push(nextDoseTime.clone());
          }
          nextDoseTime = nextDoseTime.add(treatment.intervalHours, 'hour');
        }
      } else {
        let currentDay = windowStart.clone();
        while (currentDay.isBefore(windowEnd) || currentDay.isSame(windowEnd, 'day')) {
          if (currentDay.isBefore(startDay, 'day')) { currentDay = currentDay.add(1, 'day'); continue; }
          if (endDay && currentDay.isAfter(endDay, 'day')) { currentDay = currentDay.add(1, 'day'); continue; }

          let shouldSchedule = false;
          switch (treatment.frequencyType) {
            case 'daily': shouldSchedule = true; break;
            case 'specific_days':
              const daysArray = treatment.daysOfWeek ? (typeof treatment.daysOfWeek === 'string' ? treatment.daysOfWeek.split(',').map(Number) : treatment.daysOfWeek) : [];
              shouldSchedule = daysArray.includes(currentDay.day());
              break;
            case 'alternate_days':
              const diffDays = currentDay.diff(startDay, 'day');
              shouldSchedule = diffDays >= 0 && diffDays % 2 === 0;
              break;
          }

          if (shouldSchedule) {
            if (treatment.frequencyType === 'specific_days' && treatment.intervalHours) {
              let t = currentDay.hour(startHour).minute(startMinute).second(0).millisecond(0);
              while (t.isBefore(currentDay.endOf('day'))) {
                targetDatetimes.push(t.clone());
                t = t.add(treatment.intervalHours, 'hour');
              }
            } else {
              targetDatetimes.push(currentDay.hour(startHour).minute(startMinute).second(0).millisecond(0));
            }
          }
          currentDay = currentDay.add(1, 'day');
        }
      }

      for (const targetTime of targetDatetimes) {
        if (targetTime.isBefore(now)) continue;
        const isoStr = targetTime.toISOString();
        if (existingDates.has(isoStr)) continue;

        const eventId = uuid.v4() as string;
        let notificationId = '';
        try {
          notificationId = await AlarmService.scheduleAlarm(eventId, medication.name, `${medication.dose} ${medication.unit}`, targetTime.toDate());
        } catch (e) {
          console.warn('[Scheduler] Error scheduling alarm:', e);
        }

        await db.executeSql(
          `INSERT INTO DoseEvent (id, treatmentId, scheduledAt, status, notificationId, createdAt) VALUES (?, ?, ?, 'PENDING', ?, ?);`,
          [eventId, treatment.id, isoStr, notificationId || null, new Date().toISOString()]
        );
      }
      console.log(`[Scheduler] Generated ${targetDatetimes.length} events for treatment ${treatment.id}.`);
    } catch (error) {
      console.error('[Scheduler] Error generating events for treatment:', error);
    }
  }
}
