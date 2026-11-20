import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, ARTHA_USER_DOC_ID } from '../config/firebase';

export const VIRTUAL_EMAIL_DOMAIN = '@artha.local';

export function toVirtualEmail(rawUserId: string): string {
  const cleaned = rawUserId.trim().toLowerCase();
  if (!cleaned) return '';
  return cleaned.includes('@') ? cleaned : `${cleaned}${VIRTUAL_EMAIL_DOMAIN}`;
}

export function formatDisplayUserId(email: string | null | undefined): string {
  if (!email) return '-';
  if (email.toLowerCase().endsWith(VIRTUAL_EMAIL_DOMAIN)) {
    return email.slice(0, -VIRTUAL_EMAIL_DOMAIN.length);
  }
  return email;
}

export function mapAuthErrorToIndonesian(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'User ID atau Password salah. Periksa kembali kredensial Anda.';
    case 'auth/invalid-email':
      return 'Format User ID tidak valid. Gunakan huruf, angka, titik, atau tanda hubung tanpa spasi.';
    case 'auth/user-disabled':
      return 'Akun ini telah dinonaktifkan oleh administrator.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan gagal. Silakan tunggu beberapa saat sebelum mencoba lagi.';
    case 'auth/operation-not-allowed':
      return 'Login Email/Password belum diaktifkan di Firebase Console proyek ini.';
    case 'auth/network-request-failed':
      return 'Koneksi internet terputus. Pastikan perangkat terhubung ke jaringan.';
    default:
      return err instanceof Error && err.message
        ? `Gagal masuk: ${err.message}`
        : 'Gagal masuk. Silakan coba lagi.';
  }
}

/**
 * Pembersihan satu kali untuk seluruh key lama berawalan `artha_` di browser.
 * Tidak ada migrasi data lokal; aplikasi berjalan 100% Cloud Firestore.
 */
function purgeLegacyArthaStorage(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('artha_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Abaikan jika browser membatasi akses storage
  }
}

interface AuthContextValue {
  user: User | null;
  uid: string | null;
  authUid: string | null;
  displayUserId: string;
  authReady: boolean;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    purgeLegacyArthaStorage();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const login = useCallback(async (userId: string, password: string) => {
    const trimmedId = userId.trim();
    if (!trimmedId) {
      throw new Error('User ID wajib diisi.');
    }
    if (!password) {
      throw new Error('Password wajib diisi.');
    }
    const virtualEmail = toVirtualEmail(trimmedId);
    try {
      await signInWithEmailAndPassword(auth, virtualEmail, password);
    } catch (err) {
      throw new Error(mapAuthErrorToIndonesian(err));
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      uid: user ? ARTHA_USER_DOC_ID : null,
      authUid: user?.uid ?? null,
      displayUserId: formatDisplayUserId(user?.email),
      authReady,
      login,
      logout,
    }),
    [user, authReady, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return ctx;
}
