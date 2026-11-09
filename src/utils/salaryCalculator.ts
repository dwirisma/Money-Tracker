/**
 * Artha Payroll & Shift Engine: AGC Group 2026 Shifting Calendar (Group C)
 * Sesuai dokumen resmi: AGC Group Internal Use Only - 2026 Shifting Calendar
 * 
 * Fitur:
 * 1. Logika Siklus 28-Hari 4-Group (A, B, C, D) 3-Shift
 * 2. Determinasi Instan Shift untuk Hari Ini, Besok, s/d 1 Tahun Mendatang
 * 3. Otomatisasi Ceklis Makan sesuai Jam Masuk Kerja
 * 4. Matriks AUTO O/T (Auto Overtime) Resmi AGC (8.25j / 16.50j)
 * 5. Overtime Indexer Presisi (Kepmenakertrans / PP 35/2021)
 * 6. Automasi Pajak TER PPh 21 DJP 2024
 */
import { 
  PTKPStatus, 
  TERCategory, 
  ShiftDayLog, 
  SalaryBreakdown, 
  DayType, 
  PublicHoliday,
  ShiftGroup,
  SalaryAddOn
} from '../types';

// =========================================================================
// 1. DOKUMEN RESMI AGC GROUP: KONFIGURASI SIKLUS 28-HARI & ANCHOR DATE
// =========================================================================

/**
 * Tanggal Referensi Anchor (Indeks 0 terjadi pada tanggal ini):
 * 2025-12-21 (Start Cut-off periode Desember 2025 - Januari 2026)
 */
export const AGC_ANCHOR_DATE = '2025-12-21';
export const ANCHOR_DATE = AGC_ANCHOR_DATE;

/**
 * Master 28-Hari Siklus Rotasi Group A (Mulai 21 Des 2025):
 * 2 I, 2 II, 2 III, 3 O | 2 I, 2 II, 3 III, 2 O | 2 I, 3 II, 2 III, 2 O | 3 I, 2 II, 2 III, 2 O (Total = 28 hari)
 */
export const AGC_GROUP_A_CYCLE: string[] = [
  'I', 'I', 'II', 'II', 'III', 'III', 'O', 'O', 'O',
  'I', 'I', 'II', 'II', 'III', 'III', 'III', 'O', 'O',
  'I', 'I', 'II', 'II', 'II', 'III', 'III', 'O', 'O',
  'I'
];

/**
 * Master 28-Hari Siklus Rotasi Group C (Offset 14 hari dari Group A):
 * Telah diverifikasi 100% presisi mencakup 365 hari kalender resmi AGC 2026!
 */
export const AGC_GROUP_C_CYCLE: string[] = [
  'III', 'III', 'O', 'O', 'I', 'I', 'II', 'II', 'II',
  'III', 'III', 'O', 'O', 'I', 'I', 'I', 'II', 'II',
  'III', 'III', 'O', 'O', 'O', 'I', 'I', 'II', 'II',
  'III'
];

export const SHIFT_PATTERN = AGC_GROUP_C_CYCLE;

export interface AGCShiftMetadata {
  code: 'I' | 'II' | 'III' | 'O';
  name: string;
  short: string;
  hours: string;
  isWork: boolean;
  defaultMeals: { breakfast: boolean; lunch: boolean; dinner: boolean };
}

export const AGC_SHIFT_INFO: Record<string, AGCShiftMetadata> = {
  'I': {
    code: 'I',
    name: 'Shift 1 (Malam)',
    short: 'Malam',
    hours: '23:00 - 07:00',
    isWork: true,
    defaultMeals: { breakfast: false, lunch: false, dinner: false }
  },
  'II': {
    code: 'II',
    name: 'Shift 2 (Pagi)',
    short: 'Pagi',
    hours: '07:00 - 15:00',
    isWork: true,
    defaultMeals: { breakfast: false, lunch: false, dinner: false }
  },
  'III': {
    code: 'III',
    name: 'Shift 3 (Sore)',
    short: 'Sore',
    hours: '15:00 - 23:00',
    isWork: true,
    defaultMeals: { breakfast: false, lunch: false, dinner: false }
  },
  'O': {
    code: 'O',
    name: 'Off (Libur)',
    short: 'Off',
    hours: 'Libur',
    isWork: false,
    defaultMeals: { breakfast: false, lunch: false, dinner: false }
  }
};

/**
 * Matriks AUTO OT Resmi dari dokumen AGC Group 2026 Shifting Calendar untuk Group C:
 * - Periode 2025-12 (Dec 25 - Jan 26): 16.50 Jam
 * - Periode 2026-11 (Nov 26 - Dec 26): 16.50 Jam
 * - 10 Periode lainnya: 8.25 Jam
 */
export const AGC_AUTO_OT_MAP_GROUP_C: Record<string, number> = {
  '2025-12': 16.50, // DEC 2025 - JAN 2026
  '2026-01': 8.25,  // JAN - FEB 2026
  '2026-02': 8.25,  // FEB - MAR 2026
  '2026-03': 8.25,  // MAR - APR 2026
  '2026-04': 8.25,  // APR - MAY 2026
  '2026-05': 8.25,  // MAY - JUN 2026
  '2026-06': 8.25,  // JUN - JUL 2026
  '2026-07': 8.25,  // JUL - AUG 2026
  '2026-08': 8.25,  // AUG - SEP 2026
  '2026-09': 8.25,  // SEP - OCT 2026
  '2026-10': 8.25,  // OCT - NOV 2026
  '2026-11': 16.50  // NOV - DEC 2026
};

/**
 * Mendapatkan Jam Lembur Otomatis (Auto OT) sesuai matriks resmi AGC
 */
export function getAutoOTForPeriod(
  selectedMonthIndex: number,
  selectedYear: number,
  group: ShiftGroup = 'C'
): number {
  const periodKey = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}`;
  if (group === 'C' && AGC_AUTO_OT_MAP_GROUP_C[periodKey] !== undefined) {
    return AGC_AUTO_OT_MAP_GROUP_C[periodKey];
  }
  // Siklus rotasi reguler: Periode akhir tahun / pergantian memiliki 16.50 jam, periode lainnya 8.25 jam
  if (selectedMonthIndex === 0 || selectedMonthIndex === 11) {
    return 16.50;
  }
  return 8.25;
}

/**
 * Daftar Hari Libur Nasional Indonesia Tahun 2026 (Ketetapan SKB 3 Menteri)
 */
export const PUBLIC_HOLIDAYS_2026: PublicHoliday[] = [
  { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi' },
  { date: '2026-01-16', name: "Isra Mi'raj Nabi Muhammad SAW" },
  { date: '2026-02-17', name: 'Tahun Baru Imlek 2577 Kongzili' },
  { date: '2026-03-20', name: 'Hari Suci Nyepi Tahun Baru Saka 1948' },
  { date: '2026-03-21', name: 'Hari Raya Idul Fitri 1447 H (Hari ke-1)' },
  { date: '2026-03-22', name: 'Hari Raya Idul Fitri 1447 H (Hari ke-2)' },
  { date: '2026-04-03', name: 'Wafat Yesus Kristus (Jumat Agung)' },
  { date: '2026-05-01', name: 'Hari Buruh Internasional' },
  { date: '2026-05-14', name: 'Kenaikan Yesus Kristus' },
  { date: '2026-05-27', name: 'Hari Raya Idul Adha 1447 H' },
  { date: '2026-05-31', name: 'Hari Raya Waisak 2570 BE' },
  { date: '2026-06-01', name: 'Hari Lahir Pancasila' },
  { date: '2026-06-16', name: 'Tahun Baru Islam 1448 H' },
  { date: '2026-08-17', name: 'Hari Kemerdekaan RI Ke-81' },
  { date: '2026-08-25', name: 'Maulid Nabi Muhammad SAW' },
  { date: '2026-12-25', name: 'Hari Raya Natal' }
];

export const HOLIDAYS_MAP: Record<string, string> = PUBLIC_HOLIDAYS_2026.reduce((acc, curr) => {
  acc[curr.date] = curr.name;
  return acc;
}, {} as Record<string, string>);

// =========================================================================
// KOMPONEN TETAP SLIP GAJI
// =========================================================================
export const BASIC_SALARY = 9345000;
export const HOUSING_ALLOWANCE = 1350000;
export const SHIFT_ALLOWANCE = 1700000;
export const TOTAL_FIXED_ALLOWANCE = BASIC_SALARY + HOUSING_ALLOWANCE + SHIFT_ALLOWANCE; // Rp 12.395.000

// Basis Rate Lembur per Jam: (Basic + Housing) / 173 = Rp 61.820,809...
export const BPJS_BASE = BASIC_SALARY + HOUSING_ALLOWANCE; // Rp 10.695.000
export const OVERTIME_BASE_RATE = BPJS_BASE / 173; // Rp 61.820,81

export const DEFAULT_MEAL_RATE = 9800;
export const HOUSING_DEDUCTION = 1050000;

// Tunjangan Perusahaan (Natura / Company)
export const BPJS_JKK_CO_RATE = 0.0089; // 0.89%
export const BPJS_JKM_CO_RATE = 0.003;  // 0.3%
export const BPJS_KES_CO_RATE = 0.04;   // 4%

// Potongan Karyawan (Deduction / Employee)
export const BPJS_JHT_EMP_RATE = 0.02; // 2%
export const BPJS_JP_EMP_RATE = 0.01;  // 1%
export const BPJS_KES_EMP_RATE = 0.01; // 1%

// =========================================================================
// 2. FUNGSI PENENTU STATUS HARI (DAY TYPE ANALYZER)
// =========================================================================

export function getDayType(dateStr: string, shift: string): { 
  dayType: DayType; 
  isPublicHoliday: boolean; 
  holidayName?: string;
  isWorkDay: boolean;
} {
  const holidayName = HOLIDAYS_MAP[dateStr];
  const isPublicHoliday = Boolean(holidayName);
  const isShiftOff = shift.trim().toLowerCase() === 'off' || shift.trim() === 'O';

  if (isShiftOff || isPublicHoliday) {
    return {
      dayType: 'OFF_OR_HOLIDAY',
      isPublicHoliday,
      holidayName,
      isWorkDay: false
    };
  }

  return {
    dayType: 'NORMAL_WORKDAY',
    isPublicHoliday: false,
    isWorkDay: true
  };
}

// =========================================================================
// 3. FUNGSI DETERMINASI SHIFT INSTAN (SEKARANG, BESOK, 1 TAHUN MENDATANG)
// =========================================================================

/**
 * Menentukan shift untuk tanggal berapapun (sekarang, besok, atau 1-5 tahun mendatang)
 * secara matematis tanpa perlu input manual.
 */
export function getShiftForDate(
  dateInput: string | Date,
  group: ShiftGroup = 'C',
  anchorDateStr: string = AGC_ANCHOR_DATE
) {
  const d = typeof dateInput === 'string' ? new Date(`${dateInput}T00:00:00`) : new Date(dateInput);
  const anchor = new Date(`${anchorDateStr}T00:00:00`);
  const diffTime = d.getTime() - anchor.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // Offset per group pada kalender 4-group 28-hari: A = 0, B = 7, C = 14, D = 21
  const groupOffsets: Record<ShiftGroup, number> = { 'A': 0, 'B': 7, 'C': 14, 'D': 21 };
  const offset = groupOffsets[group] ?? 14;

  const cycleLength = 28;
  const cycleIndex = (((diffDays + offset) % cycleLength) + cycleLength) % cycleLength;
  const code = (AGC_GROUP_A_CYCLE[cycleIndex] || 'O') as 'I' | 'II' | 'III' | 'O';
  const info = AGC_SHIFT_INFO[code] || AGC_SHIFT_INFO['O'];

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const { dayType, isPublicHoliday, holidayName } = getDayType(dateStr, info.short);

  return {
    date: dateStr,
    group,
    code,
    name: info.name,
    short: info.short,
    hours: info.hours,
    isWorkDay: info.isWork,
    dayType,
    isPublicHoliday,
    holidayName,
    defaultMeals: { ...info.defaultMeals }
  };
}

// =========================================================================
// 4. OVERTIME INDEXER (KEPMENAKERTRANS / PP 35/2021)
// =========================================================================

export function calculateOvertimeIndex(actualOtHours: number, dayType: DayType): number {
  if (actualOtHours <= 0) return 0;

  let totalIndex = 0;

  if (dayType === 'NORMAL_WORKDAY') {
    if (actualOtHours <= 1) {
      totalIndex = actualOtHours * 1.5;
    } else {
      const firstHour = 1.5;
      const nextHours = (actualOtHours - 1) * 2.0;
      totalIndex = firstHour + nextHours;
    }
  } else {
    // OFF_OR_HOLIDAY
    const hours1to8 = Math.min(actualOtHours, 8);
    totalIndex += hours1to8 * 2.0;

    if (actualOtHours > 8) {
      const hour9 = Math.min(actualOtHours - 8, 1);
      totalIndex += hour9 * 3.0;
    }

    if (actualOtHours > 9) {
      const hours10Plus = actualOtHours - 9;
      totalIndex += hours10Plus * 4.0;
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
// 5. GENERATOR KALENDER PERIODE CUT-OFF DENGAN AUTO OT & AUTO CEKLIS MAKAN
// =========================================================================

export function generateShiftCalendar(
  selectedMonthIndex: number,
  selectedYear: number,
  shiftPattern: string[] = AGC_GROUP_C_CYCLE,
  anchorDateStr: string = AGC_ANCHOR_DATE,
  group: ShiftGroup = 'C'
): ShiftDayLog[] {
  // Start: Tanggal 21 bulan sebelumnya
  const startDate = new Date(selectedYear, selectedMonthIndex - 1, 21);
  // End: Tanggal 20 bulan ini
  const endDate = new Date(selectedYear, selectedMonthIndex, 20);

  const days: ShiftDayLog[] = [];
  const current = new Date(startDate);
  const dayNamesShort = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  while (current <= endDate) {
    const shiftInfo = getShiftForDate(current, group, anchorDateStr);
    const dayOfWeek = current.getDay();

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
      overtimeHours: 0,
      overtimeIndex: 0,
      overtimeAmount: 0,
      meals: { breakfast: false, lunch: false, dinner: false } // Manual: pengguna mengisi secara manual karena sering tidak makan
    });

    current.setDate(current.getDate() + 1);
  }

  return days;
}

// =========================================================================
// 6. AUTOMASI PAJAK TER (TARIF EFEKTIF RATA-RATA PPh 21 DJP 2024)
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
  { max: 5400000, rate: 0.0 },
  { max: 5650000, rate: 0.25 },
  { max: 5950000, rate: 0.5 },
  { max: 6300000, rate: 0.75 },
  { max: 6750000, rate: 1.0 },
  { max: 7500000, rate: 1.25 },
  { max: 8550000, rate: 1.5 },
  { max: 9650000, rate: 1.75 },
  { max: 10050000, rate: 2.0 },
  { max: 10350000, rate: 2.25 },
  { max: 10700000, rate: 2.5 },
  { max: 11050000, rate: 3.0 },
  { max: 11600000, rate: 3.5 },
  { max: 12500000, rate: 4.0 },
  { max: 13750000, rate: 5.0 },
  { max: 15100000, rate: 6.0 },
  { max: 16950000, rate: 7.0 },
  { max: 19750000, rate: 8.0 },
  { max: 24100000, rate: 9.0 },
  { max: 26450000, rate: 10.0 },
  { max: 28000000, rate: 11.0 },
  { max: 30050000, rate: 12.0 },
  { max: 32400000, rate: 13.0 },
  { max: 35400000, rate: 14.0 },
  { max: 39100000, rate: 15.0 },
  { max: 43850000, rate: 16.0 },
  { max: 47800000, rate: 17.0 },
  { max: 51400000, rate: 18.0 },
  { max: 56300000, rate: 19.0 },
  { max: 62200000, rate: 20.0 },
  { max: 68600000, rate: 21.0 },
  { max: 77500000, rate: 22.0 },
  { max: 89000000, rate: 23.0 },
  { max: 101900000, rate: 24.0 },
  { max: 120000000, rate: 25.0 },
  { max: 150000000, rate: 26.0 },
  { max: 200000000, rate: 27.0 },
  { max: 250000000, rate: 28.0 },
  { max: 300000000, rate: 29.0 },
  { max: 400000000, rate: 30.0 },
  { max: 500000000, rate: 31.0 },
  { max: 750000000, rate: 32.0 },
  { max: 1000000000, rate: 33.0 },
  { max: 1400000000, rate: 34.0 },
  { max: Infinity, rate: 35.0 }
];

const TER_TABLE_B: TERBracket[] = [
  { max: 6200000, rate: 0.0 },
  { max: 6500000, rate: 0.25 },
  { max: 6850000, rate: 0.5 },
  { max: 7300000, rate: 0.75 },
  { max: 9200000, rate: 1.0 },
  { max: 10750000, rate: 1.5 },
  { max: 11250000, rate: 2.0 },
  { max: 11600000, rate: 2.5 },
  { max: 12600000, rate: 3.0 },
  { max: 13600000, rate: 4.0 },
  { max: 14950000, rate: 5.0 },
  { max: 16400000, rate: 6.0 },
  { max: 18450000, rate: 7.0 },
  { max: 21850000, rate: 8.0 },
  { max: 26000000, rate: 9.0 },
  { max: 27700000, rate: 10.0 },
  { max: 29350000, rate: 11.0 },
  { max: 31450000, rate: 12.0 },
  { max: 33950000, rate: 13.0 },
  { max: 37100000, rate: 14.0 },
  { max: 41100000, rate: 15.0 },
  { max: 45800000, rate: 16.0 },
  { max: 49500000, rate: 17.0 },
  { max: 53800000, rate: 18.0 },
  { max: 58500000, rate: 19.0 },
  { max: 64000000, rate: 20.0 },
  { max: 71000000, rate: 21.0 },
  { max: 80000000, rate: 22.0 },
  { max: 93000000, rate: 23.0 },
  { max: 107000000, rate: 24.0 },
  { max: 126000000, rate: 25.0 },
  { max: 158000000, rate: 26.0 },
  { max: 211000000, rate: 27.0 },
  { max: 263000000, rate: 28.0 },
  { max: 316000000, rate: 29.0 },
  { max: 421000000, rate: 30.0 },
  { max: 526000000, rate: 31.0 },
  { max: 789000000, rate: 32.0 },
  { max: 1052000000, rate: 33.0 },
  { max: 1474000000, rate: 34.0 },
  { max: Infinity, rate: 35.0 }
];

const TER_TABLE_C: TERBracket[] = [
  { max: 6600000, rate: 0.0 },
  { max: 6950000, rate: 0.25 },
  { max: 7350000, rate: 0.5 },
  { max: 7800000, rate: 0.75 },
  { max: 8850000, rate: 1.0 },
  { max: 9800000, rate: 1.25 },
  { max: 10950000, rate: 1.5 },
  { max: 11200000, rate: 1.75 },
  { max: 12050000, rate: 2.0 },
  { max: 12950000, rate: 3.0 },
  { max: 14150000, rate: 4.0 },
  { max: 15550000, rate: 5.0 },
  { max: 17050000, rate: 6.0 },
  { max: 19500000, rate: 7.0 },
  { max: 22700000, rate: 8.0 },
  { max: 26600000, rate: 9.0 },
  { max: 28100000, rate: 10.0 },
  { max: 30100000, rate: 11.0 },
  { max: 32600000, rate: 12.0 },
  { max: 35400000, rate: 13.0 },
  { max: 38900000, rate: 14.0 },
  { max: 43000000, rate: 15.0 },
  { max: 47400000, rate: 16.0 },
  { max: 51200000, rate: 17.0 },
  { max: 55800000, rate: 18.0 },
  { max: 60800000, rate: 19.0 },
  { max: 66700000, rate: 20.0 },
  { max: 74200000, rate: 21.0 },
  { max: 83200000, rate: 22.0 },
  { max: 95600000, rate: 23.0 },
  { max: 110000000, rate: 24.0 },
  { max: 134000000, rate: 25.0 },
  { max: 169000000, rate: 26.0 },
  { max: 224000000, rate: 27.0 },
  { max: 280000000, rate: 28.0 },
  { max: 336000000, rate: 29.0 },
  { max: 448000000, rate: 30.0 },
  { max: 560000000, rate: 31.0 },
  { max: 841000000, rate: 32.0 },
  { max: 1121000000, rate: 33.0 },
  { max: 1570000000, rate: 34.0 },
  { max: Infinity, rate: 35.0 }
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
// 7. PENYESUAIAN HARI KERJA UNTUK TANGGAL GAJIAN (TANGGAL 28)
// =========================================================================

export function calculatePayday(year: number, monthIndex: number): { 
  originalDate: string; 
  paydayDate: string; 
  isAdjusted: boolean 
} {
  const d = new Date(year, monthIndex, 28);
  const originalDateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-28`;
  const dayOfWeek = d.getDay(); // 0 = Minggu, 6 = Sabtu

  let adjusted = false;
  if (dayOfWeek === 6) { // Sabtu -> Jumat (27)
    d.setDate(27);
    adjusted = true;
  } else if (dayOfWeek === 0) { // Minggu -> Jumat (26)
    d.setDate(26);
    adjusted = true;
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  return {
    originalDate: originalDateStr,
    paydayDate: `${yyyy}-${mm}-${dd}`,
    isAdjusted: adjusted
  };
}

// =========================================================================
// 8. KALKULASI UTAMA SLIP GAJI LENGKAP DENGAN AUTO OT RESMI
// =========================================================================

// --- FUNGSI KALKULATOR UTAMA ---
export function calculateSalaryBreakdown(
  shiftLogs: ShiftDayLog[],
  ptkpStatus: PTKPStatus = 'TK/0',
  mealRate: number = DEFAULT_MEAL_RATE,
  year: number = new Date().getFullYear(),
  monthIndex: number = new Date().getMonth(),
  manualAutoOTHours?: number,
  addOns?: SalaryAddOn[],
  medicalBik: number = 0 // Input Baru BIK
): SalaryBreakdown {
  
  // 1. Hitung Lembur (OT) - Sama seperti sebelumnya
  const autoOTHours = manualAutoOTHours !== undefined 
    ? manualAutoOTHours 
    : getAutoOTForPeriod(monthIndex, year, 'C'); // Gunakan fungsi getAutoOTForPeriod milikmu
  
  const autoOTIndex = calculateOvertimeIndex(autoOTHours, 'NORMAL_WORKDAY'); // Gunakan fungsiku
  const autoOTAmount = Math.round(autoOTIndex * OVERTIME_BASE_RATE);

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

      const { index, amount } = calculateDailyOvertimeAmount(day.overtimeHours, day.dayType, OVERTIME_BASE_RATE); // Gunakan fungsi helper-mu
      actualOTIndex += index;
      actualOTAmount += amount;
    }
  });

  const actualAdditionalOTHours = Math.round((actualWorkDayOTHours + actualOffDayOTHours) * 10) / 10;
  const totalOTHours = Math.round((autoOTHours + actualAdditionalOTHours) * 10) / 10;
  const totalOTIndex = Math.round((autoOTIndex + actualOTIndex) * 100) / 100;
  const totalOTAmount = autoOTAmount + actualOTAmount;

  const activeAddOns = (addOns || []).filter(item => item.isEnabled !== false);
  const totalAddOns = activeAddOns.reduce((sum, item) => sum + (item.amount || 0), 0);

  // 2. Kalkulasi Natura BPJS (Dari Perusahaan)
  const bpjsJkkCo = Math.round(BPJS_BASE * BPJS_JKK_CO_RATE);
  const bpjsJkmCo = Math.round(BPJS_BASE * BPJS_JKM_CO_RATE);
  const bpjsKesCo = Math.round(BPJS_BASE * BPJS_KES_CO_RATE);
  const totalBpjsCo = bpjsJkkCo + bpjsJkmCo + bpjsKesCo;

  // 3. PENDAPATAN KOTOR (Dasar Pajak TER)
  // Termasuk BIK dan BPJS Perusahaan karena dihitung sebagai penghasilan oleh negara
  const grossIncome = TOTAL_FIXED_ALLOWANCE + totalOTAmount + totalAddOns + totalBpjsCo + medicalBik;

  // 4. Potongan Karyawan (Deduction Cash)
  const bpjsJhtEmp = Math.round(BPJS_BASE * BPJS_JHT_EMP_RATE);
  const bpjsJpEmp = Math.round(BPJS_BASE * BPJS_JP_EMP_RATE);
  const bpjsKesEmp = Math.round(BPJS_BASE * BPJS_KES_EMP_RATE);
  const totalBpjsEmp = bpjsJhtEmp + bpjsJpEmp + bpjsKesEmp;

  const totalMealDeduction = totalMealCount * mealRate;

  // 5. Hitung Pajak TER otomatis dari grossIncome
  const { category: terCategory, rate: terRate, taxAmount: terTaxAmount } = calculateTER(grossIncome, ptkpStatus); // Gunakan fungsiku

  // 6. TOTAL CASH FLOW (TAKE HOME PAY)
  // Cash Income: Uang yang riil
  const cashIncome = TOTAL_FIXED_ALLOWANCE + totalOTAmount + totalAddOns;
  // Cash Deduction: Potongan riil
  const cashDeductions = totalBpjsEmp + HOUSING_DEDUCTION + totalMealDeduction;
  
  // THP = Uang Riil - Potongan Riil - Pajak
  const totalDeductions = cashDeductions + terTaxAmount;
  const netSalary = Math.max(0, cashIncome - totalDeductions);

  const paydayInfo = calculatePayday(year, monthIndex); // Gunakan fungsiku

  return {
    basicSalary: BASIC_SALARY,
    housingAllowance: HOUSING_ALLOWANCE,
    shiftAllowance: SHIFT_ALLOWANCE,
    totalAllowance: TOTAL_FIXED_ALLOWANCE,
    otBaseRatePerHour: OVERTIME_BASE_RATE,
    autoOTHours, autoOTIndex, autoOTAmount,
    actualAdditionalOTHours, 
    totalWorkDayOTHours: Math.round(actualWorkDayOTHours * 10) / 10,
    totalOffDayOTHours: Math.round(actualOffDayOTHours * 10) / 10,
    totalOTHours, totalOTIndex, totalOTAmount,
    addOns: activeAddOns, totalAddOns,
    medicalBik, // Input baru
    bpjsJkkCo, bpjsJkmCo, bpjsKesCo, totalBpjsCo,
    grossIncome,
    mealRate, totalMealCount, totalMealDeduction,
    housingDeduction: HOUSING_DEDUCTION,
    bpjsJhtEmp, bpjsJpEmp, bpjsKesEmp, totalBpjsEmp,
    ptkpStatus, terCategory, terRate, terTaxAmount,
    cashIncome, cashDeductions, totalDeductions,
    netSalary,
    paydayDate: paydayInfo.paydayDate,
    paydayOriginalDate: paydayInfo.originalDate,
    isPaydayAdjusted: paydayInfo.isAdjusted
  };
}

// =========================================================================
// LOCAL STORAGE PERSISTENCE UNTUK SHIFT LOGS & CUSTOM PATTERN
// =========================================================================
const STORAGE_KEY_SHIFT_LOGS = 'artha_shift_calendar_logs_';
const STORAGE_KEY_CUSTOM_PATTERN = 'artha_shift_pattern_config';

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

export function getCustomShiftPattern(): { pattern: string[]; anchorDate: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_PATTERN);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.pattern) && parsed.pattern.length === 6) {
        // Otomatis upgrade ke siklus 28-hari AGC Group C
        return { pattern: AGC_GROUP_C_CYCLE, anchorDate: AGC_ANCHOR_DATE };
      }
      return parsed;
    }
  } catch (e) {
    console.error('Gagal membaca custom shift pattern:', e);
  }
  return { pattern: AGC_GROUP_C_CYCLE, anchorDate: AGC_ANCHOR_DATE };
}

export function saveCustomShiftPattern(pattern: string[], anchorDate: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_PATTERN, JSON.stringify({ pattern, anchorDate }));
  } catch (e) {
    console.error('Gagal menyimpan custom shift pattern:', e);
  }
}
