export type DoseStatus = 'PENDING' | 'TAKEN' | 'MISSED' | 'SKIPPED' | 'SNOOZED';

export type FrequencyType = 'daily' | 'interval' | 'specific_days' | 'alternate_days';

export type MedicationStatus = 'active' | 'finished' | 'inactive';

export interface Medication {
  id: string;
  name: string;
  dose: string;
  unit: string;
  color: string;
  notes?: string;
  foodInstruction?: 'fasting' | 'with_food' | 'none';
  createdAt: string;
  // Derived from associated Treatment(s)
  treatmentStatus?: MedicationStatus;
  startTime?: string;  // Derived from Treatment for editing purposes
}

export interface Treatment {
  id: string;
  medicationId: string;
  frequencyType: FrequencyType;
  intervalHours?: number; // e.g., every 8 hours
  timesPerDay?: number;    // e.g., 3 times a day
  daysOfWeek?: string;     // comma-separated day numbers (e.g., '1,4' for Mon, Thu)
  startDate: string;       // ISO Date string YYYY-MM-DD
  startTime: string;       // HH:mm format for the start of the daily cycle
  endDate?: string;        // ISO Date string YYYY-MM-DD (optional)
  isIndefinite: boolean;   // if true, has no end date
  active: boolean;         // treatment is active/running
  createdAt: string;
}

export interface TreatmentSchedule {
  id: string;
  treatmentId: string;
  hour: number;            // 0 - 23
  minute: number;          // 0 - 59
}

export interface DoseEvent {
  id: string;
  treatmentId: string;
  scheduledAt: string;     // ISO datetime string
  takenAt?: string;        // ISO datetime string (when confirmed)
  status: DoseStatus;
  snoozedUntil?: string;   // ISO datetime string
  notificationId?: string; // Notifee scheduled trigger notification ID
  createdAt: string;
}

export interface DoseEventWithMedication extends DoseEvent {
  medication: Medication;
  treatment: Treatment;
}

export * from './dto';
