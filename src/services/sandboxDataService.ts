/**
 * Sandbox Dummy Data Seeder & Resetter (Simulasi 1 Tahun Penuh / 12 Bulan)
 * KHUSUS beroperasi pada jalur `users/user_artha_sandbox` ketika sesi berada pada Sandbox / Demo Mode.
 * Dilindungi guard keras agar tidak pernah dapat menyentuh data produksi `users/user_artha`.
 * Seluruh operasi write & delete dipecah menjadi batch <= 400 dokumen (aman di bawah batas 500 Firestore).
 */
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import {
  SANDBOX_USER_DOC_ID,
  getActiveUserDocId,
  isSandboxSession,
  db,
  OperationType,
  handleFirestoreError,
} from '../config/firebase';
import { toLocalDateStr } from '../utils/dateUtils';
import {
  BASIC_SALARY,
  DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3,
  DEFAULT_MEAL_RATE,
  HOUSING_ALLOWANCE,
  HOUSING_DEDUCTION,
  SHIFT_ALLOWANCE,
  calculateDailyOvertimeAmount,
  calculateSalaryBreakdown,
  generateShiftCalendar,
} from '../utils/salaryCalculator';
import { DEFAULT_CATEGORY_BUDGETS } from './settingsService';

const SANDBOX_UID = SANDBOX_USER_DOC_ID;
const BATCH_CHUNK_SIZE = 400; // Wajib <= 400 agar aman di bawah limit 500 operasi Firestore

const SANDBOX_COLLECTIONS = [
  'ledgers',
  'accounts',
  'transactions',
  'bills',
  'debts',
  'goals',
  'automations',
  'investments',
  'investmentEntries',
  'autopilot',
  'salaryHistory',
  'shiftSchedules',
  'salaryAddons',
  'salarySettings',
  'budgets',
  'settings',
] as const;

export interface SandboxSeedProgress {
  phase: 'cleaning' | 'writing';
  completedBatches: number;
  totalBatches: number;
  totalDocs: number;
}

export interface SandboxSeedOptions {
  /** Kosongkan koleksi sandbox lama sebelum mengisi ulang agar tidak ada data yatim/duplikat (default: true). */
  resetBeforeSeed?: boolean;
  onProgress?: (progress: SandboxSeedProgress) => void;
}

export interface SandboxSeedResult {
  totalCreated: number;
  totalBatches: number;
  counts: {
    ledgers: number;
    accounts: number;
    transactions: number;
    bills: number;
    debts: number;
    goals: number;
    automations: number;
    investments: number;
    shiftSchedules: number;
    salaryRecords: number;
  };
}

export interface SandboxResetResult {
  totalDeleted: number;
}

interface BatchWriteOp {
  ref: DocumentReference;
  data: Record<string, unknown>;
}

function assertSandboxOnly(): void {
  if (!isSandboxSession() || getActiveUserDocId() !== SANDBOX_UID) {
    throw new Error('Operasi data dummy hanya diizinkan pada Sandbox / Demo Mode (users/user_artha_sandbox).');
  }
}

/**
 * Menghapus semua properti bernilai `undefined` secara rekursif (termasuk di dalam array/nested object)
 * karena Firestore `WriteBatch.set()` menolak nilai `undefined`.
 */
function sanitizeFirestoreValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestoreValue(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = sanitizeFirestoreValue(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

function daysFromToday(deltaDays: number, baseDate: Date = new Date()): string {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateStr(d);
}

/**
 * Menghasilkan tanggal `YYYY-MM-DD` pada bulan ke-`monthsAgo` sebelum `nowDate`.
 * Untuk bulan berjalan (`monthsAgo === 0`), tanggal otomatis dijepit tidak melebihi hari ini.
 */
function clampedDateInMonth(monthsAgo: number, preferredDay: number, nowDate: Date): string {
  const target = new Date(nowDate.getFullYear(), nowDate.getMonth() - monthsAgo, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const maxAllowedDay = monthsAgo === 0 ? Math.min(lastDay, nowDate.getDate()) : lastDay;
  const finalDay = Math.max(1, Math.min(preferredDay, maxAllowedDay));
  target.setDate(finalDay);
  return toLocalDateStr(target);
}

function periodKeyForMonthsAgo(monthsAgo: number, nowDate: Date): string {
  const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelId(monthsAgo: number, nowDate: Date): string {
  const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - monthsAgo, 1);
  return d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
}

function epochForDate(dateStr: string, hour = 10, minute = 0): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1, hour, minute, 0).getTime();
}

/**
 * Mengisi simulasi data keuangan lengkap selama 1 TAHUN PENUH (12 bulan terakhir hingga hari ini)
 * ke `users/user_artha_sandbox/...` menggunakan multi-batch chunking (maks 400 operasi/batch).
 */
export async function seedSandboxDummyData(
  options: SandboxSeedOptions = {}
): Promise<SandboxSeedResult> {
  assertSandboxOnly();

  const { resetBeforeSeed = true, onProgress } = options;

  if (resetBeforeSeed) {
    onProgress?.({ phase: 'cleaning', completedBatches: 0, totalBatches: 1, totalDocs: 0 });
    await resetSandboxDummyData();
  }

  const nowDate = new Date();
  const now = nowDate.getTime();
  const todayStr = toLocalDateStr(nowDate);
  const ledgerId = 'ledger_sandbox_main';

  // =========================================================================
  // 1. LEDGER & 5 AKUN BERAGAM (DENGAN 2 KANTONG DI BANK BCA)
  // =========================================================================
  const ledgers = [
    {
      id: ledgerId,
      name: 'Keuangan Sandbox (Demo)',
      description: 'Buku kas simulasi 1 tahun penuh (12 bulan) untuk peninjauan seluruh modul Artha',
      colorAccent: '#2dd4a7',
      isDefault: true,
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 8, 0),
      updatedAt: now,
    },
  ];

  const accounts = [
    {
      id: 'acc_sb_mandiri',
      ledgerId,
      name: 'Bank Mandiri Gaji',
      type: 'bank',
      balance: 8450000,
      colorAccent: '#ffc933',
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 8, 5),
      updatedAt: now,
    },
    {
      id: 'acc_sb_bca',
      ledgerId,
      name: 'Bank BCA Utama',
      type: 'bank',
      balance: 18250000,
      colorAccent: '#6c97ff',
      pockets: [
        {
          id: 'pkt_sb_darurat',
          name: 'Cadangan Darurat',
          balance: 6500000,
          targetAmount: 10000000,
          colorAccent: '#2dd4a7',
          type: 'saving',
          createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 8, 10),
        },
        {
          id: 'pkt_sb_liburan',
          name: 'Tabungan Liburan',
          balance: 2250000,
          targetAmount: 4000000,
          colorAccent: '#ffc933',
          type: 'saving',
          createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 8, 12),
        },
      ],
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 8, 10),
      updatedAt: now,
    },
    {
      id: 'acc_sb_gopay',
      ledgerId,
      name: 'GoPay & QRIS',
      type: 'ewallet',
      balance: 1480000,
      colorAccent: '#2dd4a7',
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 8, 15),
      updatedAt: now,
    },
    {
      id: 'acc_sb_cash',
      ledgerId,
      name: 'Dompet Tunai',
      type: 'cash',
      balance: 720000,
      colorAccent: '#ff7a4d',
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 8, 20),
      updatedAt: now,
    },
    {
      id: 'acc_sb_invest',
      ledgerId,
      name: 'Rekening Investasi',
      type: 'bank',
      balance: 4650000,
      colorAccent: '#e3a8f7',
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 8, 25),
      updatedAt: now,
    },
  ];

  // =========================================================================
  // 2. SIMULASI 12 BULAN TRANSAKSI (~240+ TRANSAKSI) & 12 RIWAYAT GAJI
  // =========================================================================
  const transactions: Array<Record<string, unknown>> = [];
  const salaryHistoryRecords: Array<Record<string, unknown>> = [];

  // Tracking totalPaid untuk tagihan agar akurat terhadap histori transaksi 11 bulan sebelumnya
  let paidListrikTotal = 0;
  let paidInternetTotal = 0;
  let paidAirTotal = 0;
  let paidDigitalTotal = 0;

  // Pola variasi deterministik per bulan agar grafik terlihat organik & realistis
  const otHoursPattern = [10, 14, 8, 16, 12, 18, 9, 15, 11, 13, 17, 12];
  const mealsPattern = [21, 23, 20, 24, 22, 25, 19, 23, 22, 21, 24, 20];
  const groceryPattern = [1420000, 1560000, 1380000, 1690000, 1490000, 1610000, 1540000, 1720000, 1450000, 1580000, 1660000, 1480000];
  const listrikPattern = [395000, 415000, 428000, 452000, 430000, 410000, 445000, 468000, 438000, 422000, 440000, 435000];
  const airPattern = [125000, 132000, 128000, 140000, 136000, 130000, 142000, 148000, 138000, 134000, 145000, 140000];
  const diningBasePattern = [145000, 168000, 132000, 185000, 154000, 176000, 142000, 195000, 158000, 164000, 179000, 152000];
  const coffeeNotes = [
    'Kopi pagi & sarapan roti',
    'Kopi susu & camilan kerja',
    'Sarapan bubur & es kopi',
    'Kopi & makan siang cepat',
  ];
  const dinnerNotes = [
    'Makan malam keluarga akhir pekan',
    'Makan siang bersama tim kantor',
    'Makan malam & minuman segar',
    'Kuliner akhir pekan & kopi',
  ];
  const entertainmentNotes = [
    'Nonton bioskop & camilan',
    'Buku bacaan & hobi akhir pekan',
    'Olahraga futsal / gym bulanan',
    'Hangout & rekreasi akhir pekan',
  ];
  const healthNotes = [
    'Vitamin harian & apotek',
    'Obat ringan & suplemen daya tahan',
    'Periksa kesehatan rutin & apotek',
    'Perlengkapan medis & vitamin',
  ];
  const miscNotes = [
    'Servis rutin & ganti oli motor',
    'Perlengkapan rumah tangga kecil',
    'Hadiah & kado kerabat',
    'Potong rambut & perawatan pribadi',
  ];

  // Loop 12 bulan mundur: monthsAgo = 11 (11 bulan lalu) s/d 0 (bulan berjalan)
  for (let mAgo = 11; mAgo >= 0; mAgo--) {
    const idx = 11 - mAgo; // 0..11 kronologis
    const period = periodKeyForMonthsAgo(mAgo, nowDate);
    const mLabel = monthLabelId(mAgo, nowDate);
    const mTag = period.replace('-', '');

    // Hitung slip gaji realistis untuk bulan ini (gaji pokok + tunjangan + lembur - potongan)
    const otHours = otHoursPattern[idx];
    const mealsCount = mealsPattern[idx];
    const otBaseRate = (BASIC_SALARY + HOUSING_ALLOWANCE) / 173;
    const overtimeAmount = Math.round(otHours * 1.85 * otBaseRate);
    const addOnAmount = mAgo === 7 ? 9345000 : mAgo === 1 ? 2750000 : 0; // THR (7 bln lalu) & Bonus Kuartal (1 bln lalu)
    const fixedAllowances = BASIC_SALARY + HOUSING_ALLOWANCE + SHIFT_ALLOWANCE;
    const grossSalary = Math.round(fixedAllowances + overtimeAmount + addOnAmount);
    const mealDeduction = mealsCount * DEFAULT_MEAL_RATE;
    const bpjsEmp = Math.round((BASIC_SALARY + HOUSING_ALLOWANCE) * 0.04);
    const taxEstimate = Math.round(grossSalary * (addOnAmount > 0 ? 0.075 : 0.045));
    const netSalary = Math.max(
      6500000,
      Math.round((grossSalary - HOUSING_DEDUCTION - mealDeduction - bpjsEmp - taxEstimate) / 1000) * 1000
    );

    // 1. Catat Riwayat Slip Gaji (12 bulan penuh)
    const paydayDate =
      mAgo === 0
        ? clampedDateInMonth(0, Math.min(20, Math.max(1, nowDate.getDate() - 1)), nowDate)
        : clampedDateInMonth(mAgo, 25, nowDate);

    salaryHistoryRecords.push({
      id: `sal_sb_${ledgerId}_${period}`,
      ledgerId,
      period,
      basicSalary: BASIC_SALARY,
      housingAllowance: HOUSING_ALLOWANCE,
      shiftAllowance: SHIFT_ALLOWANCE,
      overtimeAmount,
      totalOtHours: otHours,
      totalMeals: mealsCount,
      totalAddOns: addOnAmount,
      grossSalary,
      netSalary,
      createdAt: epochForDate(paydayDate, 9, 0),
    });

    // 2. Transaksi Gaji Masuk (selaras dengan netSalary tanpa addOn agar THR/Bonus terpisah jelas)
    const regularNetSalary =
      addOnAmount > 0 ? Math.max(8200000, netSalary - Math.round(addOnAmount * 0.9)) : netSalary;

    transactions.push({
      id: `tx_sb_${mTag}_01_gaji`,
      ledgerId,
      accountId: 'acc_sb_mandiri',
      type: 'income',
      amount: regularNetSalary,
      category: 'Gaji Bulanan',
      note: `Gaji & tunjangan shift ${mLabel} (${otHours}j lembur)`,
      date: paydayDate,
      createdAt: epochForDate(paydayDate, 8, 30),
      updatedAt: now,
    });

    // Pemasukan musiman: THR (7 bulan lalu) & Bonus Kinerja (1 bulan lalu) + freelance ringan tiap 3 bulan
    if (mAgo === 7) {
      const thrDate = clampedDateInMonth(mAgo, 18, nowDate);
      transactions.push({
        id: `tx_sb_${mTag}_02_thr`,
        ledgerId,
        accountId: 'acc_sb_mandiri',
        type: 'income',
        amount: 9345000,
        category: 'Bonus & THR',
        note: `THR & Tunjangan Hari Raya ${mLabel}`,
        date: thrDate,
        createdAt: epochForDate(thrDate, 10, 0),
        updatedAt: now,
      });
    } else if (mAgo === 1) {
      const bonusDate = clampedDateInMonth(mAgo, 20, nowDate);
      transactions.push({
        id: `tx_sb_${mTag}_02_bonus`,
        ledgerId,
        accountId: 'acc_sb_mandiri',
        type: 'income',
        amount: 2750000,
        category: 'Bonus & THR',
        note: `Bonus kinerja & insentif produksi ${mLabel}`,
        date: bonusDate,
        createdAt: epochForDate(bonusDate, 11, 15),
        updatedAt: now,
      });
    } else if (idx % 3 === 1) {
      const sideDate = clampedDateInMonth(mAgo, 14, nowDate);
      transactions.push({
        id: `tx_sb_${mTag}_02_side`,
        ledgerId,
        accountId: 'acc_sb_bca',
        type: 'income',
        amount: 850000 + (idx % 4) * 175000,
        category: 'Bonus & THR',
        note: `Proyek sampingan & dividen kecil ${mLabel}`,
        date: sideDate,
        createdAt: epochForDate(sideDate, 15, 0),
        updatedAt: now,
      });
    }

    // 3. Transfer Antar-Akun (3 mutasi/bulan = 36 transfer selama 1 tahun)
    const trfBcaDate = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(3, nowDate.getDate()) : 26, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_03_trf_bca`,
      ledgerId,
      accountId: 'acc_sb_mandiri',
      toAccountId: 'acc_sb_bca',
      type: 'transfer',
      amount: 3400000 + (idx % 3) * 200000,
      category: 'Transfer Saldo',
      note: `Alokasi tabungan & kebutuhan bulanan ke BCA (${mLabel})`,
      date: trfBcaDate,
      createdAt: epochForDate(trfBcaDate, 9, 15),
      updatedAt: now,
    });

    const trfGopayDate = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(4, nowDate.getDate()) : 2, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_04_trf_gopay`,
      ledgerId,
      accountId: 'acc_sb_mandiri',
      toAccountId: 'acc_sb_gopay',
      type: 'transfer',
      amount: 1600000 + (idx % 3) * 150000,
      category: 'Transfer Saldo',
      note: `Top-up GoPay & QRIS operasional harian (${mLabel})`,
      date: trfGopayDate,
      createdAt: epochForDate(trfGopayDate, 9, 30),
      updatedAt: now,
    });

    const trfInvDate = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(6, nowDate.getDate()) : 27, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_05_trf_invest`,
      ledgerId,
      accountId: 'acc_sb_bca',
      toAccountId: 'acc_sb_invest',
      type: 'transfer',
      amount: 1000000 + (idx % 2) * 250000,
      category: 'Transfer Saldo',
      note: `Setoran rutin DCA ke Rekening Investasi (${mLabel})`,
      date: trfInvDate,
      createdAt: epochForDate(trfInvDate, 10, 10),
      updatedAt: now,
    });

    // 4. Pengeluaran Tagihan Rutin (lunas untuk 11 bulan sebelumnya; bulan ini jatuh tempo upcoming)
    if (mAgo >= 1) {
      const listrikAmt = listrikPattern[idx];
      const airAmt = airPattern[idx];
      const internetAmt = 350000;
      const digitalAmt = 119000;

      paidListrikTotal += listrikAmt;
      paidInternetTotal += internetAmt;
      paidAirTotal += airAmt;
      paidDigitalTotal += digitalAmt;

      const dListrik = clampedDateInMonth(mAgo, 6, nowDate);
      transactions.push({
        id: `tx_sb_${mTag}_06_bill_listrik`,
        ledgerId,
        accountId: 'acc_sb_bca',
        billId: 'bill_sb_listrik',
        type: 'expense',
        amount: listrikAmt,
        category: 'Tagihan & Utilitas',
        note: `Bayar Listrik PLN Pascabayar ${mLabel}`,
        date: dListrik,
        createdAt: epochForDate(dListrik, 11, 0),
        updatedAt: now,
      });

      const dInternet = clampedDateInMonth(mAgo, 8, nowDate);
      transactions.push({
        id: `tx_sb_${mTag}_07_bill_wifi`,
        ledgerId,
        accountId: 'acc_sb_bca',
        billId: 'bill_sb_internet',
        type: 'expense',
        amount: internetAmt,
        category: 'Tagihan & Utilitas',
        note: `Bayar Internet WiFi Rumah ${mLabel}`,
        date: dInternet,
        createdAt: epochForDate(dInternet, 11, 15),
        updatedAt: now,
      });

      const dAir = clampedDateInMonth(mAgo, 11, nowDate);
      transactions.push({
        id: `tx_sb_${mTag}_08_bill_air`,
        ledgerId,
        accountId: 'acc_sb_bca',
        billId: 'bill_sb_air',
        type: 'expense',
        amount: airAmt,
        category: 'Tagihan & Utilitas',
        note: `Bayar Air PDAM & Iuran Kebersihan ${mLabel}`,
        date: dAir,
        createdAt: epochForDate(dAir, 11, 30),
        updatedAt: now,
      });

      const dDigital = clampedDateInMonth(mAgo, 15, nowDate);
      transactions.push({
        id: `tx_sb_${mTag}_09_bill_digital`,
        ledgerId,
        accountId: 'acc_sb_gopay',
        billId: 'bill_sb_digital',
        type: 'expense',
        amount: digitalAmt,
        category: 'Hiburan & Hobi',
        note: `Langganan Cloud, Musik & Streaming ${mLabel}`,
        date: dDigital,
        createdAt: epochForDate(dDigital, 13, 0),
        updatedAt: now,
      });
    } else {
      // Bulan berjalan: catat 1 tagihan pulsa/kuota yang sudah dibayar awal bulan
      const dPulsa = clampedDateInMonth(0, 3, nowDate);
      transactions.push({
        id: `tx_sb_${mTag}_06_pulsa`,
        ledgerId,
        accountId: 'acc_sb_gopay',
        type: 'expense',
        amount: 125000,
        category: 'Tagihan & Utilitas',
        note: `Paket data & pulsa bulanan ${mLabel}`,
        date: dPulsa,
        createdAt: epochForDate(dPulsa, 10, 45),
        updatedAt: now,
      });
    }

    // 5. Cicilan / Utang (histori pembayaran sebagian)
    const dMotor = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(10, nowDate.getDate()) : 10, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_10_debt_motor`,
      ledgerId,
      accountId: 'acc_sb_mandiri',
      debtId: 'debt_sb_motor',
      type: 'expense',
      amount: 1500000,
      category: 'Tagihan & Utilitas',
      note: `Cicilan Motor Harian bulan ${mLabel}`,
      date: dMotor,
      createdAt: epochForDate(dMotor, 10, 0),
      updatedAt: now,
    });

    // Cicilan 0% Laptop Kerja berjalan 6 bulan terakhir (mAgo 5..0)
    if (mAgo <= 5) {
      const dLaptop = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(12, nowDate.getDate()) : 17, nowDate);
      transactions.push({
        id: `tx_sb_${mTag}_11_debt_laptop`,
        ledgerId,
        accountId: 'acc_sb_bca',
        debtId: 'debt_sb_laptop',
        type: 'expense',
        amount: 1000000,
        category: 'Tagihan & Utilitas',
        note: `Cicilan 0% Laptop Kerja angsuran ${6 - mAgo}/9`,
        date: dLaptop,
        createdAt: epochForDate(dLaptop, 14, 0),
        updatedAt: now,
      });
    }

    // 6. Belanja Bulanan (2x per bulan di Bank BCA)
    const grocTotal = groceryPattern[idx];
    const grocPart1 = Math.round((grocTotal * 0.58) / 1000) * 1000;
    const grocPart2 = grocTotal - grocPart1;

    const dGroc1 = clampedDateInMonth(mAgo, 5, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_12_groc1`,
      ledgerId,
      accountId: 'acc_sb_bca',
      type: 'expense',
      amount: grocPart1,
      category: 'Belanja Bulanan',
      note: `Belanja bulanan supermarket (beras, dapur, kebutuhan rumah)`,
      date: dGroc1,
      createdAt: epochForDate(dGroc1, 16, 20),
      updatedAt: now,
    });

    const dGroc2 = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(16, nowDate.getDate()) : 19, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_13_groc2`,
      ledgerId,
      accountId: 'acc_sb_bca',
      type: 'expense',
      amount: grocPart2,
      category: 'Belanja Bulanan',
      note: `Restok buah, sayur segar & kebutuhan rumah tangga`,
      date: dGroc2,
      createdAt: epochForDate(dGroc2, 17, 10),
      updatedAt: now,
    });

    // 7. Makanan & Minuman Harian (5 transaksi tersebar di GoPay & Dompet Tunai)
    const diningBase = diningBasePattern[idx];
    const mealDays = mAgo === 0
      ? [2, 6, 9, 13, Math.max(1, nowDate.getDate() - 1)]
      : [3, 9, 14, 21, 27];

    mealDays.forEach((prefDay, mealIdx) => {
      const mDate = clampedDateInMonth(mAgo, prefDay, nowDate);
      const isCash = mealIdx === 1 || mealIdx === 4;
      const amt =
        mealIdx === 2
          ? diningBase + 95000 // makan malam akhir pekan
          : mealIdx === 0
            ? Math.round((diningBase * 0.65) / 1000) * 1000
            : Math.round((diningBase * (0.85 + (mealIdx % 3) * 0.15)) / 1000) * 1000;
      transactions.push({
        id: `tx_sb_${mTag}_14_food_${mealIdx + 1}`,
        ledgerId,
        accountId: isCash ? 'acc_sb_cash' : 'acc_sb_gopay',
        type: 'expense',
        amount: amt,
        category: 'Makanan & Minuman',
        note:
          mealIdx % 2 === 0
            ? coffeeNotes[(idx + mealIdx) % coffeeNotes.length]
            : dinnerNotes[(idx + mealIdx) % dinnerNotes.length],
        date: mDate,
        createdAt: epochForDate(mDate, 12 + mealIdx, 15),
        updatedAt: now,
      });
    });

    // 8. Transportasi (2 transaksi per bulan: GoPay/QRIS & Dompet Tunai)
    const dTrans1 = clampedDateInMonth(mAgo, 7, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_19_trans1`,
      ledgerId,
      accountId: 'acc_sb_gopay',
      type: 'expense',
      amount: 210000 + (idx % 4) * 25000,
      category: 'Transportasi',
      note: 'Isi BBM Pertamax & saldo e-Toll',
      date: dTrans1,
      createdAt: epochForDate(dTrans1, 8, 45),
      updatedAt: now,
    });

    const dTrans2 = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(18, nowDate.getDate()) : 22, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_20_trans2`,
      ledgerId,
      accountId: 'acc_sb_cash',
      type: 'expense',
      amount: 145000 + (idx % 3) * 20000,
      category: 'Transportasi',
      note: 'Ojek online, parkir harian & cuci kendaraan',
      date: dTrans2,
      createdAt: epochForDate(dTrans2, 18, 0),
      updatedAt: now,
    });

    // 9. Hiburan & Hobi (1 transaksi per bulan di GoPay)
    const dEnt = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(14, nowDate.getDate()) : 23, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_21_hiburan`,
      ledgerId,
      accountId: 'acc_sb_gopay',
      type: 'expense',
      amount: 175000 + (idx % 4) * 45000,
      category: 'Hiburan & Hobi',
      note: entertainmentNotes[idx % entertainmentNotes.length],
      date: dEnt,
      createdAt: epochForDate(dEnt, 19, 30),
      updatedAt: now,
    });

    // 10. Kesehatan (1 transaksi per bulan di Dompet Tunai / GoPay)
    const dHealth = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(11, nowDate.getDate()) : 16, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_22_kesehatan`,
      ledgerId,
      accountId: idx % 2 === 0 ? 'acc_sb_cash' : 'acc_sb_gopay',
      type: 'expense',
      amount: 115000 + (idx % 3) * 45000,
      category: 'Kesehatan',
      note: healthNotes[idx % healthNotes.length],
      date: dHealth,
      createdAt: epochForDate(dHealth, 15, 20),
      updatedAt: now,
    });

    // 11. Lainnya (1 transaksi per bulan di BCA / Dompet Tunai)
    const dMisc = clampedDateInMonth(mAgo, mAgo === 0 ? Math.min(15, nowDate.getDate()) : 28, nowDate);
    transactions.push({
      id: `tx_sb_${mTag}_23_lainnya`,
      ledgerId,
      accountId: idx % 2 === 0 ? 'acc_sb_bca' : 'acc_sb_cash',
      type: 'expense',
      amount: 165000 + (idx % 4) * 55000,
      category: 'Lainnya',
      note: miscNotes[idx % miscNotes.length],
      date: dMisc,
      createdAt: epochForDate(dMisc, 16, 40),
      updatedAt: now,
    });
  }

  // =========================================================================
  // 3. TAGIHAN RUTIN (4 TAGIHAN) & UTANG / CICILAN (2 AKTIF)
  // =========================================================================
  const bills = [
    {
      id: 'bill_sb_listrik',
      ledgerId,
      name: 'Listrik PLN Pascabayar',
      cycle: 'monthly',
      pricingType: 'variable',
      lastNominal: 435000,
      nextPaymentDate: daysFromToday(3, nowDate),
      category: 'Tagihan & Utilitas',
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#ffc933',
      note: 'Nominal menyesuaikan pemakaian kWh bulanan (11 bulan lalu lunas)',
      totalPaid: paidListrikTotal,
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 9, 0),
      updatedAt: now,
    },
    {
      id: 'bill_sb_internet',
      ledgerId,
      name: 'Internet WiFi Rumah',
      cycle: 'monthly',
      pricingType: 'fixed',
      fixedAmount: 350000,
      nextPaymentDate: daysFromToday(6, nowDate),
      category: 'Tagihan & Utilitas',
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#6c97ff',
      note: 'Paket fiber 50 Mbps rutin bulanan',
      totalPaid: paidInternetTotal,
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 9, 5),
      updatedAt: now,
    },
    {
      id: 'bill_sb_air',
      ledgerId,
      name: 'Air PDAM & Iuran Kebersihan',
      cycle: 'monthly',
      pricingType: 'variable',
      lastNominal: 145000,
      nextPaymentDate: daysFromToday(9, nowDate),
      category: 'Tagihan & Utilitas',
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#2dd4a7',
      note: 'Tagihan air bersih & IPL lingkungan bulanan',
      totalPaid: paidAirTotal,
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 9, 10),
      updatedAt: now,
    },
    {
      id: 'bill_sb_digital',
      ledgerId,
      name: 'Langganan Cloud, Musik & Streaming',
      cycle: 'monthly',
      pricingType: 'fixed',
      fixedAmount: 119000,
      nextPaymentDate: daysFromToday(14, nowDate),
      category: 'Hiburan & Hobi',
      sourceAccountId: 'acc_sb_gopay',
      colorAccent: '#e3a8f7',
      note: 'Bundel penyimpanan cloud & musik personal',
      totalPaid: paidDigitalTotal,
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 9, 15),
      updatedAt: now,
    },
  ];

  const debts = [
    {
      id: 'debt_sb_motor',
      ledgerId,
      name: 'Cicilan Motor Harian',
      lender: 'Leasing Contoh Nusantara',
      totalDebt: 27000000,
      remainingDebt: 9000000,
      nextPaymentDate: daysFromToday(11, nowDate),
      dueDate: daysFromToday(180, nowDate),
      cycle: 'monthly',
      sourceAccountId: 'acc_sb_mandiri',
      colorAccent: '#ff7a4d',
      note: 'Angsuran Rp 1.500.000/bulan (12x telah terbayar, sisa 6x)',
      isPaidOff: false,
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 9, 20),
      updatedAt: now,
    },
    {
      id: 'debt_sb_laptop',
      ledgerId,
      name: 'Cicilan 0% Laptop Kerja',
      lender: 'Kartu Kredit Contoh',
      totalDebt: 9000000,
      remainingDebt: 3000000,
      nextPaymentDate: daysFromToday(16, nowDate),
      dueDate: daysFromToday(95, nowDate),
      cycle: 'monthly',
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#6c97ff',
      note: 'Angsuran Rp 1.000.000/bulan (6x telah terbayar, sisa 3x)',
      isPaidOff: false,
      createdAt: epochForDate(clampedDateInMonth(5, 1, nowDate), 9, 25),
      updatedAt: now,
    },
  ];

  // =========================================================================
  // 4. TARGET & SINKING FUNDS (4 TARGET DENGAN PROGRES BERVARIASI)
  // =========================================================================
  const goals = [
    {
      id: 'goal_sb_darurat',
      ledgerId,
      name: 'Dana Darurat 6 Bulan',
      type: 'sinking_fund',
      targetAmount: 30000000,
      currentAmount: 22500000, // 75%
      deadline: daysFromToday(150, nowDate),
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#2dd4a7',
      note: 'Prioritas utama dana keamanan finansial (75% tercapai)',
      isCompleted: false,
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 9, 30),
      updatedAt: now,
    },
    {
      id: 'goal_sb_liburan',
      ledgerId,
      name: 'Liburan Akhir Tahun',
      type: 'sinking_fund',
      targetAmount: 8000000,
      currentAmount: 4400000, // 55%
      deadline: daysFromToday(90, nowDate),
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#ffc933',
      note: 'Tiket transportasi, penginapan & akomodasi liburan keluarga',
      isCompleted: false,
      createdAt: epochForDate(clampedDateInMonth(9, 1, nowDate), 9, 35),
      updatedAt: now,
    },
    {
      id: 'goal_sb_kendaraan',
      ledgerId,
      name: 'Dana Perawatan Kendaraan',
      type: 'sinking_fund',
      targetAmount: 5000000,
      currentAmount: 2000000, // 40%
      deadline: daysFromToday(120, nowDate),
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#6c97ff',
      note: 'Pajak STNK tahunan, ban, dan servis besar berkala',
      isCompleted: false,
      createdAt: epochForDate(clampedDateInMonth(8, 1, nowDate), 9, 40),
      updatedAt: now,
    },
    {
      id: 'goal_sb_setup',
      ledgerId,
      name: 'Upgrade Monitor & Setup Kerja',
      type: 'wishlist',
      targetAmount: 6500000,
      currentAmount: 4200000, // ~65%
      deadline: daysFromToday(75, nowDate),
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#e3a8f7',
      note: 'Monitor 4K ergonomis untuk produktivitas harian',
      isCompleted: false,
      createdAt: epochForDate(clampedDateInMonth(6, 1, nowDate), 9, 45),
      updatedAt: now,
    },
  ];

  // =========================================================================
  // 5. PORTOFOLIO INVESTASI (4 INSTRUMEN ASET BERVARIASI)
  // =========================================================================
  const investments = [
    {
      id: 'inv_sb_rdpu',
      ledgerId,
      name: 'Reksa Dana Pasar Uang',
      type: 'mutual_fund',
      symbolOrTicker: 'RDPU',
      platform: 'Bibit (Contoh)',
      initialCapital: 8000000,
      currentValue: 8540000,
      colorAccent: '#2dd4a7',
      notes: 'Dana likuid risiko rendah untuk penyangga dana darurat',
      lastUpdated: todayStr,
      status: 'active',
      createdAt: epochForDate(clampedDateInMonth(11, 5, nowDate), 10, 0),
      updatedAt: now,
    },
    {
      id: 'inv_sb_bbca',
      ledgerId,
      name: 'Saham Bluechip Perbankan',
      type: 'stock',
      symbolOrTicker: 'BBCA',
      platform: 'Stockbit (Contoh)',
      initialCapital: 12000000,
      currentValue: 13680000,
      units: 1400,
      buyPricePerUnit: 8571,
      currentPricePerUnit: 9771,
      colorAccent: '#6c97ff',
      notes: 'Akumulasi bertahap (DCA) saham perbankan berdividen rutin',
      lastUpdated: todayStr,
      status: 'active',
      createdAt: epochForDate(clampedDateInMonth(10, 5, nowDate), 10, 5),
      updatedAt: now,
    },
    {
      id: 'inv_sb_emas',
      ledgerId,
      name: 'Tabungan Emas Digital',
      type: 'gold',
      symbolOrTicker: 'XAU',
      platform: 'Pegadaian Digital (Contoh)',
      initialCapital: 6500000,
      currentValue: 7620000,
      units: 5,
      buyPricePerUnit: 1300000,
      currentPricePerUnit: 1524000,
      colorAccent: '#ffc933',
      notes: 'Aset lindung nilai inflasi jangka panjang',
      lastUpdated: todayStr,
      status: 'active',
      createdAt: epochForDate(clampedDateInMonth(9, 5, nowDate), 10, 10),
      updatedAt: now,
    },
    {
      id: 'inv_sb_sbn',
      ledgerId,
      name: 'Obligasi Negara Ritel (ORI)',
      type: 'bond',
      symbolOrTicker: 'ORI025',
      platform: 'Bareksa (Contoh)',
      initialCapital: 10000000,
      currentValue: 10420000,
      colorAccent: '#e3a8f7',
      notes: 'Kupon tetap bulanan 6,35% p.a. dijamin negara',
      lastUpdated: todayStr,
      status: 'active',
      createdAt: epochForDate(clampedDateInMonth(7, 5, nowDate), 10, 15),
      updatedAt: now,
    },
  ];

  // =========================================================================
  // 6. OTOMATISASI TRANSAKSI (3 ATURAN AKTIF)
  // =========================================================================
  const automations = [
    {
      id: 'auto_sb_gaji',
      ledgerId,
      name: 'Gaji Bulanan Otomatis',
      type: 'income',
      category: 'Gaji Bulanan',
      amount: 10850000,
      sourceAccountId: 'acc_sb_mandiri',
      cycle: 'monthly',
      monthlyDay: 25,
      nextRunDate: daysFromToday(5, nowDate),
      lastRunDate: clampedDateInMonth(1, 25, nowDate),
      executionCount: 12,
      isActive: true,
      note: 'Pencatatan otomatis penerimaan gaji bulanan ke Mandiri',
      colorAccent: '#2dd4a7',
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 9, 50),
      updatedAt: now,
    },
    {
      id: 'auto_sb_tabung',
      ledgerId,
      name: 'Auto-Transfer Tabungan & Kebutuhan',
      type: 'transfer',
      category: 'Transfer Saldo',
      amount: 3600000,
      sourceAccountId: 'acc_sb_mandiri',
      toAccountId: 'acc_sb_bca',
      cycle: 'monthly',
      monthlyDay: 26,
      nextRunDate: daysFromToday(6, nowDate),
      lastRunDate: clampedDateInMonth(1, 26, nowDate),
      executionCount: 12,
      isActive: true,
      note: 'Alokasi rutin ke rekening BCA setelah tanggal gajian',
      colorAccent: '#6c97ff',
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 9, 52),
      updatedAt: now,
    },
    {
      id: 'auto_sb_invest',
      ledgerId,
      name: 'Auto-Invest Bulanan (DCA)',
      type: 'transfer',
      category: 'Transfer Saldo',
      amount: 1250000,
      sourceAccountId: 'acc_sb_bca',
      toAccountId: 'acc_sb_invest',
      cycle: 'monthly',
      monthlyDay: 27,
      nextRunDate: daysFromToday(7, nowDate),
      lastRunDate: clampedDateInMonth(1, 27, nowDate),
      executionCount: 12,
      isActive: true,
      note: 'Setoran investasi konsisten tiap akhir bulan',
      colorAccent: '#e3a8f7',
      createdAt: epochForDate(clampedDateInMonth(11, 1, nowDate), 9, 55),
      updatedAt: now,
    },
  ];

  // =========================================================================
  // 7. MODUL 6: PENGATURAN GAJI, KALENDER SHIFT AKTIF, & SETTINGS/SHIFT
  // =========================================================================
  // Cut-off kalender shift adalah tgl 21 s/d tgl 20 bulan berikutnya (mengikuti Module6SalaryShift)
  const activeShiftPeriodDate =
    nowDate.getDate() >= 21
      ? new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1)
      : new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
  const currentShiftPeriodKey = `${activeShiftPeriodDate.getFullYear()}-${String(activeShiftPeriodDate.getMonth() + 1).padStart(2, '0')}`;
  const rawShiftDays = generateShiftCalendar(
    activeShiftPeriodDate.getMonth(),
    activeShiftPeriodDate.getFullYear(),
    'C',
    undefined,
    DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3,
    true
  );

  let otSampleApplied = 0;
  const shiftDays = rawShiftDays.map((day, index) => {
    const meals = day.isWorkDay
      ? {
          breakfast: day.shiftCode === 'II',
          lunch: day.shiftCode === 'II' || day.shiftCode === 'III',
          dinner: day.shiftCode === 'I' || day.shiftCode === 'III',
        }
      : { breakfast: false, lunch: false, dinner: false };

    let overtimeHours = 0;
    if (day.isWorkDay && otSampleApplied < 4 && index % 5 === 2) {
      overtimeHours = otSampleApplied === 1 ? 3 : 2;
      otSampleApplied += 1;
    }

    const { index: overtimeIndex, amount: overtimeAmount } = calculateDailyOvertimeAmount(
      overtimeHours,
      day.dayType
    );

    return {
      ...day,
      overtimeHours,
      overtimeIndex,
      overtimeAmount,
      meals,
      note: overtimeHours > 0 ? 'Lembur operasional (Contoh Sandbox)' : day.note || '',
    };
  });

  // Pastikan breakdown periode berjalan valid dengan formula kalkulator
  calculateSalaryBreakdown(
    shiftDays,
    'TK/0',
    DEFAULT_MEAL_RATE,
    activeShiftPeriodDate.getFullYear(),
    activeShiftPeriodDate.getMonth()
  );

  const salarySettingsDoc = {
    ledgerId,
    basicSalary: BASIC_SALARY,
    housingAllowance: HOUSING_ALLOWANCE,
    shiftAllowance: SHIFT_ALLOWANCE,
    housingDeduction: HOUSING_DEDUCTION,
    mealRate: DEFAULT_MEAL_RATE,
    ptkpStatus: 'TK/0',
    defaultGroup: 'C',
    autoOTHoursPerSundayShift3: DEFAULT_AUTO_OT_HOURS_PER_SUNDAY_SHIFT_3,
    isAutoOTEnabled: true,
    payrollAuto: {
      enabled: false,
      accountId: 'acc_sb_mandiri',
    },
    updatedAt: now,
  };

  // =========================================================================
  // 8. SUSUN SELURUH OPERASI WRITE & COMMIT DALAM CHUNK MAKS 400 OPERASI
  // =========================================================================
  const writeOps: BatchWriteOp[] = [];

  ledgers.forEach((item) =>
    writeOps.push({ ref: doc(db, 'users', SANDBOX_UID, 'ledgers', item.id), data: item })
  );
  accounts.forEach((item) =>
    writeOps.push({ ref: doc(db, 'users', SANDBOX_UID, 'accounts', item.id), data: item })
  );
  transactions.forEach((item) =>
    writeOps.push({
      ref: doc(db, 'users', SANDBOX_UID, 'transactions', String(item.id)),
      data: item,
    })
  );
  bills.forEach((item) =>
    writeOps.push({ ref: doc(db, 'users', SANDBOX_UID, 'bills', item.id), data: item })
  );
  debts.forEach((item) =>
    writeOps.push({ ref: doc(db, 'users', SANDBOX_UID, 'debts', item.id), data: item })
  );
  goals.forEach((item) =>
    writeOps.push({ ref: doc(db, 'users', SANDBOX_UID, 'goals', item.id), data: item })
  );
  automations.forEach((item) =>
    writeOps.push({ ref: doc(db, 'users', SANDBOX_UID, 'automations', item.id), data: item })
  );
  investments.forEach((item) =>
    writeOps.push({ ref: doc(db, 'users', SANDBOX_UID, 'investments', item.id), data: item })
  );
  salaryHistoryRecords.forEach((item) =>
    writeOps.push({
      ref: doc(db, 'users', SANDBOX_UID, 'salaryHistory', String(item.id)),
      data: item,
    })
  );

  writeOps.push({
    ref: doc(db, 'users', SANDBOX_UID, 'salarySettings', ledgerId),
    data: salarySettingsDoc,
  });

  writeOps.push({
    ref: doc(db, 'users', SANDBOX_UID, 'shiftSchedules', `shift_${ledgerId}_${currentShiftPeriodKey}_grp_C`),
    data: {
      ledgerId,
      periodKey: `${currentShiftPeriodKey}_grp_C`,
      days: shiftDays,
      updatedAt: now,
    },
  });

  writeOps.push({
    ref: doc(db, 'users', SANDBOX_UID, 'settings', 'shift'),
    data: {
      defaultGroup: 'C',
      basicSalary: BASIC_SALARY,
      housingAllowance: HOUSING_ALLOWANCE,
      shiftAllowance: SHIFT_ALLOWANCE,
      mealRate: DEFAULT_MEAL_RATE,
      ptkpStatus: 'TK/0',
      updatedAt: now,
    },
  });

  writeOps.push({
    ref: doc(db, 'users', SANDBOX_UID, 'budgets', ledgerId),
    data: {
      ledgerId,
      budgets: {
        ...DEFAULT_CATEGORY_BUDGETS,
        'Makanan & Minuman': 1800000,
        'Belanja Bulanan': 1700000,
        'Transportasi': 600000,
        'Tagihan & Utilitas': 1250000,
        'Hiburan & Hobi': 450000,
        'Kesehatan': 350000,
        'Lainnya': 400000,
      },
      updatedAt: now,
    },
  });

  writeOps.push({
    ref: doc(db, 'users', SANDBOX_UID, 'settings', 'preferences'),
    data: {
      activeLedgerId: ledgerId,
      updatedAt: now,
    },
  });

  const totalBatches = Math.max(1, Math.ceil(writeOps.length / BATCH_CHUNK_SIZE));
  let completedBatches = 0;

  onProgress?.({
    phase: 'writing',
    completedBatches: 0,
    totalBatches,
    totalDocs: writeOps.length,
  });

  for (let i = 0; i < writeOps.length; i += BATCH_CHUNK_SIZE) {
    const chunk = writeOps.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((op) =>
      batch.set(op.ref, sanitizeFirestoreValue(op.data), { merge: true })
    );

    try {
      await batch.commit();
      completedBatches += 1;
      onProgress?.({
        phase: 'writing',
        completedBatches,
        totalBatches,
        totalDocs: writeOps.length,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) {
        handleFirestoreError(error, OperationType.WRITE, `users/${SANDBOX_UID}`);
      }
      throw new Error(
        `Gagal mengisi data dummy ke Sandbox (batch ${completedBatches + 1}/${totalBatches}): ${msg}`
      );
    }
  }

  const counts = {
    ledgers: ledgers.length,
    accounts: accounts.length,
    transactions: transactions.length,
    bills: bills.length,
    debts: debts.length,
    goals: goals.length,
    automations: automations.length,
    investments: investments.length,
    shiftSchedules: 1,
    salaryRecords: salaryHistoryRecords.length,
  };

  return { totalCreated: writeOps.length, totalBatches, counts };
}

let pendingAutoSeedPromise: Promise<{ seeded: boolean; result?: SandboxSeedResult }> | null = null;

/**
 * Memastikan jalur `users/user_artha_sandbox` otomatis memiliki data dummy 1 tahun penuh
 * ketika akun demo login dan database sandbox masih kosong (belum punya rekening & transaksi).
 * Aman dipanggil berulang kali (idempoten & tidak menimpa data yang sudah ada).
 */
export async function ensureSandboxSeededIfEmpty(): Promise<{
  seeded: boolean;
  result?: SandboxSeedResult;
}> {
  if (!isSandboxSession() || getActiveUserDocId() !== SANDBOX_UID) {
    return { seeded: false };
  }

  if (pendingAutoSeedPromise) {
    return pendingAutoSeedPromise;
  }

  pendingAutoSeedPromise = (async () => {
    try {
      const [accountsSnap, transactionsSnap] = await Promise.all([
        getDocs(query(collection(db, 'users', SANDBOX_UID, 'accounts'), limit(1))),
        getDocs(query(collection(db, 'users', SANDBOX_UID, 'transactions'), limit(1))),
      ]);

      if (!accountsSnap.empty || !transactionsSnap.empty) {
        return { seeded: false };
      }

      const result = await seedSandboxDummyData({ resetBeforeSeed: false });
      return { seeded: true, result };
    } finally {
      pendingAutoSeedPromise = null;
    }
  })();

  return pendingAutoSeedPromise;
}

/**
 * Menghapus seluruh dokumen pada `users/user_artha_sandbox/...` agar Sandbox kembali bersih.
 * Memecah penghapusan ke batch maksimal 400 operasi secara berurutan.
 */
export async function resetSandboxDummyData(): Promise<SandboxResetResult> {
  assertSandboxOnly();

  const refsToDelete: DocumentReference[] = [];

  await Promise.all(
    SANDBOX_COLLECTIONS.map(async (colName) => {
      const path = `users/${SANDBOX_UID}/${colName}`;
      try {
        const snap = await getDocs(collection(db, 'users', SANDBOX_UID, colName));
        snap.docs.forEach((d) => {
          // Pertahankan preferensi tema/privasi agar UX tidak berkedip, hanya hapus koleksi data & settings lain
          if (colName === 'settings' && d.id === 'preferences') return;
          refsToDelete.push(d.ref);
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) {
          handleFirestoreError(error, OperationType.LIST, path);
        }
        throw new Error(`Gagal membaca koleksi Sandbox "${colName}": ${msg}`);
      }
    })
  );

  let totalDeleted = 0;
  for (let i = 0; i < refsToDelete.length; i += BATCH_CHUNK_SIZE) {
    const chunk = refsToDelete.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.delete(ref));
    try {
      await batch.commit();
      totalDeleted += chunk.length;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) {
        handleFirestoreError(error, OperationType.DELETE, `users/${SANDBOX_UID}`);
      }
      throw new Error(`Gagal menghapus data Sandbox: ${msg}`);
    }
  }

  return { totalDeleted };
}
