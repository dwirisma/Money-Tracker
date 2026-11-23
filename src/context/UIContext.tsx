import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setPrivacyMode } from '../utils/financeUtils';
import { useAuth } from './AuthContext';
import {
  DEFAULT_AI_SETTINGS,
  normalizeAiSettings,
  normalizeBudgetAllocationMap,
  saveAiSettings,
  saveBudgetAllocationMap,
  subscribeUserPreferences,
  updateUserPreferences,
  type AiSettings,
  type BudgetAllocationMap,
} from '../services/settingsService';

export type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'artha_theme_mode';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Abaikan jika localStorage tidak tersedia
  }
  return 'light';
}

function persistStoredTheme(next: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Abaikan jika localStorage tidak tersedia
  }
}

interface UIState {
  theme: Theme;
  privacy: boolean;
  sidebarCollapsed: boolean;
  mobileDrawerOpen: boolean;
  aiSettings: AiSettings;
  budgetAllocationMap: BudgetAllocationMap;
  toggleTheme: () => void;
  togglePrivacy: () => void;
  toggleSidebar: () => void;
  toggleMobileDrawer: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  updateAiSettings: (partial: Partial<AiSettings>) => Promise<void>;
  updateBudgetAllocationMap: (nextMap: BudgetAllocationMap) => Promise<void>;
}

const UIContext = createContext<UIState | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const { uid } = useAuth();
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [privacy, setPrivacy] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [aiSettings, setAiSettings] = useState<AiSettings>({ ...DEFAULT_AI_SETTINGS });
  const [budgetAllocationMap, setBudgetAllocationMap] = useState<BudgetAllocationMap>({});

  // Sinkronisasi preferensi UI, AI & Pemetaan 50/30/20 real-time dari Cloud Firestore
  useEffect(() => {
    if (!uid) {
      setPrivacy(false);
      setSidebarCollapsed(false);
      setMobileDrawerOpen(false);
      setAiSettings({ ...DEFAULT_AI_SETTINGS });
      setBudgetAllocationMap({});
      return;
    }

    const unsubscribe = subscribeUserPreferences(uid, (prefs) => {
      setTheme(prefs.theme);
      persistStoredTheme(prefs.theme);
      setPrivacy(prefs.privacy);
      setSidebarCollapsed(prefs.sidebarCollapsed);
      setAiSettings(prefs.aiSettings);
      setBudgetAllocationMap(prefs.budgetAllocationMap || {});
    });
    return () => unsubscribe();
  }, [uid]);

  // Sinkronkan ke <html>, localStorage, dan meta theme-color
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0F1117' : '#fff4dc');
    persistStoredTheme(theme);
  }, [theme]);

  // setPrivacyMode dipanggil sinkron saat render agar semua formatRupiah di render yang sama ikut tersensor
  setPrivacyMode(privacy);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', sidebarCollapsed ? '4.25rem' : '13.5rem');
  }, [sidebarCollapsed]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    persistStoredTheme(next);
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

  const updateAiSettings = useCallback(
    async (partial: Partial<AiSettings>) => {
      const next = normalizeAiSettings({ ...aiSettings, ...partial });
      setAiSettings(next);
      if (uid) {
        await saveAiSettings(uid, next);
      }
    },
    [aiSettings, uid]
  );

  const updateBudgetAllocationMap = useCallback(
    async (nextMap: BudgetAllocationMap) => {
      const normalized = normalizeBudgetAllocationMap(nextMap);
      setBudgetAllocationMap(normalized);
      if (uid) {
        await saveBudgetAllocationMap(normalized, uid);
      }
    },
    [uid]
  );

  const value = useMemo(
    () => ({
      theme,
      privacy,
      sidebarCollapsed,
      mobileDrawerOpen,
      aiSettings,
      budgetAllocationMap,
      toggleTheme,
      togglePrivacy,
      toggleSidebar,
      toggleMobileDrawer,
      setMobileDrawerOpen,
      updateAiSettings,
      updateBudgetAllocationMap,
    }),
    [
      theme,
      privacy,
      sidebarCollapsed,
      mobileDrawerOpen,
      aiSettings,
      budgetAllocationMap,
      toggleTheme,
      togglePrivacy,
      toggleSidebar,
      toggleMobileDrawer,
      updateAiSettings,
      updateBudgetAllocationMap,
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIState {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI harus dipakai di dalam <UIProvider>');
  return ctx;
}
