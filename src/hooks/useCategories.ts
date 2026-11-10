import { useCallback, useMemo, useState } from 'react';

export type CategoryKind = 'expense' | 'income';
export type CategoryLists = Record<CategoryKind, string[]>;

/** Kategori bawaan (sama dengan daftar lama di form transaksi). "Lainnya" dikunci sebagai cadangan. */
export const DEFAULT_CATEGORIES: CategoryLists = {
  expense: ['Makanan & Minuman', 'Transportasi', 'Tagihan & Utilitas', 'Belanja Bulanan', 'Kesehatan', 'Hiburan & Hobi', 'Lainnya'],
  income: ['Gaji Bulanan', 'Bonus & THR', 'Hasil Bisnis', 'Investasi', 'Hadiah/Pemberian', 'Lainnya'],
};
export const LOCKED_CATEGORY = 'Lainnya';
const KEY = 'artha_categories';
const MAX_LEN = 30;

function load(): CategoryLists {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CATEGORIES;
    const p = JSON.parse(raw);
    const ok = (a: unknown): a is string[] => Array.isArray(a) && a.every(x => typeof x === 'string' && x.trim());
    if (!ok(p?.expense) || !ok(p?.income)) return DEFAULT_CATEGORIES;
    const withLocked = (a: string[]) => (a.includes(LOCKED_CATEGORY) ? a : [...a, LOCKED_CATEGORY]);
    return { expense: withLocked(p.expense), income: withLocked(p.income) };
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

function save(v: CategoryLists) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* preferensi tidak tersimpan jika storage penuh */ }
}

/** Mengembalikan pesan error, atau null jika nama valid. */
function validate(list: string[], name: string, ignore?: string): string | null {
  const n = name.trim();
  if (!n) return 'Nama kategori tidak boleh kosong.';
  if (n.length > MAX_LEN) return `Maksimal ${MAX_LEN} karakter.`;
  if (list.some(c => c !== ignore && c.toLowerCase() === n.toLowerCase())) return 'Kategori itu sudah ada.';
  return null;
}

export function useCategories() {
  const [lists, setLists] = useState<CategoryLists>(load);

  const commit = useCallback((next: CategoryLists) => { setLists(next); save(next); }, []);

  const add = useCallback((kind: CategoryKind, name: string): string | null => {
    const err = validate(lists[kind], name);
    if (err) return err;
    const arr = lists[kind];
    // sisipkan sebelum "Lainnya" agar tetap di paling bawah
    const at = arr.indexOf(LOCKED_CATEGORY);
    const next = at >= 0 ? [...arr.slice(0, at), name.trim(), ...arr.slice(at)] : [...arr, name.trim()];
    commit({ ...lists, [kind]: next });
    return null;
  }, [lists, commit]);

  const rename = useCallback((kind: CategoryKind, from: string, to: string): string | null => {
    if (from === LOCKED_CATEGORY) return 'Kategori "Lainnya" tidak bisa diubah.';
    const err = validate(lists[kind], to, from);
    if (err) return err;
    commit({ ...lists, [kind]: lists[kind].map(c => (c === from ? to.trim() : c)) });
    return null;
  }, [lists, commit]);

  const remove = useCallback((kind: CategoryKind, name: string) => {
    if (name === LOCKED_CATEGORY) return;
    commit({ ...lists, [kind]: lists[kind].filter(c => c !== name) });
  }, [lists, commit]);

  const reset = useCallback(() => commit(DEFAULT_CATEGORIES), [commit]);

  return useMemo(() => ({ lists, add, rename, remove, reset }), [lists, add, rename, remove, reset]);
}

export type CategoriesApi = ReturnType<typeof useCategories>;
