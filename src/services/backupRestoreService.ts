/**
 * Cloud Firestore JSON Backup Restore Service
 * Membaca file backup `.json` (baik format ekspor Artha terbaru, format wrapped `data`,
 * maupun format dump legacy `artha_offline_*` / `artha_*`) dan mengunggah seluruh dokumennya
 * ke Cloud Firestore pada path `users/user_artha/...` di database `(default)`.
 *
 * - Mempertahankan `id` asli setiap dokumen agar relasi antar koleksi tetap utuh.
 * - Menggunakan `writeBatch` dengan `batch.set(ref, data, { merge: true })`.
 * - Otomatis memecah operasi per 450 dokumen (di bawah batas 500 operasi batch Firestore).
 * - Seluruh perubahan langsung terdeteksi secara real-time oleh listener `onSnapshot`.
 */
import { collection, doc, getDoc, getDocs, writeBatch, type DocumentData } from 'firebase/firestore';
import { getActiveUserDocId, db, OperationType, handleFirestoreError } from '../config/firebase';
import { LOCKED_CATEGORY } from '../hooks/useCategories';
import { toLocalDateStr } from '../utils/dateUtils';

const BATCH_CHUNK_SIZE = 450;

export interface RestoreWriteOp {
  collection: string;
  docId: string;
  path: string;
  data: DocumentData;
}

export interface ParsedBackupPlan {
  operations: RestoreWriteOp[];
  countsByCollection: Record<string, number>;
  totalDocuments: number;
  skippedEntries: number;
}

export interface RestoreProgress {
  completedDocs: number;
  totalDocs: number;
  currentBatch: number;
  totalBatches: number;
  percent: number;
}

export interface RestoreResult {
  totalWritten: number;
  totalBatches: number;
  countsByCollection: Record<string, number>;
  targetUserDocId: string;
}

export const COLLECTION_LABELS: Record<string, string> = {
  ledgers: 'Buku Kas',
  accounts: 'Rekening & Kas',
  transactions: 'Transaksi',
  bills: 'Tagihan Rutin',
  debts: 'Utang & Cicilan',
  goals: 'Target & Sinking Funds',
  automations: 'Otomatisasi',
  investments: 'Aset Investasi',
  investmentEntries: 'Riwayat Investasi',
  autopilot: 'Aturan Autopilot',
  salaryHistory: 'Riwayat Gaji',
  shiftSchedules: 'Jadwal Shift',
  salaryAddons: 'Tambahan Gaji',
  salarySettings: 'Pengaturan Gaji',
  budgets: 'Anggaran Kategori',
  settings: 'Pengaturan & Kategori',
};

const COLLECTION_ALIASES: Array<{ target: string; keys: string[] }> = [
  {
    target: 'ledgers',
    keys: ['ledgers', 'artha_offline_ledgers', 'artha_ledgers'],
  },
  {
    target: 'accounts',
    keys: ['accounts', 'artha_offline_accounts', 'artha_accounts'],
  },
  {
    target: 'transactions',
    keys: ['transactions', 'artha_offline_transactions', 'artha_transactions'],
  },
  {
    target: 'bills',
    keys: ['bills', 'artha_offline_bills', 'artha_bills'],
  },
  {
    target: 'debts',
    keys: ['debts', 'artha_offline_debts', 'artha_debts'],
  },
  {
    target: 'goals',
    keys: ['goals', 'artha_offline_goals', 'artha_goals'],
  },
  {
    target: 'automations',
    keys: ['automations', 'artha_offline_automations', 'artha_automations'],
  },
  {
    target: 'investments',
    keys: ['investments', 'artha_offline_investments', 'artha_investments'],
  },
  {
    target: 'investmentEntries',
    keys: [
      'investmentEntries',
      'investment_entries',
      'artha_offline_investment_entries',
      'artha_investment_entries',
      'artha_investmentEntries',
    ],
  },
  {
    target: 'autopilot',
    keys: [
      'autopilot',
      'autopilotRules',
      'autopilot_rules',
      'artha_offline_autopilot',
      'artha_autopilot',
      'artha_autopilot_rules',
    ],
  },
  {
    target: 'salaryHistory',
    keys: [
      'salaryHistory',
      'salaryHistories',
      'salary_histories',
      'salary_history',
      'artha_offline_salary_history',
      'artha_offline_salary_histories',
      'artha_salary_history',
      'artha_salary_histories',
    ],
  },
  {
    target: 'shiftSchedules',
    keys: [
      'shiftSchedules',
      'shift_schedules',
      'artha_offline_shift_schedules',
      'artha_shift_schedules',
    ],
  },
  {
    target: 'salaryAddons',
    keys: [
      'salaryAddons',
      'salary_addons',
      'artha_offline_salary_addons',
      'artha_salary_addons',
    ],
  },
  {
    target: 'salarySettings',
    keys: [
      'salarySettings',
      'salary_settings',
      'artha_offline_salary_settings',
      'artha_salary_settings',
    ],
  },
];

const PREFERENCE_FIELD_KEYS = new Set([
  'theme',
  'privacy',
  'sidebarCollapsed',
  'activeLedgerId',
  'notificationsRead',
  'notificationsDismissed',
  'automationEvents',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Jika nilai masih berupa JSON string (misalnya hasil dump localStorage), parse otomatis.
 */
function maybeParseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Bersihkan nilai secara rekursif agar 100% valid untuk Firestore:
 * - Hapus properti bernilai `undefined`
 * - Ganti `NaN` / `Infinity` menjadi `0`
 * - Hapus elemen array bernilai `undefined`
 */
function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const cleaned = sanitizeForFirestore(item);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!k) continue;
      const cleaned = sanitizeForFirestore(v);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }
    return out;
  }
  return undefined;
}

/**
 * Buat ID dokumen Firestore yang aman (tidak mengandung `/` dan tidak diawali/diakhiri `__`).
 */
function sanitizeDocId(rawId: unknown, fallbackPrefix: string, index: number): string {
  if (typeof rawId === 'string' && rawId.trim().length > 0) {
    const cleaned = rawId
      .trim()
      .replace(/\//g, '_')
      .replace(/^\.+$/, 'doc');
    if (cleaned.length > 0 && !(cleaned.startsWith('__') && cleaned.endsWith('__'))) {
      return cleaned.slice(0, 200);
    }
  }
  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    return String(rawId);
  }
  return `${fallbackPrefix}_${Date.now()}_${index}`;
}

/**
 * Gabungkan container top-level dan wrapper seperti `data`, `backup`, `payload`, `collections`, `localStorage`.
 */
function collectSourceMap(parsedRoot: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const wrapperKeys = ['data', 'backup', 'payload', 'collections', 'localStorage', 'storage'];

  // Masukkan isi wrapper terlebih dahulu, lalu top-level agar key eksplisit tetap terbaca
  for (const wKey of wrapperKeys) {
    const candidate = maybeParseJsonValue(parsedRoot[wKey]);
    if (isPlainObject(candidate)) {
      for (const [k, v] of Object.entries(candidate)) {
        if (!(k in merged)) {
          merged[k] = v;
        }
      }
    }
  }

  for (const [k, v] of Object.entries(parsedRoot)) {
    if (wrapperKeys.includes(k)) continue;
    if (!(k in merged)) {
      merged[k] = v;
    }
  }

  return merged;
}

/**
 * Parsing file JSON backup Artha menjadi daftar operasi write Firestore yang tervalidasi.
 */
export function parseBackupJson(
  rawText: string,
  targetUserDocId: string = getActiveUserDocId()
): ParsedBackupPlan {
  if (!rawText || !rawText.trim()) {
    throw new Error('File backup kosong. Pilih file .json yang berisi data Artha.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Format JSON tidak valid. Pastikan file yang diunggah adalah file backup .json yang utuh.');
  }

  if (!isPlainObject(parsed)) {
    throw new Error('Struktur root file backup harus berupa objek JSON ({ ... }).');
  }

  const source = collectSourceMap(parsed);
  const opMap = new Map<string, RestoreWriteOp>();
  let skippedEntries = 0;
  const now = Date.now();

  const enqueue = (collectionName: string, docId: string, rawData: Record<string, unknown>) => {
    const sanitized = sanitizeForFirestore(rawData);
    if (!isPlainObject(sanitized) || Object.keys(sanitized).length === 0) {
      skippedEntries += 1;
      return;
    }
    const path = `users/${targetUserDocId}/${collectionName}/${docId}`;
    const existing = opMap.get(path);
    const mergedData = existing ? { ...existing.data, ...sanitized } : sanitized;
    opMap.set(path, {
      collection: collectionName,
      docId,
      path,
      data: mergedData,
    });
  };

  const LEDGER_SCOPED_COLLECTIONS = new Set([
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
  ]);

  // 1. Proses seluruh koleksi entitas (Array maupun Object/Map key->doc)
  // `ledgers` selalu diproses paling awal sehingga `firstDiscoveredLedgerId` sudah tersedia
  let firstDiscoveredLedgerId = '';

  for (const { target, keys } of COLLECTION_ALIASES) {
    for (const key of keys) {
      if (!(key in source)) continue;
      const value = maybeParseJsonValue(source[key]);
      if (value === null || value === undefined) continue;

      const buildPayload = (obj: Record<string, unknown>, docId: string): Record<string, unknown> => {
        const payload: Record<string, unknown> = {
          ...obj,
          id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : docId,
          updatedAt: obj.updatedAt ?? now,
        };
        if (
          LEDGER_SCOPED_COLLECTIONS.has(target) &&
          (typeof payload.ledgerId !== 'string' || !payload.ledgerId.trim())
        ) {
          payload.ledgerId = firstDiscoveredLedgerId || 'ledger_personal_default';
        }
        return payload;
      };

      if (Array.isArray(value)) {
        value.forEach((item, idx) => {
          const obj = maybeParseJsonValue(item);
          if (!isPlainObject(obj)) {
            skippedEntries += 1;
            return;
          }
          const rawId =
            obj.id ??
            (target === 'salarySettings' ? obj.ledgerId : undefined) ??
            (target === 'shiftSchedules' ? obj.periodKey : undefined) ??
            (target === 'salaryAddons' ? obj.monthKey : undefined);
          const docId = sanitizeDocId(rawId, target, idx);
          if (target === 'ledgers' && !firstDiscoveredLedgerId) {
            firstDiscoveredLedgerId = docId;
          }
          enqueue(target, docId, buildPayload(obj, docId));
        });
      } else if (isPlainObject(value)) {
        // Mendukung bentuk map { [docId]: { ... } }
        Object.entries(value).forEach(([entryKey, item], idx) => {
          const obj = maybeParseJsonValue(item);
          if (!isPlainObject(obj)) {
            skippedEntries += 1;
            return;
          }
          const docId = sanitizeDocId(obj.id ?? entryKey, target, idx);
          if (target === 'ledgers' && !firstDiscoveredLedgerId) {
            firstDiscoveredLedgerId = docId;
          }
          enqueue(target, docId, buildPayload(obj, docId));
        });
      }
    }
  }

  const defaultLedgerId = firstDiscoveredLedgerId || 'ledger_personal_default';

  // 2. Proses `categories` -> users/user_artha/settings/categories
  const enqueueCategories = (rawCat: unknown) => {
    const val = maybeParseJsonValue(rawCat);
    if (!isPlainObject(val)) return;
    const payload: Record<string, unknown> = { ...val, updatedAt: val.updatedAt ?? now };
    if (Array.isArray(val.expense)) {
      const cleanExpense = val.expense
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim());
      if (cleanExpense.length > 0 && !cleanExpense.includes(LOCKED_CATEGORY)) {
        cleanExpense.push(LOCKED_CATEGORY);
      }
      payload.expense = cleanExpense;
    }
    if (Array.isArray(val.income)) {
      const cleanIncome = val.income
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim());
      if (cleanIncome.length > 0 && !cleanIncome.includes(LOCKED_CATEGORY)) {
        cleanIncome.push(LOCKED_CATEGORY);
      }
      payload.income = cleanIncome;
    }
    enqueue('settings', 'categories', payload);
  };

  for (const catKey of ['categories', 'artha_categories', 'artha_offline_categories']) {
    if (catKey in source) {
      enqueueCategories(source[catKey]);
    }
  }

  // 3. Proses `budgets` -> users/user_artha/budgets/{ledgerId}
  const enqueueBudgetForLedger = (ledgerId: string, rawBudget: unknown) => {
    const parsedBudget = maybeParseJsonValue(rawBudget);
    if (!isPlainObject(parsedBudget)) return;

    if (isPlainObject(parsedBudget.budgets)) {
      const targetLedger = sanitizeDocId(parsedBudget.ledgerId ?? ledgerId, 'ledger', 0);
      enqueue('budgets', targetLedger, {
        ...parsedBudget,
        ledgerId: targetLedger,
        budgets: parsedBudget.budgets,
        updatedAt: parsedBudget.updatedAt ?? now,
      });
      return;
    }

    const numericEntries: Record<string, number> = {};
    for (const [catName, limit] of Object.entries(parsedBudget)) {
      const num = typeof limit === 'number' ? limit : Number(limit);
      if (Number.isFinite(num) && num >= 0) {
        numericEntries[catName] = num;
      }
    }
    if (Object.keys(numericEntries).length > 0) {
      const targetLedger = sanitizeDocId(ledgerId, 'ledger', 0);
      enqueue('budgets', targetLedger, {
        ledgerId: targetLedger,
        budgets: numericEntries,
        updatedAt: now,
      });
    }
  };

  for (const budgetKey of ['budgets', 'categoryBudgets', 'artha_budgets', 'artha_category_budgets', 'artha_offline_budgets']) {
    if (!(budgetKey in source)) continue;
    const rawBudgets = maybeParseJsonValue(source[budgetKey]);

    if (Array.isArray(rawBudgets)) {
      rawBudgets.forEach((item, idx) => {
        const obj = maybeParseJsonValue(item);
        if (!isPlainObject(obj)) return;
        const ledgerId = sanitizeDocId(obj.ledgerId ?? obj.id ?? defaultLedgerId, 'ledger', idx);
        enqueueBudgetForLedger(ledgerId, obj);
      });
    } else if (isPlainObject(rawBudgets)) {
      const values = Object.values(rawBudgets);
      const isFlatNumberMap =
        values.length > 0 && values.every((v) => typeof v === 'number' || (typeof v === 'string' && !Number.isNaN(Number(v))));

      if (isFlatNumberMap) {
        enqueueBudgetForLedger(defaultLedgerId, rawBudgets);
      } else if ('budgets' in rawBudgets && isPlainObject(rawBudgets.budgets)) {
        const ledgerId = sanitizeDocId(rawBudgets.ledgerId ?? defaultLedgerId, 'ledger', 0);
        enqueueBudgetForLedger(ledgerId, rawBudgets);
      } else {
        // Bentuk { [ledgerId]: { 'Makanan & Minuman': 1500000, ... } }
        Object.entries(rawBudgets).forEach(([ledgerKey, budgetMap]) => {
          enqueueBudgetForLedger(ledgerKey, budgetMap);
        });
      }
    }
  }

  // 4. Proses `preferences` & `settings` -> users/user_artha/settings/{preferences|categories|holidays|...}
  const mergedPreferences: Record<string, unknown> = {};

  for (const prefKey of ['preferences', 'userPreferences', 'artha_preferences', 'artha_offline_preferences']) {
    if (!(prefKey in source)) continue;
    const val = maybeParseJsonValue(source[prefKey]);
    if (isPlainObject(val)) {
      Object.assign(mergedPreferences, val);
    }
  }

  for (const settingsKey of ['settings', 'artha_settings', 'artha_offline_settings']) {
    if (!(settingsKey in source)) continue;
    const rawSettings = maybeParseJsonValue(source[settingsKey]);

    if (Array.isArray(rawSettings)) {
      rawSettings.forEach((item, idx) => {
        const obj = maybeParseJsonValue(item);
        if (!isPlainObject(obj)) return;
        const settingId = sanitizeDocId(obj.id ?? 'preferences', 'setting', idx);
        if (settingId === 'migration') return;
        if (settingId === 'categories') {
          enqueueCategories(obj);
        } else if (settingId === 'preferences') {
          Object.assign(mergedPreferences, obj);
        } else {
          enqueue('settings', settingId, { ...obj, updatedAt: obj.updatedAt ?? now });
        }
      });
    } else if (isPlainObject(rawSettings)) {
      for (const [subKey, subVal] of Object.entries(rawSettings)) {
        if (subKey === 'migration') continue;
        const parsedSub = maybeParseJsonValue(subVal);

        if (subKey === 'categories' && isPlainObject(parsedSub)) {
          enqueueCategories(parsedSub);
        } else if (subKey === 'preferences' && isPlainObject(parsedSub)) {
          Object.assign(mergedPreferences, parsedSub);
        } else if (PREFERENCE_FIELD_KEYS.has(subKey)) {
          mergedPreferences[subKey] = parsedSub;
        } else if (isPlainObject(parsedSub)) {
          enqueue('settings', sanitizeDocId(subKey, 'setting', 0), {
            ...parsedSub,
            updatedAt: parsedSub.updatedAt ?? now,
          });
        }
      }
    }
  }

  // 5. Tangani key legacy lokal tambahan (theme, privacy, activeLedgerId, holidays, per-ledger budgets/shift/addons)
  if (typeof source.activeLedgerId === 'string' && source.activeLedgerId.trim()) {
    mergedPreferences.activeLedgerId = source.activeLedgerId.trim();
  } else if (typeof source.artha_active_ledger === 'string' && source.artha_active_ledger.trim()) {
    mergedPreferences.activeLedgerId = source.artha_active_ledger.trim();
  }

  if (source.artha_theme === 'dark' || source.artha_theme === 'light') {
    mergedPreferences.theme = source.artha_theme;
  }
  if (typeof source.artha_privacy === 'boolean') {
    mergedPreferences.privacy = source.artha_privacy;
  } else if (source.artha_privacy === 'true' || source.artha_privacy === 'false') {
    mergedPreferences.privacy = source.artha_privacy === 'true';
  }

  for (const holidayKey of ['holidays', 'artha_holidays', 'artha_offline_holidays']) {
    if (!(holidayKey in source)) continue;
    const val = maybeParseJsonValue(source[holidayKey]);
    if (isPlainObject(val)) {
      enqueue('settings', 'holidays', { ...val, updatedAt: val.updatedAt ?? now });
    }
  }

  // Tangani key berpola prefix seperti `artha_budgets_<ledgerId>`, `artha_salary_settings_<ledgerId>`, dll.
  for (const [key, rawVal] of Object.entries(source)) {
    if (key.startsWith('artha_budgets_') || key.startsWith('artha_category_budgets_')) {
      const ledgerId = key.replace(/^artha_(?:category_)?budgets_/, '').trim() || defaultLedgerId;
      enqueueBudgetForLedger(ledgerId, rawVal);
    } else if (key.startsWith('artha_salary_settings_')) {
      const ledgerId = key.replace(/^artha_salary_settings_/, '').trim() || defaultLedgerId;
      const val = maybeParseJsonValue(rawVal);
      if (isPlainObject(val)) {
        enqueue('salarySettings', sanitizeDocId(ledgerId, 'salarySettings', 0), {
          ...val,
          ledgerId,
          updatedAt: val.updatedAt ?? now,
        });
      }
    } else if (key.startsWith('artha_shift_schedule_') || key.startsWith('artha_shift_')) {
      const periodKey = key.replace(/^artha_shift_(?:schedule_)?/, '').trim();
      const val = maybeParseJsonValue(rawVal);
      if (periodKey && Array.isArray(val)) {
        const docId = sanitizeDocId(`${defaultLedgerId}__${periodKey}`, 'shiftSchedules', 0);
        enqueue('shiftSchedules', docId, {
          ledgerId: defaultLedgerId,
          periodKey,
          days: val,
          updatedAt: now,
        });
      } else if (periodKey && isPlainObject(val)) {
        const docId = sanitizeDocId(val.id ?? `${defaultLedgerId}__${periodKey}`, 'shiftSchedules', 0);
        enqueue('shiftSchedules', docId, {
          ledgerId: typeof val.ledgerId === 'string' ? val.ledgerId : defaultLedgerId,
          periodKey: typeof val.periodKey === 'string' ? val.periodKey : periodKey,
          ...val,
          updatedAt: val.updatedAt ?? now,
        });
      }
    } else if (key.startsWith('artha_salary_addons_')) {
      const monthKey = key.replace(/^artha_salary_addons_/, '').trim();
      const val = maybeParseJsonValue(rawVal);
      if (monthKey && Array.isArray(val)) {
        const docId = sanitizeDocId(`${defaultLedgerId}__${monthKey}`, 'salaryAddons', 0);
        enqueue('salaryAddons', docId, {
          ledgerId: defaultLedgerId,
          monthKey,
          addOns: val,
          updatedAt: now,
        });
      }
    }
  }

  if (Object.keys(mergedPreferences).length > 0) {
    enqueue('settings', 'preferences', {
      ...mergedPreferences,
      updatedAt: mergedPreferences.updatedAt ?? now,
    });
  }

  const operations = Array.from(opMap.values());
  if (operations.length === 0) {
    throw new Error(
      'Tidak ditemukan data Artha yang dikenali di dalam file JSON ini (misalnya ledgers, accounts, transactions, bills, debts, goals, investments, automations, autopilot, salaryHistory, categories, budgets, atau preferences).'
    );
  }

  const countsByCollection: Record<string, number> = {};
  for (const op of operations) {
    countsByCollection[op.collection] = (countsByCollection[op.collection] || 0) + 1;
  }

  return {
    operations,
    countsByCollection,
    totalDocuments: operations.length,
    skippedEntries,
  };
}

/**
 * Menulis seluruh operasi restore ke Cloud Firestore (`users/user_artha/...`)
 * menggunakan `writeBatch` (maks 450 operasi per batch) dengan `{ merge: true }`.
 */
export async function executeBackupRestore(
  plan: ParsedBackupPlan,
  onProgress?: (progress: RestoreProgress) => void,
  targetUserDocId: string = getActiveUserDocId()
): Promise<RestoreResult> {
  const { operations, countsByCollection } = plan;
  const totalDocs = operations.length;
  const totalBatches = Math.max(1, Math.ceil(totalDocs / BATCH_CHUNK_SIZE));
  let completedDocs = 0;

  onProgress?.({
    completedDocs: 0,
    totalDocs,
    currentBatch: 0,
    totalBatches,
    percent: 0,
  });

  for (let i = 0; i < totalDocs; i += BATCH_CHUNK_SIZE) {
    const batchIndex = Math.floor(i / BATCH_CHUNK_SIZE) + 1;
    const chunk = operations.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const op of chunk) {
      const ref = doc(db, 'users', targetUserDocId, op.collection, op.docId);
      batch.set(ref, op.data, { merge: true });
    }

    try {
      await batch.commit();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) {
        handleFirestoreError(error, OperationType.WRITE, `users/${targetUserDocId} (batch ${batchIndex}/${totalBatches})`);
      }
      throw new Error(
        `Gagal menulis batch ${batchIndex}/${totalBatches} ke Firestore (${completedDocs}/${totalDocs} tersimpan): ${msg}`
      );
    }

    completedDocs += chunk.length;
    onProgress?.({
      completedDocs,
      totalDocs,
      currentBatch: batchIndex,
      totalBatches,
      percent: Math.round((completedDocs / totalDocs) * 100),
    });
  }

  return {
    totalWritten: completedDocs,
    totalBatches,
    countsByCollection,
    targetUserDocId,
  };
}

// =============================================================================
// EXPORT / DOWNLOAD BACKUP (.JSON) LANGSUNG DARI CLOUD FIRESTORE
// =============================================================================

export interface BackupDownloadResult {
  fileName: string;
  totalDocuments: number;
  countsByCollection: Record<string, number>;
  exportedAt: string;
  targetUserDocId: string;
}

const EXPORT_SUBCOLLECTIONS = [
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
] as const;

const EXPORT_SETTING_DOCS = ['categories', 'shift', 'preferences', 'holidays'] as const;

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|secret|private[_-]?key|access[_-]?token|refresh[_-]?token|password)/i;

/**
 * Menormalkan data dokumen Firestore agar siap di-serialize ke JSON:
 * - Konversi Firestore Timestamp menjadi milidetik epoch (number)
 * - Hapus field sensitif (mis. apiKey/secret/token/password) jika ada
 */
function serializeFirestoreValue(value: unknown, stripSensitive = false): unknown {
  if (value === null || value === undefined) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestoreValue(item, stripSensitive));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (stripSensitive && SENSITIVE_KEY_PATTERN.test(k)) continue;
      if (v !== undefined) {
        out[k] = serializeFirestoreValue(v, stripSensitive);
      }
    }
    return out;
  }
  return value;
}

/**
 * Mengambil seluruh koleksi & pengaturan terbaru dari `users/user_artha/...`
 * di database `(default)` dan langsung memicu download file `artha-backup-YYYY-MM-DD.json`
 * yang kompatibel 1:1 dengan fitur Restore Backup (.json).
 */
export async function downloadCloudBackupJson(
  targetUserDocId: string = getActiveUserDocId()
): Promise<BackupDownloadResult> {
  const exportedAt = new Date().toISOString();
  const countsByCollection: Record<string, number> = {};
  let totalDocuments = 0;

  const backupPayload: Record<string, unknown> = {
    exportedAt,
    source: 'artha-cloud-firestore',
    version: 2,
    userDocId: targetUserDocId,
  };

  // 1. Ambil seluruh subkoleksi secara paralel
  const collectionReads = await Promise.all(
    EXPORT_SUBCOLLECTIONS.map(async (colName) => {
      const path = `users/${targetUserDocId}/${colName}`;
      try {
        const snap = await getDocs(collection(db, 'users', targetUserDocId, colName));
        const docs = snap.docs.map((d) => {
          const clean = serializeFirestoreValue(d.data(), false) as Record<string, unknown>;
          return {
            id: d.id,
            ...clean,
          };
        });
        return { colName, docs };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) {
          handleFirestoreError(error, OperationType.LIST, path);
        }
        throw new Error(`Gagal membaca koleksi "${colName}" dari Firestore: ${msg}`);
      }
    })
  );

  for (const { colName, docs } of collectionReads) {
    backupPayload[colName] = docs;
    if (docs.length > 0) {
      countsByCollection[colName] = docs.length;
      totalDocuments += docs.length;
    }
  }

  // 2. Ambil dokumen pengaturan (categories, shift, preferences, holidays)
  const settingsObj: Record<string, unknown> = {};
  let settingsCount = 0;

  const settingReads = await Promise.all(
    EXPORT_SETTING_DOCS.map(async (settingId) => {
      const path = `users/${targetUserDocId}/settings/${settingId}`;
      try {
        const snap = await getDoc(doc(db, 'users', targetUserDocId, 'settings', settingId));
        if (!snap.exists()) return { settingId, data: null };
        const clean = serializeFirestoreValue(snap.data(), true) as Record<string, unknown>;
        return { settingId, data: clean };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('missing or insufficient')) {
          handleFirestoreError(error, OperationType.GET, path);
        }
        throw new Error(`Gagal membaca pengaturan "${settingId}" dari Firestore: ${msg}`);
      }
    })
  );

  for (const { settingId, data } of settingReads) {
    if (data && Object.keys(data).length > 0) {
      settingsObj[settingId] = data;
      settingsCount += 1;
    }
  }

  backupPayload.settings = settingsObj;
  if (settingsCount > 0) {
    countsByCollection.settings = settingsCount;
    totalDocuments += settingsCount;
  }

  // 3. Picu download otomatis file JSON dengan tanggal lokal YYYY-MM-DD
  const fileName = `artha-backup-${toLocalDateStr(new Date())}.json`;
  const jsonText = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    fileName,
    totalDocuments,
    countsByCollection,
    exportedAt,
    targetUserDocId,
  };
}

