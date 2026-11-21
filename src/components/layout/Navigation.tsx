import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  LayoutDashboard,
  PlusCircle,
  History,
  Wallet,
  Target,
  Receipt,
  Zap,
  BarChart3,
  TrendingUp,
  Briefcase,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  LayoutGrid,
  Moon,
  Plus,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useUI } from '../../context/UIContext';

// =============================================================================
// NAVIGATION CONFIGURATION
// =============================================================================

export type ModuleId =
  | 'settings'
  | 'dashboard'
  | 'add_transaction'
  | 'history_transaction'
  | 'module1'
  | 'module2'
  | 'module3'
  | 'module4'
  | 'module5'
  | 'investments'
  | 'module6';

export interface NavItem {
  id: ModuleId;
  label: string;
  short: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const DASH: NavItem = { id: 'dashboard', label: 'Dashboard', short: 'Beranda', hint: 'Ringkasan kondisi keuanganmu hari ini', icon: LayoutDashboard, accent: 'var(--accent-sage)' };
const ADD_TX: NavItem = { id: 'add_transaction', label: 'Tambah Transaksi', short: 'Tambah', hint: 'Input pemasukan, pengeluaran & transfer', icon: PlusCircle, accent: 'var(--accent-sand)' };
const HIST_TX: NavItem = { id: 'history_transaction', label: 'Riwayat Transaksi', short: 'Riwayat', hint: 'Pencarian & filter transaksi lengkap', icon: History, accent: 'var(--accent-blue)' };
const M1: NavItem = { id: 'module1', label: 'Akun & Saldo', short: 'Akun', hint: 'Daftar bank, dompet & kas per buku', icon: Wallet, accent: 'var(--accent-sage)' };
const M2: NavItem = { id: 'module2', label: 'Sinking Funds', short: 'Target', hint: 'Target tabungan dan wishlist', icon: Target, accent: 'var(--accent-sand)' };
const M3: NavItem = { id: 'module3', label: 'Tagihan & Utang', short: 'Tagihan', hint: 'Tagihan rutin dan cicilan utang', icon: Receipt, accent: 'var(--accent-terracotta)' };
const M4: NavItem = { id: 'module4', label: 'Otomatisasi', short: 'Otomatis', hint: 'Aturan transaksi otomatis & cron', icon: Zap, accent: 'var(--accent-lavender)' };
const INV: NavItem = { id: 'investments', label: 'Portofolio Investasi', short: 'Investasi', hint: 'Saham, reksa dana, kripto, emas & obligasi', icon: TrendingUp, accent: 'var(--accent-sand)' };
const M5: NavItem = { id: 'module5', label: 'Laporan & Analitik', short: 'Laporan', hint: 'Arus kas, alokasi dana kategori & ekspor', icon: BarChart3, accent: 'var(--accent-blue)' };
const M6: NavItem = { id: 'module6', label: 'Gaji & Shift', short: 'Gaji', hint: 'Prediksi gaji & kalender shift Group C', icon: Briefcase, accent: 'var(--accent-terracotta)' };
const SET: NavItem = { id: 'settings', label: 'Pengaturan', short: 'Atur', hint: 'Tema, privasi, Gemini AI & preferensi', icon: SettingsIcon, accent: 'var(--accent-blue)' };

export const SIDEBAR_GROUPS: NavGroup[] = [
  { label: 'TRANSAKSI & SALDO', items: [DASH, ADD_TX, HIST_TX, M1] },
  { label: 'PERENCANAAN & UTANG', items: [M2, M3, M4] },
  { label: 'INVESTASI & LAPORAN', items: [INV, M5, M6] },
  { label: 'SISTEM', items: [SET] },
];

/** Semua modul yang tersedia untuk navigasi */
export const ALL_NAV_ITEMS: NavItem[] = [
  DASH, ADD_TX, HIST_TX, M1, M2, M3, M4, INV, M5, M6, SET,
];

// =============================================================================
// APP NAVIGATION (SIDEBAR + MOBILE TAB BAR & MENU SHEET)
// =============================================================================

interface AppNavProps {
  active: ModuleId;
  onNavigate: (id: ModuleId) => void;
}

const TABS: ModuleId[] = ['dashboard', 'history_transaction', 'module1'];
const getNavItem = (id: ModuleId) => ALL_NAV_ITEMS.find((i) => i.id === id)!;

function Tab({ id, active, onGo }: { id: ModuleId; active: boolean; onGo: (id: ModuleId) => void }) {
  const it = getNavItem(id);
  return (
    <button type="button" className="ax-tab" data-active={active} onClick={() => onGo(id)} aria-current={active ? 'page' : undefined}>
      <span className="ax-tab-ic"><it.icon size={18} /></span>
      {it.short}
    </button>
  );
}

export function AppNav({ active, onNavigate }: AppNavProps) {
  const { sidebarCollapsed, toggleSidebar, mobileDrawerOpen, setMobileDrawerOpen, theme, privacy, toggleTheme, togglePrivacy } = useUI();
  const [now, setNow] = useState(() => new Date());

  const go = (id: ModuleId) => {
    onNavigate(id);
    setMobileDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileDrawerOpen(false);
    };
    window.addEventListener('keydown', esc);
    return () => {
      clearInterval(t);
      window.removeEventListener('keydown', esc);
    };
  }, [mobileDrawerOpen, setMobileDrawerOpen]);

  const tgl = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const menuActive = !TABS.includes(active) && active !== 'add_transaction';

  return (
    <>
      {/* DESKTOP: sidebar */}
      <aside className="ax-side" data-collapsed={sidebarCollapsed} aria-label="Navigasi utama">
        <div className="ax-brand">
          <button type="button" className="ax-logo" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}>A</button>
          <div><b>Artha</b><small>WEALTH OS</small></div>
        </div>
        {SIDEBAR_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="ax-grp">{g.label}</div>
            {g.items.map((it) => (
              <button key={it.id} type="button" className="ax-item" data-active={active === it.id} title={it.label} onClick={() => go(it.id)} aria-current={active === it.id ? 'page' : undefined}>
                <span className="ax-chip" style={{ backgroundColor: it.accent }}><it.icon size={16} /></span>
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        ))}
        <button type="button" className="ax-collapse" onClick={toggleSidebar} aria-label="Ciutkan atau perluas sidebar">
          {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}<span>Ciutkan</span>
        </button>
      </aside>

      {/* MOBILE: tab bar + tombol catat di tengah */}
      <nav className="ax-tabbar" aria-label="Navigasi bawah">
        <Tab id="dashboard" active={active === 'dashboard'} onGo={go} />
        <Tab id="history_transaction" active={active === 'history_transaction'} onGo={go} />
        <button type="button" className="ax-fab" onClick={() => go('add_transaction')} aria-label="Catat transaksi baru"><Plus size={26} strokeWidth={3} /></button>
        <Tab id="module1" active={active === 'module1'} onGo={go} />
        <button type="button" className="ax-tab" data-active={menuActive} onClick={() => setMobileDrawerOpen(true)}>
          <span className="ax-tab-ic"><LayoutGrid size={18} /></span>Menu
        </button>
      </nav>

      {/* MOBILE: sheet menu semua modul */}
      {mobileDrawerOpen && (
        <div className="ax-overlay md:hidden" onClick={() => setMobileDrawerOpen(false)}>
          <div className="ax-sheet" role="dialog" aria-label="Menu Artha" onClick={(e) => e.stopPropagation()}>
            <div className="ax-handle" />
            <div className="ax-sh">
              <div><h2>Menu</h2><p>{tgl} · {jam}</p></div>
              <button type="button" className="brutal-btn !p-2 min-w-[44px] min-h-[44px]" onClick={() => setMobileDrawerOpen(false)} aria-label="Tutup menu"><X size={16} /></button>
            </div>
            <div className="ax-tools">
              <button type="button" className="brutal-btn" onClick={togglePrivacy}>{privacy ? <EyeOff size={14} /> : <Eye size={14} />}{privacy ? 'Saldo disensor' : 'Saldo terbuka'}</button>
              <button type="button" className="brutal-btn" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}{theme === 'dark' ? 'Mode gelap' : 'Mode terang'}</button>
            </div>
            {SIDEBAR_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="ax-grp">{g.label}</div>
                <div className="ax-grid">
                  {g.items.map((it) => (
                    <button key={it.id} type="button" className="ax-tile" data-active={active === it.id} onClick={() => go(it.id)}>
                      <span className="ax-chip" style={{ backgroundColor: it.accent }}><it.icon size={16} /></span>
                      {it.short}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================================
// HEADER TOOLS (DESKTOP CLOCK, PRIVACY & THEME TOGGLES)
// =============================================================================

function formatNow(d: Date) {
  const tgl = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return { tgl, jam };
}

/** Alat header desktop: tanggal & jam, mode privasi, dan tema. (Di mobile ada di menu sheet.) */
export function HeaderTools() {
  const { theme, privacy, toggleTheme, togglePrivacy } = useUI();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const { tgl, jam } = formatNow(now);

  return (
    <div className="ax-htools">
      <div className="ax-clock" aria-label={`${tgl}, ${jam}`}>
        <CalendarDays className="w-4 h-4" aria-hidden="true" />
        <div>
          <b>{tgl}</b>
          <small>{jam}</small>
        </div>
      </div>

      <button
        type="button"
        onClick={togglePrivacy}
        aria-pressed={privacy}
        aria-label={privacy ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
        title={privacy ? 'Mode privasi aktif: ketuk untuk tampilkan saldo' : 'Sembunyikan saldo'}
        className={`ax-hbtn ${privacy ? 'on' : ''}`}
      >
        {privacy ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
        title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
        className="ax-hbtn"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </div>
  );
}
