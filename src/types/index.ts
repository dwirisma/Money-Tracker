/**
 * TypeScript Interfaces untuk Artha Personal Finance (Modul 1: Manajemen Kas & Ledgers)
 */

export interface Ledger {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  colorAccent?: string;
  isDefault?: boolean;
  createdAt: number | string;
}

export type AccountType = 'bank' | 'ewallet' | 'cash' | 'credit_card';

export interface Account {
  id: string;
  ledgerId: string; // Relasi wajib ke Buku Kas
  name: string;
  type: AccountType;
  balance: number;
  creditLimit?: number;
  colorAccent?: string;
  isArchived?: boolean;
  createdAt: number | string;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: string;
  ledgerId: string; // Relasi wajib ke Buku Kas
  accountId: string;
  toAccountId?: string | null;
  goalId?: string; // Referensi opsional ke Goal jika merupakan alokasi target
  billId?: string; // Referensi opsional ke Tagihan Rutin jika pembayaran tagihan
  debtId?: string; // Referensi opsional ke Utang jika pembayaran cicilan
  automationId?: string; // Referensi opsional ke Aturan Otomatisasi (Modul 4)
  type: TransactionType;
  amount: number;
  category?: string;
  date: string; // YYYY-MM-DD
  note?: string;
  createdAt: number | string;
}

export type GoalType = 'wishlist' | 'sinking_fund';

export interface Goal {
  id: string;
  ledgerId: string; // Relasi wajib ke Buku Kas Aktif
  name: string;
  type: GoalType;
  targetAmount: number;
  currentAmount: number;
  deadline?: string; // YYYY-MM-DD
  sourceAccountId?: string; // Khusus Sinking Fund
  colorAccent?: string;
  note?: string;
  isCompleted?: boolean;
  createdAt: number | string;
}

export type BillCycle = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type CustomIntervalUnit = 'days' | 'weeks' | 'months' | 'years';
export type BillPricingType = 'fixed' | 'variable';

export interface Bill {
  id: string;
  ledgerId: string; // Relasi wajib ke Buku Kas Aktif
  name: string;
  cycle: BillCycle;
  customIntervalCount?: number;
  customIntervalUnit?: CustomIntervalUnit;
  pricingType: BillPricingType;
  fixedAmount?: number;
  lastNominal?: number; // Nominal Periode Lalu (Estimasi)
  nextPaymentDate: string; // YYYY-MM-DD
  category?: string;
  sourceAccountId?: string;
  totalPaid: number;
  colorAccent?: string;
  note?: string;
  createdAt: number | string;
}

export interface Debt {
  id: string;
  ledgerId: string; // Relasi wajib ke Buku Kas Aktif
  name: string;
  lender?: string;
  totalDebt: number;
  remainingDebt: number;
  nextPaymentDate?: string; // Tanggal Jatuh Tempo Berikutnya (siklus terdekat)
  cycle?: BillCycle; // Siklus Pembayaran
  customIntervalCount?: number;
  customIntervalUnit?: CustomIntervalUnit;
  dueDate?: string; // Target Lunas Akhir (YYYY-MM-DD)
  sourceAccountId?: string;
  colorAccent?: string;
  note?: string;
  isPaidOff: boolean;
  createdAt: number | string;
}

/**
 * TypeScript Interfaces untuk Modul 4: Otomatisasi Transaksi (Auto-Income, Auto-Expense, Auto-Transfer)
 */
export type AutomationType = 'income' | 'expense' | 'transfer';
export type AutomationCycle = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface AutomationRule {
  id: string;
  ledgerId: string; // Relasi wajib ke Buku Kas Aktif
  name: string;
  type: AutomationType;
  amount: number;
  category?: string;
  sourceAccountId: string; // Akun pengeluaran, akun penerima income, atau akun asal transfer
  toAccountId?: string | null; // Khusus transfer
  cycle: AutomationCycle;
  monthlyDay?: number; // misal tgl 25 tiap bulan
  customIntervalCount?: number;
  customIntervalUnit?: CustomIntervalUnit;
  nextRunDate: string; // YYYY-MM-DD
  lastRunDate?: string | null;
  executionCount?: number;
  isActive: boolean;
  note?: string;
  colorAccent?: string;
  createdAt: number | string;
}

/**
 * TypeScript Interfaces untuk Modul 5: Laporan & Analitik (Reports & Analytics)
 */
export type ReportTimeRange = 'this_month' | 'last_month' | 'this_year' | 'all_time' | 'custom';

export interface CategoryExpenseSummary {
  category: string;
  amount: number;
  percentage: number;
  count: number;
  color: string;
}

export interface CashFlowTrendPoint {
  label: string;
  dateKey: string;
  income: number;
  expense: number;
  net: number;
}

export interface ReportMetrics {
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  savingsRate: number;
  transactionCount: number;
  avgDailyExpense: number;
  // Metrik Finansial Tingkat Lanjut (Modul 5 Refinement)
  momIncomePercent?: number | null;
  momExpensePercent?: number | null;
  prevIncome?: number;
  prevExpense?: number;
  fixedExpenseTotal?: number;
  variableExpenseTotal?: number;
  fixedExpensePercent?: number;
  variableExpensePercent?: number;
  financialRunwayMonths?: number | string;
  totalCashBalance?: number;
  avgMonthlyExpense3M?: number;
}

/**
 * TypeScript Interfaces untuk Modul 6: Prediksi Gaji & Kalender Shift (Group C)
 */
export type PTKPStatus = 'TK/0' | 'TK/1' | 'TK/2' | 'TK/3' | 'K/0' | 'K/1' | 'K/2' | 'K/3';

export type TERCategory = 'A' | 'B' | 'C';

export type ShiftType = 'pagi' | 'siang' | 'malam' | 'off';

export type DayType = 'NORMAL_WORKDAY' | 'OFF_OR_HOLIDAY';

export interface PublicHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

export type ShiftGroup = 'A' | 'B' | 'C' | 'D';

export interface SalaryAddOn {
  id: string;
  name: string; // e.g. "THR Idul Fitri", "Bonus Tahunan", "Insentif Produksi", "Rapelan Gaji"
  amount: number; // nominal penambah dalam Rupiah
  isEnabled: boolean; // toggle aktif/nonaktif
  note?: string;
  category?: 'thr' | 'bonus' | 'incentive' | 'overtime_extra' | 'other';
}

export interface ShiftDayLog {
  date: string; // YYYY-MM-DD
  dayName: string; // "Sen", "Sel", "Rab", etc.
  dayNumber: number; // 1 - 31
  isWorkDay: boolean; // true: Kerja, false: Libur/Off
  shiftType: string; // 'Shift 1 (Malam)' | 'Shift 2 (Pagi)' | 'Shift 3 (Sore)' | 'Off'
  shiftCode?: 'I' | 'II' | 'III' | 'O';
  shiftHours?: string; // '23:00 - 07:00', '07:00 - 15:00', '15:00 - 23:00', 'Libur'
  dayType: DayType; // 'NORMAL_WORKDAY' | 'OFF_OR_HOLIDAY'
  isPublicHoliday: boolean;
  holidayName?: string;
  overtimeHours: number;
  overtimeIndex: number;
  overtimeAmount: number;
  meals: {
    breakfast: boolean; // Pagi
    lunch: boolean; // Siang
    dinner: boolean; // Malam
  };
  note?: string;
}

export interface SalaryBreakdown {
  basicSalary: number; // Rp 9.345.000
  housingAllowance: number; // Rp 1.350.000
  shiftAllowance: number; // Rp 1.700.000
  totalAllowance: number; // Rp 12.395.000

  otBaseRatePerHour: number; // (Basic + Housing) / 173 = Rp 61.820,81
  autoOTHours: number; // e.g. 8.25 atau 16.50 jam (Auto O/T AGC)
  autoOTIndex: number;
  autoOTAmount: number;
  actualAdditionalOTHours: number;
  totalWorkDayOTHours: number;
  totalOffDayOTHours: number;
  totalOTHours: number;
  totalOTIndex: number;
  totalOTAmount: number;

  // Komponen Tambahan Gaji (Add-On / Bonus / THR / Rapelan)
  addOns?: SalaryAddOn[];
  totalAddOns: number;

  grossIncome: number; // totalAllowance + totalOTAmount + totalAddOns

  mealRate: number; // default Rp 15.000
  totalMealCount: number;
  totalMealDeduction: number;
  housingDeduction: number; // Rp 1.050.000

// Tambahan untuk Natura & Potongan Karyawan
  medicalBik: number;
  bpjsJkkCo: number;
  bpjsJkmCo: number;
  bpjsKesCo: number;
  totalBpjsCo: number;
  bpjsJhtEmp: number;
  bpjsJpEmp: number;
  bpjsKesEmp: number;
  totalBpjsEmp: number;
  cashIncome: number;
  cashDeductions: number;

  ptkpStatus: PTKPStatus;
  terCategory: TERCategory;
  terRate: number; // e.g. 8 (%)
  terTaxAmount: number;

  totalDeductions: number;
  netSalary: number; // Take Home Pay

  paydayDate: string; // YYYY-MM-DD
  paydayOriginalDate: string;
  isPaydayAdjusted: boolean;
}

export interface SalaryHistoryRecord {
  id: string;
  ledgerId: string; // Relasi ke buku kas
  period: string; // Contoh: "2026-11" (diambil dari bulan kalender shift aktif)
  totalOtHours: number; // Angka total jam lembur sebulan
  totalMeals: number; // Angka total ceklis makan sebulan
  totalAddOns?: number; // Total komponen tambahan (Bonus/THR/dll)
  netSalary: number; // Angka Pendapatan Bersih
  grossSalary: number; // Angka Pendapatan Kotor
  createdAt: any; // serverTimestamp() atau timestamp number / string
}

export type InvestmentAssetType = 'stock' | 'mutual_fund' | 'crypto' | 'gold' | 'bond' | 'deposit' | 'p2p' | 'other';

export interface InvestmentAsset {
  id: string;
  ledgerId: string; // Relasi ke buku kas
  name: string;
  symbolOrTicker?: string;
  type: InvestmentAssetType;
  platform?: string; // e.g. Stockbit, Bibit, Ajaib, Pluang, Indodax, BCA
  initialCapital: number; // Modal pembelian (cost basis)
  currentValue: number; // Nilai pasar saat ini
  units?: number; // Jumlah unit / lembar / koin / gram
  buyPricePerUnit?: number;
  currentPricePerUnit?: number;
  colorAccent?: string;
  notes?: string;
  lastUpdated?: string; // YYYY-MM-DD
  createdAt: number | string;
}
