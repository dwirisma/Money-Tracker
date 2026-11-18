import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart as PieIcon,
  BarChart3,
  Download,
  AlertTriangle,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Hourglass,
  Heart,
  ShoppingBag,
  GraduationCap,
  RefreshCw,
  Bus,
  Utensils,
  Leaf,
  ListFilter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Transaction, Ledger, Account, ReportTimeRange, CategoryExpenseSummary, CashFlowTrendPoint, ReportMetrics } from '../types';
import { getCategoryBudgets, type CategoryBudgetMap } from '../services/budgetService';

type Tone = 'ok' | 'mid' | 'low';
const TONE_COLOR: Record<Tone, string> = { ok: 'var(--accent-sage)', mid: 'var(--accent-sand)', low: 'var(--accent-terracotta)' };

interface Module5ReportsProps {
  transactions: Transaction[];
  activeLedger: Ledger | null;
  accounts: Account[];
  formatRupiah: (val: number) => string;
  formatDate: (val: string | number) => string;
  onNavigateToTab?: (tab: 'module1' | 'module2' | 'module3' | 'module4') => void;
}

// Palet warna Neo-Brutalisme Kalem untuk Kategori & Grafik
const CHART_PALETTE = [
  '#ff7a4d', // Terracotta
  '#ffc933', // Sand
  '#6c97ff', // Dusty Blue
  '#e3a8f7', // Lavender
  '#2dd4a7', // Sage Green
  '#e5a882', // Warm Coral
  '#8ec5ba', // Soft Teal
  '#d9a0d8', // Muted Plum
  '#c5ca82', // Olive Sand
  '#8e96a6'  // Muted Slate
];

export const Module5Reports: React.FC<Module5ReportsProps> = ({
  transactions,
  activeLedger,
  accounts,
  formatRupiah,
  formatDate,
  onNavigateToTab
}) => {
  // State Filter Waktu
  const [timeRange, setTimeRange] = useState<ReportTimeRange>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Category Budget State & Realtime Listener
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudgetMap>(() => 
    getCategoryBudgets(activeLedger?.id || 'default')
  );
  const [expenseSourcesTab, setExpenseSourcesTab] = useState<'overview' | 'detail'>('overview');

  useEffect(() => {
    setCategoryBudgets(getCategoryBudgets(activeLedger?.id || 'default'));
    const handler = () => {
      setCategoryBudgets(getCategoryBudgets(activeLedger?.id || 'default'));
    };
    window.addEventListener('artha-budgets-updated', handler);
    return () => window.removeEventListener('artha-budgets-updated', handler);
  }, [activeLedger?.id]);

  // Perhitungan Rentang Tanggal berdasarkan Filter Waktu
  const dateBounds = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    let start = '';
    let end = '';
    let label = '';

    if (timeRange === 'this_month') {
      const firstDay = new Date(currentYear, currentMonth, 1);
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      start = firstDay.toISOString().split('T')[0];
      end = lastDay.toISOString().split('T')[0];
      label = `Bulan Ini (${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })})`;
    } else if (timeRange === 'last_month') {
      const firstDay = new Date(currentYear, currentMonth - 1, 1);
      const lastDay = new Date(currentYear, currentMonth, 0);
      start = firstDay.toISOString().split('T')[0];
      end = lastDay.toISOString().split('T')[0];
      const prevDate = new Date(currentYear, currentMonth - 1, 1);
      label = `Bulan Lalu (${prevDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })})`;
    } else if (timeRange === 'this_year') {
      start = `${currentYear}-01-01`;
      end = `${currentYear}-12-31`;
      label = `Tahun Ini (${currentYear})`;
    } else if (timeRange === 'custom') {
      start = customStartDate || '1970-01-01';
      end = customEndDate || '2099-12-31';
      label = customStartDate && customEndDate 
        ? `${customStartDate} s/d ${customEndDate}` 
        : 'Rentang Kustom';
    } else {
      // all_time
      start = '1970-01-01';
      end = '2099-12-31';
      label = 'Semua Waktu';
    }

    return { start, end, label };
  }, [timeRange, customStartDate, customEndDate]);

  // Filter Transaksi Berdasarkan Rentang Tanggal dan Ledger Aktif
  const filteredTransactions = useMemo(() => {
    if (!activeLedger) return [];
    return transactions.filter(t => {
      if (t.ledgerId !== activeLedger.id) return false;
      const txDate = t.date || '';
      if (dateBounds.start && txDate < dateBounds.start) return false;
      if (dateBounds.end && txDate > dateBounds.end) return false;
      return true;
    });
  }, [transactions, activeLedger, dateBounds]);

  // =========================================================================
  // 1. AGREGASI SCORECARDS (TOTAL INCOME, EXPENSE, NET CASH FLOW)
  // =========================================================================
  const metrics: ReportMetrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let validTxCount = 0;
    let fixedExpenseTotal = 0;
    let variableExpenseTotal = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'income') {
        totalIncome += Number(t.amount) || 0;
        validTxCount++;
      } else if (t.type === 'expense') {
        const amt = Number(t.amount) || 0;
        totalExpense += amt;
        validTxCount++;

        // -------------------------------------------------------------------
        // KLASIFIKASI PENGELUARAN (FIXED/KEWAJIBAN VS VARIABLE/GAYA HIDUP)
        // Fixed: Transaksi dari tagihan (billId), utang/cicilan (debtId), atau kategori kewajiban
        // Variable: Sisanya (makanan, hobi, belanja fleksibel)
        // -------------------------------------------------------------------
        const catLower = (t.category || '').toLowerCase();
        const isFixed = Boolean(
          t.billId || 
          t.debtId || 
          catLower.includes('tagihan') || 
          catLower.includes('utilitas') || 
          catLower.includes('cicilan') || 
          catLower.includes('utang') || 
          catLower.includes('pinjaman') || 
          catLower.includes('sewa') || 
          catLower.includes('asuransi') ||
          catLower.includes('sinking fund') ||
          catLower.includes('langganan')
        );

        if (isFixed) {
          fixedExpenseTotal += amt;
        } else {
          variableExpenseTotal += amt;
        }
      }
      // Transfer internal antar-akun tidak dianggap sebagai beban pengeluaran luar
    });

    const netCashFlow = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 
      ? Math.max(0, Math.round((netCashFlow / totalIncome) * 100))
      : 0;

    const fixedExpensePercent = totalExpense > 0 
      ? Math.round((fixedExpenseTotal / totalExpense) * 100) 
      : 0;
    const variableExpensePercent = totalExpense > 0 
      ? Math.max(0, 100 - fixedExpensePercent) 
      : 0;

    // Hitung rata-rata pengeluaran harian
    let dayCount = 1;
    if (dateBounds.start && dateBounds.end && dateBounds.start !== '1970-01-01') {
      const dStart = new Date(dateBounds.start).getTime();
      const dEnd = new Date(dateBounds.end).getTime();
      const diffDays = Math.ceil((dEnd - dStart) / (1000 * 60 * 60 * 24)) + 1;
      dayCount = Math.max(1, diffDays);
    } else if (filteredTransactions.length > 0) {
      dayCount = 30;
    }
    const avgDailyExpense = Math.round(totalExpense / dayCount);

    // -----------------------------------------------------------------------
    // 1. INDIKATOR KOMPARASI MoM (MONTH-OVER-MONTH)
    // -----------------------------------------------------------------------
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let prevStart = '';
    let prevEnd = '';
    let isComparable = true;

    if (timeRange === 'this_month') {
      const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
      const py = prevMonthDate.getFullYear();
      const pm = prevMonthDate.getMonth();
      prevStart = new Date(py, pm, 1).toISOString().split('T')[0];
      prevEnd = new Date(py, pm + 1, 0).toISOString().split('T')[0];
    } else if (timeRange === 'last_month') {
      const twoMonthsAgoDate = new Date(currentYear, currentMonth - 2, 1);
      const py = twoMonthsAgoDate.getFullYear();
      const pm = twoMonthsAgoDate.getMonth();
      prevStart = new Date(py, pm, 1).toISOString().split('T')[0];
      prevEnd = new Date(py, pm + 1, 0).toISOString().split('T')[0];
    } else if (timeRange === 'this_year') {
      prevStart = `${currentYear - 1}-01-01`;
      prevEnd = `${currentYear - 1}-12-31`;
    } else {
      isComparable = false;
    }

    let prevIncome = 0;
    let prevExpense = 0;

    if (isComparable && activeLedger) {
      transactions.forEach(t => {
        if (t.ledgerId !== activeLedger.id) return;
        const txDate = t.date || '';
        if (prevStart && txDate < prevStart) return;
        if (prevEnd && txDate > prevEnd) return;

        if (t.type === 'income') {
          prevIncome += Number(t.amount) || 0;
        } else if (t.type === 'expense') {
          prevExpense += Number(t.amount) || 0;
        }
      });
    }

    let momIncomePercent: number | null = null;
    let momExpensePercent: number | null = null;

    if (isComparable) {
      if (prevIncome > 0) {
        momIncomePercent = Math.round(((totalIncome - prevIncome) / prevIncome) * 100);
      } else if (totalIncome > 0) {
        momIncomePercent = 100;
      } else {
        momIncomePercent = 0;
      }

      if (prevExpense > 0) {
        momExpensePercent = Math.round(((totalExpense - prevExpense) / prevExpense) * 100);
      } else if (totalExpense > 0) {
        momExpensePercent = 100;
      } else {
        momExpensePercent = 0;
      }
    }

    // -----------------------------------------------------------------------
    // 3. METRIK FINANCIAL RUNWAY (NAPAS KAS)
    // Formula: (Total Saldo Seluruh Akun Kas) / (Rata-rata Pengeluaran per Bulan selama 3 bulan terakhir)
    // -----------------------------------------------------------------------
    const totalCashBalance = accounts
      .filter(a => a.ledgerId === activeLedger?.id && !a.isArchived)
      .reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];

    const past3MTxs = transactions.filter(t => 
      t.ledgerId === activeLedger?.id && 
      t.type === 'expense' && 
      (t.date || '') >= threeMonthsAgoStr
    );

    const totalExpensePast3M = past3MTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const avgMonthlyExpense3M = Math.round(totalExpensePast3M / 3);

    let financialRunwayMonths: string | number = '∞';
    if (avgMonthlyExpense3M > 0) {
      const rawMonths = totalCashBalance / avgMonthlyExpense3M;
      financialRunwayMonths = rawMonths >= 10 ? Math.round(rawMonths) : Number(rawMonths.toFixed(1));
    } else if (totalExpense > 0) {
      const rawMonths = totalCashBalance / totalExpense;
      financialRunwayMonths = rawMonths >= 10 ? Math.round(rawMonths) : Number(rawMonths.toFixed(1));
    }

    return {
      totalIncome,
      totalExpense,
      netCashFlow,
      savingsRate,
      transactionCount: validTxCount,
      avgDailyExpense,
      momIncomePercent,
      momExpensePercent,
      prevIncome,
      prevExpense,
      fixedExpenseTotal,
      variableExpenseTotal,
      fixedExpensePercent,
      variableExpensePercent,
      financialRunwayMonths,
      totalCashBalance,
      avgMonthlyExpense3M
    };
  }, [filteredTransactions, transactions, accounts, activeLedger, dateBounds, timeRange]);

  // =========================================================================
  // 2. AGREGASI KOMPOSISI PENGELUARAN BERDASARKAN KATEGORI (PIE CHART)
  // =========================================================================
  const categoryBreakdown: CategoryExpenseSummary[] = useMemo(() => {
    const catMap = new Map<string, { amount: number; count: number }>();
    let totalExpenseAmount = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'expense') {
        const rawCat = (t.category || 'Lain-lain').trim();
        // Bersihkan prefix seperti "Sinking Fund: " atau "Wishlist: " untuk konsistensi tampilan
        let cat = rawCat;
        if (cat.startsWith('Sinking Fund:')) cat = 'Alokasi Sinking Fund';
        else if (cat.startsWith('Wishlist:')) cat = 'Alokasi Wishlist';

        const curr = catMap.get(cat) || { amount: 0, count: 0 };
        const amt = Number(t.amount) || 0;
        curr.amount += amt;
        curr.count += 1;
        catMap.set(cat, curr);
        totalExpenseAmount += amt;
      }
    });

    const result: CategoryExpenseSummary[] = [];
    let colorIdx = 0;

    catMap.forEach((val, cat) => {
      const percentage = totalExpenseAmount > 0 
        ? Math.round((val.amount / totalExpenseAmount) * 1000) / 10 
        : 0;

      result.push({
        category: cat,
        amount: val.amount,
        percentage,
        count: val.count,
        color: CHART_PALETTE[colorIdx % CHART_PALETTE.length]
      });
      colorIdx++;
    });

    // Urutkan dari nominal terbesar ke terkecil
    return result.sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions]);

  // =========================================================================
  // 2B. INDIKATOR ANALISIS KESEHATAN FINANSIAL & RASIO VITAL
  // =========================================================================
  const financialHealth = useMemo(() => {
    let totalDebtPayments = 0;
    filteredTransactions.forEach(t => {
      if (t.type === 'expense') {
        const cat = (t.category || '').toLowerCase();
        if (t.debtId || cat.includes('utang') || cat.includes('cicilan') || cat.includes('pinjaman') || cat.includes('kredit')) {
          totalDebtPayments += Number(t.amount) || 0;
        }
      }
    });

    const dtiRatio = metrics.totalIncome > 0 
      ? Math.round((totalDebtPayments / metrics.totalIncome) * 100) 
      : (totalDebtPayments > 0 ? 100 : 0);

    // Score calculations
    let savingsScore = 0;
    if (metrics.savingsRate >= 30) savingsScore = 35;
    else if (metrics.savingsRate >= 20) savingsScore = 30;
    else if (metrics.savingsRate >= 10) savingsScore = 20;
    else if (metrics.savingsRate > 0) savingsScore = 10;
    else savingsScore = 0;

    const runwayMonthsVal = typeof metrics.financialRunwayMonths === 'number' 
      ? metrics.financialRunwayMonths 
      : (metrics.financialRunwayMonths === '∞' ? 12 : 0);

    let runwayScore = 0;
    if (runwayMonthsVal >= 6) runwayScore = 35;
    else if (runwayMonthsVal >= 3) runwayScore = 25;
    else if (runwayMonthsVal >= 1) runwayScore = 15;
    else runwayScore = 5;

    let debtScore = 0;
    if (dtiRatio === 0) debtScore = 30;
    else if (dtiRatio <= 15) debtScore = 30;
    else if (dtiRatio <= 30) debtScore = 20;
    else if (dtiRatio <= 40) debtScore = 10;
    else debtScore = 0;

    const totalHealthScore = Math.min(100, savingsScore + runwayScore + debtScore);

    let healthGrade = 'Sangat Sehat';
    let healthBadgeBg = 'bg-emerald-500/20 border-emerald-500 text-emerald-400';
    if (totalHealthScore < 45) {
      healthGrade = 'Perlu Perhatian';
      healthBadgeBg = 'bg-rose-500/20 border-rose-500 text-rose-400';
    } else if (totalHealthScore < 75) {
      healthGrade = 'Cukup Sehat';
      healthBadgeBg = 'bg-amber-500/20 border-amber-500 text-amber-400';
    }

    return {
      totalDebtPayments,
      dtiRatio,
      totalHealthScore,
      healthGrade,
      healthBadgeBg,
      runwayMonthsVal
    };
  }, [filteredTransactions, metrics]);

  // Helper render ikon kategori untuk kartu Expense Sources
  const renderCategoryIcon = (category: string) => {
    const lower = category.toLowerCase();
    if (lower.includes('makan') || lower.includes('minum') || lower.includes('food')) {
      return <Utensils className="w-4 h-4 text-amber-500" />;
    }
    if (lower.includes('trans') || lower.includes('bensin') || lower.includes('kendaraan')) {
      return <Bus className="w-4 h-4 text-blue-500" />;
    }
    if (lower.includes('belanja') || lower.includes('shop') || lower.includes('pasar')) {
      return <ShoppingBag className="w-4 h-4 text-rose-500" />;
    }
    if (lower.includes('sehat') || lower.includes('obat') || lower.includes('dokter') || lower.includes('health')) {
      return <Heart className="w-4 h-4 text-red-500" />;
    }
    if (lower.includes('tagihan') || lower.includes('listrik') || lower.includes('air') || lower.includes('wifi') || lower.includes('pulsa') || lower.includes('utilitas')) {
      return <RefreshCw className="w-4 h-4 text-emerald-500" />;
    }
    if (lower.includes('didik') || lower.includes('kuliah') || lower.includes('sekolah') || lower.includes('buku') || lower.includes('kursus')) {
      return <GraduationCap className="w-4 h-4 text-indigo-500" />;
    }
    return <Leaf className="w-4 h-4 text-emerald-600" />;
  };

  // Komputasi Alokasi Dana & Status Kategori (Expense Sources Gambar 3)
  const expenseSourcesData = useMemo(() => {
    const keys = new Set<string>([
      ...Object.keys(categoryBudgets),
      ...categoryBreakdown.map(c => c.category)
    ]);

    return Array.from(keys).map(category => {
      const budget = categoryBudgets[category] || 0;
      const spentEntry = categoryBreakdown.find(c => c.category === category);
      const spent = spentEntry ? spentEntry.amount : 0;
      const count = spentEntry ? spentEntry.count : 0;
      const remaining = Math.max(0, budget - spent);
      const overspent = Math.max(0, spent - budget);
      const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;

      let status: 'ON_BUDGET' | 'LIMIT_REACHED' | 'BUDGET_EXCEEDED' | 'FLEXIBLE';
      if (budget === 0) {
        status = 'FLEXIBLE';
      } else if (spent > budget) {
        status = 'BUDGET_EXCEEDED';
      } else if (spent === budget) {
        status = 'LIMIT_REACHED';
      } else {
        status = 'ON_BUDGET';
      }

      return {
        category,
        budget,
        spent,
        count,
        remaining,
        overspent,
        pct,
        status
      };
    }).sort((a, b) => {
      // Prioritaskan kategori yang overbudget atau pengeluaran terbesar
      if (a.status === 'BUDGET_EXCEEDED' && b.status !== 'BUDGET_EXCEEDED') return -1;
      if (b.status === 'BUDGET_EXCEEDED' && a.status !== 'BUDGET_EXCEEDED') return 1;
      return b.spent - a.spent;
    });
  }, [categoryBudgets, categoryBreakdown]);

  // =========================================================================
  // 3. AGREGASI TREN ARUS KAS (BAR CHART: PEMASUKAN VS PENGELUARAN)
  // =========================================================================
  const trendData: CashFlowTrendPoint[] = useMemo(() => {
    // Mode Harian (untuk Bulan Ini / Bulan Lalu) vs Mode Bulanan (untuk Tahun Ini / Semua Waktu)
    const isMonthlyGrouping = timeRange === 'this_year' || timeRange === 'all_time';

    const groupMap = new Map<string, { label: string; income: number; expense: number }>();

    if (isMonthlyGrouping) {
      // Inisialisasi 12 bulan jika Tahun Ini
      if (timeRange === 'this_year') {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const yr = new Date().getFullYear();
        months.forEach((m, idx) => {
          const key = `${yr}-${String(idx + 1).padStart(2, '0')}`;
          groupMap.set(key, { label: m, income: 0, expense: 0 });
        });
      }

      filteredTransactions.forEach(t => {
        if (!t.date) return;
        const monthKey = t.date.substring(0, 7); // YYYY-MM
        const parts = monthKey.split('-');
        const monthNum = parseInt(parts[1], 10);
        const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const label = monthsShort[monthNum - 1] || monthKey;

        const curr = groupMap.get(monthKey) || { label, income: 0, expense: 0 };
        if (t.type === 'income') curr.income += Number(t.amount) || 0;
        if (t.type === 'expense') curr.expense += Number(t.amount) || 0;
        groupMap.set(monthKey, curr);
      });
    } else {
      // Pengelompokan harian
      filteredTransactions.forEach(t => {
        if (!t.date) return;
        const dayKey = t.date; // YYYY-MM-DD
        const d = new Date(dayKey);
        const dayNum = d.getDate();
        const monthShort = d.toLocaleDateString('id-ID', { month: 'short' });
        const label = `${dayNum} ${monthShort}`;

        const curr = groupMap.get(dayKey) || { label, income: 0, expense: 0 };
        if (t.type === 'income') curr.income += Number(t.amount) || 0;
        if (t.type === 'expense') curr.expense += Number(t.amount) || 0;
        groupMap.set(dayKey, curr);
      });
    }

    const sortedKeys = Array.from(groupMap.keys()).sort();
    return sortedKeys.map(k => {
      const item = groupMap.get(k)!;
      return {
        dateKey: k,
        label: item.label,
        income: item.income,
        expense: item.expense,
        net: item.income - item.expense
      };
    });
  }, [filteredTransactions, timeRange]);

  // Transaksi Pengeluaran Terbesar (Top 5 Expenses)
  const topExpenses = useMemo(() => {
    return filteredTransactions
      .filter(t => t.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [filteredTransactions]);

  // Alokasi Anggaran Cerdas (Aturan Emas 50/30/20)
  const allocation503020 = useMemo(() => {
    let needs = 0;
    let wants = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'expense') {
        const cat = (t.category || '').toLowerCase();
        const isNeed = Boolean(
          t.billId || 
          t.debtId || 
          cat.includes('makan') || 
          cat.includes('transport') || 
          cat.includes('tagihan') || 
          cat.includes('utilitas') || 
          cat.includes('kesehatan') || 
          cat.includes('bulanan') ||
          cat.includes('sewa') ||
          cat.includes('pendidikan') ||
          cat.includes('cicilan') ||
          cat.includes('utang')
        );
        if (isNeed) {
          needs += t.amount;
        } else {
          wants += t.amount;
        }
      }
    });

    const income = metrics.totalIncome || 0;
    const totalExp = needs + wants;
    const savings = Math.max(0, income - totalExp);
    const base = income > 0 ? income : (totalExp > 0 ? totalExp : 1);

    const needsPct = Math.round((needs / base) * 100);
    const wantsPct = Math.round((wants / base) * 100);
    const savingsPct = Math.round((savings / base) * 100);

    return { needs, wants, savings, needsPct, wantsPct, savingsPct, base };
  }, [filteredTransactions, metrics.totalIncome]);

  // Ekspor Data Transaksi ke File Excel / CSV
  const handleExportData = () => {
    try {
      const rows = filteredTransactions.map((t, idx) => {
        const acc = accounts.find(a => a.id === t.accountId);
        return {
          No: idx + 1,
          Tanggal: t.date,
          Tipe: t.type === 'income' ? 'Pemasukan' : t.type === 'expense' ? 'Pengeluaran' : 'Transfer',
          Kategori: t.category || '-',
          Nominal: t.amount,
          'Akun Rekening': acc ? acc.name : '-',
          Catatan: t.note || ''
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Transaksi');

      const fileName = `Laporan_Keuangan_${activeLedger?.name || 'Artha'}_${dateBounds.start}_to_${dateBounds.end}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (e) {
      console.error('Gagal mengekspor laporan:', e);
    }
  };

  // Helper Custom Tooltip Recharts bergaya Neo-Brutalisme
  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const inc = payload.find((p: any) => p.dataKey === 'income')?.value || 0;
      const exp = payload.find((p: any) => p.dataKey === 'expense')?.value || 0;
      const net = inc - exp;
      return (
        <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-color)] p-3 rounded-[var(--radius-sm)] shadow-[4px_4px_0px_#000] text-xs space-y-1.5 font-mono">
          <p className="font-heading font-bold text-[var(--text-primary)] text-sm border-b border-[var(--border-subtle)] pb-1">
            {label}
          </p>
          <div className="flex items-center justify-between gap-3 text-[var(--accent-sage)]">
            <span className="flex items-center gap-1.5 font-bold">
              <span className="w-2.5 h-2.5 bg-[var(--accent-sage)] border border-black inline-block" />
              Pemasukan:
            </span>
            <span>{formatRupiah(inc)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[var(--accent-terracotta-light)]">
            <span className="flex items-center gap-1.5 font-bold">
              <span className="w-2.5 h-2.5 bg-[var(--accent-terracotta)] border border-black inline-block" />
              Pengeluaran:
            </span>
            <span>{formatRupiah(exp)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-[var(--border-subtle)] font-bold text-[var(--text-primary)]">
            <span>Net Arus Kas:</span>
            <span className={net >= 0 ? 'text-[var(--accent-sage)]' : 'text-[var(--accent-terracotta)]'}>
              {net >= 0 ? `+${formatRupiah(net)}` : `-${formatRupiah(Math.abs(net))}`}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as CategoryExpenseSummary;
      return (
        <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-color)] p-3 rounded-[var(--radius-sm)] shadow-[4px_4px_0px_#000] text-xs space-y-1 font-mono">
          <p className="font-heading font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border border-black inline-block" style={{ backgroundColor: data.color }} />
            {data.category}
          </p>
          <p className="text-[var(--accent-terracotta-light)] font-bold text-sm">
            {formatRupiah(data.amount)}
          </p>
          <div className="flex items-center justify-between gap-2.5 text-[var(--text-secondary)] text-[11px] pt-1 border-t border-[var(--border-subtle)]">
            <span>Porsi Pengeluaran:</span>
            <span className="font-bold text-[var(--text-primary)]">{data.percentage}%</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            {data.count} Transaksi
          </p>
        </div>
      );
    }
    return null;
  };

  // Ringkasan Cerdas Finansial
  const insightMessage = useMemo(() => {
    if (metrics.transactionCount === 0) {
      return 'Belum ada transaksi tercatat pada rentang waktu ini. Tambahkan transaksi pada Modul 1 untuk melihat analitik lengkap.';
    }

    const sentences: string[] = [];
    const topCat = categoryBreakdown[0];

    // Status Arus Kas & Tabungan
    if (metrics.netCashFlow > 0) {
      sentences.push(
        `Arus kas Anda surplus ${formatRupiah(metrics.netCashFlow)} dengan rasio tabungan ${metrics.savingsRate}%.`
      );
    } else if (metrics.netCashFlow < 0) {
      sentences.push(
        `Pengeluaran melebihi pemasukan sebesar ${formatRupiah(Math.abs(metrics.netCashFlow))}.`
      );
    } else {
      sentences.push(
        `Pemasukan dan pengeluaran seimbang (${formatRupiah(metrics.totalIncome)}).`
      );
    }

    // Komparasi MoM
    if (metrics.momIncomePercent !== null && metrics.momIncomePercent !== undefined) {
      const incText = metrics.momIncomePercent >= 0 
        ? `pemasukan tumbuh +${metrics.momIncomePercent}%` 
        : `pemasukan turun ${metrics.momIncomePercent}%`;
      const expText = metrics.momExpensePercent && metrics.momExpensePercent > 0 
        ? `pengeluaran naik +${metrics.momExpensePercent}%` 
        : `pengeluaran terkendali ${metrics.momExpensePercent}%`;
      sentences.push(
        `Tren ${timeRange === 'this_year' ? 'YoY' : 'MoM'}: ${incText} & ${expText} dibanding periode sebelumnya.`
      );
    }

    // Klasifikasi Kewajiban vs Gaya Hidup
    if (metrics.fixedExpensePercent !== undefined && metrics.fixedExpensePercent > 0) {
      sentences.push(
        `Rasio kebutuhan: ${metrics.fixedExpensePercent}% dialokasikan untuk Kewajiban Rutin (tagihan/cicilan) dan ${metrics.variableExpensePercent}% untuk Kebutuhan Fleksibel/Gaya Hidup.`
      );
    }

    // Estimasi Napas Kas (Runway)
    if (metrics.financialRunwayMonths) {
      sentences.push(
        `Napas kas Anda diestimasikan bertahan sekitar ${metrics.financialRunwayMonths} bulan berdasarkan saldo kas saat ini.`
      );
    } else if (topCat) {
      sentences.push(
        `Pengeluaran terbesar ada pada pos ${topCat.category} (${topCat.percentage}%).`
      );
    }

    return sentences.join(' ');
  }, [metrics, categoryBreakdown, formatRupiah, timeRange]);

  const runwayRaw = metrics.financialRunwayMonths;
  const runwayNum = Number(runwayRaw);
  const runwayTier = runwayRaw === '∞' || runwayNum >= 6 ? 'ok' : runwayNum >= 3 ? 'mid' : 'low';
  const runwayLabel = runwayTier === 'ok' ? 'Napas aman' : runwayTier === 'mid' ? 'Cukup' : 'Waspada';
  const periodTabs: { id: ReportTimeRange; label: string }[] = [
    { id: 'this_month', label: 'Bulan ini' },
    { id: 'last_month', label: 'Bulan lalu' },
    { id: 'this_year', label: 'Tahun ini' },
    { id: 'all_time', label: 'Semua waktu' },
    { id: 'custom', label: 'Kustom' }
  ];
  const cmpLabel = timeRange === 'this_year' ? 'YoY' : 'MoM';

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      
      {/* HEADER + PERIODE */}
      <div className="ax-pagehead">
        <div>
          <h2>Laporan & Analitik</h2>
          <p>Buku kas <b>{activeLedger?.name || 'Utama'}</b> · {dateBounds.label}</p>
        </div>
        <button type="button" onClick={handleExportData} disabled={filteredTransactions.length === 0} className="brutal-btn ax-btn-light" title="Ekspor data transaksi terfilter ke Excel">
          <Download className="w-4 h-4" />Ekspor Excel
        </button>
      </div>
      <div className="ax-chipset scroll" role="radiogroup" aria-label="Periode laporan">
        {periodTabs.map(t => (
          <button key={t.id} type="button" role="radio" aria-checked={timeRange === t.id} onClick={() => setTimeRange(t.id)}>{t.label}</button>
        ))}
      </div>
      {timeRange === 'custom' && (
        <div className="ax-panel ax-daterange">
          <div>
            <label className="brutal-label" htmlFor="rep-from">Dari tanggal</label>
            <input id="rep-from" type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="brutal-input" />
          </div>
          <div>
            <label className="brutal-label" htmlFor="rep-to">Sampai tanggal</label>
            <input id="rep-to" type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="brutal-input" />
          </div>
          <span className="ax-sec-sub">{filteredTransactions.length} transaksi dalam rentang</span>
        </div>
      )}

      {/* RINGKASAN METRIK */}
      <section className="ax-dash">
        <div className={`ax-b s6 ax-panel ax-hero ${metrics.netCashFlow >= 0 ? 'sage' : 'terra'}`}>
          <div className="ax-hero-head">
            <div className="ax-eyebrow" style={{ marginTop: 0 }}><DollarSign className="w-3.5 h-3.5" />Arus kas bersih</div>
            <span className="ax-badge-s">{metrics.netCashFlow >= 0 ? 'Surplus ✓' : 'Defisit ⚠'}</span>
          </div>
          <div className="ax-big" style={{ marginBottom: 10 }}>
            {metrics.netCashFlow >= 0 ? '+' : '-'}{formatRupiah(Math.abs(metrics.netCashFlow))}
          </div>
          <div className="ax-stats two">
            <div className="ax-stat" title="Persentase pemasukan yang tersisa setelah pengeluaran">
              <span><TrendingUp className="w-3 h-3" />Rasio simpanan</span>
              <b>{metrics.savingsRate}% <small style={{ fontSize: 10, fontWeight: 700 }}>dari pemasukan</small></b>
            </div>
            <div className="ax-stat" title={`Saldo kas aktif: ${formatRupiah(metrics.totalCashBalance || 0)} | Pengeluaran rata-rata 3 bulan: ${formatRupiah(metrics.avgMonthlyExpense3M || 0)}`}>
              <span><Hourglass className="w-3 h-3" />Estimasi runway</span>
              <b className={runwayTier}>{runwayRaw} bulan{runwayRaw !== '∞' ? ` · ${runwayLabel}` : ''}</b>
            </div>
          </div>
        </div>

        <div className="ax-b m6 s3 ax-sc s">
          <span><TrendingUp className="w-3 h-3" />Total pemasukan</span>
          <div className="ax-valrow">
            <b>{formatRupiah(metrics.totalIncome)}</b>
            {metrics.momIncomePercent !== null && metrics.momIncomePercent !== undefined && (
              <span className={`ax-chg ${metrics.momIncomePercent >= 0 ? 'ok' : 'bad'}`} title={`Pemasukan periode lalu: ${formatRupiah(metrics.prevIncome || 0)}`}>
                {metrics.momIncomePercent >= 0 ? '▲ +' : '▼ '}{metrics.momIncomePercent}% {cmpLabel}
              </span>
            )}
          </div>
          <small>{metrics.prevIncome !== undefined && metrics.prevIncome > 0 ? `Periode lalu: ${formatRupiah(metrics.prevIncome)}` : 'Gaji, freelance, dan pendapatan lain'}</small>
        </div>

        <div className="ax-b m6 s3 ax-sc t">
          <span><TrendingDown className="w-3 h-3" />Total pengeluaran</span>
          <div className="ax-valrow">
            <b>{formatRupiah(metrics.totalExpense)}</b>
            {metrics.momExpensePercent !== null && metrics.momExpensePercent !== undefined && (
              <span className={`ax-chg ${metrics.momExpensePercent <= 0 ? 'ok' : 'bad'}`} title={`Pengeluaran periode lalu: ${formatRupiah(metrics.prevExpense || 0)}`}>
                {metrics.momExpensePercent > 0 ? '▲ +' : '▼ '}{metrics.momExpensePercent}% {cmpLabel}
              </span>
            )}
          </div>
          <small>Rata-rata {formatRupiah(metrics.avgDailyExpense)} / hari{metrics.prevExpense !== undefined && metrics.prevExpense > 0 ? ` · periode lalu ${formatRupiah(metrics.prevExpense)}` : ''}</small>
        </div>
      </section>

      {/* INSIGHT */}
      <p className="ax-ai-tip" style={{ margin: '0 0 12px' }}>
        <span aria-hidden="true"><Sparkles className="w-4 h-4" /></span>
        <span style={{ color: 'inherit', fontWeight: 600 }}><b>Insight periode ini:</b> {insightMessage}</span>
      </p>

      {/* ===================================================================== */}
      {/* 2B. ANALISIS KESEHATAN FINANSIAL & RASIO VITAL                        */}
      {/* ===================================================================== */}
      {(() => {
        const sTone: Tone = metrics.savingsRate >= 20 ? 'ok' : metrics.savingsRate >= 10 ? 'mid' : 'low';
        const rTone: Tone = financialHealth.runwayMonthsVal >= 6 ? 'ok' : financialHealth.runwayMonthsVal >= 3 ? 'mid' : 'low';
        const dTone: Tone = financialHealth.dtiRatio <= 20 ? 'ok' : financialHealth.dtiRatio <= 30 ? 'mid' : 'low';
        const hTone: Tone = financialHealth.totalHealthScore >= 75 ? 'ok' : financialHealth.totalHealthScore >= 45 ? 'mid' : 'low';
        return (
          <section className="ax-panel ax-sec">
            <div className="ax-secthead">
              <div>
                <h3><ShieldCheck className="w-5 h-5" style={{ color: 'var(--accent-sage)' }} />Kesehatan Finansial</h3>
                <p className="ax-sec-sub">Rasio tabungan, kesiapan dana darurat, dan beban utang</p>
              </div>
              <span className="ax-tone big" data-tone={hTone}>{financialHealth.totalHealthScore} / 100 · {financialHealth.healthGrade}</span>
            </div>

            <div className="ax-rgrid c3">
              <div className="ax-meter" style={{ '--c': TONE_COLOR[sTone] } as React.CSSProperties}>
                <div className="ax-meter-h"><span><TrendingUp className="w-4 h-4" />Rasio Tabungan</span></div>
                <div className="ax-meter-v" data-tone={sTone}>{metrics.savingsRate}%</div>
                <div className="ax-prog"><i style={{ width: `${Math.min(100, Math.max(0, metrics.savingsRate))}%` }} /></div>
                <div className="ax-meter-f">
                  <span>Target min. 20% penghasilan</span>
                  <span className="ax-tone" data-tone={sTone}>{sTone === 'ok' ? 'Sangat baik' : sTone === 'mid' ? 'Cukup' : 'Perlu ditingkatkan'}</span>
                </div>
              </div>

              <div className="ax-meter" style={{ '--c': TONE_COLOR[rTone] } as React.CSSProperties}>
                <div className="ax-meter-h"><span><Hourglass className="w-4 h-4" />Dana Darurat (Runway)</span></div>
                <div className="ax-meter-v" data-tone={rTone}>{metrics.financialRunwayMonths} <small>bulan</small></div>
                <div className="ax-prog"><i style={{ width: `${Math.min(100, (financialHealth.runwayMonthsVal / 6) * 100)}%` }} /></div>
                <div className="ax-meter-f">
                  <span>Target 3 - 6 bulan pengeluaran</span>
                  <span className="ax-tone" data-tone={rTone}>{rTone === 'ok' ? 'Aman prima' : rTone === 'mid' ? 'Cukup aman' : 'Waspada minim'}</span>
                </div>
              </div>

              <div className="ax-meter" style={{ '--c': TONE_COLOR[dTone] } as React.CSSProperties}>
                <div className="ax-meter-h"><span><AlertTriangle className="w-4 h-4" />Beban Cicilan / Utang (DTI)</span></div>
                <div className="ax-meter-v" data-tone={dTone}>{financialHealth.dtiRatio}%</div>
                <div className="ax-prog"><i style={{ width: `${Math.min(100, financialHealth.dtiRatio)}%` }} /></div>
                <div className="ax-meter-f">
                  <span>Batas maksimal 30% penghasilan</span>
                  <span className="ax-tone" data-tone={dTone}>
                    {financialHealth.dtiRatio === 0 ? 'Bebas utang' : dTone === 'ok' ? 'Sangat aman' : dTone === 'mid' ? 'Waspada' : 'Berisiko'}
                  </span>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ===================================================================== */}
      {/* 3. GRAFIK: TREN ARUS KAS & KOMPOSISI PENGELUARAN                      */}
      {/* ===================================================================== */}
      <section className="ax-rgrid c2">
        {/* GRAFIK 1 (BAR): TREN PEMASUKAN VS PENGELUARAN */}
        <div className="ax-panel ax-sec">
          <div className="ax-secthead">
            <div>
              <h3><BarChart3 className="w-5 h-5" style={{ color: 'var(--accent-sand)' }} />Tren Arus Kas</h3>
              <p className="ax-sec-sub">{timeRange === 'this_year' || timeRange === 'all_time' ? 'Distribusi per bulan' : 'Pergerakan per hari'}</p>
            </div>
            <div className="ax-leg">
              <span><i style={{ background: 'var(--accent-sage)' }} />Masuk</span>
              <span><i style={{ background: 'var(--accent-terracotta)' }} />Keluar</span>
            </div>
          </div>

          <div className="ax-rchart">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={11} tickLine={false} fontFamily="var(--font-mono)" />
                  <YAxis
                    stroke="var(--text-secondary)"
                    fontSize={10}
                    tickLine={false}
                    fontFamily="var(--font-mono)"
                    tickFormatter={(val) => {
                      if (val >= 1000000) return `${(val / 1000000).toFixed(0)}jt`;
                      if (val >= 1000) return `${(val / 1000).toFixed(0)}rb`;
                      return String(val);
                    }}
                  />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'var(--bg-muted)', opacity: 0.5 }} />
                  <Bar dataKey="income" name="Pemasukan" fill="var(--accent-sage)" stroke="var(--border-color)" strokeWidth={1.5} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Pengeluaran" fill="var(--accent-terracotta)" stroke="var(--border-color)" strokeWidth={1.5} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="ax-emptyh" style={{ height: '100%', display: 'grid', placeContent: 'center' }}>
                <p>Belum ada data</p>
                <small>Belum ada transaksi untuk divisualisasikan.</small>
              </div>
            )}
          </div>

          <p className="ax-sec-sub">{trendData.length} titik waktu tercatat</p>
        </div>

        {/* GRAFIK 2 (DOUGHNUT): KOMPOSISI PENGELUARAN PER KATEGORI */}
        <div className="ax-panel ax-sec">
          <div className="ax-secthead">
            <div>
              <h3><PieIcon className="w-5 h-5" style={{ color: 'var(--accent-terracotta)' }} />Komposisi Pengeluaran</h3>
              <p className="ax-sec-sub">Berdasarkan pos dan kategori belanja</p>
            </div>
            <span className="ax-tone big" data-tone="info">{categoryBreakdown.length} kategori</span>
          </div>

          {/* Kewajiban rutin vs gaya hidup */}
          <div className="ax-split">
            <div className="ax-split-h">
              <span><ShieldCheck className="w-3.5 h-3.5" />Kewajiban rutin vs gaya hidup</span>
              <b>{metrics.fixedExpensePercent}% : {metrics.variableExpensePercent}%</b>
            </div>
            <div className="ax-split-bar">
              <i style={{ width: `${metrics.fixedExpensePercent || 0}%`, background: 'var(--accent-blue)' }}
                title={`Kewajiban Rutin: ${formatRupiah(metrics.fixedExpenseTotal || 0)} (${metrics.fixedExpensePercent}%)`} />
              <i style={{ width: `${metrics.variableExpensePercent || 0}%`, background: 'var(--accent-lavender)' }}
                title={`Gaya Hidup / Fleksibel: ${formatRupiah(metrics.variableExpenseTotal || 0)} (${metrics.variableExpensePercent}%)`} />
            </div>
            <div className="ax-split-f">
              <span><i style={{ background: 'var(--accent-blue)' }} />Kewajiban (tagihan, utang, alokasi) <b>{formatRupiah(metrics.fixedExpenseTotal || 0)}</b></span>
              <span><i style={{ background: 'var(--accent-lavender)' }} />Gaya hidup / fleksibel <b>{formatRupiah(metrics.variableExpenseTotal || 0)}</b></span>
            </div>
          </div>

          <div className="ax-rpie">
            <div className="ax-rpie-c">
              {categoryBreakdown.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<CustomPieTooltip />} />
                      <Pie data={categoryBreakdown} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="var(--border-color)" strokeWidth={2.5}>
                        {categoryBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} cursor="pointer" />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="ax-rpie-t">
                    <small>Total keluar</small>
                    <b>{formatRupiah(metrics.totalExpense)}</b>
                  </div>
                </>
              ) : (
                <div className="ax-emptyh" style={{ width: '100%', height: '100%', display: 'grid', placeContent: 'center' }}>
                  <p>Belum ada pengeluaran</p>
                  <small>Tidak ada transaksi pengeluaran.</small>
                </div>
              )}
            </div>

            <div className="ax-rlist">
              {categoryBreakdown.length > 0 ? (
                categoryBreakdown.slice(0, 6).map((cat, idx) => (
                  <div key={idx} className="ax-catline">
                    <span className="sw" style={{ background: cat.color }} />
                    <b title={cat.category}>{cat.category}</b>
                    <span className="v">{formatRupiah(cat.amount)}<small>{cat.percentage}%</small></span>
                  </div>
                ))
              ) : (
                <p className="ax-empty">Kosong</p>
              )}
            </div>
          </div>

          <p className="ax-sec-sub">
            Kategori terbesar: <b>{categoryBreakdown[0]?.category || '-'}</b>{categoryBreakdown[0] ? ` · ${categoryBreakdown[0].percentage}% pos` : ''}
          </p>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3B. ALOKASI DANA 50 / 30 / 20                                         */}
      {/* ===================================================================== */}
      <section className="ax-panel ax-sec">
        <div className="ax-secthead">
          <div>
            <h3><Sparkles className="w-5 h-5" style={{ color: 'var(--accent-sand)' }} />Alokasi Dana 50 / 30 / 20</h3>
            <p className="ax-sec-sub">Proporsi pengeluaran terhadap standar kesehatan finansial</p>
          </div>
          <span className="ax-tone big" data-tone="mid">Aturan emas budgeting</span>
        </div>

        <div className="ax-rgrid c3">
          <div className="ax-meter" style={{ '--c': 'var(--accent-blue)' } as React.CSSProperties}>
            <div className="ax-meter-h">
              <span><i className="dot" />Kebutuhan Pokok</span>
              <span className="ax-tone" data-tone={allocation503020.needsPct > 55 ? 'low' : 'ok'}>{allocation503020.needsPct}% / 50%</span>
            </div>
            <div className="ax-meter-v">{formatRupiah(allocation503020.needs)}</div>
            <div className="ax-prog"><i style={{ width: `${Math.min(100, allocation503020.needsPct)}%` }} /></div>
            <p className="ax-sec-sub">Tagihan, makanan pokok, transport dan cicilan utang</p>
          </div>

          <div className="ax-meter" style={{ '--c': 'var(--accent-terracotta)' } as React.CSSProperties}>
            <div className="ax-meter-h">
              <span><i className="dot" />Gaya Hidup</span>
              <span className="ax-tone" data-tone={allocation503020.wantsPct > 35 ? 'low' : 'ok'}>{allocation503020.wantsPct}% / 30%</span>
            </div>
            <div className="ax-meter-v">{formatRupiah(allocation503020.wants)}</div>
            <div className="ax-prog"><i style={{ width: `${Math.min(100, allocation503020.wantsPct)}%` }} /></div>
            <p className="ax-sec-sub">Hiburan, makan luar, hobi, belanja fleksibel</p>
          </div>

          <div className="ax-meter" style={{ '--c': 'var(--accent-sage)' } as React.CSSProperties}>
            <div className="ax-meter-h">
              <span><i className="dot" />Tabungan & Investasi</span>
              <span className="ax-tone" data-tone="ok">{allocation503020.savingsPct}% / 20%</span>
            </div>
            <div className="ax-meter-v" data-tone="ok">{formatRupiah(allocation503020.savings)}</div>
            <div className="ax-prog"><i style={{ width: `${Math.min(100, allocation503020.savingsPct)}%` }} /></div>
            <p className="ax-sec-sub">Sinking funds, portofolio dan dana darurat</p>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3C. EXPENSE SOURCES / STATUS BUDGET PER KATEGORI                      */}
      {/* ===================================================================== */}
      <section className="ax-sec">
        <div className="ax-secthead">
          <div>
            <h3>Expense Sources</h3>
            <p className="ax-sec-sub">Kepatuhan alokasi dana per kategori bulan ini</p>
          </div>
          <div className="ax-chipset" role="radiogroup" aria-label="Tampilan expense sources">
            <button type="button" role="radio" aria-checked={expenseSourcesTab === 'overview'} onClick={() => setExpenseSourcesTab('overview')}>
              <TrendingDown className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Overview
            </button>
            <button type="button" role="radio" aria-checked={expenseSourcesTab === 'detail'} onClick={() => setExpenseSourcesTab('detail')}>
              <ListFilter className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Detail
            </button>
          </div>
        </div>

        {expenseSourcesData.length === 0 ? (
          <div className="ax-emptyh">
            <p>Belum ada data</p>
            <small>Belum ada kategori pengeluaran atau alokasi budget yang terdaftar.</small>
          </div>
        ) : (
          <div className="ax-esgrid">
            {expenseSourcesData.map((item) => {
              const isExceeded = item.status === 'BUDGET_EXCEEDED';
              const isLimit = item.status === 'LIMIT_REACHED';
              const isOnBudget = item.status === 'ON_BUDGET';
              const tone: Tone | 'flex' = item.status === 'FLEXIBLE' ? 'flex' : isExceeded ? 'low' : isLimit ? 'mid' : 'ok';
              return (
                <div key={item.category} className="ax-es" data-tone={tone}>
                  <div className="ax-es-h">
                    <span className="ax-ic">{renderCategoryIcon(item.category)}</span>
                    <div>
                      <h4 title={item.category}>{item.category}</h4>
                      <small><Leaf className="w-3 h-3 inline -mt-0.5 mr-0.5" />{activeLedger?.name || 'Personal'}</small>
                    </div>
                  </div>

                  <div className="ax-es-kv">
                    <div><small>Budget bulanan</small><b>{item.budget > 0 ? formatRupiah(item.budget) : 'Fleksibel'}</b></div>
                    <div><small>Terpakai</small><b>{formatRupiah(item.spent)}</b></div>
                  </div>

                  {expenseSourcesTab === 'detail' && item.budget > 0 && (
                    <div>
                      <div className="ax-prog"><i style={{ width: `${Math.min(100, item.pct)}%` }} /></div>
                      <small className="ax-es-n">{item.count} transaksi tercatat</small>
                    </div>
                  )}

                  <div className="ax-es-f">
                    <span className="ax-tone" data-tone={tone === 'flex' ? 'info' : tone}>
                      {isOnBudget ? `Sisa ${formatRupiah(item.remaining)}` : isLimit ? 'Batas tercapai' : isExceeded ? 'Melebihi budget' : 'Tanpa batas'}
                    </span>
                    <b>{item.budget > 0 ? `${item.pct}%` : '0%'}</b>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* 4. RINCIAN KATEGORI & TOP 5 PENGELUARAN TERBESAR                      */}
      {/* ===================================================================== */}
      <section className="ax-rgrid c21">
        {/* RINCIAN SEMUA KATEGORI PENGELUARAN */}
        <div className="ax-panel ax-sec">
          <div className="ax-secthead">
            <div>
              <h3><Layers className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />Rincian Pengeluaran per Pos</h3>
              <p className="ax-sec-sub">Diurutkan dari nominal tertinggi</p>
            </div>
            <span className="ax-tone big" data-tone="info">{categoryBreakdown.length} pos</span>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="ax-emptyh">
              <p>Belum ada pos pengeluaran</p>
              <small>Tidak ada pengeluaran dalam rentang tanggal terpilih.</small>
            </div>
          ) : (
            <div className="ax-rlist">
              {categoryBreakdown.map((item, idx) => (
                <div key={idx} className="ax-catrow" style={{ '--c': item.color } as React.CSSProperties}>
                  <div className="ax-catrow-t">
                    <span className="sw" />
                    <b>{item.category}</b>
                    <small>{item.count} transaksi</small>
                    <span className="v">{formatRupiah(item.amount)}<em>{item.percentage}%</em></span>
                  </div>
                  <div className="ax-prog"><i style={{ width: `${Math.min(100, item.percentage)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TOP 5 PENGELUARAN TUNGGAL TERBESAR */}
        <div className="ax-panel ax-sec">
          <div className="ax-secthead">
            <div>
              <h3><AlertTriangle className="w-5 h-5" style={{ color: 'var(--accent-terracotta)' }} />Top 5 Terbesar</h3>
              <p className="ax-sec-sub">Pengeluaran tunggal terbesar periode ini</p>
            </div>
          </div>

          {topExpenses.length === 0 ? (
            <div className="ax-emptyh">
              <p>Belum ada pengeluaran</p>
              <small>Tidak ada pengeluaran tercatat.</small>
            </div>
          ) : (
            <div className="ax-rlist">
              {topExpenses.map((tx, idx) => {
                const acc = accounts.find(a => a.id === tx.accountId);
                return (
                  <div key={tx.id} className="ax-top">
                    <span className="rk">{idx + 1}</span>
                    <div>
                      <b title={tx.note || tx.category}>{tx.note || tx.category || 'Pengeluaran'}</b>
                      <small>{tx.date} · {tx.category} · {acc?.name || 'Kas'}</small>
                    </div>
                    <span className="v">-{formatRupiah(tx.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {onNavigateToTab && (
            <button type="button" onClick={() => onNavigateToTab('module1')} className="brutal-btn brutal-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
              Lihat semua transaksi<ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </section>


    </div>
  );
};