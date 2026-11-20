import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setPrivacyMode } from '../utils/financeUtils';
import { useAuth } from './AuthContext';
import { subscribeUserPreferences, updateUserPreferences } from '../services/settingsService';

export type Theme = 'dark' | 'light';

interface UIState {
  theme: Theme;
  privacy: boolean;
  sidebarCollapsed: boolean;
  mobileDrawerOpen: boolean;
  toggleTheme: () => void;
  togglePrivacy: () => void;
  toggleSidebar: () => void;
  toggleMobileDrawer: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
}

const UIContext = createContext<UIState | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const { uid } = useAuth();
  const [theme, setTheme] = useState<Theme>('light');
  const [privacy, setPrivacy] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  // Sinkronisasi preferensi UI real-time dari Cloud Firestore
  useEffect(() => {
    if (!uid) {
      setTheme('light');
      setPrivacy(false);
      setSidebarCollapsed(false);
      setMobileDrawerOpen(false);
      return;
    }

    const unsubscribe = subscribeUserPreferences(uid, (prefs) => {
      setTheme(prefs.theme);
      setPrivacy(prefs.privacy);
      setSidebarCollapsed(prefs.sidebarCollapsed);
    });
    return () => unsubscribe();
  }, [uid]);

  // Sinkronkan ke <html> dan meta theme-color
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#16161c' : '#fff4dc');
  }, [theme]);

  // setPrivacyMode dipanggil sinkron saat render agar semua formatRupiah di render yang sama ikut tersensor
  setPrivacyMode(privacy);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', sidebarCollapsed ? '4.25rem' : '13.5rem');
  }, [sidebarCollapsed]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (uid) {
      void updateUserPreferences(uid, { theme: next });
    }
  }, [theme, uid]);

  const togglePrivacy = useCallback(() => {
    const next = !privacy;
    setPrivacy(next);
    if (uid) {
      void updateUserPreferences(uid, { privacy: next });
    }
  }, [privacy, uid]);

  const toggleSidebar = useCallback(() => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    if (uid) {
      void updateUserPreferences(uid, { sidebarCollapsed: next });
    }
  }, [sidebarCollapsed, uid]);

  const toggleMobileDrawer = useCallback(() => setMobileDrawerOpen((o) => !o), []);

  const value = useMemo(
    () => ({
      theme,
      privacy,
      sidebarCollapsed,
      mobileDrawerOpen,
      toggleTheme,
      togglePrivacy,
      toggleSidebar,
      toggleMobileDrawer,
      setMobileDrawerOpen,
    }),
    [
      theme,
      privacy,
      sidebarCollapsed,
      mobileDrawerOpen,
      toggleTheme,
      togglePrivacy,
      toggleSidebar,
      toggleMobileDrawer,
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIState {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI harus dipakai di dalam <UIProvider>');
  return ctx;
}
