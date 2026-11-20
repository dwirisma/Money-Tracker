import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, OperationType, handleFirestoreError, logFirestoreListenerError } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

export type CategoryKind = 'expense' | 'income';
export type CategoryLists = Record<CategoryKind, string[]>;

/** Kategori bawaan (sama dengan daftar lama di form transaksi). "Lainnya" dikunci sebagai cadangan. */
export const DEFAULT_CATEGORIES: CategoryLists = {
  expense: [
    'Makanan & Minuman',
    'Transportasi',
    'Tagihan & Utilitas',
    'Belanja Bulanan',
    'Kesehatan',
    'Hiburan & Hobi',
    'Lainnya',
  ],
  income: ['Gaji Bulanan', 'Bonus & THR', 'Hasil Bisnis', 'Investasi', 'Hadiah/Pemberian', 'Lainnya'],
};
export const LOCKED_CATEGORY = 'Lainnya';
const MAX_LEN = 30;

function normalizeCategoryLists(raw: unknown): CategoryLists {
  const p = raw as Partial<CategoryLists> | null | undefined;
  const ok = (a: unknown): a is string[] =>
    Array.isArray(a) && a.every((x) => typeof x === 'string' && x.trim().length > 0);
  if (!ok(p?.expense) || !ok(p?.income)) return DEFAULT_CATEGORIES;
  const withLocked = (a: string[]) => (a.includes(LOCKED_CATEGORY) ? a : [...a, LOCKED_CATEGORY]);
  return { expense: withLocked(p.expense), income: withLocked(p.income) };
}

/** Pastikan sebuah kategori ada di daftar Firestore (dipakai fitur otomatis, mis. investasi). Aman dipanggil berulang. */
export async function ensureCategory(uid: string, kind: CategoryKind, name: string): Promise<void> {
  if (!uid || !name.trim()) return;
  const path = `users/${uid}/settings/categories`;
  try {
    const ref = doc(db, 'users', uid, 'settings', 'categories');
    const snap = await getDoc(ref);
    const cur = snap.exists() ? normalizeCategoryLists(snap.data()) : DEFAULT_CATEGORIES;
    if (cur[kind].some((c) => c.toLowerCase() === name.toLowerCase())) return;
    const arr = cur[kind];
    const at = arr.indexOf(LOCKED_CATEGORY);
    const next = at >= 0 ? [...arr.slice(0, at), name, ...arr.slice(at)] : [...arr, name];
    await setDoc(ref, { ...cur, [kind]: next, updatedAt: Date.now() }, { merge: true });
  } catch (error) {
    console.error('Gagal memastikan kategori di Firestore:', path, error);
  }
}

/** Mengembalikan pesan error, atau null jika nama valid. */
function validate(list: string[], name: string, ignore?: string): string | null {
  const n = name.trim();
  if (!n) return 'Nama kategori tidak boleh kosong.';
  if (n.length > MAX_LEN) return `Maksimal ${MAX_LEN} karakter.`;
  if (list.some((c) => c !== ignore && c.toLowerCase() === n.toLowerCase())) return 'Kategori itu sudah ada.';
  return null;
}

export function useCategories() {
  const { uid } = useAuth();
  const [lists, setLists] = useState<CategoryLists>(DEFAULT_CATEGORIES);

  useEffect(() => {
    if (!uid) {
      setLists(DEFAULT_CATEGORIES);
      return;
    }

    const path = `users/${uid}/settings/categories`;
    const ref = doc(db, 'users', uid, 'settings', 'categories');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setLists(DEFAULT_CATEGORIES);
          void setDoc(ref, { ...DEFAULT_CATEGORIES, updatedAt: Date.now() }, { merge: true }).catch((err) =>
            console.error('Gagal inisialisasi kategori default:', err)
          );
          return;
        }
        setLists(normalizeCategoryLists(snap.data()));
      },
      (error) => {
        logFirestoreListenerError(error, OperationType.GET, path);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const commit = useCallback(
    (next: CategoryLists) => {
      setLists(next);
      if (!uid) return;
      const path = `users/${uid}/settings/categories`;
      const ref = doc(db, 'users', uid, 'settings', 'categories');
      void setDoc(ref, { ...next, updatedAt: Date.now() }, { merge: true }).catch((error) =>
        handleFirestoreError(error, OperationType.WRITE, path)
      );
    },
    [uid]
  );

  const add = useCallback(
    (kind: CategoryKind, name: string): string | null => {
      const err = validate(lists[kind], name);
      if (err) return err;
      const arr = lists[kind];
      // sisipkan sebelum "Lainnya" agar tetap di paling bawah
      const at = arr.indexOf(LOCKED_CATEGORY);
      const next =
        at >= 0 ? [...arr.slice(0, at), name.trim(), ...arr.slice(at)] : [...arr, name.trim()];
      commit({ ...lists, [kind]: next });
      return null;
    },
    [lists, commit]
  );

  const rename = useCallback(
    (kind: CategoryKind, from: string, to: string): string | null => {
      if (from === LOCKED_CATEGORY) return 'Kategori "Lainnya" tidak bisa diubah.';
      const err = validate(lists[kind], to, from);
      if (err) return err;
      commit({ ...lists, [kind]: lists[kind].map((c) => (c === from ? to.trim() : c)) });
      return null;
    },
    [lists, commit]
  );

  const remove = useCallback(
    (kind: CategoryKind, name: string) => {
      if (name === LOCKED_CATEGORY) return;
      commit({ ...lists, [kind]: lists[kind].filter((c) => c !== name) });
    },
    [lists, commit]
  );

  const reset = useCallback(() => commit(DEFAULT_CATEGORIES), [commit]);

  return useMemo(() => ({ lists, add, rename, remove, reset }), [lists, add, rename, remove, reset]);
}

export type CategoriesApi = ReturnType<typeof useCategories>;
