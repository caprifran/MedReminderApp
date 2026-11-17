import { getDBConnection } from '../sqlite';
import { Treatment } from '../../models';

export class TreatmentRepository {
  /**
   * Retrieves a treatment by its associated medication ID.
   */
  static async getByMedicationId(medicationId: string): Promise<Treatment | null> {
    const db = await getDBConnection();
    const query = `SELECT * FROM Treatment WHERE medicationId = ? LIMIT 1;`;
    const [result] = await db.executeSql(query, [medicationId]);

    if (result.rows.length === 0) return null;

    const item = result.rows.item(0);
    return {
      id: item.id,
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
      createdAt: item.createdAt,
    };
  }

  /**
   * Updates the start time of a treatment.
   */
  static async updateStartTime(medicationId: string, newStartTime: string): Promise<void> {
    const db = await getDBConnection();
    await db.executeSql(
      `UPDATE Treatment SET startTime = ? WHERE medicationId = ?;`,
      [newStartTime, medicationId]
    );
  }
}
