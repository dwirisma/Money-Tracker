/**
 * Firebase Initialization & Offline-First Persistence Configuration
 */
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  Firestore
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

// Mengambil konfigurasi dari window global atau environment variables
declare global {
  interface Window {
    __FIREBASE_CONFIG__?: Record<string, string>;
  }
}

const rawApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const isValidApiKey = typeof rawApiKey === 'string' && rawApiKey.trim().length > 10;

const firebaseConfig = {
  apiKey: isValidApiKey ? rawApiKey : 'AIzaSyArthaOfflineDefaultKey12345678901',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'artha-finance-app.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'artha-finance-app',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'artha-finance-app.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1029384756',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1029384756:web:artha1234567890'
};

// Inisialisasi Firebase App (Cegah inisialisasi ganda)
const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Inisialisasi Firestore dengan offline-first IndexedDB persistence
let db: Firestore;

try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch {
  // Fallback jika sudah pernah terinisialisasi
  db = getFirestore(app);
}

// Inisialisasi Auth secara aman dengan fallback proteksi jika API Key belum diisi
let auth: Auth;
try {
  auth = getAuth(app);
} catch (err) {
  console.warn('Firebase Auth offline fallback active:', err);
  auth = {
    currentUser: null,
    onAuthStateChanged: () => () => {}
  } as unknown as Auth;
}

export { app, db, auth };
