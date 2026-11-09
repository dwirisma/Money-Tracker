import { Settings as SettingsIcon, LayoutDashboard, BookOpen, Target, Receipt, Zap, BarChart3, Briefcase, type LucideIcon } from 'lucide-react';

export type ModuleId = 'settings' | 'dashboard' | 'module1' | 'module2' | 'module3' | 'module4' | 'module5' | 'module6';

export interface NavItem {
  id: ModuleId;
  label: string;
  short: string; // label pendek untuk bottom nav
  hint: string;
  icon: LucideIcon;
  accent: string; // CSS var untuk ikon di sheet mobile
}

export interface NavGroup { label: string; items: NavItem[] }

const DASH: NavItem = { id: 'dashboard', label: 'Dashboard', short: 'Beranda', hint: 'Ringkasan kondisi keuanganmu hari ini', icon: LayoutDashboard, accent: 'var(--accent-sage)' };
const SET: NavItem = { id: 'settings', label: 'Pengaturan', short: 'Atur', hint: 'Tema, privasi, dan kategori transaksi', icon: SettingsIcon, accent: 'var(--accent-blue)' };
const M1: NavItem = { id: 'module1', label: 'Buku Besar & Akun', short: 'Buku', hint: 'Transaksi, saldo, dan daftar akun', icon: BookOpen, accent: 'var(--accent-sage)' };
const M2: NavItem = { id: 'module2', label: 'Sinking Funds', short: 'Target', hint: 'Target tabungan dan wishlist', icon: Target, accent: 'var(--accent-sand)' };
const M3: NavItem = { id: 'module3', label: 'Tagihan & Utang', short: 'Tagihan', hint: 'Tagihan rutin dan cicilan utang', icon: Receipt, accent: 'var(--accent-terracotta)' };
const M4: NavItem = { id: 'module4', label: 'Otomatisasi', short: 'Otomatis', hint: 'Aturan transaksi otomatis', icon: Zap, accent: 'var(--accent-lavender)' };
const M5: NavItem = { id: 'module5', label: 'Laporan & Analitik', short: 'Laporan', hint: 'Arus kas, rincian, ekspor Excel', icon: BarChart3, accent: 'var(--accent-blue)' };
const M6: NavItem = { id: 'module6', label: 'Gaji & Shift', short: 'Gaji', hint: 'Prediksi gaji dan kalender shift Group C', icon: Briefcase, accent: 'var(--accent-sand)' };

export const SIDEBAR_GROUPS: NavGroup[] = [
  { label: 'NAVIGASI UTAMA', items: [DASH, M1] },
  { label: 'MODUL', items: [M2, M3, M4, M5, M6] },
  { label: 'PENGATURAN & BANTUAN', items: [SET] },
];

/** Isi sheet "Menu Lainnya" di mobile: semua yang tidak ada di bottom nav */
export const MORE_ITEMS: NavItem[] = [M1, M2, M3, M6, SET];
export const BOTTOM_LEFT: NavItem[] = [DASH, M5];
export const BOTTOM_RIGHT: NavItem[] = [M4];
