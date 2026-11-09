/**
 * Artha Payroll & Shift Engine: AGC Group 4-Regu 3-Shift (Siklus 28-Hari)
 * Terintegrasi penuh dengan logika matematis Kalkulator Kalender Shift AGC:
 * 
 * Fitur Utama:
 * 1. Logika Matematis Siklus 28-Hari (Base Date: 20 Desember 2025, Offset A:0, B:7, C:14, D:21)
 * 2. Determinasi Otomatis Auto O/T: Setiap Shift III (Sore) pada Hari Minggu = 8.25 Jam
 * 3. Manajemen Tanggal Merah Berlapis: Custom User > Sync API Online > Built-in SKB 3 Menteri & Libur Perusahaan (2025-2027+)
 * 4. Overtime Indexer Presisi (Kepmenakertrans / PP 35/2021)
 * 5. Kalkulasi Komponen Gaji Dinamis & Pajak TER PPh 21 DJP (PP 58/2023)
 */
import { 
  PTKPStatus, 
  TERCategory, 
  ShiftDayLog, 
  SalaryBreakdown, 
  DayType, 
  ShiftGroup,
  SalaryAddOn
} from '../types';

// =========================================================================
// 1. KONFIGURASI SIKLUS 28-HARI AGC (4 REGU 3 SHIFT)
// =========================================================================

// Base Date: 20 Desember 2025 (Sesuai Kalkulator Kalender Shift AGC 4 Regu 3 Shift)
export const BASE_DATE_UTC = Date.UTC(2025, 11, 20);

// Urutan 28-Hari Berulang untuk Grup A mulai 20 Desember 2025:
export const CYCLE_28_A: ('I' | 'II' | 'III' | 'O')[] = [
  'I', 'I', 'I', 'II', 'II', 'III', 'III', 'O', 'O', 'O',
  'I', 'I', 'II', 'II', 'III', 'III', 'III', 'O', 'O',
  'I', 'I', 'II', 'II', 'II', 'III', 'III', 'O', 'O'
];

// Selisih Hari (Offset) Antar Regu:
export const GROUP_OFFSETS: Record<ShiftGroup, number> = {
  'A': 0,
  'B': 7,
  'C': 14,
  'D': 21
};

export interface AGCShiftMetadata {
  code: 'I' | 'II' | 'III' | 'O';
  name: string;
  short: string;
  hours: string;
  isWork: boolean;
}

export const AGC_SHIFT_INFO: Record<'I' | 'II' | 'III' | 'O', AGCShiftMetadata> = {
  'I': {
    code: 'I',
    name: 'Shift 1 (Malam)',
    short: 'Malam',
    hours: '23:00 - 07:00',
    isWork: true
  },
  'II': {
    code: 'II',
    name: 'Shift 2 (Pagi)',
    short: 'Pagi',
    hours: '07:00 - 15:00',
    isWork: true
  },
  'III': {
    code: 'III',
    name: 'Shift 3 (Sore)',
    short: 'Sore',
    hours: '15:00 - 23:00',
    isWork: true
  },
  'O': {
    code: 'O',
    name: 'Off (Libur)',
    short: 'Off',
    hours: 'Libur (24 Jam)',
    isWork: false
  }
};

// =========================================================================
// 2. DATABASE TANGGAL MERAH NASIONAL & PERUSAHAAN (BUILT-IN, API & CUSTOM)
// =========================================================================

export const BUILTIN_HOLIDAYS: Record<string, string> = {
  // 2025
  '2025-01-01': 'Tahun Baru 2025 Masehi',
  '2025-01-27': "Isra Mi'raj Nabi Muhammad SAW",
  '2025-01-29': 'Tahun Baru Imlek 2576',
  '2025-03-29': 'Hari Suci Nyepi 1947',
  '2025-03-31': 'Hari Raya Idul Fitri 1446 H',
  '2025-04-01': 'Hari Raya Idul Fitri 1446 H',
  '2025-04-18': 'Wafat Yesus Kristus',
  '2025-04-20': 'Kebangkitan Yesus Kristus (Paskah)',
  '2025-05-01': 'Hari Buruh Internasional',
  '2025-05-12': 'Hari Raya Waisak 2569',
  '2025-05-29': 'Kenaikan Yesus Kristus',
  '2025-06-01': 'Hari Lahir Pancasila',
  '2025-06-06': 'Hari Raya Idul Adha 1446 H',
  '2025-06-27': 'Tahun Baru Islam 1447 H',
  '2025-08-17': 'Proklamasi Kemerdekaan RI',
  '2025-09-05': 'Maulid Nabi Muhammad SAW',
  '2025-12-25': 'Kelahiran Yesus Kristus (Natal)',
  '2025-12-29': 'Libur ASC Group B',
  '2025-12-31': 'Hari Libur ASC',

  // 2026 (Sesuai dokumen resmi AGC 2026)
  '2026-01-01': 'Tahun Baru 2026',
  '2026-01-16': "Isra Mi'raj Nabi Muhammad SAW",
  '2026-02-17': 'Tahun Baru Imlek 2577',
  '2026-03-19': 'Hari Suci Nyepi 1948',
  '2026-03-21': 'Idul Fitri 1447 H (Hari 1)',
  '2026-03-22': 'Idul Fitri 1447 H (Hari 2)',
  '2026-04-03': 'Wafat Yesus Kristus',
  '2026-04-05': 'Kebangkitan Yesus Kristus (Paskah)',
  '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Yesus Kristus',
  '2026-05-27': 'Idul Adha 1447 H',
  '2026-05-31': 'Hari Raya Waisak 2570',
  '2026-06-01': 'Hari Lahir Pancasila',
  '2026-06-16': 'Tahun Baru Islam 1448 H',
  '2026-08-17': 'Proklamasi Kemerdekaan RI',
  '2026-08-25': 'Maulid Nabi Muhammad SAW',
  '2026-12-25': 'Kelahiran Yesus Kristus',

  // 2027
  '2027-01-01': 'Tahun Baru 2027 Masehi',
  '2027-01-05': "Isra Mi'raj Nabi Muhammad SAW",
  '2027-02-06': 'Tahun Baru Imlek 2578',
  '2027-03-09': 'Hari Suci Nyepi 1949',
  '2027-03-10': 'Hari Raya Idul Fitri 1448 H',
  '2027-03-11': 'Hari Raya Idul Fitri 1448 H',
  '2027-03-26': 'Wafat Yesus Kristus',
  '2027-03-28': 'Kebangkitan Yesus Kristus (Paskah)',
  '2027-05-01': 'Hari Buruh Internasional',
  '2027-05-06': 'Kenaikan Yesus Kristus',
  '2027-05-17': 'Hari Raya Idul Adha 1448 H',
  '2027-05-20': 'Hari Raya Waisak 2571',
  '2027-06-01': 'Hari Lahir Pancasila',
  '2027-06-06': 'Tahun Baru Islam 1449 H',
  '2027-08-15': 'Maulid Nabi Muhammad SAW',
  '2027-08-17': 'Proklamasi Kemerdekaan RI',
  '2027-12-25': 'Hari Raya Natal'
};

const STORAGE_KEY_CUSTOM_HOLIDAYS = 'artha_agc_custom_holidays';
const STORAGE_KEY_SYNCED_HOLIDAYS = 'artha_agc_synced_holidays';

export function getStoredCustomHolidays(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_HOLIDAYS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca custom holidays:', e);
  }
  return {};
}

export function saveStoredCustomHolidays(holidays: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_HOLIDAYS, JSON.stringify(holidays));
  } catch (e) {
    console.error('Gagal menyimpan custom holidays:', e);
  }
}

export function getStoredSyncedHolidays(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYNCED_HOLIDAYS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca synced holidays:', e);
  }
  return {};
}

export function saveStoredSyncedHolidays(holidays: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY_SYNCED_HOLIDAYS, JSON.stringify(holidays));
  } catch (e) {
    console.error('Gagal menyimpan synced holidays:', e);
  }
}

/**
 * Menggabungkan seluruh sumber hari libur dengan prioritas:
 * Custom User > Synced API > Built-in Resmi
 */
export function getMergedHolidays(
  customOverride?: Record<string, string>,
  syncedOverride?: Record<string, string>
): Record<string, string> {
  const custom = customOverride ?? getStoredCustomHolidays();
  const synced = syncedOverride ?? getStoredSyncedHolidays();
  return {
    ...BUILTIN_HOLIDAYS,
    ...synced,
    ...custom
  };
}

export function getHolidayForDate(
  dateStr: string,
  mergedHolidays?: Record<string, string>
): string | undefined {
  const map = mergedHolidays ?? getMergedHolidays();
  return map[dateStr];
}

// =========================================================================
// 3. KOMPONEN DEFAULT SLIP GAJI
// =========================================================================
export const BASIC_SALARY = 9345000;
export const HOUSING_ALLOWANCE = 1350000;
export const SHIFT_ALLOWANCE = 1700000;
export const TOTAL_FIXED_ALLOWANCE = BASIC_SALARY + HOUSING_ALLOWANCE + SHIFT_ALLOWANCE;

export const BPJS_BASE = BASIC_SALARY + HOUSING_ALLOWANCE;
export const OVERTIME_BASE_RATE = BPJS_BASE / 173;

export const DEFAULT_MEAL_RATE = 9800;
export const HOUSING_DEDUCTION = 1050000;
export const DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3 = 8.25;

// Tunjangan Perusahaan (Natura / Company)
export const BPJS_JKK_CO_RATE = 0.0089;
export const BPJS_JKM_CO_RATE = 0.003;
export const BPJS_KES_CO_RATE = 0.04;

// Potongan Karyawan (Deduction / Employee)
export const BPJS_JHT_EMP_RATE = 0.02;
export const BPJS_JP_EMP_RATE = 0.01;
export const BPJS_KES_EMP_RATE = 0.01;

// =========================================================================
// 4. DETERMINASI SHIFT, TIPE HARI & AUTO OT
// =========================================================================

export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDayType(
  dateStr: string,
  shiftOrCode: string,
  holidaysMap?: Record<string, string>
): { 
  dayType: DayType; 
  isPublicHoliday: boolean; 
  holidayName?: string;
  isWorkDay: boolean;
} {
  const holidayName = getHolidayForDate(dateStr, holidaysMap);
  const isPublicHoliday = Boolean(holidayName);
  const normalized = shiftOrCode.trim().toLowerCase();
  const isShiftOff = normalized === 'o' || normalized === 'off' || normalized.includes('off');

  if (isShiftOff) {
    return {
      dayType: 'OFF_OR_HOLIDAY',
      isPublicHoliday,
      holidayName,
      isWorkDay: false
    };
  }

  if (isPublicHoliday) {
    return {
      dayType: 'OFF_OR_HOLIDAY',
      isPublicHoliday: true,
      holidayName,
      isWorkDay: true
    };
  }

  return {
    dayType: 'NORMAL_WORKDAY',
    isPublicHoliday: false,
    isWorkDay: true
  };
}

/**
 * Menentukan shift untuk grup A/B/C/D pada tanggal apapun dengan akurasi UTC 100%
 * sesuai algoritma Kalkulator Kalender Shift AGC 4 Regu 3 Shift.
 */
export function getShiftForDate(
  dateInput: string | Date,
  group: ShiftGroup = 'C',
  holidaysMap?: Record<string, string>
) {
  let d: Date;
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('-');
    d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  } else {
    d = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }

  const d1 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((d1 - BASE_DATE_UTC) / 86400000);
  const offset = GROUP_OFFSETS[group] ?? 14;
  const cycleIndex = (((diffDays + offset) % 28) + 28) % 28;
  const code = CYCLE_28_A[cycleIndex] || 'O';
  const info = AGC_SHIFT_INFO[code];
  const dateStr = formatDateISO(d);

  const { dayType, isPublicHoliday, holidayName, isWorkDay } = getDayType(dateStr, code, holidaysMap);

  // Aturan Auto O/T Resmi AGC:
  // Setiap Shift III (Sore) yang jatuh pada hari Minggu (dayOfWeek === 0) bernilai 8,25 jam Auto O/T.
  const isSunday = d.getDay() === 0;
  const hasAutoOT = isSunday && code === 'III';

  return {
    date: dateStr,
    group,
    code,
    cycleIndex,
    name: info.name,
    short: info.short,
    hours: info.hours,
    isWorkDay,
    dayType,
    isPublicHoliday,
    holidayName,
    hasAutoOT,
    autoOTHours: hasAutoOT ? DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3 : 0
  };
}

// =========================================================================
// 5. OVERTIME INDEXER (KEPMENAKERTRANS / PP 35/2021)
// =========================================================================

export function calculateOvertimeIndex(actualOtHours: number, dayType: DayType): number {
  if (actualOtHours <= 0) return 0;

  let totalIndex = 0;

  if (dayType === 'NORMAL_WORKDAY') {
    // Lembur Hari Kerja Biasa: 1 jam pertama x1.5, sisanya x2
    if (actualOtHours <= 1) {
      totalIndex = actualOtHours * 1.5;
    } else {
      totalIndex = 1.5 + ((actualOtHours - 1) * 2.0);
    }
  } else {
    // OFF_OR_HOLIDAY (Hari Libur Shift / Tanggal Merah)
    // 7 jam pertama x2
    const hours1to7 = Math.min(actualOtHours, 7);
    totalIndex += hours1to7 * 2.0;

    // Jam ke-8 x3
    if (actualOtHours > 7) {
      const hour8 = Math.min(actualOtHours - 7, 1);
      totalIndex += hour8 * 3.0;
    }

    // Jam ke-9 dan seterusnya x4
    if (actualOtHours > 8) {
      const hours9Plus = actualOtHours - 8;
      totalIndex += hours9Plus * 4.0;
    }
  }

  return Math.round(totalIndex * 100) / 100;
}

export function calculateDailyOvertimeAmount(
  actualOtHours: number, 
  dayType: DayType, 
  baseRate: number = OVERTIME_BASE_RATE
): { index: number; amount: number } {
  const index = calculateOvertimeIndex(actualOtHours, dayType);
  const amount = Math.round(index * baseRate);
  return { index, amount };
}

// =========================================================================
// 6. GENERATOR KALENDER PERIODE CUT-OFF (21 BULAN LALU - 20 BULAN INI)
// =========================================================================

export function generateShiftCalendar(
  selectedMonthIndex: number,
  selectedYear: number,
  group: ShiftGroup = 'C',
  holidaysMap?: Record<string, string>,
  autoOTPerSundayShift3: number = DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3,
  isAutoOTEnabled: boolean = true
): ShiftDayLog[] {
  const startDate = new Date(selectedYear, selectedMonthIndex - 1, 21);
  const endDate = new Date(selectedYear, selectedMonthIndex, 20);
  const mergedHolidays = holidaysMap ?? getMergedHolidays();

  const days: ShiftDayLog[] = [];
  const current = new Date(startDate);
  const dayNamesShort = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  while (current <= endDate) {
    const shiftInfo = getShiftForDate(current, group, mergedHolidays);
    const dayOfWeek = current.getDay();
    const hasAutoOT = isAutoOTEnabled && shiftInfo.hasAutoOT;
    const autoOTHours = hasAutoOT ? autoOTPerSundayShift3 : 0;

    days.push({
      date: shiftInfo.date,
      dayName: dayNamesShort[dayOfWeek],
      dayNumber: current.getDate(),
      isWorkDay: shiftInfo.isWorkDay,
      shiftType: shiftInfo.name,
      shiftCode: shiftInfo.code,
      shiftHours: shiftInfo.hours,
      dayType: shiftInfo.dayType,
      isPublicHoliday: shiftInfo.isPublicHoliday,
      holidayName: shiftInfo.holidayName,
      hasAutoOT,
      autoOTHours,
      overtimeHours: 0,
      overtimeIndex: 0,
      overtimeAmount: 0,
      meals: { breakfast: false, lunch: false, dinner: false },
      note: ''
    });

    current.setDate(current.getDate() + 1);
  }

  return days;
}

/**
 * Menyegarkan metadata hari libur, shift, dan Auto OT pada log kalender yang sudah tersimpan
 * tanpa menghapus jam lembur aktual, ceklis makan, atau catatan yang sudah diinput user.
 */
export function refreshShiftLogsMetadata(
  existingLogs: ShiftDayLog[],
  group: ShiftGroup = 'C',
  holidaysMap?: Record<string, string>,
  autoOTPerSundayShift3: number = DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3,
  isAutoOTEnabled: boolean = true,
  baseRate: number = OVERTIME_BASE_RATE
): ShiftDayLog[] {
  const mergedHolidays = holidaysMap ?? getMergedHolidays();

  return existingLogs.map(day => {
    const parts = day.date.split('-');
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const isSunday = dateObj.getDay() === 0;

    const shiftCode: 'I' | 'II' | 'III' | 'O' = day.shiftCode || (
      day.shiftType.includes('Shift 1') || day.shiftType.includes('Malam') ? 'I' :
      day.shiftType.includes('Shift 2') || day.shiftType.includes('Pagi') ? 'II' :
      day.shiftType.includes('Shift 3') || day.shiftType.includes('Sore') ? 'III' : 'O'
    );

    const { dayType, isPublicHoliday, holidayName, isWorkDay } = getDayType(day.date, shiftCode, mergedHolidays);
    const hasAutoOT = isAutoOTEnabled && isSunday && shiftCode === 'III';
    const autoOTHours = hasAutoOT ? autoOTPerSundayShift3 : 0;
    const { index, amount } = calculateDailyOvertimeAmount(day.overtimeHours || 0, dayType, baseRate);

    return {
      ...day,
      shiftCode,
      isWorkDay,
      dayType,
      isPublicHoliday,
      holidayName,
      hasAutoOT,
      autoOTHours,
      overtimeIndex: index,
      overtimeAmount: amount
    };
  });
}

// =========================================================================
// 7. AUTOMASI PAJAK TER (TARIF EFEKTIF RATA-RATA PPh 21 DJP PP 58/2023)
// =========================================================================

export function getTERCategory(ptkp: PTKPStatus): TERCategory {
  switch (ptkp) {
    case 'TK/0':
    case 'TK/1':
    case 'K/0':
      return 'A';
    case 'TK/2':
    case 'TK/3':
    case 'K/1':
    case 'K/2':
      return 'B';
    case 'K/3':
      return 'C';
    default:
      return 'A';
  }
}

interface TERBracket {
  max: number;
  rate: number;
}

const TER_TABLE_A: TERBracket[] = [
  { max: 5400000, rate: 0.0 }, { max: 5650000, rate: 0.25 }, { max: 5950000, rate: 0.5 },
  { max: 6300000, rate: 0.75 }, { max: 6750000, rate: 1.0 }, { max: 7500000, rate: 1.25 },
  { max: 8550000, rate: 1.5 }, { max: 9650000, rate: 1.75 }, { max: 10050000, rate: 2.0 },
  { max: 10350000, rate: 2.25 }, { max: 10700000, rate: 2.5 }, { max: 11050000, rate: 3.0 },
  { max: 11600000, rate: 3.5 }, { max: 12500000, rate: 4.0 }, { max: 13750000, rate: 5.0 },
  { max: 15100000, rate: 6.0 }, { max: 16950000, rate: 7.0 }, { max: 19750000, rate: 8.0 },
  { max: 24100000, rate: 9.0 }, { max: 26450000, rate: 10.0 }, { max: 28000000, rate: 11.0 },
  { max: 30050000, rate: 12.0 }, { max: 32400000, rate: 13.0 }, { max: 35400000, rate: 14.0 },
  { max: 39100000, rate: 15.0 }, { max: 43850000, rate: 16.0 }, { max: 47800000, rate: 17.0 },
  { max: 51400000, rate: 18.0 }, { max: 56300000, rate: 19.0 }, { max: 62200000, rate: 20.0 },
  { max: 68600000, rate: 21.0 }, { max: 77500000, rate: 22.0 }, { max: 89000000, rate: 23.0 },
  { max: 101900000, rate: 24.0 }, { max: 120000000, rate: 25.0 }, { max: 150000000, rate: 26.0 },
  { max: 200000000, rate: 27.0 }, { max: 250000000, rate: 28.0 }, { max: 300000000, rate: 29.0 },
  { max: 400000000, rate: 30.0 }, { max: 500000000, rate: 31.0 }, { max: 750000000, rate: 32.0 },
  { max: 1000000000, rate: 33.0 }, { max: 1400000000, rate: 34.0 }, { max: Infinity, rate: 35.0 }
];

const TER_TABLE_B: TERBracket[] = [
  { max: 6200000, rate: 0.0 }, { max: 6500000, rate: 0.25 }, { max: 6850000, rate: 0.5 },
  { max: 7300000, rate: 0.75 }, { max: 9200000, rate: 1.0 }, { max: 10750000, rate: 1.5 },
  { max: 11250000, rate: 2.0 }, { max: 11600000, rate: 2.5 }, { max: 12600000, rate: 3.0 },
  { max: 13600000, rate: 4.0 }, { max: 14950000, rate: 5.0 }, { max: 16400000, rate: 6.0 },
  { max: 18450000, rate: 7.0 }, { max: 21850000, rate: 8.0 }, { max: 26000000, rate: 9.0 },
  { max: 27700000, rate: 10.0 }, { max: 29350000, rate: 11.0 }, { max: 31450000, rate: 12.0 },
  { max: 33950000, rate: 13.0 }, { max: 37100000, rate: 14.0 }, { max: 41100000, rate: 15.0 },
  { max: 45800000, rate: 16.0 }, { max: 49500000, rate: 17.0 }, { max: 53800000, rate: 18.0 },
  { max: 58500000, rate: 19.0 }, { max: 64000000, rate: 20.0 }, { max: 71000000, rate: 21.0 },
  { max: 80000000, rate: 22.0 }, { max: 93000000, rate: 23.0 }, { max: 107000000, rate: 24.0 },
  { max: 126000000, rate: 25.0 }, { max: 158000000, rate: 26.0 }, { max: 211000000, rate: 27.0 },
  { max: 263000000, rate: 28.0 }, { max: 316000000, rate: 29.0 }, { max: 421000000, rate: 30.0 },
  { max: 526000000, rate: 31.0 }, { max: 789000000, rate: 32.0 }, { max: 1052000000, rate: 33.0 },
  { max: 1474000000, rate: 34.0 }, { max: Infinity, rate: 35.0 }
];

const TER_TABLE_C: TERBracket[] = [
  { max: 6600000, rate: 0.0 }, { max: 6950000, rate: 0.25 }, { max: 7350000, rate: 0.5 },
  { max: 7800000, rate: 0.75 }, { max: 8850000, rate: 1.0 }, { max: 9800000, rate: 1.25 },
  { max: 10950000, rate: 1.5 }, { max: 11200000, rate: 1.75 }, { max: 12050000, rate: 2.0 },
  { max: 12950000, rate: 3.0 }, { max: 14150000, rate: 4.0 }, { max: 15550000, rate: 5.0 },
  { max: 17050000, rate: 6.0 }, { max: 19500000, rate: 7.0 }, { max: 22700000, rate: 8.0 },
  { max: 26600000, rate: 9.0 }, { max: 28100000, rate: 10.0 }, { max: 30100000, rate: 11.0 },
  { max: 32600000, rate: 12.0 }, { max: 35400000, rate: 13.0 }, { max: 38900000, rate: 14.0 },
  { max: 43000000, rate: 15.0 }, { max: 47400000, rate: 16.0 }, { max: 51200000, rate: 17.0 },
  { max: 55800000, rate: 18.0 }, { max: 60800000, rate: 19.0 }, { max: 66700000, rate: 20.0 },
  { max: 74200000, rate: 21.0 }, { max: 83200000, rate: 22.0 }, { max: 95600000, rate: 23.0 },
  { max: 110000000, rate: 24.0 }, { max: 134000000, rate: 25.0 }, { max: 169000000, rate: 26.0 },
  { max: 224000000, rate: 27.0 }, { max: 280000000, rate: 28.0 }, { max: 336000000, rate: 29.0 },
  { max: 448000000, rate: 30.0 }, { max: 560000000, rate: 31.0 }, { max: 841000000, rate: 32.0 },
  { max: 1121000000, rate: 33.0 }, { max: 1570000000, rate: 34.0 }, { max: Infinity, rate: 35.0 }
];

export function calculateTER(grossIncome: number, ptkp: PTKPStatus): { category: TERCategory; rate: number; taxAmount: number } {
  const category = getTERCategory(ptkp);
  let table: TERBracket[] = TER_TABLE_A;
  if (category === 'B') table = TER_TABLE_B;
  if (category === 'C') table = TER_TABLE_C;

  let appliedRate = 0;
  for (const bracket of table) {
    if (grossIncome <= bracket.max) {
      appliedRate = bracket.rate;
      break;
    }
  }

  const taxAmount = Math.round(grossIncome * (appliedRate / 100));
  return { category, rate: appliedRate, taxAmount };
}

// =========================================================================
// 8. PENYESUAIAN HARI KERJA UNTUK TANGGAL GAJIAN (TANGGAL 28)
// =========================================================================

export function calculatePayday(year: number, monthIndex: number): { 
  originalDate: string; 
  paydayDate: string; 
  isAdjusted: boolean 
} {
  const d = new Date(year, monthIndex, 28);
  const originalDateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-28`;
  const dayOfWeek = d.getDay();

  let adjusted = false;
  if (dayOfWeek === 6) {
    d.setDate(27);
    adjusted = true;
  } else if (dayOfWeek === 0) {
    d.setDate(26);
    adjusted = true;
  }

  return {
    originalDate: originalDateStr,
    paydayDate: formatDateISO(d),
    isAdjusted: adjusted
  };
}

// =========================================================================
// 9. KALKULASI UTAMA SLIP GAJI
// =========================================================================

export interface SalaryCalculationCustomOverrides {
  basicSalary?: number;
  housingAllowance?: number;
  shiftAllowance?: number;
  housingDeduction?: number;
}

export function calculateSalaryBreakdown(
  shiftLogs: ShiftDayLog[],
  ptkpStatus: PTKPStatus = 'TK/0',
  mealRate: number = DEFAULT_MEAL_RATE,
  year: number = new Date().getFullYear(),
  monthIndex: number = new Date().getMonth(),
  manualAutoOTHours?: number,
  addOns?: SalaryAddOn[],
  medicalBik: number = 0,
  customOverrides?: SalaryCalculationCustomOverrides
): SalaryBreakdown {
  const basicSalary = customOverrides?.basicSalary ?? BASIC_SALARY;
  const housingAllowance = customOverrides?.housingAllowance ?? HOUSING_ALLOWANCE;
  const shiftAllowance = customOverrides?.shiftAllowance ?? SHIFT_ALLOWANCE;
  const housingDeduction = customOverrides?.housingDeduction ?? HOUSING_DEDUCTION;

  const totalAllowance = basicSalary + housingAllowance + shiftAllowance;
  const bpjsBase = basicSalary + housingAllowance;
  const otBaseRatePerHour = bpjsBase / 173;

  // Hitung Auto OT dari hari-hari yang memiliki flag hasAutoOT (Minggu Shift III)
  const autoOTHours = manualAutoOTHours !== undefined 
    ? manualAutoOTHours 
    : shiftLogs.reduce((sum, day) => sum + (day.hasAutoOT ? (day.autoOTHours || DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3) : 0), 0);

  const autoOTIndex = calculateOvertimeIndex(autoOTHours, 'NORMAL_WORKDAY');
  const autoOTAmount = Math.round(autoOTIndex * otBaseRatePerHour);

  let actualWorkDayOTHours = 0;
  let actualOffDayOTHours = 0;
  let actualOTAmount = 0;
  let actualOTIndex = 0;
  let totalMealCount = 0;

  shiftLogs.forEach(day => {
    if (day.meals.breakfast) totalMealCount++;
    if (day.meals.lunch) totalMealCount++;
    if (day.meals.dinner) totalMealCount++;

    if (day.overtimeHours > 0) {
      if (day.dayType === 'NORMAL_WORKDAY') actualWorkDayOTHours += day.overtimeHours;
      else actualOffDayOTHours += day.overtimeHours;

      const { index, amount } = calculateDailyOvertimeAmount(day.overtimeHours, day.dayType, otBaseRatePerHour);
      actualOTIndex += index;
      actualOTAmount += amount;
    }
  });

  const actualAdditionalOTHours = Math.round((actualWorkDayOTHours + actualOffDayOTHours) * 100) / 100;
  const totalOTHours = Math.round((autoOTHours + actualAdditionalOTHours) * 100) / 100;
  const totalOTIndex = Math.round((autoOTIndex + actualOTIndex) * 100) / 100;
  const totalOTAmount = autoOTAmount + actualOTAmount;

  const activeAddOns = (addOns || []).filter(item => item.isEnabled !== false);
  const totalAddOns = activeAddOns.reduce((sum, item) => sum + (item.amount || 0), 0);

  const bpjsJkkCo = Math.round(bpjsBase * BPJS_JKK_CO_RATE);
  const bpjsJkmCo = Math.round(bpjsBase * BPJS_JKM_CO_RATE);
  const bpjsKesCo = Math.round(bpjsBase * BPJS_KES_CO_RATE);
  const totalBpjsCo = bpjsJkkCo + bpjsJkmCo + bpjsKesCo;

  const grossIncome = totalAllowance + totalOTAmount + totalAddOns + totalBpjsCo + medicalBik;

  const bpjsJhtEmp = Math.round(bpjsBase * BPJS_JHT_EMP_RATE);
  const bpjsJpEmp = Math.round(bpjsBase * BPJS_JP_EMP_RATE);
  const bpjsKesEmp = Math.round(bpjsBase * BPJS_KES_EMP_RATE);
  const totalBpjsEmp = bpjsJhtEmp + bpjsJpEmp + bpjsKesEmp;

  const totalMealDeduction = totalMealCount * mealRate;
  const { category: terCategory, rate: terRate, taxAmount: terTaxAmount } = calculateTER(grossIncome, ptkpStatus);

  const cashIncome = totalAllowance + totalOTAmount + totalAddOns;
  const cashDeductions = totalBpjsEmp + housingDeduction + totalMealDeduction;
  const totalDeductions = cashDeductions + terTaxAmount;
  const netSalary = Math.max(0, cashIncome - totalDeductions);

  const paydayInfo = calculatePayday(year, monthIndex);

  return {
    basicSalary,
    housingAllowance,
    shiftAllowance,
    totalAllowance,
    otBaseRatePerHour,
    autoOTHours,
    autoOTIndex,
    autoOTAmount,
    actualAdditionalOTHours,
    totalWorkDayOTHours: Math.round(actualWorkDayOTHours * 100) / 100,
    totalOffDayOTHours: Math.round(actualOffDayOTHours * 100) / 100,
    totalOTHours,
    totalOTIndex,
    totalOTAmount,
    addOns: activeAddOns,
    totalAddOns,
    medicalBik,
    bpjsJkkCo,
    bpjsJkmCo,
    bpjsKesCo,
    totalBpjsCo,
    grossIncome,
    mealRate,
    totalMealCount,
    totalMealDeduction,
    housingDeduction,
    bpjsJhtEmp,
    bpjsJpEmp,
    bpjsKesEmp,
    totalBpjsEmp,
    ptkpStatus,
    terCategory,
    terRate,
    terTaxAmount,
    cashIncome,
    cashDeductions,
    totalDeductions,
    netSalary,
    paydayDate: paydayInfo.paydayDate,
    paydayOriginalDate: paydayInfo.originalDate,
    isPaydayAdjusted: paydayInfo.isAdjusted
  };
}

// =========================================================================
// 10. LOCAL STORAGE PERSISTENCE UNTUK SHIFT LOGS
// =========================================================================
const STORAGE_KEY_SHIFT_LOGS = 'artha_shift_calendar_logs_';

export function getStoredShiftLogs(ledgerId: string, monthKey: string): ShiftDayLog[] | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_SHIFT_LOGS}${ledgerId}_${monthKey}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca shift logs lokal:', e);
  }
  return null;
}

export function saveStoredShiftLogs(ledgerId: string, monthKey: string, logs: ShiftDayLog[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_SHIFT_LOGS}${ledgerId}_${monthKey}`, JSON.stringify(logs));
  } catch (e) {
    console.error('Gagal menyimpan shift logs lokal:', e);
  }
}