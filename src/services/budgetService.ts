/**
 * Category Budget Management Service
 * Menyimpan alokasi pagu dana / budget bulanan per kategori per buku kas
 */

export interface CategoryBudgetMap {
  [categoryName: string]: number;
}

const BUDGET_STORAGE_KEY_PREFIX = 'artha_category_budgets_';

export const DEFAULT_CATEGORY_BUDGETS: CategoryBudgetMap = {
  'Makanan & Minuman': 1500000,
  'Transportasi': 500000,
  'Tagihan & Utilitas': 1000000,
  'Belanja Bulanan': 1000000,
  'Kesehatan': 300000,
  'Hiburan & Hobi': 400000,
  'Lainnya': 300000
};

export function getCategoryBudgets(ledgerId: string = 'default'): CategoryBudgetMap {
  try {
    const raw = localStorage.getItem(`${BUDGET_STORAGE_KEY_PREFIX}${ledgerId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Gagal membaca alokasi budget kategori:', e);
  }
  return { ...DEFAULT_CATEGORY_BUDGETS };
}

export function saveCategoryBudgets(ledgerId: string = 'default', budgets: CategoryBudgetMap): void {
  try {
    localStorage.setItem(`${BUDGET_STORAGE_KEY_PREFIX}${ledgerId}`, JSON.stringify(budgets));
    window.dispatchEvent(new CustomEvent('artha-budgets-updated', { detail: { ledgerId, budgets } }));
  } catch (e) {
    console.error('Gagal menyimpan alokasi budget kategori:', e);
  }
}

export function setSingleCategoryBudget(ledgerId: string = 'default', category: string, amount: number): void {
  const current = getCategoryBudgets(ledgerId);
  current[category] = Math.max(0, amount);
  saveCategoryBudgets(ledgerId, current);
}
