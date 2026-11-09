import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setPrivacyMode } from '../utils/calculator';

export type Theme = 'dark' | 'light';
const KEY_THEME = 'artha_theme';
const KEY_PRIVACY = 'artha_privacy';
const KEY_SIDEBAR = 'artha_sidebar_collapsed';

interface UIState {
  theme: Theme;
  privacy: boolean;
  sidebarCollapsed: boolean;
  toggleTheme: () => void;
  togglePrivacy: () => void;
  toggleSidebar: () => void;
}

const UIContext = createContext<UIState | null>(null);

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage penuh/dinonaktifkan: preferensi tidak tersimpan */ }
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (read(KEY_THEME) === 'light' ? 'light' : 'dark'));
  const [privacy, setPrivacy] = useState<boolean>(() => read(KEY_PRIVACY) === 'true');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => read(KEY_SIDEBAR) === 'true');

  // Sinkronkan ke <html>, meta theme-color, dan formatter global
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121316' : '#fff4dc');
    write(KEY_THEME, theme);
  }, [theme]);

  // setPrivacyMode dipanggil sinkron saat render agar semua formatRupiah di render yang sama ikut tersensor
  setPrivacyMode(privacy);
  useEffect(() => { write(KEY_PRIVACY, String(privacy)); }, [privacy]);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', sidebarCollapsed ? '4.5rem' : '15rem');
    write(KEY_SIDEBAR, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const toggleTheme = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);
  const togglePrivacy = useCallback(() => setPrivacy(p => !p), []);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(c => !c), []);

  const value = useMemo(
    () => ({ theme, privacy, sidebarCollapsed, toggleTheme, togglePrivacy, toggleSidebar }),
    [theme, privacy, sidebarCollapsed, toggleTheme, togglePrivacy, toggleSidebar]
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIState {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI harus dipakai di dalam <UIProvider>');
  return ctx;
}
