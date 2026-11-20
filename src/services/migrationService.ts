/**
 * Automatic Legacy Firestore Rename Service
 * Memindahkan ("rename") satu kali seluruh data lama dari `users/demo_user_artha/...`
 * ke `users/user_artha/...` pada database `(default)` setelah pengguna login via Firebase Auth.
 *
 * Alur aman anti-hilang data:
 * 1. Periksa dokumen penanda `users/user_artha/settings/migration` (`renamedFromDemo === true`).
 * 2. Baca seluruh subkoleksi (dan dokumen induk bila ada) di `users/demo_user_artha` dengan `try/catch` per subkoleksi.
 * 3. Salin seluruh dokumen beserta ID asli dan seluruh field-nya ke `users/user_artha/...` menggunakan `writeBatch` (chunk <= 450).
 * 4. Jika SELURUH penyalinan berhasil tanpa error:
 *    - Simpan penanda `{ renamedFromDemo: true, migratedAt: serverTimestamp(), ... }` di `users/user_artha/settings/migration`.
 *    - Hapus dokumen lama di `users/demo_user_artha/...` menggunakan `writeBatch` (chunk <= 450) agar rename selesai bersih.
 * 5. Jika ada kegagalan baca/salin, data di `users/demo_user_artha` TIDAK disentuh/dihapus dan akan dicoba ulang pada login berikutnya.
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
  type DocumentReference,
} from 'firebase/firestore';
import { ARTHA_USER_DOC_ID, db } from '../config/firebase';

const LEGACY_DEMO_UID = 'demo_user_artha';
const BATCH_CHUNK_SIZE = 450;

export interface MigrationResult {
  skipped: boolean;
  migratedCount: number;
  deletedLegacyCount: number;
  migratedCollections: string[];
  hadError: boolean;
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

function stripUndefined(obj: DocumentData): DocumentData {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) out[k] = v;
  });
  return out;
}

const inFlightMigrations = new Map<string, Promise<MigrationResult>>();

/**
 * Memeriksa penanda `users/user_artha/settings/migration` dan memindahkan satu kali
 * seluruh dokumen dari `users/demo_user_artha/...` ke `users/user_artha/...`.
 */
export function migrateLegacyDemoDataIfNeeded(
  targetUserDocId: string = ARTHA_USER_DOC_ID
): Promise<MigrationResult> {
  if (!targetUserDocId || targetUserDocId === LEGACY_DEMO_UID) {
    return Promise.resolve({
      skipped: true,
      migratedCount: 0,
      deletedLegacyCount: 0,
      migratedCollections: [],
      hadError: false,
    });
  }

  const existing = inFlightMigrations.get(targetUserDocId);
  if (existing) return existing;

  const task = (async (): Promise<MigrationResult> => {
    const markerRef = doc(db, 'users', targetUserDocId, 'settings', 'migration');

    // 1. Cek penanda migrasi agar rename hanya berjalan 1 kali
    try {
      const markerSnap = await getDoc(markerRef);
      if (markerSnap.exists() && markerSnap.data()?.renamedFromDemo === true) {
        return {
          skipped: true,
          migratedCount: 0,
          deletedLegacyCount: 0,
          migratedCollections: [],
          hadError: false,
        };
      }
    } catch (err) {
      console.warn('Gagal memeriksa penanda migrasi users/user_artha/settings/migration:', err);
      return {
        skipped: true,
        migratedCount: 0,
        deletedLegacyCount: 0,
        migratedCollections: [],
        hadError: true,
      };
    }

    const pendingWrites: Array<{
      destRef: DocumentReference;
      data: DocumentData;
      label: string;
    }> = [];
    const legacyRefsToDelete: DocumentReference[] = [];
    const migratedCollections = new Set<string>();
    let hadReadError = false;
    let hadCopyError = false;

    // 2A. Periksa apakah dokumen induk `users/demo_user_artha` sendiri ada
    try {
      const legacyRootRef = doc(db, 'users', LEGACY_DEMO_UID);
      const legacyRootSnap = await getDoc(legacyRootRef);
      if (legacyRootSnap.exists()) {
        const rootData = stripUndefined(legacyRootSnap.data() || {});
        if (Object.keys(rootData).length > 0) {
          pendingWrites.push({
            destRef: doc(db, 'users', targetUserDocId),
            data: rootData,
            label: 'profile',
          });
        }
        legacyRefsToDelete.push(legacyRootRef);
      }
    } catch (err) {
      // Tidak fatal jika aturan hanya mengizinkan subkoleksi; tetap lanjut membaca subkoleksi
      console.warn('Lewati pemeriksaan dokumen induk demo_user_artha:', err);
    }

    // 2B. Baca seluruh subkoleksi dari `users/demo_user_artha` dengan try/catch per subkoleksi
    for (const { source, target } of LEGACY_COLLECTIONS) {
      try {
        const snap = await getDocs(collection(db, 'users', LEGACY_DEMO_UID, source));
        if (snap.empty) continue;

        snap.docs.forEach((d) => {
          // Hindari menimpa dokumen penanda migrasi sendiri
          if (target === 'settings' && d.id === 'migration') {
            legacyRefsToDelete.push(d.ref);
            return;
          }
          const cleanData = stripUndefined(d.data());
          pendingWrites.push({
            destRef: doc(db, 'users', targetUserDocId, target, d.id),
            data: cleanData,
            label: target,
          });
          legacyRefsToDelete.push(d.ref);
        });
      } catch (err) {
        hadReadError = true;
        console.warn(`Gagal membaca subkoleksi lama "users/${LEGACY_DEMO_UID}/${source}":`, err);
      }
    }

    // 3. Salin seluruh dokumen ke `users/user_artha/...` menggunakan writeBatch (maks 450 ops/batch)
    let totalCopied = 0;
    for (let i = 0; i < pendingWrites.length; i += BATCH_CHUNK_SIZE) {
      const chunk = pendingWrites.slice(i, i + BATCH_CHUNK_SIZE);
      try {
        const batch = writeBatch(db);
        chunk.forEach(({ destRef, data }) => {
          batch.set(destRef, data, { merge: true });
        });
        await batch.commit();
        totalCopied += chunk.length;
        chunk.forEach(({ label }) => migratedCollections.add(label));
      } catch (batchErr) {
        console.warn('Batch penyalinan migrasi gagal, mencoba penyalinan per dokumen:', batchErr);
        for (const item of chunk) {
          try {
            await setDoc(item.destRef, item.data, { merge: true });
            totalCopied += 1;
            migratedCollections.add(item.label);
          } catch (docErr) {
            hadCopyError = true;
            console.error(`Gagal menyalin dokumen ke ${item.destRef.path}:`, docErr);
          }
        }
      }
    }

    // Jika ada error baca atau error salin, JANGAN hapus data lama dan JANGAN tandai selesai
    if (hadReadError || hadCopyError) {
      console.warn(
        'Migrasi/rename belum selesai sempurna (ada error baca/salin). Data lama users/demo_user_artha dipertahankan demi keamanan.'
      );
      return {
        skipped: false,
        migratedCount: totalCopied,
        deletedLegacyCount: 0,
        migratedCollections: Array.from(migratedCollections),
        hadError: true,
      };
    }

    // 4. Simpan penanda selesai di `users/user_artha/settings/migration`
    try {
      await setDoc(
        markerRef,
        {
          renamedFromDemo: true,
          migratedFromDemo: true,
          migratedCount: totalCopied,
          migratedCollections: Array.from(migratedCollections),
          migratedAt: serverTimestamp(),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Gagal menulis penanda migrasi, membatalkan penghapusan data lama:', err);
      return {
        skipped: false,
        migratedCount: totalCopied,
        deletedLegacyCount: 0,
        migratedCollections: Array.from(migratedCollections),
        hadError: true,
      };
    }

    // 5. Hapus dokumen lama di `users/demo_user_artha` HANYA setelah seluruh salinan & penanda sukses 100%
    let deletedLegacyCount = 0;
    for (let i = 0; i < legacyRefsToDelete.length; i += BATCH_CHUNK_SIZE) {
      const chunk = legacyRefsToDelete.slice(i, i + BATCH_CHUNK_SIZE);
      try {
        const batch = writeBatch(db);
        chunk.forEach((legacyRef) => {
          batch.delete(legacyRef);
        });
        await batch.commit();
        deletedLegacyCount += chunk.length;
      } catch (delErr) {
        console.warn('Gagal menghapus sebagian dokumen lama di users/demo_user_artha:', delErr);
      }
    }

    return {
      skipped: false,
      migratedCount: totalCopied,
      deletedLegacyCount,
      migratedCollections: Array.from(migratedCollections),
      hadError: false,
    };
  })().finally(() => {
    inFlightMigrations.delete(targetUserDocId);
  });

  inFlightMigrations.set(targetUserDocId, task);
  return task;
}
