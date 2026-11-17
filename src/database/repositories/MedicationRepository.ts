import dayjs from 'dayjs';
import uuid from 'react-native-uuid';
import { getDBConnection } from '../sqlite';
import { Medication, MedicationStatus, CreateMedicationDTO } from '../../models';

export class MedicationRepository {
  /**
   * Retrieves all medications joined with their treatment to determine their current status.
   */
  static async getAllWithActiveStatus(): Promise<Medication[]> {
    const db = await getDBConnection();
    const query = `
      SELECT m.*, t.active as treatActive, t.endDate as treatEndDate, t.isIndefinite, t.startTime as treatStartTime
      FROM Medication m
      LEFT JOIN Treatment t ON t.medicationId = m.id
      GROUP BY m.id
      ORDER BY m.name ASC;
    `;
    const [result] = await db.executeSql(query);
    const todayStr = dayjs().format('YYYY-MM-DD');
    const medications: Medication[] = [];

    for (let i = 0; i < result.rows.length; i++) {
      const item = result.rows.item(i);
      let treatmentStatus: MedicationStatus = 'active';

      if (item.treatActive === 0) {
        treatmentStatus = 'inactive';
      } else if (!item.isIndefinite && item.treatEndDate && item.treatEndDate <= todayStr) {
        treatmentStatus = 'finished';
      }

      medications.push({
        id: item.id,
        name: item.name,
        dose: item.dose,
        unit: item.unit,
        color: item.color,
        notes: item.notes,
        foodInstruction: item.foodInstruction,
        createdAt: item.createdAt,
        treatmentStatus,
        startTime: item.treatStartTime || '08:00',
      });
    }

    return medications;
  }

  /**
   * Creates a medication and its associated treatment in a single SQLite transaction.
   */
  static async createWithTreatment(dto: CreateMedicationDTO): Promise<{ medicationId: string; treatmentId: string }> {
    const db = await getDBConnection();
    const medicationId = uuid.v4() as string;
    const treatmentId = uuid.v4() as string;
    const nowIso = new Date().toISOString();

    await db.transaction((tx) => {
      // 1. Insert Medication
      tx.executeSql(
        `INSERT INTO Medication (id, name, dose, unit, color, notes, foodInstruction, createdAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          medicationId,
          dto.name,
          dto.dose,
          dto.unit,
          dto.color,
          dto.notes || null,
          dto.foodInstruction || null,
          nowIso,
        ]
      );

      // 2. Insert Treatment
      tx.executeSql(
        `INSERT INTO Treatment (id, medicationId, frequencyType, intervalHours, timesPerDay, daysOfWeek, startDate, startTime, endDate, isIndefinite, active, createdAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          treatmentId,
          medicationId,
          dto.frequencyType,
          dto.intervalHours || null,
          1, // timesPerDay
          dto.daysOfWeek ? dto.daysOfWeek.join(',') : null,
          dto.startDate,
          dto.startTime,
          dto.endDate || null,
          dto.isIndefinite ? 1 : 0,
          1, // active
          nowIso,
        ]
      );
    });

    return { medicationId, treatmentId };
  }

  /**
   * Soft deletes a medication by inactivating its treatment and deleting all its future dose events.
   * Note: The store is responsible for canceling the active alarms beforehand.
   */
  static async softDelete(medicationId: string, fromIsoString: string): Promise<void> {
    const db = await getDBConnection();

    await db.executeSql(
      `
      DELETE FROM DoseEvent 
      WHERE scheduledAt > ?
        AND treatmentId IN (SELECT id FROM Treatment WHERE medicationId = ?);
    `,
      [fromIsoString, medicationId]
    );

    await db.executeSql(
      `
      UPDATE Treatment 
      SET active = 0 
      WHERE medicationId = ?;
    `,
      [medicationId]
    );
  }
}
