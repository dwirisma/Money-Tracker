import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, type User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);

export const auth = getAuth(app);

export const PRODUCTION_DOMAIN = 'artha-apps.vercel.app';
export const PRODUCTION_USER_DOC_ID = 'user_artha';
export const SANDBOX_USER_DOC_ID = 'user_artha_sandbox';
export const DEMO_EMAIL_PREFIX = 'demo@';

/**
 * Opsional: tambahkan UID Firebase Auth akun demo/reviewer di sini bila emailnya
 * tidak berawalan `demo@`.
 */
export const DEMO_UID_ALLOWLIST: readonly string[] = [];

export function isProductionDomain(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.hostname === PRODUCTION_DOMAIN
  );
}

/**
 * Mengembalikan `true` jika pengguna yang aktif adalah akun demo/reviewer
 * (User ID `demo` -> email virtual `demo@artha.local`, email berawalan `demo@`,
 * atau terdaftar pada `DEMO_UID_ALLOWLIST`).
 */
export function isDemoAccount(
  user?: Pick<User, 'email' | 'uid'> | null
): boolean {
  const target = user !== undefined ? user : auth.currentUser;
  if (!target) return false;

  const email = (target.email || '').trim().toLowerCase();
  if (email === 'demo' || email.startsWith(DEMO_EMAIL_PREFIX)) {
    return true;
  }

  return Boolean(target.uid && DEMO_UID_ALLOWLIST.includes(target.uid));
}

/**
 * Prioritas routing Sandbox Mode:
 * 1. Akun `demo` / `demo@*` -> SELALU Sandbox (`true`), termasuk di domain produksi.
 * 2. Di luar domain produksi (AI Studio preview / localhost) -> Sandbox (`true`).
 * 3. Akun utama pada `artha-apps.vercel.app` -> Produksi (`false`).
 */
export function isSandboxSession(
  user?: Pick<User, 'email' | 'uid'> | null
): boolean {
  if (isDemoAccount(user)) {
    return true;
  }
  return !isProductionDomain();
}

/**
 * Menentukan ID dokumen root Firestore (`user_artha` vs `user_artha_sandbox`)
 * secara dinamis mengikuti akun yang sedang login dan domain aktif.
 */
export function getActiveUserDocId(
  user?: Pick<User, 'email' | 'uid'> | null
): string {
  return isSandboxSession(user)
    ? SANDBOX_USER_DOC_ID
    : PRODUCTION_USER_DOC_ID;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function logFirestoreListenerError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Listener Error:', JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Koneksi ke Cloud Firestore gagal. Periksa konfigurasi Firebase atau jaringan internet Anda.');
    }
    // Permission denied / not found pada dokumen test adalah normal untuk aturan keamanan privat.
  }
}

void testConnection();
