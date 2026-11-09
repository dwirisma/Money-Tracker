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
  type LucideIcon 
} from 'lucide-react';

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

export interface NavGroup { label: string; items: NavItem[] }

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
  DASH, ADD_TX, HIST_TX, M1, M2, M3, M4, INV, M5, M6, SET
];

