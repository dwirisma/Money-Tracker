/**
 * Sandbox Dummy Data Seeder & Resetter
 * KHUSUS beroperasi pada jalur `users/user_artha_sandbox` ketika sesi berada pada Sandbox / Demo Mode.
 * Dilindungi guard keras agar tidak pernah dapat menyentuh data produksi `users/user_artha`.
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
const BATCH_CHUNK_SIZE = 450;

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

export interface SandboxSeedResult {
  totalCreated: number;
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

function assertSandboxOnly(): void {
  if (!isSandboxSession() || getActiveUserDocId() !== SANDBOX_UID) {
    throw new Error('Operasi data dummy hanya diizinkan pada Sandbox / Demo Mode (users/user_artha_sandbox).');
  }
}

function daysFromToday(deltaDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateStr(d);
}

function dateInMonthsAgo(monthsAgo: number, dayOfMonth: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(dayOfMonth, lastDay));
  return toLocalDateStr(target);
}

function periodKeyForMonthsAgo(monthsAgo: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Mengisi contoh lengkap buku kas, rekening, transaksi, tagihan, utang, target,
 * otomatisasi, investasi, dan anggaran ke `users/user_artha_sandbox/...`.
 */
export async function seedSandboxDummyData(): Promise<SandboxSeedResult> {
  assertSandboxOnly();

  const now = Date.now();
  const ledgerId = 'ledger_sandbox_main';

  const ledgers = [
    {
      id: ledgerId,
      name: 'Keuangan Sandbox (Demo)',
      description: 'Buku kas contoh untuk pengujian fitur di Sandbox Mode',
      colorAccent: '#2dd4a7',
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const accounts = [
    {
      id: 'acc_sb_bca',
      ledgerId,
      name: 'Bank BCA Utama',
      type: 'bank',
      balance: 14500000,
      colorAccent: '#6c97ff',
      pockets: [
        {
          id: 'pkt_sb_darurat',
          name: 'Cadangan Darurat',
          balance: 4000000,
          targetAmount: 10000000,
          colorAccent: '#2dd4a7',
          createdAt: now,
        },
        {
          id: 'pkt_sb_liburan',
          name: 'Tabungan Liburan',
          balance: 1500000,
          targetAmount: 3000000,
          colorAccent: '#ffc933',
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'acc_sb_mandiri',
      ledgerId,
      name: 'Bank Mandiri Gaji',
      type: 'bank',
      balance: 6850000,
      colorAccent: '#ffc933',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'acc_sb_gopay',
      ledgerId,
      name: 'GoPay & QRIS',
      type: 'ewallet',
      balance: 1250000,
      colorAccent: '#2dd4a7',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'acc_sb_cash',
      ledgerId,
      name: 'Dompet Tunai',
      type: 'cash',
      balance: 650000,
      colorAccent: '#ff7a4d',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const transactions = [
    {
      id: 'tx_sb_01',
      ledgerId,
      accountId: 'acc_sb_mandiri',
      type: 'income',
      amount: 8750000,
      category: 'Gaji Bulanan',
      note: 'Gaji bulanan contoh (Sandbox)',
      date: daysFromToday(-15),
      createdAt: now - 15 * 86400000,
      updatedAt: now,
    },
    {
      id: 'tx_sb_02',
      ledgerId,
      accountId: 'acc_sb_mandiri',
      toAccountId: 'acc_sb_bca',
      type: 'transfer',
      amount: 3000000,
      category: 'Transfer Saldo',
      note: 'Alokasi tabungan ke BCA',
      date: daysFromToday(-14),
      createdAt: now - 14 * 86400000,
      updatedAt: now,
    },
    {
      id: 'tx_sb_03',
      ledgerId,
      accountId: 'acc_sb_gopay',
      type: 'expense',
      amount: 145000,
      category: 'Makanan & Minuman',
      note: 'Makan siang & kopi minggu ini',
      date: daysFromToday(-2),
      createdAt: now - 2 * 86400000,
      updatedAt: now,
    },
    {
      id: 'tx_sb_04',
      ledgerId,
      accountId: 'acc_sb_bca',
      type: 'expense',
      amount: 620000,
      category: 'Belanja Bulanan',
      note: 'Belanja kebutuhan dapur supermarket',
      date: daysFromToday(-5),
      createdAt: now - 5 * 86400000,
      updatedAt: now,
    },
    {
      id: 'tx_sb_05',
      ledgerId,
      accountId: 'acc_sb_gopay',
      type: 'expense',
      amount: 185000,
      category: 'Transportasi',
      note: 'Isi bensin & tol harian',
      date: daysFromToday(-4),
      createdAt: now - 4 * 86400000,
      updatedAt: now,
    },
    {
      id: 'tx_sb_06',
      ledgerId,
      accountId: 'acc_sb_bca',
      type: 'expense',
      amount: 350000,
      category: 'Tagihan & Utilitas',
      note: 'Tagihan Internet WiFi rumah',
      date: daysFromToday(-8),
      createdAt: now - 8 * 86400000,
      updatedAt: now,
    },
    {
      id: 'tx_sb_07',
      ledgerId,
      accountId: 'acc_sb_cash',
      type: 'expense',
      amount: 95000,
      category: 'Kesehatan',
      note: 'Vitamin & apotek',
      date: daysFromToday(-1),
      createdAt: now - 1 * 86400000,
      updatedAt: now,
    },
    {
      id: 'tx_sb_08',
      ledgerId,
      accountId: 'acc_sb_mandiri',
      type: 'income',
      amount: 8500000,
      category: 'Gaji Bulanan',
      note: 'Gaji bulan lalu (Sandbox)',
      date: daysFromToday(-45),
      createdAt: now - 45 * 86400000,
      updatedAt: now,
    },
    {
      id: 'tx_sb_09',
      ledgerId,
      accountId: 'acc_sb_bca',
      type: 'expense',
      amount: 2450000,
      category: 'Belanja Bulanan',
      note: 'Pengeluaran rutin bulan lalu',
      date: daysFromToday(-40),
      createdAt: now - 40 * 86400000,
      updatedAt: now,
    },
    {
      id: 'tx_sb_10',
      ledgerId,
      accountId: 'acc_sb_bca',
      type: 'income',
      amount: 1250000,
      category: 'Bonus & THR',
      note: 'Proyek sampingan contoh',
      date: daysFromToday(-3),
      createdAt: now - 3 * 86400000,
      updatedAt: now,
    },
    // Riwayat 6 bulan terakhir untuk mengisi Grafik Arus Kas 6 Bulan & Laporan Analitik
    ...[1, 2, 3, 4, 5].flatMap((mAgo, idx) => {
      const salary = 8400000 + (idx % 3) * 225000;
      const grocery = 1850000 + (idx % 2) * 320000;
      const dining = 950000 + (idx % 3) * 140000;
      const utilities = 720000 + (idx % 2) * 85000;
      const transport = 540000 + (idx % 3) * 90000;
      const baseTs = now - mAgo * 30 * 86400000;
      return [
        {
          id: `tx_sb_6m_${mAgo}_inc`,
          ledgerId,
          accountId: 'acc_sb_mandiri',
          type: 'income',
          amount: salary,
          category: 'Gaji Bulanan',
          note: `Gaji bulanan ${periodKeyForMonthsAgo(mAgo)} (Sandbox)`,
          date: dateInMonthsAgo(mAgo, 25),
          createdAt: baseTs,
          updatedAt: now,
        },
        {
          id: `tx_sb_6m_${mAgo}_groc`,
          ledgerId,
          accountId: 'acc_sb_bca',
          type: 'expense',
          amount: grocery,
          category: 'Belanja Bulanan',
          note: `Belanja kebutuhan pokok ${periodKeyForMonthsAgo(mAgo)}`,
          date: dateInMonthsAgo(mAgo, 10),
          createdAt: baseTs - 86400000,
          updatedAt: now,
        },
        {
          id: `tx_sb_6m_${mAgo}_food`,
          ledgerId,
          accountId: 'acc_sb_gopay',
          type: 'expense',
          amount: dining,
          category: 'Makanan & Minuman',
          note: `Konsumsi & makan harian ${periodKeyForMonthsAgo(mAgo)}`,
          date: dateInMonthsAgo(mAgo, 14),
          createdAt: baseTs - 2 * 86400000,
          updatedAt: now,
        },
        {
          id: `tx_sb_6m_${mAgo}_util`,
          ledgerId,
          accountId: 'acc_sb_bca',
          type: 'expense',
          amount: utilities,
          category: 'Tagihan & Utilitas',
          note: `Listrik, air & WiFi ${periodKeyForMonthsAgo(mAgo)}`,
          date: dateInMonthsAgo(mAgo, 18),
          createdAt: baseTs - 3 * 86400000,
          updatedAt: now,
        },
        {
          id: `tx_sb_6m_${mAgo}_trans`,
          ledgerId,
          accountId: 'acc_sb_gopay',
          type: 'expense',
          amount: transport,
          category: 'Transportasi',
          note: `BBM & tol bulanan ${periodKeyForMonthsAgo(mAgo)}`,
          date: dateInMonthsAgo(mAgo, 21),
          createdAt: baseTs - 4 * 86400000,
          updatedAt: now,
        },
      ];
    }),
  ];

  const bills = [
    {
      id: 'bill_sb_internet',
      ledgerId,
      name: 'Internet WiFi Rumah',
      cycle: 'monthly',
      pricingType: 'fixed',
      fixedAmount: 350000,
      nextPaymentDate: daysFromToday(5),
      category: 'Tagihan & Utilitas',
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#6c97ff',
      note: 'Jatuh tempo rutin bulanan',
      totalPaid: 1050000,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bill_sb_listrik',
      ledgerId,
      name: 'Listrik PLN Pascabayar',
      cycle: 'monthly',
      pricingType: 'variable',
      lastNominal: 420000,
      nextPaymentDate: daysFromToday(2),
      category: 'Tagihan & Utilitas',
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#ffc933',
      note: 'Nominal menyesuaikan pemakaian bulanan',
      totalPaid: 1680000,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bill_sb_cloud',
      ledgerId,
      name: 'Langganan Cloud & Musik',
      cycle: 'monthly',
      pricingType: 'fixed',
      fixedAmount: 99000,
      nextPaymentDate: daysFromToday(12),
      category: 'Hiburan & Hobi',
      sourceAccountId: 'acc_sb_gopay',
      colorAccent: '#e3a8f7',
      note: 'Paket personal bulanan',
      totalPaid: 297000,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const debts = [
    {
      id: 'debt_sb_motor',
      ledgerId,
      name: 'Cicilan Motor Harian',
      lender: 'Leasing Contoh',
      totalDebt: 18000000,
      remainingDebt: 7500000,
      nextPaymentDate: daysFromToday(10),
      cycle: 'monthly',
      sourceAccountId: 'acc_sb_mandiri',
      colorAccent: '#ff7a4d',
      note: 'Cicilan rutin Rp 1.500.000/bulan',
      isPaidOff: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'debt_sb_gadget',
      ledgerId,
      name: 'Cicilan 0% Laptop Kerja',
      lender: 'Kartu Kredit Contoh',
      totalDebt: 6000000,
      remainingDebt: 2000000,
      nextPaymentDate: daysFromToday(18),
      cycle: 'monthly',
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#6c97ff',
      note: 'Sisa 4x angsuran',
      isPaidOff: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const goals = [
    {
      id: 'goal_sb_darurat',
      ledgerId,
      name: 'Dana Darurat 6 Bulan',
      type: 'sinking_fund',
      targetAmount: 30000000,
      currentAmount: 12000000,
      deadline: daysFromToday(240),
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#2dd4a7',
      note: 'Prioritas utama dana keamanan keluarga',
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'goal_sb_laptop',
      ledgerId,
      name: 'Upgrade Laptop Kerja',
      type: 'wishlist',
      targetAmount: 15000000,
      currentAmount: 4500000,
      deadline: daysFromToday(150),
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#ffc933',
      note: 'Target laptop baru untuk produktivitas',
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'goal_sb_liburan',
      ledgerId,
      name: 'Liburan Akhir Tahun',
      type: 'sinking_fund',
      targetAmount: 6000000,
      currentAmount: 3200000,
      deadline: daysFromToday(90),
      sourceAccountId: 'acc_sb_bca',
      colorAccent: '#6c97ff',
      note: 'Tiket & akomodasi liburan',
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const automations = [
    {
      id: 'auto_sb_gaji',
      ledgerId,
      name: 'Gaji Bulanan Otomatis (Contoh)',
      type: 'income',
      category: 'Gaji Bulanan',
      amount: 8750000,
      sourceAccountId: 'acc_sb_mandiri',
      cycle: 'monthly',
      monthlyDay: 25,
      nextRunDate: daysFromToday(15),
      isActive: true,
      note: 'Contoh auto-income bulanan',
      colorAccent: '#2dd4a7',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'auto_sb_tabung',
      ledgerId,
      name: 'Auto-Transfer Tabungan Rutin',
      type: 'transfer',
      category: 'Transfer Saldo',
      amount: 1500000,
      sourceAccountId: 'acc_sb_mandiri',
      toAccountId: 'acc_sb_bca',
      cycle: 'monthly',
      monthlyDay: 26,
      nextRunDate: daysFromToday(16),
      isActive: true,
      note: 'Sisihkan tabungan setiap habis gajian',
      colorAccent: '#6c97ff',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const investments = [
    {
      id: 'inv_sb_rdpu',
      ledgerId,
      name: 'Reksa Dana Pasar Uang',
      type: 'mutual_fund',
      symbolOrTicker: 'RDPU',
      platform: 'Bibit (Contoh)',
      initialCapital: 5000000,
      currentValue: 5320000,
      colorAccent: '#2dd4a7',
      notes: 'Portofolio likuid risiko rendah',
      lastUpdated: toLocalDateStr(new Date()),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'inv_sb_emas',
      ledgerId,
      name: 'Tabungan Emas Digital',
      type: 'gold',
      symbolOrTicker: 'XAU',
      platform: 'Pegadaian Digital (Contoh)',
      initialCapital: 4000000,
      currentValue: 4650000,
      colorAccent: '#ffc933',
      notes: 'Lindung nilai jangka panjang',
      lastUpdated: toLocalDateStr(new Date()),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ];

  // Data contoh Modul 6: Pengaturan Gaji, Kalender Shift periode berjalan, & Riwayat Slip Gaji
  // Cut-off kalender shift adalah tgl 21 s/d tgl 20 bulan berikutnya (mengikuti Module6SalaryShift)
  const nowDate = new Date();
  const activeShiftPeriodDate =
    nowDate.getDate() >= 21
      ? new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1)
      : new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
  const currentPeriodKey = `${activeShiftPeriodDate.getFullYear()}-${String(activeShiftPeriodDate.getMonth() + 1).padStart(2, '0')}`;
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
    if (day.isWorkDay && otSampleApplied < 3 && index % 6 === 2) {
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

  const sampleBreakdown = calculateSalaryBreakdown(
    shiftDays,
    'TK/0',
    DEFAULT_MEAL_RATE,
    nowDate.getFullYear(),
    nowDate.getMonth()
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

  const salaryHistoryRecords = [1, 2].map((mAgo) => {
    const period = periodKeyForMonthsAgo(mAgo);
    return {
      id: `sal_sb_${ledgerId}_${period}`,
      ledgerId,
      period,
      totalOtHours: Math.max(8, Math.round(sampleBreakdown.totalOTHours + (mAgo === 1 ? 2 : -1))),
      totalMeals: Math.max(20, sampleBreakdown.totalMealCount),
      totalAddOns: mAgo === 1 ? 500000 : 0,
      grossSalary: Math.round(sampleBreakdown.grossIncome + (mAgo === 1 ? 500000 : 0)),
      netSalary: Math.round(sampleBreakdown.netSalary + (mAgo === 1 ? 450000 : 0)),
      createdAt: now - mAgo * 30 * 86400000,
    };
  });

  const batch = writeBatch(db);

  ledgers.forEach((item) => batch.set(doc(db, 'users', SANDBOX_UID, 'ledgers', item.id), item, { merge: true }));
  accounts.forEach((item) => batch.set(doc(db, 'users', SANDBOX_UID, 'accounts', item.id), item, { merge: true }));
  transactions.forEach((item) => batch.set(doc(db, 'users', SANDBOX_UID, 'transactions', item.id), item, { merge: true }));
  bills.forEach((item) => batch.set(doc(db, 'users', SANDBOX_UID, 'bills', item.id), item, { merge: true }));
  debts.forEach((item) => batch.set(doc(db, 'users', SANDBOX_UID, 'debts', item.id), item, { merge: true }));
  goals.forEach((item) => batch.set(doc(db, 'users', SANDBOX_UID, 'goals', item.id), item, { merge: true }));
  automations.forEach((item) => batch.set(doc(db, 'users', SANDBOX_UID, 'automations', item.id), item, { merge: true }));
  investments.forEach((item) => batch.set(doc(db, 'users', SANDBOX_UID, 'investments', item.id), item, { merge: true }));
  salaryHistoryRecords.forEach((item) =>
    batch.set(doc(db, 'users', SANDBOX_UID, 'salaryHistory', item.id), item, { merge: true })
  );

  batch.set(
    doc(db, 'users', SANDBOX_UID, 'salarySettings', ledgerId),
    salarySettingsDoc,
    { merge: true }
  );

  batch.set(
    doc(db, 'users', SANDBOX_UID, 'shiftSchedules', `shift_${ledgerId}_${currentPeriodKey}_grp_C`),
    {
      ledgerId,
      periodKey: `${currentPeriodKey}_grp_C`,
      days: shiftDays,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    doc(db, 'users', SANDBOX_UID, 'budgets', ledgerId),
    {
      ledgerId,
      budgets: { ...DEFAULT_CATEGORY_BUDGETS },
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    doc(db, 'users', SANDBOX_UID, 'settings', 'preferences'),
    {
      activeLedgerId: ledgerId,
      updatedAt: now,
    },
    { merge: true }
  );

  try {
    await batch.commit();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) {
      handleFirestoreError(error, OperationType.WRITE, `users/${SANDBOX_UID}`);
    }
    throw new Error(`Gagal mengisi data dummy ke Sandbox: ${msg}`);
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

  const totalCreated = Object.values(counts).reduce((sum, n) => sum + n, 0) + 3;
  return { totalCreated, counts };
}

let pendingAutoSeedPromise: Promise<{ seeded: boolean; result?: SandboxSeedResult }> | null = null;

/**
 * Memastikan jalur `users/user_artha_sandbox` otomatis memiliki data dummy lengkap
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

      const result = await seedSandboxDummyData();
      return { seeded: true, result };
    } finally {
      pendingAutoSeedPromise = null;
    }
  })();

  return pendingAutoSeedPromise;
}

/**
 * Menghapus seluruh dokumen pada `users/user_artha_sandbox/...` agar Sandbox kembali bersih.
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
          // Pertahankan preferensi tema/privasi agar UX tidak berkedip, hanya hapus activeLedgerId & koleksi data
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
