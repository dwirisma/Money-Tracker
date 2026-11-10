import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setPrivacyMode } from '../utils/calculator';

export type Theme = 'dark' | 'light';
const KEY_THEME = 'artha_theme_v3'; // key baru: tampilan v3 dimulai dari tema terang
const KEY_PRIVACY = 'artha_privacy';
const KEY_SIDEBAR = 'artha_sidebar_collapsed';

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

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage penuh/dinonaktifkan: preferensi tidak tersimpan */ }
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (read(KEY_THEME) === 'dark' ? 'dark' : 'light'));
  const [privacy, setPrivacy] = useState<boolean>(() => read(KEY_PRIVACY) === 'true');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => read(KEY_SIDEBAR) === 'true');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  // Sinkronkan ke <html>, meta theme-color, dan formatter global
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#16161c' : '#fff4dc');
    write(KEY_THEME, theme);
  }, [theme]);

  // setPrivacyMode dipanggil sinkron saat render agar semua formatRupiah di render yang sama ikut tersensor
  setPrivacyMode(privacy);
  useEffect(() => { write(KEY_PRIVACY, String(privacy)); }, [privacy]);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', sidebarCollapsed ? '4.25rem' : '13.5rem');
    write(KEY_SIDEBAR, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const toggleTheme = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);
  const togglePrivacy = useCallback(() => setPrivacy(p => !p), []);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(c => !c), []);
  const toggleMobileDrawer = useCallback(() => setMobileDrawerOpen(o => !o), []);

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
      setMobileDrawerOpen 
    }),
    [theme, privacy, sidebarCollapsed, mobileDrawerOpen, toggleTheme, togglePrivacy, toggleSidebar, toggleMobileDrawer]
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIState {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI harus dipakai di dalam <UIProvider>');
  return ctx;
}
