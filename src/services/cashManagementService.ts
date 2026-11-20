/**
 * Layanan Manajemen Kas & Keuangan Artha (100% Cloud Firestore Real-Time)
 * Single Source of Truth di Cloud Firestore dengan listener `onSnapshot` dan mutasi atomik `runTransaction` / `writeBatch`.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  OperationType,
  handleFirestoreError,
  logFirestoreListenerError,
} from '../config/firebase';
import {
  Ledger,
  Account,
  AccountPocket,
  Transaction,
  Goal,
  Bill,
  BillCycle,
  CustomIntervalUnit,
  Debt,
  AutomationRule,
  SalaryHistoryRecord,
  ShiftDayLog,
  SalaryAddOn,
  PTKPStatus,
  ShiftGroup,
} from '../types';
import { toLocalDateStr } from '../utils/localDate';
import { recordAutomationEvent } from './notificationService';

export const DEFAULT_LEDGER_ID = 'ledger_personal_default';

export interface CustomSalarySettings {
  basicSalary: number;
  housingAllowance: number;
  shiftAllowance: number;
  housingDeduction: number;
  mealRate: number;
  medicalBik?: number;
  medicalAllowanceBik?: number;
  isMedicalBikActive?: boolean;
  ptkpStatus: PTKPStatus;
  defaultGroup?: ShiftGroup;
  autoOTHoursPerSundayShift3?: number;
  isAutoOTEnabled?: boolean;
  payrollAuto?: {
    enabled: boolean;
    accountId: string;
  };
}

export interface HolidaysCloudData {
  customHolidays: Record<string, string>;
  syncedHolidays: Record<string, string>;
}

/** Menghapus properti `undefined` secara rekursif agar aman dikirim ke Firestore */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) {
        clean[k] = stripUndefined(v);
      }
    });
    return clean as T;
  }
  return value;
}

function toTimestampMs(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  return 0;
}

// ============================================================================
// FUNGSI HELPER MURNI (KALKULASI & SIKLUS TANGGAL)
// ============================================================================

export function calculateNetWorthAccounts(accounts: Account[]) {
  let totalAssets = 0;
  let totalCreditDebt = 0;
  accounts.forEach((acc) => {
    if (acc.isArchived) return;
    if (acc.type === 'credit_card') {
      if (acc.balance < 0) {
        totalCreditDebt += Math.abs(acc.balance);
      } else {
        totalAssets += acc.balance;
      }
    } else {
      if (acc.balance >= 0) {
        totalAssets += acc.balance;
      } else {
        totalCreditDebt += Math.abs(acc.balance);
      }
    }
  });
  const netBalance = totalAssets - totalCreditDebt;
  return {
    totalAssets,
    totalCreditDebt,
    totalLiabilities: totalCreditDebt,
    netBalance,
    netWorth: netBalance,
  };
}

export function advancePaymentDate(
  dateStr: string,
  cycle: BillCycle,
  customCount: number = 1,
  customUnit: CustomIntervalUnit = 'months'
): string {
  const parts = (dateStr || toLocalDateStr(new Date())).split('-').map(Number);
  const d = new Date(parts[0] || new Date().getFullYear(), (parts[1] || 1) - 1, parts[2] || 1);
  const count = Math.max(1, Math.round(customCount || 1));

  if (cycle === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (cycle === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (cycle === 'monthly') {
    const origDay = d.getDate();
    d.setMonth(d.getMonth() + 1);
    if (d.getDate() < origDay) d.setDate(0);
  } else if (cycle === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else if (cycle === 'custom') {
    if (customUnit === 'days') d.setDate(d.getDate() + count);
    else if (customUnit === 'weeks') d.setDate(d.getDate() + count * 7);
    else if (customUnit === 'months') {
      const origDay = d.getDate();
      d.setMonth(d.getMonth() + count);
      if (d.getDate() < origDay) d.setDate(0);
    } else if (customUnit === 'years') {
      d.setFullYear(d.getFullYear() + count);
    }
  }
  return toLocalDateStr(d);
}

export function stepBackPaymentDate(
  dateStr: string,
  cycle: BillCycle,
  customCount: number = 1,
  customUnit: CustomIntervalUnit = 'months'
): string {
  const parts = (dateStr || toLocalDateStr(new Date())).split('-').map(Number);
  const d = new Date(parts[0] || new Date().getFullYear(), (parts[1] || 1) - 1, parts[2] || 1);
  const count = Math.max(1, Math.round(customCount || 1));

  if (cycle === 'daily') {
    d.setDate(d.getDate() - 1);
  } else if (cycle === 'weekly') {
    d.setDate(d.getDate() - 7);
  } else if (cycle === 'monthly') {
    const origDay = d.getDate();
    d.setMonth(d.getMonth() - 1);
    if (d.getDate() < origDay) d.setDate(0);
  } else if (cycle === 'yearly') {
    d.setFullYear(d.getFullYear() - 1);
  } else if (cycle === 'custom') {
    if (customUnit === 'days') d.setDate(d.getDate() - count);
    else if (customUnit === 'weeks') d.setDate(d.getDate() - count * 7);
    else if (customUnit === 'months') {
      const origDay = d.getDate();
      d.setMonth(d.getMonth() - count);
      if (d.getDate() < origDay) d.setDate(0);
    } else if (customUnit === 'years') {
      d.setFullYear(d.getFullYear() - count);
    }
  }
  return toLocalDateStr(d);
}

export function getCycleLabel(
  cycle?: BillCycle,
  customCount?: number,
  customUnit?: CustomIntervalUnit
): string {
  switch (cycle) {
    case 'daily':
      return 'Harian';
    case 'weekly':
      return 'Mingguan';
    case 'monthly':
      return 'Bulanan';
    case 'yearly':
      return 'Tahunan';
    case 'custom': {
      const c = customCount || 1;
      const uMap: Record<CustomIntervalUnit, string> = {
        days: 'Hari',
        weeks: 'Minggu',
        months: 'Bulan',
        years: 'Tahun',
      };
      return `Tiap ${c} ${uMap[customUnit || 'months']}`;
    }
    default:
      return 'Bulanan';
  }
}

export function getBillDueStatus(nextPaymentDate?: string) {
  const todayStr = toLocalDateStr(new Date());
  const todayParts = todayStr.split('-').map(Number);
  const targetParts = (nextPaymentDate || todayStr).split('-').map(Number);
  const t0 = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
  const t1 = new Date(targetParts[0], targetParts[1] - 1, targetParts[2]).getTime();
  const daysLeft = Math.round((t1 - t0) / 86400000);

  if (daysLeft < 0) {
    return {
      isOverdue: true,
      isToday: false,
      isDueSoon: true,
      daysLeft,
      diffDays: daysLeft,
      status: 'overdue' as const,
      label: `Telat ${Math.abs(daysLeft)} hari`,
      color: '#ef4444',
      bg: '#fee2e2',
    };
  }
  if (daysLeft === 0) {
    return {
      isOverdue: false,
      isToday: true,
      isDueSoon: true,
      daysLeft: 0,
      diffDays: 0,
      status: 'today' as const,
      label: 'Hari Ini',
      color: '#d97706',
      bg: '#fef3c7',
    };
  }
  if (daysLeft <= 3) {
    return {
      isOverdue: false,
      isToday: false,
      isDueSoon: true,
      daysLeft,
      diffDays: daysLeft,
      status: 'soon' as const,
      label: `${daysLeft} hari lagi`,
      color: '#d97706',
      bg: '#fef3c7',
    };
  }
  return {
    isOverdue: false,
    isToday: false,
    isDueSoon: false,
    daysLeft,
    diffDays: daysLeft,
    status: 'upcoming' as const,
    label: `${daysLeft} hari lagi`,
    color: '#059669',
    bg: '#d1fae5',
  };
}

// ============================================================================
// REAL-TIME SUBSCRIBERS (`onSnapshot`) — ZERO COMPOSITE INDEXES
// ============================================================================

export function subscribeLedgers(
  uid: string,
  onData: (ledgers: Ledger[]) => void
): () => void {
  const path = `users/${uid}/ledgers`;
  return onSnapshot(
    collection(db, 'users', uid, 'ledgers'),
    (snap) => {
      const list: Ledger[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Ledger, 'id'>) }))
        .sort((a, b) => toTimestampMs(a.createdAt) - toTimestampMs(b.createdAt));
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export function subscribeAccountsByLedger(
  uid: string,
  ledgerId: string,
  onData: (accounts: Account[]) => void
): () => void {
  if (!ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/accounts`;
  const q = query(collection(db, 'users', uid, 'accounts'), where('ledgerId', '==', ledgerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: Account[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Account, 'id'>) }))
        .sort((a, b) => toTimestampMs(a.createdAt) - toTimestampMs(b.createdAt));
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export function subscribeTransactionsByLedger(
  uid: string,
  ledgerId: string,
  onData: (transactions: Transaction[]) => void
): () => void {
  if (!ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/transactions`;
  const q = query(collection(db, 'users', uid, 'transactions'), where('ledgerId', '==', ledgerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: Transaction[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }))
        .sort((a, b) => {
          const dateCmp = (b.date || '').localeCompare(a.date || '');
          if (dateCmp !== 0) return dateCmp;
          return toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt);
        });
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export function subscribeGoalsByLedger(
  uid: string,
  ledgerId: string,
  onData: (goals: Goal[]) => void
): () => void {
  if (!ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/goals`;
  const q = query(collection(db, 'users', uid, 'goals'), where('ledgerId', '==', ledgerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: Goal[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Goal, 'id'>) }))
        .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export function subscribeBillsByLedger(
  uid: string,
  ledgerId: string,
  onData: (bills: Bill[]) => void
): () => void {
  if (!ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/bills`;
  const q = query(collection(db, 'users', uid, 'bills'), where('ledgerId', '==', ledgerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: Bill[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Bill, 'id'>) }))
        .sort((a, b) => (a.nextPaymentDate || '').localeCompare(b.nextPaymentDate || ''));
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export function subscribeDebtsByLedger(
  uid: string,
  ledgerId: string,
  onData: (debts: Debt[]) => void
): () => void {
  if (!ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/debts`;
  const q = query(collection(db, 'users', uid, 'debts'), where('ledgerId', '==', ledgerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: Debt[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Debt, 'id'>) }))
        .sort((a, b) => {
          if (a.isPaidOff !== b.isPaidOff) return a.isPaidOff ? 1 : -1;
          return (a.nextPaymentDate || a.dueDate || '9999-12-31').localeCompare(
            b.nextPaymentDate || b.dueDate || '9999-12-31'
          );
        });
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export function subscribeAutomationsByLedger(
  uid: string,
  ledgerId: string,
  onData: (automations: AutomationRule[]) => void
): () => void {
  if (!ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/automations`;
  const q = query(collection(db, 'users', uid, 'automations'), where('ledgerId', '==', ledgerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: AutomationRule[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AutomationRule, 'id'>) }))
        .sort((a, b) => (a.nextRunDate || '').localeCompare(b.nextRunDate || ''));
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export function subscribeSalaryHistoriesByLedger(
  uid: string,
  ledgerId: string,
  onData: (records: SalaryHistoryRecord[]) => void
): () => void {
  if (!ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/salaryHistory`;
  const q = query(collection(db, 'users', uid, 'salaryHistory'), where('ledgerId', '==', ledgerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: SalaryHistoryRecord[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SalaryHistoryRecord, 'id'>) }))
        .sort((a, b) => (b.period || '').localeCompare(a.period || ''));
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export function subscribeShiftSchedule(
  uid: string,
  ledgerId: string,
  periodKey: string,
  onData: (days: ShiftDayLog[] | null) => void
): () => void {
  if (!ledgerId || !periodKey) {
    onData(null);
    return () => {};
  }
  const docId = `shift_${ledgerId}_${periodKey}`;
  const path = `users/${uid}/shiftSchedules/${docId}`;
  return onSnapshot(
    doc(db, 'users', uid, 'shiftSchedules', docId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData(Array.isArray(data?.days) ? (data.days as ShiftDayLog[]) : null);
    },
    (error) => logFirestoreListenerError(error, OperationType.GET, path)
  );
}

export function subscribeSalarySettings(
  uid: string,
  ledgerId: string,
  onData: (settings: CustomSalarySettings | null) => void
): () => void {
  if (!ledgerId) {
    onData(null);
    return () => {};
  }
  const path = `users/${uid}/salarySettings/${ledgerId}`;
  return onSnapshot(
    doc(db, 'users', uid, 'salarySettings', ledgerId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as CustomSalarySettings);
    },
    (error) => logFirestoreListenerError(error, OperationType.GET, path)
  );
}

export function subscribeSalaryAddOns(
  uid: string,
  ledgerId: string,
  monthKey: string,
  onData: (addOns: SalaryAddOn[]) => void
): () => void {
  if (!ledgerId || !monthKey) {
    onData([]);
    return () => {};
  }
  const docId = `addons_${ledgerId}_${monthKey}`;
  const path = `users/${uid}/salaryAddons/${docId}`;
  return onSnapshot(
    doc(db, 'users', uid, 'salaryAddons', docId),
    (snap) => {
      if (!snap.exists()) {
        onData([]);
        return;
      }
      const data = snap.data();
      onData(Array.isArray(data?.addOns) ? (data.addOns as SalaryAddOn[]) : []);
    },
    (error) => logFirestoreListenerError(error, OperationType.GET, path)
  );
}

export function subscribeHolidays(
  uid: string,
  onData: (data: HolidaysCloudData) => void
): () => void {
  const path = `users/${uid}/settings/holidays`;
  return onSnapshot(
    doc(db, 'users', uid, 'settings', 'holidays'),
    (snap) => {
      if (!snap.exists()) {
        onData({ customHolidays: {}, syncedHolidays: {} });
        return;
      }
      const raw = snap.data();
      onData({
        customHolidays:
          raw?.customHolidays && typeof raw.customHolidays === 'object'
            ? (raw.customHolidays as Record<string, string>)
            : {},
        syncedHolidays:
          raw?.syncedHolidays && typeof raw.syncedHolidays === 'object'
            ? (raw.syncedHolidays as Record<string, string>)
            : {},
      });
    },
    (error) => logFirestoreListenerError(error, OperationType.GET, path)
  );
}

// ============================================================================
// BUKU KAS (LEDGERS) — DETERMINISTIC AUTO-PROVISIONING
// ============================================================================

/**
 * Memastikan minimal satu buku kas default tersedia untuk pengguna baru.
 * Menggunakan ID deterministik `ledger_personal_default` di dalam transaksi sehingga
 * membuka aplikasi di 2 perangkat secara bersamaan tidak pernah membuat duplikat.
 */
export async function ensureDefaultLedger(uid: string): Promise<Ledger | null> {
  const path = `users/${uid}/ledgers`;
  try {
    const existingSnap = await getDocs(collection(db, 'users', uid, 'ledgers'));
    if (!existingSnap.empty) {
      const first = existingSnap.docs[0];
      return { id: first.id, ...(first.data() as Omit<Ledger, 'id'>) };
    }

    const defaultRef = doc(db, 'users', uid, 'ledgers', DEFAULT_LEDGER_ID);
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(defaultRef);
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<Ledger, 'id'>) };
      }
      const now = Date.now();
      const defaultLedger: Omit<Ledger, 'id'> & { updatedAt: number } = {
        name: 'Keuangan Pribadi',
        description: 'Buku kas utama untuk pemasukan dan pengeluaran harian',
        icon: 'Wallet',
        colorAccent: '#86B89A',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(defaultRef, defaultLedger);
      return { id: DEFAULT_LEDGER_ID, ...defaultLedger };
    });

    return created;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createLedger(
  uid: string,
  data: Omit<Ledger, 'id' | 'createdAt'>
): Promise<Ledger> {
  const newId = `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/ledgers/${newId}`;
  try {
    const now = Date.now();
    const payload = stripUndefined({
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(doc(db, 'users', uid, 'ledgers', newId), payload);
    return { id: newId, ...data, createdAt: now };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateLedger(
  uid: string,
  ledgerId: string,
  updates: Partial<Omit<Ledger, 'id' | 'createdAt'>>
): Promise<void> {
  const path = `users/${uid}/ledgers/${ledgerId}`;
  try {
    const ref = doc(db, 'users', uid, 'ledgers', ledgerId);
    await updateDoc(ref, stripUndefined({ ...updates, updatedAt: Date.now() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteLedger(uid: string, ledgerId: string): Promise<void> {
  const path = `users/${uid}/ledgers/${ledgerId}`;
  try {
    const subcollections = [
      'accounts',
      'transactions',
      'goals',
      'bills',
      'debts',
      'automations',
      'investments',
      'investmentEntries',
      'autopilot',
      'salaryHistory',
      'shiftSchedules',
      'salaryAddons',
    ];

    const refsToDelete = [
      doc(db, 'users', uid, 'ledgers', ledgerId),
      doc(db, 'users', uid, 'budgets', ledgerId),
      doc(db, 'users', uid, 'salarySettings', ledgerId),
    ];

    for (const sub of subcollections) {
      const q = query(collection(db, 'users', uid, sub), where('ledgerId', '==', ledgerId));
      const snap = await getDocs(q);
      snap.forEach((d) => refsToDelete.push(d.ref));
    }

    // Firestore writeBatch maksimal 500 operasi per batch
    for (let i = 0; i < refsToDelete.length; i += 450) {
      const batch = writeBatch(db);
      refsToDelete.slice(i, i + 450).forEach((r) => batch.delete(r));
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// AKUN & KANTONG (ACCOUNTS & POCKETS)
// ============================================================================

export async function createAccount(
  uid: string,
  data: Omit<Account, 'id' | 'createdAt'>
): Promise<Account> {
  const newId = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/accounts/${newId}`;
  try {
    const now = Date.now();
    const payload = stripUndefined({
      ...data,
      balance: Number(data.balance) || 0,
      pockets: data.pockets || [],
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(doc(db, 'users', uid, 'accounts', newId), payload);
    return { id: newId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAccountData(
  uid: string,
  accountId: string,
  updates: Partial<Omit<Account, 'id' | 'ledgerId' | 'createdAt'>>
): Promise<void> {
  const path = `users/${uid}/accounts/${accountId}`;
  try {
    await updateDoc(
      doc(db, 'users', uid, 'accounts', accountId),
      stripUndefined({ ...updates, updatedAt: Date.now() })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAccount(uid: string, accountId: string): Promise<void> {
  const path = `users/${uid}/accounts/${accountId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'accounts', accountId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addPocketToAccount(
  uid: string,
  accountId: string,
  pocketData: Omit<AccountPocket, 'id' | 'createdAt'>
): Promise<AccountPocket> {
  const path = `users/${uid}/accounts/${accountId}`;
  try {
    const newPocket: AccountPocket = stripUndefined({
      ...pocketData,
      id: `pkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      balance: Number(pocketData.balance) || 0,
      createdAt: Date.now(),
    });

    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'users', uid, 'accounts', accountId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Akun tidak ditemukan.');
      const current = snap.data() as Account;
      const pockets = Array.isArray(current.pockets) ? [...current.pockets, newPocket] : [newPocket];
      tx.update(ref, { pockets, updatedAt: Date.now() });
    });

    return newPocket;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updatePocketInAccount(
  uid: string,
  accountId: string,
  pocketId: string,
  updates: Partial<Omit<AccountPocket, 'id' | 'createdAt'>>
): Promise<void> {
  const path = `users/${uid}/accounts/${accountId}`;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'users', uid, 'accounts', accountId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Akun tidak ditemukan.');
      const current = snap.data() as Account;
      const pockets = (current.pockets || []).map((p) =>
        p.id === pocketId ? stripUndefined({ ...p, ...updates }) : p
      );
      tx.update(ref, { pockets, updatedAt: Date.now() });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePocketFromAccount(
  uid: string,
  accountId: string,
  pocketId: string
): Promise<void> {
  const path = `users/${uid}/accounts/${accountId}`;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'users', uid, 'accounts', accountId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Akun tidak ditemukan.');
      const current = snap.data() as Account;
      const pockets = (current.pockets || []).filter((p) => p.id !== pocketId);
      tx.update(ref, { pockets, updatedAt: Date.now() });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// TRANSAKSI (100% ATOMIC `runTransaction`)
// ============================================================================

export async function createTransaction(
  uid: string,
  txData: Omit<Transaction, 'id' | 'createdAt'>
): Promise<Transaction> {
  const newId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/transactions/${newId}`;
  try {
    const amount = Number(txData.amount) || 0;
    if (amount <= 0) throw new Error('Nominal transaksi harus lebih dari 0.');
    const now = Date.now();

    const newTx: Transaction = stripUndefined({
      ...txData,
      id: newId,
      amount,
      createdAt: now,
    });

    await runTransaction(db, async (tx) => {
      const accRef = doc(db, 'users', uid, 'accounts', txData.accountId);
      const accSnap = await tx.get(accRef);
      if (!accSnap.exists()) throw new Error('Akun sumber tidak ditemukan.');

      let toAccSnap = null;
      const toAccRef =
        txData.type === 'transfer' && txData.toAccountId
          ? doc(db, 'users', uid, 'accounts', txData.toAccountId)
          : null;
      if (toAccRef) {
        toAccSnap = await tx.get(toAccRef);
        if (!toAccSnap.exists()) throw new Error('Akun tujuan transfer tidak ditemukan.');
      }

      const accData = accSnap.data() as Account;
      const currentBalance = Number(accData.balance) || 0;
      const delta = txData.type === 'income' ? amount : -amount;

      tx.update(accRef, { balance: currentBalance + delta, updatedAt: now });

      if (toAccRef && toAccSnap) {
        const toBal = Number((toAccSnap.data() as Account).balance) || 0;
        tx.update(toAccRef, { balance: toBal + amount, updatedAt: now });
      }

      const { id: _ignoreId, ...txBody } = newTx;
      tx.set(doc(db, 'users', uid, 'transactions', newId), stripUndefined({ ...txBody, updatedAt: now }));
    });

    return newTx;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function executeAccountTransfer(
  uid: string,
  transferData: {
    ledgerId: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: string;
    note?: string;
  }
): Promise<Transaction> {
  if (transferData.fromAccountId === transferData.toAccountId) {
    throw new Error('Akun sumber dan tujuan transfer tidak boleh sama.');
  }
  return createTransaction(uid, {
    ledgerId: transferData.ledgerId,
    accountId: transferData.fromAccountId,
    toAccountId: transferData.toAccountId,
    type: 'transfer',
    amount: transferData.amount,
    category: 'Transfer Antar Akun',
    date: transferData.date,
    note: transferData.note || 'Transfer antar rekening',
  });
}

export async function updateTransactionWithBalanceSync(
  uid: string,
  txId: string,
  updates: {
    accountId?: string;
    toAccountId?: string | null;
    type?: Transaction['type'];
    amount?: number;
    category?: string;
    date?: string;
    note?: string;
  }
): Promise<Transaction> {
  const path = `users/${uid}/transactions/${txId}`;
  try {
    const now = Date.now();
    return await runTransaction(db, async (tx) => {
      const txRef = doc(db, 'users', uid, 'transactions', txId);
      const txSnap = await tx.get(txRef);
      if (!txSnap.exists()) throw new Error('Transaksi tidak ditemukan.');

      const oldTx = { id: txSnap.id, ...(txSnap.data() as Omit<Transaction, 'id'>) };
      const nextTx: Transaction = stripUndefined({
        ...oldTx,
        ...updates,
        amount: updates.amount !== undefined ? Number(updates.amount) : Number(oldTx.amount),
      });

      if (nextTx.amount <= 0) throw new Error('Nominal transaksi harus lebih dari 0.');
      if (nextTx.type === 'transfer' && nextTx.accountId === nextTx.toAccountId) {
        throw new Error('Akun sumber dan tujuan transfer tidak boleh sama.');
      }

      // Kumpulkan seluruh dokumen akun yang terlibat untuk dibaca sebelum menulis (aturan transaksi Firestore)
      const accIds = new Set<string>([oldTx.accountId, nextTx.accountId]);
      if (oldTx.toAccountId) accIds.add(oldTx.toAccountId);
      if (nextTx.toAccountId) accIds.add(nextTx.toAccountId);

      const balances = new Map<string, number>();
      for (const accId of accIds) {
        const snap = await tx.get(doc(db, 'users', uid, 'accounts', accId));
        if (snap.exists()) {
          balances.set(accId, Number((snap.data() as Account).balance) || 0);
        }
      }

      // Baca opsional goal / bill / debt jika transaksi terkait
      const goalRef = oldTx.goalId ? doc(db, 'users', uid, 'goals', oldTx.goalId) : null;
      const billRef = oldTx.billId ? doc(db, 'users', uid, 'bills', oldTx.billId) : null;
      const debtRef = oldTx.debtId ? doc(db, 'users', uid, 'debts', oldTx.debtId) : null;
      const [goalSnap, billSnap, debtSnap] = await Promise.all([
        goalRef ? tx.get(goalRef) : Promise.resolve(null),
        billRef ? tx.get(billRef) : Promise.resolve(null),
        debtRef ? tx.get(debtRef) : Promise.resolve(null),
      ]);

      // 1. Batalkan efek transaksi lama pada saldo akun
      const oldAmount = Number(oldTx.amount) || 0;
      if (balances.has(oldTx.accountId)) {
        const cur = balances.get(oldTx.accountId)!;
        if (oldTx.type === 'income') balances.set(oldTx.accountId, cur - oldAmount);
        else balances.set(oldTx.accountId, cur + oldAmount);
      }
      if (oldTx.type === 'transfer' && oldTx.toAccountId && balances.has(oldTx.toAccountId)) {
        balances.set(oldTx.toAccountId, balances.get(oldTx.toAccountId)! - oldAmount);
      }

      // 2. Terapkan efek transaksi baru pada saldo akun
      const newAmount = Number(nextTx.amount) || 0;
      if (balances.has(nextTx.accountId)) {
        const cur = balances.get(nextTx.accountId)!;
        if (nextTx.type === 'income') balances.set(nextTx.accountId, cur + newAmount);
        else balances.set(nextTx.accountId, cur - newAmount);
      }
      if (nextTx.type === 'transfer' && nextTx.toAccountId && balances.has(nextTx.toAccountId)) {
        balances.set(nextTx.toAccountId, balances.get(nextTx.toAccountId)! + newAmount);
      }

      // 3. Sinkronisasi selisih nominal pada Goal / Bill / Debt terkait
      const diff = newAmount - oldAmount;
      if (diff !== 0) {
        if (goalRef && goalSnap && goalSnap.exists()) {
          const g = goalSnap.data() as Goal;
          const nextCur = Math.max(0, (Number(g.currentAmount) || 0) + diff);
          tx.update(goalRef, {
            currentAmount: nextCur,
            isCompleted: nextCur >= (Number(g.targetAmount) || 0),
            updatedAt: now,
          });
        }
        if (billRef && billSnap && billSnap.exists()) {
          const b = billSnap.data() as Bill;
          tx.update(billRef, {
            totalPaid: Math.max(0, (Number(b.totalPaid) || 0) + diff),
            lastNominal: newAmount,
            updatedAt: now,
          });
        }
        if (debtRef && debtSnap && debtSnap.exists()) {
          const d = debtSnap.data() as Debt;
          const nextRem = Math.max(0, (Number(d.remainingDebt) || 0) - diff);
          tx.update(debtRef, {
            remainingDebt: nextRem,
            isPaidOff: nextRem <= 0,
            updatedAt: now,
          });
        }
      }

      // 4. Commit seluruh akun + dokumen transaksi
      balances.forEach((bal, accId) => {
        tx.update(doc(db, 'users', uid, 'accounts', accId), { balance: bal, updatedAt: now });
      });

      const { id: _ignoreId, ...txBody } = nextTx;
      tx.set(txRef, stripUndefined({ ...txBody, updatedAt: now }), { merge: true });

      return nextTx;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTransaction(uid: string, txId: string): Promise<void> {
  const path = `users/${uid}/transactions/${txId}`;
  try {
    // Pra-baca dokumen transaksi agar bisa mencari riwayat tagihan terkait untuk rollback `lastNominal`
    const preSnap = await getDoc(doc(db, 'users', uid, 'transactions', txId));
    if (!preSnap.exists()) return;
    const preTx = { id: preSnap.id, ...(preSnap.data() as Omit<Transaction, 'id'>) };

    let previousBillNominal: number | null = null;
    if (preTx.billId) {
      const billTxSnap = await getDocs(
        query(collection(db, 'users', uid, 'transactions'), where('billId', '==', preTx.billId))
      );
      const otherTxs = billTxSnap.docs
        .filter((d) => d.id !== txId)
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }))
        .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
      if (otherTxs.length > 0) {
        previousBillNominal = Number(otherTxs[0].amount) || 0;
      }
    }

    const now = Date.now();
    await runTransaction(db, async (tx) => {
      const txRef = doc(db, 'users', uid, 'transactions', txId);
      const txSnap = await tx.get(txRef);
      if (!txSnap.exists()) return;

      const target = { id: txSnap.id, ...(txSnap.data() as Omit<Transaction, 'id'>) };
      const amount = Number(target.amount) || 0;

      const accRef = doc(db, 'users', uid, 'accounts', target.accountId);
      const toAccRef =
        target.type === 'transfer' && target.toAccountId
          ? doc(db, 'users', uid, 'accounts', target.toAccountId)
          : null;
      const goalRef = target.goalId ? doc(db, 'users', uid, 'goals', target.goalId) : null;
      const billRef = target.billId ? doc(db, 'users', uid, 'bills', target.billId) : null;
      const debtRef = target.debtId ? doc(db, 'users', uid, 'debts', target.debtId) : null;

      const [accSnap, toAccSnap, goalSnap, billSnap, debtSnap] = await Promise.all([
        tx.get(accRef),
        toAccRef ? tx.get(toAccRef) : Promise.resolve(null),
        goalRef ? tx.get(goalRef) : Promise.resolve(null),
        billRef ? tx.get(billRef) : Promise.resolve(null),
        debtRef ? tx.get(debtRef) : Promise.resolve(null),
      ]);

      // 1. Kembalikan saldo akun
      if (accSnap.exists()) {
        const curBal = Number((accSnap.data() as Account).balance) || 0;
        const nextBal = target.type === 'income' ? curBal - amount : curBal + amount;
        tx.update(accRef, { balance: nextBal, updatedAt: now });
      }
      if (toAccRef && toAccSnap && toAccSnap.exists()) {
        const toBal = Number((toAccSnap.data() as Account).balance) || 0;
        tx.update(toAccRef, { balance: toBal - amount, updatedAt: now });
      }

      // 2. Rollback Goal
      if (goalRef && goalSnap && goalSnap.exists()) {
        const g = goalSnap.data() as Goal;
        const nextCur = Math.max(0, (Number(g.currentAmount) || 0) - amount);
        tx.update(goalRef, {
          currentAmount: nextCur,
          isCompleted: nextCur >= (Number(g.targetAmount) || 0),
          updatedAt: now,
        });
      }

      // 3. Rollback Bill (termasuk mundurkan nextPaymentDate & lastNominal)
      if (billRef && billSnap && billSnap.exists()) {
        const b = billSnap.data() as Bill;
        const nextTotalPaid = Math.max(0, (Number(b.totalPaid) || 0) - amount);
        const rolledBackDate = stepBackPaymentDate(
          b.nextPaymentDate,
          b.cycle,
          b.customIntervalCount,
          b.customIntervalUnit
        );
        const billPatch: Record<string, unknown> = {
          totalPaid: nextTotalPaid,
          nextPaymentDate: rolledBackDate,
          updatedAt: now,
        };
        if (previousBillNominal !== null) {
          billPatch.lastNominal = previousBillNominal;
        }
        tx.update(billRef, billPatch);
      }

      // 4. Rollback Debt
      if (debtRef && debtSnap && debtSnap.exists()) {
        const d = debtSnap.data() as Debt;
        const nextRemaining = Math.min(
          Number(d.totalDebt) || 0,
          (Number(d.remainingDebt) || 0) + amount
        );
        const debtPatch: Record<string, unknown> = {
          remainingDebt: nextRemaining,
          isPaidOff: nextRemaining <= 0,
          updatedAt: now,
        };
        if (d.nextPaymentDate && d.cycle) {
          debtPatch.nextPaymentDate = stepBackPaymentDate(
            d.nextPaymentDate,
            d.cycle,
            d.customIntervalCount,
            d.customIntervalUnit
          );
        }
        tx.update(debtRef, debtPatch);
      }

      // 5. Hapus dokumen transaksi
      tx.delete(txRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// GOALS & SINKING FUNDS (MODUL 2)
// ============================================================================

export async function createGoal(
  uid: string,
  data: Omit<Goal, 'id' | 'createdAt'>
): Promise<Goal> {
  const newId = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/goals/${newId}`;
  try {
    const now = Date.now();
    const targetAmount = Number(data.targetAmount) || 0;
    const currentAmount = Number(data.currentAmount) || 0;
    const payload = stripUndefined({
      ...data,
      targetAmount,
      currentAmount,
      isCompleted: currentAmount >= targetAmount && targetAmount > 0,
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(doc(db, 'users', uid, 'goals', newId), payload);
    return { id: newId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateGoalData(
  uid: string,
  goalId: string,
  updates: Partial<Omit<Goal, 'id' | 'ledgerId' | 'createdAt'>>
): Promise<void> {
  const path = `users/${uid}/goals/${goalId}`;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'users', uid, 'goals', goalId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Target tidak ditemukan.');
      const cur = snap.data() as Goal;
      const targetAmount =
        updates.targetAmount !== undefined ? Number(updates.targetAmount) : Number(cur.targetAmount);
      const currentAmount =
        updates.currentAmount !== undefined ? Number(updates.currentAmount) : Number(cur.currentAmount);
      tx.update(
        ref,
        stripUndefined({
          ...updates,
          targetAmount,
          currentAmount,
          isCompleted: currentAmount >= targetAmount && targetAmount > 0,
          updatedAt: Date.now(),
        })
      );
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteGoal(uid: string, goalId: string): Promise<void> {
  const path = `users/${uid}/goals/${goalId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'goals', goalId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function allocateFundsToGoal(
  uid: string,
  params: {
    goalId: string;
    amount: number;
    sourceAccountId?: string;
    date: string;
    note?: string;
  }
): Promise<{ goal: Goal; transaction?: Transaction }> {
  const path = `users/${uid}/goals/${params.goalId}`;
  try {
    const amount = Number(params.amount) || 0;
    if (amount <= 0) throw new Error('Nominal alokasi harus lebih dari 0.');
    const now = Date.now();
    const txId = `tx_${now}_${Math.random().toString(36).slice(2, 7)}`;

    return await runTransaction(db, async (tx) => {
      const goalRef = doc(db, 'users', uid, 'goals', params.goalId);
      const accRef = params.sourceAccountId
        ? doc(db, 'users', uid, 'accounts', params.sourceAccountId)
        : null;

      const [goalSnap, accSnap] = await Promise.all([
        tx.get(goalRef),
        accRef ? tx.get(accRef) : Promise.resolve(null),
      ]);
      if (!goalSnap.exists()) throw new Error('Target tabungan tidak ditemukan.');
      if (accRef && (!accSnap || !accSnap.exists())) {
        throw new Error('Akun sumber dana tidak ditemukan.');
      }

      const goalData = { id: goalSnap.id, ...(goalSnap.data() as Omit<Goal, 'id'>) };
      const nextGoalAmount = (Number(goalData.currentAmount) || 0) + amount;
      const isCompleted = nextGoalAmount >= (Number(goalData.targetAmount) || 0);

      tx.update(goalRef, { currentAmount: nextGoalAmount, isCompleted, updatedAt: now });

      let newTx: Transaction | undefined;
      if (accRef && accSnap && accSnap.exists() && params.sourceAccountId) {
        const accData = accSnap.data() as Account;
        const nextBalance = (Number(accData.balance) || 0) - amount;
        newTx = stripUndefined({
          id: txId,
          ledgerId: goalData.ledgerId,
          accountId: params.sourceAccountId,
          goalId: goalData.id,
          type: 'expense',
          amount,
          category: goalData.type === 'sinking_fund' ? 'Alokasi Sinking Fund' : 'Alokasi Wishlist',
          date: params.date || toLocalDateStr(new Date()),
          note: params.note?.trim() || `Alokasi ke ${goalData.name}`,
          createdAt: now,
        });

        tx.update(accRef, { balance: nextBalance, updatedAt: now });
        const { id: _ignoreId, ...txBody } = newTx;
        tx.set(doc(db, 'users', uid, 'transactions', txId), stripUndefined({ ...txBody, updatedAt: now }));
      }

      return {
        goal: { ...goalData, currentAmount: nextGoalAmount, isCompleted },
        transaction: newTx,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchGoalAllocationHistory(uid: string, goalId: string): Promise<Transaction[]> {
  const path = `users/${uid}/transactions`;
  try {
    const q = query(collection(db, 'users', uid, 'transactions'), where('goalId', '==', goalId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) }))
      .sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ============================================================================
// TAGIHAN RUTIN (BILLS — MODUL 3)
// ============================================================================

export async function createBill(
  uid: string,
  data: Omit<Bill, 'id' | 'createdAt' | 'totalPaid'> & { totalPaid?: number }
): Promise<Bill> {
  const newId = `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/bills/${newId}`;
  try {
    const now = Date.now();
    const payload = stripUndefined({
      ...data,
      totalPaid: Number(data.totalPaid) || 0,
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(doc(db, 'users', uid, 'bills', newId), payload);
    return { id: newId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBill(
  uid: string,
  billId: string,
  updates: Partial<Omit<Bill, 'id' | 'ledgerId' | 'createdAt'>>
): Promise<void> {
  const path = `users/${uid}/bills/${billId}`;
  try {
    await updateDoc(
      doc(db, 'users', uid, 'bills', billId),
      stripUndefined({ ...updates, updatedAt: Date.now() })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBill(uid: string, billId: string): Promise<void> {
  const path = `users/${uid}/bills/${billId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'bills', billId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function payBill(
  uid: string,
  params: {
    billId: string;
    amount: number;
    sourceAccountId: string;
    date: string;
    note?: string;
  }
): Promise<{ bill: Bill; transaction: Transaction }> {
  const path = `users/${uid}/bills/${params.billId}`;
  try {
    const amount = Number(params.amount) || 0;
    if (amount <= 0) throw new Error('Nominal pembayaran tagihan harus lebih dari 0.');
    const now = Date.now();
    const txId = `tx_${now}_${Math.random().toString(36).slice(2, 7)}`;

    return await runTransaction(db, async (tx) => {
      const billRef = doc(db, 'users', uid, 'bills', params.billId);
      const accRef = doc(db, 'users', uid, 'accounts', params.sourceAccountId);

      const [billSnap, accSnap] = await Promise.all([tx.get(billRef), tx.get(accRef)]);
      if (!billSnap.exists()) throw new Error('Tagihan tidak ditemukan.');
      if (!accSnap.exists()) throw new Error('Akun sumber dana tidak ditemukan.');

      const billData = { id: billSnap.id, ...(billSnap.data() as Omit<Bill, 'id'>) };
      const accData = accSnap.data() as Account;

      const nextPaymentDate = advancePaymentDate(
        billData.nextPaymentDate,
        billData.cycle,
        billData.customIntervalCount,
        billData.customIntervalUnit
      );
      const nextTotalPaid = (Number(billData.totalPaid) || 0) + amount;
      const nextBalance = (Number(accData.balance) || 0) - amount;

      const newTx: Transaction = stripUndefined({
        id: txId,
        ledgerId: billData.ledgerId,
        accountId: params.sourceAccountId,
        billId: billData.id,
        type: 'expense',
        amount,
        category: billData.category || 'Tagihan & Utilitas',
        date: params.date || toLocalDateStr(new Date()),
        note: params.note?.trim() || `Bayar tagihan: ${billData.name}`,
        createdAt: now,
      });

      tx.update(accRef, { balance: nextBalance, updatedAt: now });
      tx.update(billRef, {
        nextPaymentDate,
        lastNominal: amount,
        totalPaid: nextTotalPaid,
        updatedAt: now,
      });
      const { id: _ignoreId, ...txBody } = newTx;
      tx.set(doc(db, 'users', uid, 'transactions', txId), stripUndefined({ ...txBody, updatedAt: now }));

      return {
        bill: { ...billData, nextPaymentDate, lastNominal: amount, totalPaid: nextTotalPaid },
        transaction: newTx,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// UTANG & CICILAN (DEBTS — MODUL 3)
// ============================================================================

export async function createDebt(
  uid: string,
  data: Omit<Debt, 'id' | 'createdAt' | 'isPaidOff'> & { isPaidOff?: boolean }
): Promise<Debt> {
  const newId = `debt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/debts/${newId}`;
  try {
    const now = Date.now();
    const totalDebt = Number(data.totalDebt) || 0;
    const remainingDebt = data.remainingDebt !== undefined ? Number(data.remainingDebt) : totalDebt;
    const payload = stripUndefined({
      ...data,
      totalDebt,
      remainingDebt,
      isPaidOff: remainingDebt <= 0,
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(doc(db, 'users', uid, 'debts', newId), payload);
    return { id: newId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateDebt(
  uid: string,
  debtId: string,
  updates: Partial<Omit<Debt, 'id' | 'ledgerId' | 'createdAt'>>
): Promise<void> {
  const path = `users/${uid}/debts/${debtId}`;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'users', uid, 'debts', debtId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Utang tidak ditemukan.');
      const cur = snap.data() as Debt;
      const remainingDebt =
        updates.remainingDebt !== undefined ? Number(updates.remainingDebt) : Number(cur.remainingDebt);
      tx.update(
        ref,
        stripUndefined({
          ...updates,
          remainingDebt,
          isPaidOff: remainingDebt <= 0,
          updatedAt: Date.now(),
        })
      );
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDebt(uid: string, debtId: string): Promise<void> {
  const path = `users/${uid}/debts/${debtId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'debts', debtId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function payDebtInstallment(
  uid: string,
  params: {
    debtId: string;
    amount: number;
    sourceAccountId: string;
    date: string;
    note?: string;
  }
): Promise<{ debt: Debt; transaction: Transaction }> {
  const path = `users/${uid}/debts/${params.debtId}`;
  try {
    const amount = Number(params.amount) || 0;
    if (amount <= 0) throw new Error('Nominal cicilan harus lebih dari 0.');
    const now = Date.now();
    const txId = `tx_${now}_${Math.random().toString(36).slice(2, 7)}`;

    return await runTransaction(db, async (tx) => {
      const debtRef = doc(db, 'users', uid, 'debts', params.debtId);
      const accRef = doc(db, 'users', uid, 'accounts', params.sourceAccountId);

      const [debtSnap, accSnap] = await Promise.all([tx.get(debtRef), tx.get(accRef)]);
      if (!debtSnap.exists()) throw new Error('Data utang tidak ditemukan.');
      if (!accSnap.exists()) throw new Error('Akun sumber dana tidak ditemukan.');

      const debtData = { id: debtSnap.id, ...(debtSnap.data() as Omit<Debt, 'id'>) };
      const accData = accSnap.data() as Account;

      const nextRemaining = Math.max(0, (Number(debtData.remainingDebt) || 0) - amount);
      const isPaidOff = nextRemaining <= 0;
      const nextBalance = (Number(accData.balance) || 0) - amount;

      const debtPatch: Record<string, unknown> = {
        remainingDebt: nextRemaining,
        isPaidOff,
        updatedAt: now,
      };
      let nextPaymentDate = debtData.nextPaymentDate;
      if (!isPaidOff && debtData.nextPaymentDate && debtData.cycle) {
        nextPaymentDate = advancePaymentDate(
          debtData.nextPaymentDate,
          debtData.cycle,
          debtData.customIntervalCount,
          debtData.customIntervalUnit
        );
        debtPatch.nextPaymentDate = nextPaymentDate;
      }

      const newTx: Transaction = stripUndefined({
        id: txId,
        ledgerId: debtData.ledgerId,
        accountId: params.sourceAccountId,
        debtId: debtData.id,
        type: 'expense',
        amount,
        category: 'Cicilan & Utang',
        date: params.date || toLocalDateStr(new Date()),
        note: params.note?.trim() || `Bayar cicilan: ${debtData.name}`,
        createdAt: now,
      });

      tx.update(accRef, { balance: nextBalance, updatedAt: now });
      tx.update(debtRef, debtPatch);
      const { id: _ignoreId, ...txBody } = newTx;
      tx.set(doc(db, 'users', uid, 'transactions', txId), stripUndefined({ ...txBody, updatedAt: now }));

      return {
        debt: { ...debtData, remainingDebt: nextRemaining, isPaidOff, nextPaymentDate },
        transaction: newTx,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// OTOMATISASI TRANSAKSI (MODUL 4)
// ============================================================================

export async function createAutomation(
  uid: string,
  data: Omit<AutomationRule, 'id' | 'createdAt' | 'executionCount' | 'lastRunDate'>
): Promise<AutomationRule> {
  const newId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/automations/${newId}`;
  try {
    const now = Date.now();
    const payload = stripUndefined({
      ...data,
      amount: Number(data.amount) || 0,
      executionCount: 0,
      lastRunDate: null,
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(doc(db, 'users', uid, 'automations', newId), payload);
    return { id: newId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAutomation(
  uid: string,
  automationId: string,
  updates: Partial<Omit<AutomationRule, 'id' | 'ledgerId' | 'createdAt'>>
): Promise<void> {
  const path = `users/${uid}/automations/${automationId}`;
  try {
    await updateDoc(
      doc(db, 'users', uid, 'automations', automationId),
      stripUndefined({ ...updates, updatedAt: Date.now() })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleAutomationActive(
  uid: string,
  automationId: string,
  isActive: boolean
): Promise<void> {
  await updateAutomation(uid, automationId, { isActive });
}

export async function deleteAutomation(uid: string, automationId: string): Promise<void> {
  const path = `users/${uid}/automations/${automationId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'automations', automationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function executeSingleAutomation(
  uid: string,
  automationId: string,
  executionDateOverride?: string
): Promise<{ rule: AutomationRule; transaction: Transaction; accountName: string }> {
  const path = `users/${uid}/automations/${automationId}`;
  try {
    const now = Date.now();
    const txId = `tx_${now}_${Math.random().toString(36).slice(2, 7)}`;

    const result = await runTransaction(db, async (tx) => {
      const ruleRef = doc(db, 'users', uid, 'automations', automationId);
      const ruleSnap = await tx.get(ruleRef);
      if (!ruleSnap.exists()) throw new Error('Aturan otomatisasi tidak ditemukan.');

      const rule = { id: ruleSnap.id, ...(ruleSnap.data() as Omit<AutomationRule, 'id'>) };
      const accRef = doc(db, 'users', uid, 'accounts', rule.sourceAccountId);
      const toAccRef =
        rule.type === 'transfer' && rule.toAccountId
          ? doc(db, 'users', uid, 'accounts', rule.toAccountId)
          : null;

      const [accSnap, toAccSnap] = await Promise.all([
        tx.get(accRef),
        toAccRef ? tx.get(toAccRef) : Promise.resolve(null),
      ]);

      if (!accSnap.exists()) throw new Error('Akun sumber pada aturan otomatisasi tidak ditemukan.');
      if (toAccRef && (!toAccSnap || !toAccSnap.exists())) {
        throw new Error('Akun tujuan transfer pada aturan otomatisasi tidak ditemukan.');
      }

      const accData = accSnap.data() as Account;
      const amount = Number(rule.amount) || 0;
      const execDate = executionDateOverride || toLocalDateStr(new Date());

      const curBal = Number(accData.balance) || 0;
      const delta = rule.type === 'income' ? amount : -amount;
      tx.update(accRef, { balance: curBal + delta, updatedAt: now });

      let targetAccName = accData.name;
      if (toAccRef && toAccSnap && toAccSnap.exists()) {
        const toData = toAccSnap.data() as Account;
        targetAccName = `${accData.name} → ${toData.name}`;
        tx.update(toAccRef, { balance: (Number(toData.balance) || 0) + amount, updatedAt: now });
      }

      const nextRunDate = advancePaymentDate(
        rule.nextRunDate || execDate,
        rule.cycle,
        rule.customIntervalCount,
        rule.customIntervalUnit
      );
      const nextCount = (Number(rule.executionCount) || 0) + 1;

      const newTx: Transaction = stripUndefined({
        id: txId,
        ledgerId: rule.ledgerId,
        accountId: rule.sourceAccountId,
        toAccountId: rule.type === 'transfer' ? rule.toAccountId || null : null,
        automationId: rule.id,
        type: rule.type,
        amount,
        category:
          rule.category ||
          (rule.type === 'income'
            ? 'Gaji Bulanan'
            : rule.type === 'transfer'
            ? 'Transfer Otomatis'
            : 'Pengeluaran Otomatis'),
        date: execDate,
        note: rule.note?.trim() || `[Otomatis] ${rule.name}`,
        createdAt: now,
      });

      const { id: _ignoreId, ...txBody } = newTx;
      tx.set(doc(db, 'users', uid, 'transactions', txId), stripUndefined({ ...txBody, updatedAt: now }));
      tx.update(ruleRef, {
        nextRunDate,
        lastRunDate: execDate,
        executionCount: nextCount,
        updatedAt: now,
      });

      return {
        rule: { ...rule, nextRunDate, lastRunDate: execDate, executionCount: nextCount },
        transaction: newTx,
        accountName: targetAccName,
      };
    });

    void recordAutomationEvent(uid, result.rule.name, result.rule.amount, result.accountName);
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

const automationRunsInFlight = new Map<string, Promise<Array<{ rule: AutomationRule; transaction: Transaction }>>>();

export function checkAndRunAutomations(
  uid: string,
  ledgerId: string
): Promise<Array<{ rule: AutomationRule; transaction: Transaction }>> {
  const key = `${uid}:${ledgerId}`;
  const existing = automationRunsInFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    const todayStr = toLocalDateStr(new Date());
    const executed: Array<{ rule: AutomationRule; transaction: Transaction }> = [];
    const q = query(collection(db, 'users', uid, 'automations'), where('ledgerId', '==', ledgerId));
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      let rule = { id: d.id, ...(d.data() as Omit<AutomationRule, 'id'>) };
      if (!rule.isActive || !rule.nextRunDate) continue;

      let safetyGuard = 0;
      while (rule.nextRunDate <= todayStr && safetyGuard < 12) {
        safetyGuard++;
        try {
          const res = await executeSingleAutomation(uid, rule.id, rule.nextRunDate);
          executed.push({ rule: res.rule, transaction: res.transaction });
          rule = res.rule;
        } catch (err) {
          console.warn('Otomasi dilewati:', rule.name, err);
          break;
        }
      }
    }

    return executed;
  })().finally(() => {
    automationRunsInFlight.delete(key);
  });

  automationRunsInFlight.set(key, task);
  return task;
}

// ============================================================================
// MODUL 6: PENGGAJIAN, SHIFT, ADD-ONS, & HARI LIBUR
// ============================================================================

export async function archiveSalaryPeriod(
  uid: string,
  data: Omit<SalaryHistoryRecord, 'id' | 'createdAt'>
): Promise<SalaryHistoryRecord> {
  const docId = `sal_${data.ledgerId}_${data.period}`;
  const path = `users/${uid}/salaryHistory/${docId}`;
  try {
    const now = Date.now();
    const payload = stripUndefined({
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(doc(db, 'users', uid, 'salaryHistory', docId), payload, { merge: true });
    return { id: docId, ...data, createdAt: now };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSalaryHistoryDoc(uid: string, recordId: string): Promise<void> {
  const path = `users/${uid}/salaryHistory/${recordId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'salaryHistory', recordId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertPayrollAutomation(
  uid: string,
  params: {
    ledgerId: string;
    targetAccountId: string;
    netSalary: number;
    paydayDate: string;
    paydayNumber?: number;
    noteDesc?: string;
    existingRuleId?: string;
  }
): Promise<AutomationRule> {
  const docId = params.existingRuleId || `auto_payroll_${params.ledgerId}`;
  const path = `users/${uid}/automations/${docId}`;
  try {
    const ref = doc(db, 'users', uid, 'automations', docId);
    const snap = await getDoc(ref);
    const now = Date.now();
    const existing = snap.exists() ? (snap.data() as Omit<AutomationRule, 'id'>) : null;

    const payload = stripUndefined({
      ledgerId: params.ledgerId,
      name: existing?.name || 'Payroll Gaji Bulanan',
      type: 'income' as const,
      amount: Math.max(0, Math.round(Number(params.netSalary) || 0)),
      category: 'Gaji Bulanan',
      sourceAccountId: params.targetAccountId,
      toAccountId: null,
      cycle: 'monthly' as const,
      monthlyDay: params.paydayNumber || Number(params.paydayDate.split('-')[2]) || 28,
      nextRunDate: params.paydayDate,
      lastRunDate: existing?.lastRunDate ?? null,
      executionCount: existing?.executionCount ?? 0,
      isActive: true,
      note: params.noteDesc || 'Otomasi Gajian dari Modul 6 (Prediksi Gaji & Shift)',
      colorAccent: '#86B89A',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    await setDoc(ref, payload, { merge: true });
    return { id: docId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveShiftScheduleToFirestore(
  uid: string,
  ledgerId: string,
  periodKey: string,
  days: ShiftDayLog[]
): Promise<void> {
  const docId = `shift_${ledgerId}_${periodKey}`;
  const path = `users/${uid}/shiftSchedules/${docId}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'shiftSchedules', docId),
      stripUndefined({
        ledgerId,
        periodKey,
        days,
        updatedAt: Date.now(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchShiftScheduleFromFirestore(
  uid: string,
  ledgerId: string,
  periodKey: string
): Promise<ShiftDayLog[] | null> {
  const docId = `shift_${ledgerId}_${periodKey}`;
  const path = `users/${uid}/shiftSchedules/${docId}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'shiftSchedules', docId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return Array.isArray(data?.days) ? (data.days as ShiftDayLog[]) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveSalarySettingsToFirestore(
  uid: string,
  ledgerId: string,
  settings: CustomSalarySettings
): Promise<void> {
  const path = `users/${uid}/salarySettings/${ledgerId}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'salarySettings', ledgerId),
      stripUndefined({
        ledgerId,
        ...settings,
        updatedAt: Date.now(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchSalarySettingsFromFirestore(
  uid: string,
  ledgerId: string
): Promise<CustomSalarySettings | null> {
  const path = `users/${uid}/salarySettings/${ledgerId}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'salarySettings', ledgerId));
    return snap.exists() ? (snap.data() as CustomSalarySettings) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveSalaryAddOnsToFirestore(
  uid: string,
  ledgerId: string,
  monthKey: string,
  addOns: SalaryAddOn[]
): Promise<void> {
  const docId = `addons_${ledgerId}_${monthKey}`;
  const path = `users/${uid}/salaryAddons/${docId}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'salaryAddons', docId),
      stripUndefined({
        ledgerId,
        monthKey,
        addOns,
        updatedAt: Date.now(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchSalaryAddOnsFromFirestore(
  uid: string,
  ledgerId: string,
  monthKey: string
): Promise<SalaryAddOn[]> {
  const docId = `addons_${ledgerId}_${monthKey}`;
  const path = `users/${uid}/salaryAddons/${docId}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'salaryAddons', docId));
    if (!snap.exists()) return [];
    const data = snap.data();
    return Array.isArray(data?.addOns) ? (data.addOns as SalaryAddOn[]) : [];
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveHolidaysToFirestore(
  uid: string,
  data: Partial<HolidaysCloudData>
): Promise<void> {
  const path = `users/${uid}/settings/holidays`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'settings', 'holidays'),
      stripUndefined({
        ...data,
        updatedAt: Date.now(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
