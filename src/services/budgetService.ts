/**
 * Category Budget Management Service (100% Cloud Firestore Real-Time)
 * Menyimpan alokasi pagu dana / budget bulanan per kategori per buku kas
 */
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError, logFirestoreListenerError } from '../config/firebase';

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
