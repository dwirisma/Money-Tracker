/**
 * Cloud Firestore Settings & Budget Service (100% Real-Time)
 * Menggabungkan manajemen alokasi anggaran per kategori (`users/{uid}/budgets/{ledgerId}`)
 * dan preferensi pengguna (`users/{uid}/settings/preferences`).
 */
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError, logFirestoreListenerError } from '../config/firebase';
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
        onData({ ...DEFAULT_USER_PREFERENCES });
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
