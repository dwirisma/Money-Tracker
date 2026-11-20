/**
 * Automatic Legacy Firestore Migration Service
 * Memigrasikan satu kali seluruh data lama dari `users/demo_user_artha/...`
 * ke `users/{uid}/...` saat pengguna pertama kali login dengan Firebase Auth.
 *
 * - Mempertahankan ID dokumen asli agar relasi ledgerId/accountId/goalId/billId/debtId tetap utuh.
 * - Menggunakan `writeBatch` (chunk <= 400 operasi per commit).
 * - Menyimpan penanda `users/{uid}/settings/migration` (`migratedFromDemo: true`, `migratedAt: serverTimestamp()`).
 * - Aman jika subkoleksi lama kosong atau tidak ada.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { toLocalDateStr } from '../utils/localDate';

const LEGACY_DEMO_UID = 'demo_user_artha';
const BATCH_CHUNK_SIZE = 400;

export interface MigrationResult {
  skipped: boolean;
  migratedCount: number;
  migratedCollections: string[];
}

const LEGACY_COLLECTIONS: Array<{ source: string; target: string }> = [
  { source: 'ledgers', target: 'ledgers' },
  { source: 'accounts', target: 'accounts' },
  { source: 'transactions', target: 'transactions' },
  { source: 'bills', target: 'bills' },
  { source: 'debts', target: 'debts' },
  { source: 'goals', target: 'goals' },
  { source: 'automations', target: 'automations' },
  { source: 'investments', target: 'investments' },
  { source: 'investmentEntries', target: 'investmentEntries' },
  { source: 'investment_entries', target: 'investmentEntries' },
  { source: 'autopilot', target: 'autopilot' },
  { source: 'salaryHistory', target: 'salaryHistory' },
  { source: 'salary_histories', target: 'salaryHistory' },
  { source: 'shiftSchedules', target: 'shiftSchedules' },
  { source: 'shift_schedules', target: 'shiftSchedules' },
  { source: 'salaryAddons', target: 'salaryAddons' },
  { source: 'salary_addons', target: 'salaryAddons' },
  { source: 'salarySettings', target: 'salarySettings' },
  { source: 'salary_settings', target: 'salarySettings' },
  { source: 'budgets', target: 'budgets' },
  { source: 'settings', target: 'settings' },
];

const ALLOWED_SETTINGS_IDS = new Set(['preferences', 'categories', 'holidays', 'shift']);

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) out[k] = v;
  });
  return out as T;
}

/**
 * Menormalkan dokumen lama agar memenuhi validasi schema & rules Cloud Firestore
 * tanpa menghilangkan field asli yang sudah ada.
 */
function normalizeLegacyDocument(
  targetCollection: string,
  docId: string,
  raw: DocumentData
): DocumentData | null {
  const now = Date.now();
  const todayStr = toLocalDateStr(new Date());
  const base: Record<string, unknown> = { ...raw };

  if (targetCollection === 'settings') {
    if (!ALLOWED_SETTINGS_IDS.has(docId)) return null;
    return stripUndefined({
      ...base,
      updatedAt: base.updatedAt ?? now,
    });
  }

  switch (targetCollection) {
    case 'ledgers':
      return stripUndefined({
        ...base,
        name: typeof base.name === 'string' && base.name.trim() ? base.name.trim().slice(0, 120) : 'Keuangan Pribadi',
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });

    case 'accounts': {
      const validTypes = new Set(['bank', 'ewallet', 'cash', 'credit_card']);
      const accType = typeof base.type === 'string' && validTypes.has(base.type) ? base.type : 'bank';
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        name: typeof base.name === 'string' && base.name.trim() ? base.name.trim().slice(0, 120) : 'Rekening',
        type: accType,
        balance: typeof base.balance === 'number' && Number.isFinite(base.balance) ? base.balance : Number(base.balance) || 0,
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });
    }

    case 'transactions': {
      const validTypes = new Set(['income', 'expense', 'transfer']);
      const txType = typeof base.type === 'string' && validTypes.has(base.type) ? base.type : 'expense';
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        accountId: typeof base.accountId === 'string' && base.accountId ? base.accountId : 'unknown_account',
        type: txType,
        amount: Math.max(0, Number(base.amount) || 0),
        date: typeof base.date === 'string' && base.date ? base.date : todayStr,
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });
    }

    case 'goals': {
      const gType = base.type === 'wishlist' ? 'wishlist' : 'sinking_fund';
      const targetAmount = Math.max(0, Number(base.targetAmount) || 0);
      const currentAmount = Math.max(0, Number(base.currentAmount) || 0);
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        name: typeof base.name === 'string' && base.name.trim() ? base.name.trim().slice(0, 120) : 'Target',
        type: gType,
        targetAmount,
        currentAmount,
        isCompleted: typeof base.isCompleted === 'boolean' ? base.isCompleted : targetAmount > 0 && currentAmount >= targetAmount,
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });
    }

    case 'bills': {
      const validCycles = new Set(['daily', 'weekly', 'monthly', 'yearly', 'custom']);
      const cycle = typeof base.cycle === 'string' && validCycles.has(base.cycle) ? base.cycle : 'monthly';
      const pricingType = base.pricingType === 'variable' ? 'variable' : 'fixed';
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        name: typeof base.name === 'string' && base.name.trim() ? base.name.trim().slice(0, 120) : 'Tagihan',
        cycle,
        pricingType,
        nextPaymentDate: typeof base.nextPaymentDate === 'string' && base.nextPaymentDate ? base.nextPaymentDate : todayStr,
        totalPaid: Math.max(0, Number(base.totalPaid) || 0),
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });
    }

    case 'debts': {
      const totalDebt = Math.max(0, Number(base.totalDebt) || 0);
      const remainingDebt = Math.max(0, Number(base.remainingDebt) || 0);
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        name: typeof base.name === 'string' && base.name.trim() ? base.name.trim().slice(0, 120) : 'Utang',
        totalDebt,
        remainingDebt,
        isPaidOff: typeof base.isPaidOff === 'boolean' ? base.isPaidOff : remainingDebt <= 0,
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });
    }

    case 'automations': {
      const validTypes = new Set(['income', 'expense', 'transfer']);
      const validCycles = new Set(['daily', 'weekly', 'monthly', 'yearly', 'custom']);
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        name: typeof base.name === 'string' && base.name.trim() ? base.name.trim().slice(0, 160) : 'Aturan Otomatis',
        type: typeof base.type === 'string' && validTypes.has(base.type) ? base.type : 'expense',
        amount: Math.max(0, Number(base.amount) || 0),
        sourceAccountId: typeof base.sourceAccountId === 'string' && base.sourceAccountId ? base.sourceAccountId : 'unknown_account',
        cycle: typeof base.cycle === 'string' && validCycles.has(base.cycle) ? base.cycle : 'monthly',
        nextRunDate: typeof base.nextRunDate === 'string' && base.nextRunDate ? base.nextRunDate : todayStr,
        isActive: typeof base.isActive === 'boolean' ? base.isActive : true,
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });
    }

    case 'investments': {
      const validTypes = new Set(['stock', 'mutual_fund', 'crypto', 'gold', 'bond', 'deposit', 'p2p', 'other']);
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        name: typeof base.name === 'string' && base.name.trim() ? base.name.trim().slice(0, 120) : 'Aset Investasi',
        type: typeof base.type === 'string' && validTypes.has(base.type) ? base.type : 'other',
        initialCapital: Math.max(0, Number(base.initialCapital) || 0),
        currentValue: Math.max(0, Number(base.currentValue) || 0),
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });
    }

    case 'investmentEntries': {
      const validKinds = new Set(['topup', 'yield', 'withdraw', 'close']);
      return stripUndefined({
        ...base,
        assetId: typeof base.assetId === 'string' && base.assetId ? base.assetId : 'unknown_asset',
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        kind: typeof base.kind === 'string' && validKinds.has(base.kind) ? base.kind : 'topup',
        date: typeof base.date === 'string' && base.date ? base.date : todayStr,
        amount: Math.max(0, Number(base.amount) || 0),
        accountId: typeof base.accountId === 'string' && base.accountId ? base.accountId : 'unknown_account',
        capitalDelta: Number(base.capitalDelta) || 0,
        valueDelta: Number(base.valueDelta) || 0,
        createdAt: base.createdAt ?? now,
      });
    }

    case 'autopilot': {
      const validKinds = new Set(['goal_topup', 'pay_bill', 'pay_debt']);
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        name: typeof base.name === 'string' && base.name.trim() ? base.name.trim().slice(0, 160) : 'Autopilot',
        kind: typeof base.kind === 'string' && validKinds.has(base.kind) ? base.kind : 'pay_bill',
        targetId: typeof base.targetId === 'string' && base.targetId ? base.targetId : 'unknown_target',
        sourceAccountId: typeof base.sourceAccountId === 'string' && base.sourceAccountId ? base.sourceAccountId : 'unknown_account',
        amount: Math.max(0, Number(base.amount) || 0),
        isActive: typeof base.isActive === 'boolean' ? base.isActive : true,
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });
    }

    case 'budgets':
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : docId,
        budgets: base.budgets && typeof base.budgets === 'object' ? base.budgets : {},
        updatedAt: base.updatedAt ?? now,
      });

    case 'salaryHistory':
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        period: typeof base.period === 'string' && base.period ? base.period : todayStr.slice(0, 7),
        totalOtHours: Number(base.totalOtHours) || 0,
        totalMeals: Number(base.totalMeals) || 0,
        netSalary: Number(base.netSalary) || 0,
        grossSalary: Number(base.grossSalary) || 0,
        createdAt: base.createdAt ?? now,
        updatedAt: base.updatedAt ?? now,
      });

    case 'shiftSchedules':
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        periodKey: typeof base.periodKey === 'string' && base.periodKey ? base.periodKey : docId,
        days: Array.isArray(base.days) ? base.days.slice(0, 62) : [],
        updatedAt: base.updatedAt ?? now,
      });

    case 'salaryAddons':
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : 'ledger_personal_default',
        monthKey: typeof base.monthKey === 'string' && base.monthKey ? base.monthKey : docId,
        addOns: Array.isArray(base.addOns) ? base.addOns.slice(0, 100) : [],
        updatedAt: base.updatedAt ?? now,
      });

    case 'salarySettings':
      return stripUndefined({
        ...base,
        ledgerId: typeof base.ledgerId === 'string' && base.ledgerId ? base.ledgerId : docId,
        updatedAt: base.updatedAt ?? now,
      });

    default:
      return stripUndefined({
        ...base,
        updatedAt: base.updatedAt ?? now,
      });
  }
}

const inFlightMigrations = new Map<string, Promise<MigrationResult>>();

/**
 * Memeriksa penanda `users/{uid}/settings/migration` dan menyalin satu kali
 * seluruh dokumen yang ada di `users/demo_user_artha/...` ke `users/{uid}/...`.
 */
export function migrateLegacyDemoDataIfNeeded(uid: string): Promise<MigrationResult> {
  if (!uid || uid === LEGACY_DEMO_UID) {
    return Promise.resolve({ skipped: true, migratedCount: 0, migratedCollections: [] });
  }

  const existing = inFlightMigrations.get(uid);
  if (existing) return existing;

  const task = (async (): Promise<MigrationResult> => {
    const markerRef = doc(db, 'users', uid, 'settings', 'migration');

    try {
      const markerSnap = await getDoc(markerRef);
      if (markerSnap.exists() && markerSnap.data()?.migratedFromDemo === true) {
        return { skipped: true, migratedCount: 0, migratedCollections: [] };
      }
    } catch (err) {
      console.warn('Gagal memeriksa status migrasi awal:', err);
      return { skipped: true, migratedCount: 0, migratedCollections: [] };
    }

    let totalCopied = 0;
    const migratedCollections = new Set<string>();
    const pendingWrites: Array<{ targetCol: string; docId: string; data: DocumentData }> = [];

    for (const { source, target } of LEGACY_COLLECTIONS) {
      try {
        const snap = await getDocs(collection(db, 'users', LEGACY_DEMO_UID, source));
        if (snap.empty) continue;

        snap.docs.forEach((d) => {
          const normalized = normalizeLegacyDocument(target, d.id, d.data());
          if (!normalized) return;
          pendingWrites.push({ targetCol: target, docId: d.id, data: normalized });
        });
      } catch (err) {
        // Subkoleksi lama kosong, tidak ada, atau tidak dapat dibaca — lewati dengan aman
        console.warn(`Lewati migrasi subkoleksi lama "${source}":`, err);
      }
    }

    // Commit per chunk menggunakan writeBatch (<= 400 operasi per batch)
    for (let i = 0; i < pendingWrites.length; i += BATCH_CHUNK_SIZE) {
      const chunk = pendingWrites.slice(i, i + BATCH_CHUNK_SIZE);
      try {
        const batch = writeBatch(db);
        chunk.forEach(({ targetCol, docId, data }) => {
          const destRef = doc(db, 'users', uid, targetCol, docId);
          batch.set(destRef, data, { merge: true });
        });
        await batch.commit();
        totalCopied += chunk.length;
        chunk.forEach(({ targetCol }) => migratedCollections.add(targetCol));
      } catch (batchErr) {
        console.warn('Batch migrasi gagal, mencoba penyalinan per dokumen:', batchErr);
        for (const item of chunk) {
          try {
            const destRef = doc(db, 'users', uid, item.targetCol, item.docId);
            await setDoc(destRef, item.data, { merge: true });
            totalCopied += 1;
            migratedCollections.add(item.targetCol);
          } catch (docErr) {
            console.warn(`Lewati dokumen lama ${item.targetCol}/${item.docId}:`, docErr);
          }
        }
      }
    }

    // Tandai migrasi selesai agar tidak pernah dijalankan ulang
    try {
      await setDoc(
        markerRef,
        {
          migratedFromDemo: true,
          migratedCount: totalCopied,
          migratedCollections: Array.from(migratedCollections),
          migratedAt: serverTimestamp(),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Gagal menulis penanda migrasi:', err);
    }

    return {
      skipped: false,
      migratedCount: totalCopied,
      migratedCollections: Array.from(migratedCollections),
    };
  })().finally(() => {
    inFlightMigrations.delete(uid);
  });

  inFlightMigrations.set(uid, task);
  return task;
}
