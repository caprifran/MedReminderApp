import { getDBConnection } from '../sqlite';
import { DoseEventWithMedication, DoseStatus, FrequencyType } from '../../models';

export interface RawDoseEventJoinedRow {
  id: string;
  treatmentId: string;
  scheduledAt: string;
  takenAt: string | null;
  status: DoseStatus;
  snoozedUntil: string | null;
  notificationId: string | null;
  createdAt: string;
  medicationId: string;
  medName: string;
  medDose: string;
  medUnit: string;
  medColor: string;
  medNotes: string | null;
  medFoodInstruction: 'fasting' | 'with_food' | 'none' | null;
  medCreatedAt: string;
  frequencyType: FrequencyType;
  intervalHours: number | null;
  timesPerDay: number | null;
  daysOfWeek: string | null;
  startDate: string;
  startTime: string;
  endDate: string | null;
  isIndefinite: number;
  active: number;
  treatCreatedAt: string;
}

export class DoseEventRepository {
  /**
   * Helper function to map a row to a DoseEventWithMedication object.
   */
  private static mapRowToEventWithMedication(item: RawDoseEventJoinedRow): DoseEventWithMedication {
    return {
      id: item.id,
      treatmentId: item.treatmentId,
      scheduledAt: item.scheduledAt,
      takenAt: item.takenAt,
      status: item.status,
      snoozedUntil: item.snoozedUntil,
      notificationId: item.notificationId,
      createdAt: item.createdAt,
      medication: {
        id: item.medicationId,
        name: item.medName,
        dose: item.medDose,
        unit: item.medUnit,
        color: item.medColor,
        notes: item.medNotes,
        foodInstruction: item.medFoodInstruction,
        createdAt: item.medCreatedAt,
      },
      treatment: {
        id: item.treatmentId,
        medicationId: item.medicationId,
        frequencyType: item.frequencyType,
        intervalHours: item.intervalHours,
        timesPerDay: item.timesPerDay,
        daysOfWeek: item.daysOfWeek,
        startDate: item.startDate,
        startTime: item.startTime,
        endDate: item.endDate,
        isIndefinite: item.isIndefinite === 1,
        active: item.active === 1,
        createdAt: item.treatCreatedAt,
      },
    };
  }

  /**
   * Retrieves events scheduled between a start and end date.
   * Also optionally includes all pending past events.
   */
  static async getEventsBetween(
    startDateIso: string,
    endDateIso: string,
    includePastPending: boolean = false
  ): Promise<DoseEventWithMedication[]> {
    const db = await getDBConnection();
    
    let query = `
      SELECT de.*, 
             m.name as medName, m.dose as medDose, m.unit as medUnit, m.color as medColor, m.notes as medNotes, m.foodInstruction as medFoodInstruction, m.createdAt as medCreatedAt,
             t.frequencyType, t.intervalHours, t.timesPerDay, t.daysOfWeek, t.startDate, t.startTime, t.endDate, t.isIndefinite, t.active, t.createdAt as treatCreatedAt
      FROM DoseEvent de
      JOIN Treatment t ON de.treatmentId = t.id
      JOIN Medication m ON t.medicationId = m.id
      WHERE de.scheduledAt BETWEEN ? AND ?
    `;

    const queryParams: (string | number)[] = [startDateIso, endDateIso];

    if (includePastPending) {
      query += ` OR (de.status = 'PENDING' AND de.scheduledAt < ?)`;
      queryParams.push(startDateIso);
    }

    query += ` ORDER BY de.scheduledAt ASC;`;

    const [result] = await db.executeSql(query, queryParams);
    
    const events: DoseEventWithMedication[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      events.push(this.mapRowToEventWithMedication(result.rows.item(i)));
    }
    return events;
  }

  /**
   * Retrieves a single event by ID along with its medication data.
   */
  static async getEventById(eventId: string): Promise<DoseEventWithMedication | null> {
    const db = await getDBConnection();
    const query = `
      SELECT de.*, 
             m.name as medName, m.dose as medDose, m.unit as medUnit, m.color as medColor, m.notes as medNotes, m.foodInstruction as medFoodInstruction, m.createdAt as medCreatedAt,
             t.frequencyType, t.intervalHours, t.timesPerDay, t.daysOfWeek, t.startDate, t.startTime, t.endDate, t.isIndefinite, t.active, t.createdAt as treatCreatedAt
      FROM DoseEvent de
      JOIN Treatment t ON de.treatmentId = t.id
      JOIN Medication m ON t.medicationId = m.id
      WHERE de.id = ?;
    `;
    const [result] = await db.executeSql(query, [eventId]);
    if (result.rows.length === 0) return null;
    return this.mapRowToEventWithMedication(result.rows.item(0));
  }

  /**
   * Updates an event's status. Handles taking, skipping, and snoozing.
   */
  static async updateEventStatus(
    eventId: string,
    status: DoseStatus,
    updates?: {
      takenAt?: string;
      snoozedUntil?: string | null;
      notificationId?: string | null;
    }
  ): Promise<void> {
    const db = await getDBConnection();
    
    let query = `UPDATE DoseEvent SET status = ?`;
    const params: (string | number | null)[] = [status];

    if (updates?.takenAt !== undefined) {
      query += `, takenAt = ?`;
      params.push(updates.takenAt);
    }
    
    if (updates?.snoozedUntil !== undefined) {
      query += `, snoozedUntil = ?`;
      params.push(updates.snoozedUntil);
    }

    if (updates?.notificationId !== undefined) {
      query += `, notificationId = ?`;
      params.push(updates.notificationId);
    }

    query += ` WHERE id = ?;`;
    params.push(eventId);

    await db.executeSql(query, params);
  }

  /**
   * Deletes all future pending events for a specific medication (used when updating start time).
   */
  static async deleteFutureEvents(medicationId: string, fromDateIso: string): Promise<void> {
    const db = await getDBConnection();
    await db.executeSql(
      `
      DELETE FROM DoseEvent 
      WHERE scheduledAt > ?
        AND treatmentId IN (SELECT id FROM Treatment WHERE medicationId = ?);
      `,
      [fromDateIso, medicationId]
    );
  }

  /**
   * Retrieves all future notification IDs for a specific medication to allow cancelling alarms.
   */
  static async getFutureNotificationIds(medicationId: string, fromDateIso: string): Promise<string[]> {
    const db = await getDBConnection();
    const query = `
      SELECT de.notificationId 
      FROM DoseEvent de
      JOIN Treatment t ON de.treatmentId = t.id
      WHERE t.medicationId = ? AND de.notificationId IS NOT NULL AND de.scheduledAt > ?;
    `;
    const [result] = await db.executeSql(query, [medicationId, fromDateIso]);
    
    const ids: string[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const id = result.rows.item(i).notificationId;
      if (id) ids.push(id);
    }
    return ids;
  }

  /**
   * Checks if a dose event has been completed (TAKEN or SKIPPED) for a given treatment within a time window.
   */
  static async hasCompletedEventInWindow(
    treatmentId: string,
    startDateIso: string,
    endDateIso: string
  ): Promise<boolean> {
    const db = await getDBConnection();
    const [result] = await db.executeSql(
      `
      SELECT id FROM DoseEvent 
      WHERE treatmentId = ? 
        AND scheduledAt >= ? AND scheduledAt <= ?
        AND status IN ('TAKEN', 'SKIPPED')
      LIMIT 1;
      `,
      [treatmentId, startDateIso, endDateIso]
    );
    return result.rows.length > 0;
  }
}
