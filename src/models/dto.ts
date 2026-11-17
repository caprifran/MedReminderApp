import { FrequencyType } from './index';

export interface CreateMedicationDTO {
  name: string;
  dose: string;
  unit: string;
  color: string;
  notes?: string;
  foodInstruction?: 'fasting' | 'with_food' | 'none';
  frequencyType: FrequencyType;
  intervalHours?: number | null;
  daysOfWeek?: number[] | null;
  startDate: string;
  startTime: string;
  endDate?: string | null;
  isIndefinite: boolean;
}
