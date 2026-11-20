/**
 * Cloud Firestore Settings & Budget Service (100% Real-Time)
 * Menggabungkan manajemen alokasi anggaran per kategori (`users/{uid}/budgets/{ledgerId}`)
 * dan preferensi pengguna (`users/{uid}/settings/preferences`).
 */
import { doc, getDoc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError, logFirestoreListenerError } from '../config/firebase';
import { toLocalDateStr } from '../utils/dateUtils';
import type { AutomationEvent } from './notificationService';

// =============================================================================
// CATEGORY BUDGET MANAGEMENT
// =============================================================================

export interface CategoryBudgetMap {
  [categoryName: string]: number;
}

export const DEFAULT_CATEGORY_BUDGETS: CategoryBudgetMap = {
  'Makanan & Minuman': 1500000,
  'Transportasi': 500000,
  'Tagihan & Utilitas': 1000000,
  'Belanja Bulanan': 1000000,
  'Kesehatan': 300000,
  'Hiburan & Hobi': 400000,
  'Lainnya': 300000,
};

function getBudgetDocRef(uid: string, ledgerId: string) {
  return doc(db, 'users', uid, 'budgets', ledgerId);
}

export function subscribeCategoryBudgets(
  uid: string,
  ledgerId: string,
  onData: (budgets: CategoryBudgetMap) => void
): () => void {
  if (!uid || !ledgerId) {
    onData({ ...DEFAULT_CATEGORY_BUDGETS });
    return () => {};
  }
  const path = `users/${uid}/budgets/${ledgerId}`;
  const ref = getBudgetDocRef(uid, ledgerId);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData({ ...DEFAULT_CATEGORY_BUDGETS });
        return;
      }
      const data = snap.data();
      if (data && data.budgets && typeof data.budgets === 'object') {
        onData(data.budgets as CategoryBudgetMap);
      } else {
        onData({ ...DEFAULT_CATEGORY_BUDGETS });
      }
    },
    (error) => {
      logFirestoreListenerError(error, OperationType.GET, path);
    }
  );
}

export async function getCategoryBudgetsOnce(
  uid: string,
  ledgerId: string
): Promise<CategoryBudgetMap> {
  if (!uid || !ledgerId) return { ...DEFAULT_CATEGORY_BUDGETS };
  const path = `users/${uid}/budgets/${ledgerId}`;
  try {
    const snap = await getDoc(getBudgetDocRef(uid, ledgerId));
    if (snap.exists() && snap.data()?.budgets && typeof snap.data().budgets === 'object') {
      return snap.data().budgets as CategoryBudgetMap;
    }
    return { ...DEFAULT_CATEGORY_BUDGETS };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveCategoryBudgets(
  uid: string,
  ledgerId: string,
  budgets: CategoryBudgetMap
): Promise<void> {
  if (!uid || !ledgerId) return;
  const path = `users/${uid}/budgets/${ledgerId}`;
  try {
    await setDoc(
      getBudgetDocRef(uid, ledgerId),
      {
        ledgerId,
        budgets,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// =============================================================================
// AI (GEMINI) PREFERENCES MANAGEMENT
// =============================================================================

export type AiInsightMode = 'manual' | 'auto' | 'off';
export type AiPrimaryModel = 'gemini-3.1-flash-lite' | 'gemini-4-hydrogen';
export type AiCacheDurationMinutes = 10 | 30 | 60 | 360;
export type AiFocusStyle = 'ringkas' | 'hemat' | 'tabungan';

export interface AiSettings {
  insightMode: AiInsightMode;
  primaryModel: AiPrimaryModel;
  autoFallback: boolean;
  cacheDurationMinutes: AiCacheDurationMinutes;
  focusStyle: AiFocusStyle;
  compressReceiptImage: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  insightMode: 'manual',
  primaryModel: 'gemini-3.1-flash-lite',
  autoFallback: true,
  cacheDurationMinutes: 10,
  focusStyle: 'ringkas',
  compressReceiptImage: true,
};

export function normalizeAiSettings(raw: unknown): AiSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const insightMode: AiInsightMode =
    src.insightMode === 'auto' || src.insightMode === 'off' || src.insightMode === 'manual'
      ? src.insightMode
      : DEFAULT_AI_SETTINGS.insightMode;
  const primaryModel: AiPrimaryModel =
    src.primaryModel === 'gemini-4-hydrogen' || src.primaryModel === 'gemini-3.1-flash-lite'
      ? src.primaryModel
      : DEFAULT_AI_SETTINGS.primaryModel;
  const autoFallback =
    typeof src.autoFallback === 'boolean' ? src.autoFallback : DEFAULT_AI_SETTINGS.autoFallback;
  const cacheDurationMinutes: AiCacheDurationMinutes =
    src.cacheDurationMinutes === 10 ||
    src.cacheDurationMinutes === 30 ||
    src.cacheDurationMinutes === 60 ||
    src.cacheDurationMinutes === 360
      ? src.cacheDurationMinutes
      : DEFAULT_AI_SETTINGS.cacheDurationMinutes;
  const focusStyle: AiFocusStyle =
    src.focusStyle === 'ringkas' || src.focusStyle === 'hemat' || src.focusStyle === 'tabungan'
      ? src.focusStyle
      : DEFAULT_AI_SETTINGS.focusStyle;
  const compressReceiptImage =
    typeof src.compressReceiptImage === 'boolean'
      ? src.compressReceiptImage
      : DEFAULT_AI_SETTINGS.compressReceiptImage;

  return {
    insightMode,
    primaryModel,
    autoFallback,
    cacheDurationMinutes,
    focusStyle,
    compressReceiptImage,
  };
}

// =============================================================================
// USER PREFERENCES MANAGEMENT
// =============================================================================

export interface UserPreferences {
  theme: 'dark' | 'light';
  privacy: boolean;
  sidebarCollapsed: boolean;
  activeLedgerId?: string;
  notificationsRead: string[];
  notificationsDismissed: string[];
  automationEvents: AutomationEvent[];
  aiSettings: AiSettings;
  updatedAt: number;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'light',
  privacy: false,
  sidebarCollapsed: false,
  activeLedgerId: undefined,
  notificationsRead: [],
  notificationsDismissed: [],
  automationEvents: [],
  aiSettings: { ...DEFAULT_AI_SETTINGS },
  updatedAt: 0,
};

function getPreferencesRef(uid: string) {
  return doc(db, 'users', uid, 'settings', 'preferences');
}

export function subscribeUserPreferences(
  uid: string,
  onData: (prefs: UserPreferences) => void
): () => void {
  const path = `users/${uid}/settings/preferences`;
  const ref = getPreferencesRef(uid);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData({ ...DEFAULT_USER_PREFERENCES, aiSettings: { ...DEFAULT_AI_SETTINGS } });
        return;
      }
      const data = snap.data() as Partial<UserPreferences>;
      onData({
        theme: data.theme === 'dark' ? 'dark' : 'light',
        privacy: Boolean(data.privacy),
        sidebarCollapsed: Boolean(data.sidebarCollapsed),
        activeLedgerId: typeof data.activeLedgerId === 'string' ? data.activeLedgerId : undefined,
        notificationsRead: Array.isArray(data.notificationsRead) ? data.notificationsRead : [],
        notificationsDismissed: Array.isArray(data.notificationsDismissed) ? data.notificationsDismissed : [],
        automationEvents: Array.isArray(data.automationEvents) ? data.automationEvents : [],
        aiSettings: normalizeAiSettings(data.aiSettings),
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
      });
    },
    (error) => {
      logFirestoreListenerError(error, OperationType.GET, path);
    }
  );
}

export async function updateUserPreferences(
  uid: string,
  partial: Partial<Omit<UserPreferences, 'updatedAt'>>
): Promise<void> {
  const path = `users/${uid}/settings/preferences`;
  try {
    const clean: Record<string, unknown> = { updatedAt: Date.now() };
    Object.entries(partial).forEach(([k, v]) => {
      if (v !== undefined) clean[k] = v;
    });
    await setDoc(getPreferencesRef(uid), clean, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveAiSettings(uid: string, next: AiSettings): Promise<void> {
  const normalized = normalizeAiSettings(next);
  await updateUserPreferences(uid, { aiSettings: normalized });
}

export async function appendAutomationEventCloud(
  uid: string,
  ruleName: string,
  amount: number,
  accountName: string
): Promise<void> {
  try {
    const ref = getPreferencesRef(uid);
    const snap = await getDoc(ref);
    const currentEvents: AutomationEvent[] =
      snap.exists() && Array.isArray(snap.data()?.automationEvents)
        ? (snap.data().automationEvents as AutomationEvent[])
        : [];

    const newEvent: AutomationEvent = {
      id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ruleName,
      amount,
      accountName,
      timestamp: Date.now(),
    };

    const nextEvents = [newEvent, ...currentEvents].slice(0, 25);
    await setDoc(
      ref,
      { automationEvents: nextEvents, updatedAt: Date.now() },
      { merge: true }
    );
  } catch (error) {
    console.error('Gagal mencatat event otomasi ke Firestore:', error);
  }
}

// =============================================================================
// DAILY AI USAGE & QUOTA TRACKER (`users/{uid}/settings/aiUsage`)
// =============================================================================

export const AI_TRACKED_MODELS: AiPrimaryModel[] = [
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen',
];

export interface AiUsageRecord {
  date: string; // YYYY-MM-DD (tanggal lokal)
  usage: Record<AiPrimaryModel, number>;
  limits: Record<AiPrimaryModel, number>;
  limitReached: Record<AiPrimaryModel, boolean>;
  updatedAt: number;
}

export const DEFAULT_AI_USAGE_LIMITS: Record<AiPrimaryModel, number> = {
  'gemini-3.1-flash-lite': 500,
  'gemini-4-hydrogen': 20,
};

function isTrackedAiModel(model: unknown): model is AiPrimaryModel {
  return model === 'gemini-3.1-flash-lite' || model === 'gemini-4-hydrogen';
}

function parsePositiveLimit(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(1_000_000, Math.round(n));
}

function parseNonNegativeCount(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export function createDefaultAiUsage(todayStr = toLocalDateStr(new Date())): AiUsageRecord {
  return {
    date: todayStr,
    usage: {
      'gemini-3.1-flash-lite': 0,
      'gemini-4-hydrogen': 0,
    },
    limits: { ...DEFAULT_AI_USAGE_LIMITS },
    limitReached: {
      'gemini-3.1-flash-lite': false,
      'gemini-4-hydrogen': false,
    },
    updatedAt: 0,
  };
}

export function normalizeAiUsage(
  raw: unknown,
  todayStr = toLocalDateStr(new Date())
): AiUsageRecord {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawLimits =
    src.limits && typeof src.limits === 'object'
      ? (src.limits as Record<string, unknown>)
      : {};

  const limits: Record<AiPrimaryModel, number> = {
    'gemini-3.1-flash-lite': parsePositiveLimit(
      rawLimits['gemini-3.1-flash-lite'],
      DEFAULT_AI_USAGE_LIMITS['gemini-3.1-flash-lite']
    ),
    'gemini-4-hydrogen': parsePositiveLimit(
      rawLimits['gemini-4-hydrogen'],
      DEFAULT_AI_USAGE_LIMITS['gemini-4-hydrogen']
    ),
  };

  const storedDate = typeof src.date === 'string' ? src.date : '';
  if (storedDate !== todayStr) {
    return {
      date: todayStr,
      usage: {
        'gemini-3.1-flash-lite': 0,
        'gemini-4-hydrogen': 0,
      },
      limits,
      limitReached: {
        'gemini-3.1-flash-lite': false,
        'gemini-4-hydrogen': false,
      },
      updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : 0,
    };
  }

  const rawUsage =
    src.usage && typeof src.usage === 'object'
      ? (src.usage as Record<string, unknown>)
      : {};
  const rawLimitReached =
    src.limitReached && typeof src.limitReached === 'object'
      ? (src.limitReached as Record<string, unknown>)
      : {};

  return {
    date: todayStr,
    usage: {
      'gemini-3.1-flash-lite': parseNonNegativeCount(rawUsage['gemini-3.1-flash-lite']),
      'gemini-4-hydrogen': parseNonNegativeCount(rawUsage['gemini-4-hydrogen']),
    },
    limits,
    limitReached: {
      'gemini-3.1-flash-lite': Boolean(rawLimitReached['gemini-3.1-flash-lite']),
      'gemini-4-hydrogen': Boolean(rawLimitReached['gemini-4-hydrogen']),
    },
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : Date.now(),
  };
}

function getAiUsageRef(uid: string) {
  return doc(db, 'users', uid, 'settings', 'aiUsage');
}

export function subscribeAiUsage(
  uid: string,
  onData: (record: AiUsageRecord) => void
): () => void {
  if (!uid) {
    onData(createDefaultAiUsage());
    return () => {};
  }
  const path = `users/${uid}/settings/aiUsage`;
  const ref = getAiUsageRef(uid);

  return onSnapshot(
    ref,
    (snap) => {
      const today = toLocalDateStr(new Date());
      if (!snap.exists()) {
        onData(createDefaultAiUsage(today));
        return;
      }
      onData(normalizeAiUsage(snap.data(), today));
    },
    (error) => {
      logFirestoreListenerError(error, OperationType.GET, path);
    }
  );
}

export async function recordAiApiUsage(
  uid: string,
  event: {
    modelUsed?: string;
    cached?: boolean;
    exhaustedModels?: string[];
  }
): Promise<void> {
  if (!uid) return;
  const shouldIncrement = !event.cached && isTrackedAiModel(event.modelUsed);
  const exhaustedValid = (event.exhaustedModels || []).filter(isTrackedAiModel);

  if (!shouldIncrement && exhaustedValid.length === 0) {
    return;
  }

  const ref = getAiUsageRef(uid);
  const today = toLocalDateStr(new Date());

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current = normalizeAiUsage(snap.exists() ? snap.data() : null, today);

      if (shouldIncrement && isTrackedAiModel(event.modelUsed)) {
        current.usage[event.modelUsed] = (current.usage[event.modelUsed] || 0) + 1;
      }
      for (const m of exhaustedValid) {
        current.limitReached[m] = true;
      }

      tx.set(
        ref,
        {
          date: today,
          usage: current.usage,
          limits: current.limits,
          limitReached: current.limitReached,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    });
  } catch (error) {
    console.warn('Gagal mencatat estimasi pemakaian AI ke Firestore:', error);
  }
}

export async function updateAiUsageLimits(
  uid: string,
  partialLimits: Partial<Record<AiPrimaryModel, number>>
): Promise<void> {
  if (!uid) return;
  const path = `users/${uid}/settings/aiUsage`;
  const ref = getAiUsageRef(uid);
  const today = toLocalDateStr(new Date());

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current = normalizeAiUsage(snap.exists() ? snap.data() : null, today);

      const nextLimits: Record<AiPrimaryModel, number> = {
        'gemini-3.1-flash-lite':
          partialLimits['gemini-3.1-flash-lite'] !== undefined
            ? parsePositiveLimit(
                partialLimits['gemini-3.1-flash-lite'],
                current.limits['gemini-3.1-flash-lite']
              )
            : current.limits['gemini-3.1-flash-lite'],
        'gemini-4-hydrogen':
          partialLimits['gemini-4-hydrogen'] !== undefined
            ? parsePositiveLimit(
                partialLimits['gemini-4-hydrogen'],
                current.limits['gemini-4-hydrogen']
              )
            : current.limits['gemini-4-hydrogen'],
      };

      tx.set(
        ref,
        {
          date: today,
          usage: current.usage,
          limits: nextLimits,
          limitReached: current.limitReached,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function resetAiUsageToday(uid: string): Promise<void> {
  if (!uid) return;
  const path = `users/${uid}/settings/aiUsage`;
  const ref = getAiUsageRef(uid);
  const today = toLocalDateStr(new Date());

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current = normalizeAiUsage(snap.exists() ? snap.data() : null, today);

      tx.set(
        ref,
        {
          date: today,
          usage: {
            'gemini-3.1-flash-lite': 0,
            'gemini-4-hydrogen': 0,
          },
          limits: current.limits,
          limitReached: {
            'gemini-3.1-flash-lite': false,
            'gemini-4-hydrogen': false,
          },
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
