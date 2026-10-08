export type DriverName = 'Já' | 'Tade' | 'Fany';
export type PassengerName = 'Hanes' | 'Vorel' | string;
export type ShiftName = 'Ranní' | 'Odpolední' | 'Noční' | 'Sobota 12 h';

export type DriveRecord = {
  id: number;
  date: string;
  shift: ShiftName;
  planned_driver: DriverName;
  actual_driver: DriverName;
  created_at: string;
};

export type PassengerEntry = {
  id: number;
  date: string;
  shift: ShiftName;
  passenger_name: string;
  fraction: number;
  amount: number;
  is_guest: number;
  is_retro: number;
  is_cancelled: number;
  cancelled_at: string | null;
  created_at: string;
};
