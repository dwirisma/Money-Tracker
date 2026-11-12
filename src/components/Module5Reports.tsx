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
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Download, 
  CheckCircle2, 
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
  Sliders,
  ListFilter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Transaction, Ledger, Account, ReportTimeRange, CategoryExpenseSummary, CashFlowTrendPoint, ReportMetrics } from '../types';
import { getCategoryBudgets, type CategoryBudgetMap } from '../services/budgetService';

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
          <p className="font-heading font-bold text-white text-sm border-b border-[var(--border-subtle)] pb-1">
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
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-[var(--border-subtle)] font-bold text-white">
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
          <p className="font-heading font-bold text-white flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 border border-black inline-block" style={{ backgroundColor: data.color }} />
            {data.category}
          </p>
          <p className="text-[var(--accent-terracotta-light)] font-bold text-sm">
            {formatRupiah(data.amount)}
          </p>
          <div className="flex items-center justify-between gap-2.5 text-[var(--text-secondary)] text-[11px] pt-1 border-t border-[var(--border-subtle)]">
            <span>Porsi Pengeluaran:</span>
            <span className="font-bold text-white">{data.percentage}%</span>
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

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      
      {/* ===================================================================== */}
      {/* 1. FILTER WAKTU & HEADER LAPORAN (NEO-BRUTALISME)                      */}
      {/* ===================================================================== */}
      <section className="brutal-card p-3 sm:p-3 bg-[var(--bg-surface)] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--accent-sand)]" />
            <h2 className="font-heading font-bold text-lg sm:text-xl text-white">
              Laporan & Analitik Keuangan
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-mono flex items-center gap-1.5">
            <span>Buku Kas: <strong>{activeLedger?.name || 'Utama'}</strong></span>
            <span>•</span>
            <span className="text-[var(--accent-sand-light)]">{dateBounds.label}</span>
          </p>
        </div>

        {/* Grup Tombol Filter Waktu */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setTimeRange('this_month')}
            className={`px-3 py-1.5 text-xs font-heading font-bold rounded-[var(--radius-sm)] border-2 transition-all ${
              timeRange === 'this_month'
                ? 'bg-[var(--accent-sand)] text-[var(--text-inverted)] border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-color)]'
            }`}
          >
            Bulan Ini
          </button>

          <button
            type="button"
            onClick={() => setTimeRange('last_month')}
            className={`px-3 py-1.5 text-xs font-heading font-bold rounded-[var(--radius-sm)] border-2 transition-all ${
              timeRange === 'last_month'
                ? 'bg-[var(--accent-sand)] text-[var(--text-inverted)] border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-color)]'
            }`}
          >
            Bulan Lalu
          </button>

          <button
            type="button"
            onClick={() => setTimeRange('this_year')}
            className={`px-3 py-1.5 text-xs font-heading font-bold rounded-[var(--radius-sm)] border-2 transition-all ${
              timeRange === 'this_year'
                ? 'bg-[var(--accent-sand)] text-[var(--text-inverted)] border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-color)]'
            }`}
          >
            Tahun Ini
          </button>

          <button
            type="button"
            onClick={() => setTimeRange('all_time')}
            className={`px-3 py-1.5 text-xs font-heading font-bold rounded-[var(--radius-sm)] border-2 transition-all ${
              timeRange === 'all_time'
                ? 'bg-[var(--accent-sand)] text-[var(--text-inverted)] border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-color)]'
            }`}
          >
            Semua Waktu
          </button>

          <button
            type="button"
            onClick={() => setTimeRange('custom')}
            className={`px-3 py-1.5 text-xs font-heading font-bold rounded-[var(--radius-sm)] border-2 transition-all flex items-center gap-1 ${
              timeRange === 'custom'
                ? 'bg-[var(--accent-blue)] text-[var(--text-inverted)] border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-color)]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Kustom</span>
          </button>

          {/* Tombol Ekspor Excel */}
          <button
            type="button"
            onClick={handleExportData}
            disabled={filteredTransactions.length === 0}
            className="px-3 py-1.5 text-xs font-heading font-bold rounded-[var(--radius-sm)] border-2 bg-[var(--bg-elevated)] border-[var(--border-subtle)] hover:border-[var(--accent-sage)] text-[var(--text-secondary)] hover:text-[var(--accent-sage)] transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Ekspor data transaksi terfilter ke Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ekspor Excel</span>
          </button>
        </div>
      </section>

      {/* Input Tanggal Kustom (Jika Filter Kustom Aktif) */}
      {timeRange === 'custom' && (
        <div className="brutal-card p-3 bg-[var(--bg-elevated)] flex flex-wrap items-center gap-2.5 text-xs animate-in fade-in duration-150">
          <span className="font-heading font-bold text-white flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[var(--accent-blue)]" />
            Pilih Rentang Tanggal:
          </span>
          <div className="flex items-center gap-2">
            <label className="text-[var(--text-secondary)]">Dari:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="brutal-input py-1 px-2 text-xs w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[var(--text-secondary)]">Sampai:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="brutal-input py-1 px-2 text-xs w-auto"
            />
          </div>
          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            ({filteredTransactions.length} transaksi dalam rentang)
          </span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. KARTU RINGKASAN METRIK (SCORECARDS NEO-BRUTALISME)                  */}
      {/* ===================================================================== */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* KARTU 1: TOTAL PEMASUKAN (HIJAU SAGE KALEM DENGAN MoM) */}
        <div className="brutal-card p-3.5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-sage)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[var(--accent-sage)]" />
              Total Pemasukan
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border border-[var(--accent-sage)]">
              Masuk
            </span>
          </div>

          <div className="flex items-baseline gap-2.5 flex-wrap">
            <div className="text-xl sm:text-2xl font-heading font-extrabold text-[var(--accent-sage)] font-mono">
              {formatRupiah(metrics.totalIncome)}
            </div>
            {/* 1. Indikator Komparasi MoM Pemasukan */}
            {metrics.momIncomePercent !== null && metrics.momIncomePercent !== undefined && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded flex items-center gap-1 border shadow-[1px_1px_0px_#000] ${
                  metrics.momIncomePercent >= 0
                    ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border-[var(--accent-sage)]'
                    : 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border-[var(--accent-terracotta)]'
                }`}
                title={`Pemasukan periode lalu: ${formatRupiah(metrics.prevIncome || 0)}`}
              >
                <span>{metrics.momIncomePercent >= 0 ? '▲' : '▼'}</span>
                <span>{metrics.momIncomePercent >= 0 ? `+${metrics.momIncomePercent}%` : `${metrics.momIncomePercent}%`}</span>
                <span className="text-[9px] opacity-75">{timeRange === 'this_year' ? 'YoY' : 'MoM'}</span>
              </span>
            )}
          </div>

          <p className="text-[11px] text-[var(--text-muted)] font-mono">
            {metrics.prevIncome !== undefined && metrics.prevIncome > 0 ? (
              <>Bulan lalu: <strong>{formatRupiah(metrics.prevIncome)}</strong></>
            ) : (
              'Dari pos gaji, freelance, dan pendapatan lain'
            )}
          </p>
        </div>

        {/* KARTU 2: TOTAL PENGELUARAN (MERAH BATA TERRACOTTA DENGAN MoM) */}
        <div className="brutal-card p-3.5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-terracotta)] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-[var(--accent-terracotta)]" />
              Total Pengeluaran
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border border-[var(--accent-terracotta)]">
              Keluar
            </span>
          </div>

          <div className="flex items-baseline gap-2.5 flex-wrap">
            <div className="text-xl sm:text-2xl font-heading font-extrabold text-[var(--accent-terracotta-light)] font-mono">
              {formatRupiah(metrics.totalExpense)}
            </div>
            {/* 1. Indikator Komparasi MoM Pengeluaran (Turun = Bagus/Hijau, Naik = Merah) */}
            {metrics.momExpensePercent !== null && metrics.momExpensePercent !== undefined && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded flex items-center gap-1 border shadow-[1px_1px_0px_#000] ${
                  metrics.momExpensePercent <= 0
                    ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border-[var(--accent-sage)]'
                    : 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border-[var(--accent-terracotta)]'
                }`}
                title={`Pengeluaran periode lalu: ${formatRupiah(metrics.prevExpense || 0)}`}
              >
                <span>{metrics.momExpensePercent > 0 ? '▲' : '▼'}</span>
                <span>{metrics.momExpensePercent > 0 ? `+${metrics.momExpensePercent}%` : `${metrics.momExpensePercent}%`}</span>
                <span className="text-[9px] opacity-75">{timeRange === 'this_year' ? 'YoY' : 'MoM'}</span>
              </span>
            )}
          </div>

          <p className="text-[11px] text-[var(--text-muted)] font-mono">
            Rata-rata: <strong>{formatRupiah(metrics.avgDailyExpense)}</strong> / hari
            {metrics.prevExpense !== undefined && metrics.prevExpense > 0 && (
              <> • Bulan lalu: <strong>{formatRupiah(metrics.prevExpense)}</strong></>
            )}
          </p>
        </div>

        {/* KARTU 3: ARUS KAS / NET CASH FLOW (SURPLUS/DEFISIT & FINANCIAL RUNWAY) */}
        <div className={`brutal-card p-3.5 bg-[var(--bg-surface)] border-l-8 space-y-2 ${
          metrics.netCashFlow >= 0 ? 'border-l-[var(--accent-sage)]' : 'border-l-[var(--accent-terracotta)]'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-[var(--accent-sand)]" />
              Arus Kas Bersih (Net)
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
              metrics.netCashFlow >= 0
                ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border-[var(--accent-sage)]'
                : 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border-[var(--accent-terracotta)]'
            }`}>
              {metrics.netCashFlow >= 0 ? 'Surplus ✓' : 'Defisit ⚠'}
            </span>
          </div>

          <div className={`text-xl sm:text-2xl font-heading font-extrabold font-mono ${
            metrics.netCashFlow >= 0 ? 'text-[var(--accent-sage)]' : 'text-[var(--accent-terracotta)]'
          }`}>
            {metrics.netCashFlow >= 0 
              ? `+${formatRupiah(metrics.netCashFlow)}` 
              : `-${formatRupiah(Math.abs(metrics.netCashFlow))}`}
          </div>

          {/* Rasio Simpanan & 3. Metrik Financial Runway (Napas Kas) */}
          <div className="space-y-1 pt-1.5 border-t border-[var(--border-subtle)] text-[11px] font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Rasio Simpanan:</span>
              <span className="font-bold text-[var(--accent-sand-light)]">
                {metrics.savingsRate}% dari pemasukan
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)] flex items-center gap-1">
                <Hourglass className="w-3 h-3 text-[var(--accent-blue)]" />
                Estimasi Runway:
              </span>
              <span className={`font-bold flex items-center gap-1.5 ${
                metrics.financialRunwayMonths === '∞' || Number(metrics.financialRunwayMonths) >= 6
                  ? 'text-[var(--accent-sage)]'
                  : Number(metrics.financialRunwayMonths) >= 3
                  ? 'text-[var(--accent-sand-light)]'
                  : 'text-[var(--accent-terracotta-light)]'
              }`}
              title={`Saldo Kas Aktif: ${formatRupiah(metrics.totalCashBalance || 0)} | Pengeluaran Rata-rata 3 Bln: ${formatRupiah(metrics.avgMonthlyExpense3M || 0)}/bln`}
              >
                <span>{metrics.financialRunwayMonths} Bulan</span>
                {metrics.financialRunwayMonths !== '∞' && (
                  <span className={`text-[9px] px-1 py-0.2 rounded font-normal border ${
                    Number(metrics.financialRunwayMonths) >= 6
                      ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border-[var(--accent-sage)]/50'
                      : Number(metrics.financialRunwayMonths) >= 3
                      ? 'bg-[var(--accent-sand-dark)] text-[var(--accent-sand-light)] border-[var(--accent-sand)]/50'
                      : 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border-[var(--accent-terracotta)]/50'
                  }`}>
                    {Number(metrics.financialRunwayMonths) >= 6 ? 'Napas Aman' : Number(metrics.financialRunwayMonths) >= 3 ? 'Cukup' : 'Waspada'}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

      </section>

      {/* HIGHLIGHT INSIGHT CERDAS */}
      <div className="brutal-card p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] flex items-start gap-2.5">
        <Sparkles className="w-5 h-5 text-[var(--accent-sand)] shrink-0 mt-0.5" />
        <div className="text-xs space-y-0.5">
          <span className="font-heading font-bold text-white uppercase tracking-wider text-[11px]">
            Insight Finansial Periode Ini:
          </span>
          <p className="text-[var(--text-secondary)] leading-relaxed font-body">
            {insightMessage}
          </p>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2B. INDIKATOR ANALISIS KESEHATAN FINANSIAL & RASIO VITAL             */}
      {/* ===================================================================== */}
      <section className="brutal-card p-3.5 bg-[var(--bg-surface)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--accent-sage)]" />
            <div>
              <h3 className="font-heading font-bold text-sm text-white">
                Analisis Kesehatan Finansial & Rasio Vital
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-mono">
                Evaluasi komprehensif rasio tabungan, kesiapan dana darurat, dan beban utang
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-mono text-[var(--text-muted)]">Skor Kesehatan:</span>
            <span className={`px-2.5 py-1 text-xs font-heading font-extrabold rounded-[var(--radius-sm)] border-2 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 ${financialHealth.healthBadgeBg}`}>
              <span>{financialHealth.totalHealthScore} / 100</span>
              <span>•</span>
              <span>{financialHealth.healthGrade}</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 1. Rasio Tabungan */}
          <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-heading font-bold text-white flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[var(--accent-sage)]" />
                Rasio Tabungan (Savings Rate)
              </span>
              <span className={`font-mono font-bold text-xs ${metrics.savingsRate >= 20 ? 'text-[var(--accent-sage-light)]' : metrics.savingsRate >= 10 ? 'text-[var(--accent-sand-light)]' : 'text-[var(--accent-terracotta-light)]'}`}>
                {metrics.savingsRate}%
              </span>
            </div>
            <div className="h-2 w-full bg-[var(--bg-muted)] border border-black rounded-[2px] overflow-hidden">
              <div 
                className="h-full bg-[var(--accent-sage)] transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, metrics.savingsRate))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
              <span>Target: Min. 20% Penghasilan</span>
              <span className={metrics.savingsRate >= 20 ? 'text-emerald-400 font-bold' : metrics.savingsRate >= 10 ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold'}>
                {metrics.savingsRate >= 20 ? 'Sangat Baik' : metrics.savingsRate >= 10 ? 'Cukup' : 'Perlu Ditingkatkan'}
              </span>
            </div>
          </div>

          {/* 2. Kesiapan Dana Darurat */}
          <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-heading font-bold text-white flex items-center gap-1.5">
                <Hourglass className="w-4 h-4 text-[var(--accent-blue)]" />
                Kesiapan Dana Darurat (Runway)
              </span>
              <span className={`font-mono font-bold text-xs ${financialHealth.runwayMonthsVal >= 6 ? 'text-[var(--accent-sage-light)]' : financialHealth.runwayMonthsVal >= 3 ? 'text-[var(--accent-sand-light)]' : 'text-[var(--accent-terracotta-light)]'}`}>
                {metrics.financialRunwayMonths} Bulan
              </span>
            </div>
            <div className="h-2 w-full bg-[var(--bg-muted)] border border-black rounded-[2px] overflow-hidden">
              <div 
                className="h-full bg-[var(--accent-blue)] transition-all duration-300"
                style={{ width: `${Math.min(100, (financialHealth.runwayMonthsVal / 6) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
              <span>Target: 3 - 6 Bulan Pengeluaran</span>
              <span className={financialHealth.runwayMonthsVal >= 3 ? 'text-blue-400 font-bold' : 'text-rose-400 font-bold'}>
                {financialHealth.runwayMonthsVal >= 6 ? 'Aman Prima' : financialHealth.runwayMonthsVal >= 3 ? 'Cukup Aman' : 'Waspada Minim'}
              </span>
            </div>
          </div>

          {/* 3. Beban Cicilan & Utang (DTI) */}
          <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-heading font-bold text-white flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[var(--accent-terracotta)]" />
                Beban Cicilan / Utang (DTI)
              </span>
              <span className={`font-mono font-bold text-xs ${financialHealth.dtiRatio <= 20 ? 'text-[var(--accent-sage-light)]' : financialHealth.dtiRatio <= 30 ? 'text-[var(--accent-sand-light)]' : 'text-[var(--accent-terracotta-light)]'}`}>
                {financialHealth.dtiRatio}%
              </span>
            </div>
            <div className="h-2 w-full bg-[var(--bg-muted)] border border-black rounded-[2px] overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${financialHealth.dtiRatio > 30 ? 'bg-[var(--accent-terracotta)]' : 'bg-[var(--accent-sand)]'}`}
                style={{ width: `${Math.min(100, financialHealth.dtiRatio)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
              <span>Batas Maksimal: 30% Penghasilan</span>
              <span className={financialHealth.dtiRatio <= 30 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {financialHealth.dtiRatio === 0 ? 'Bebas Utang' : financialHealth.dtiRatio <= 20 ? 'Sangat Aman' : financialHealth.dtiRatio <= 30 ? 'Waspada' : 'Berisiko'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. VISUALISASI GRAFIK: BAR CHART & DOUGHNUT PIE CHART                  */}
      {/* ===================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GRAFIK 1 (BAR CHART): TREN PEMASUKAN VS PENGELUARAN */}
        <div className="brutal-card p-3.5 bg-[var(--bg-surface)] flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
            <div>
              <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--accent-sand)]" />
                Tren Arus Kas (Pemasukan vs Pengeluaran)
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                {timeRange === 'this_year' || timeRange === 'all_time' ? 'Distribusi per bulan' : 'Pergerakan per hari'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-[var(--accent-sage)]">
                <span className="w-2.5 h-2.5 bg-[var(--accent-sage)] inline-block border border-black rounded-[2px]" />
                Masuk
              </span>
              <span className="flex items-center gap-1 text-[var(--accent-terracotta)]">
                <span className="w-2.5 h-2.5 bg-[var(--accent-terracotta)] inline-block border border-black rounded-[2px]" />
                Keluar
              </span>
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full pt-2">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trendData}
                  margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                >
                  <CartesianGrid 
                    strokeDasharray="3 3" 
                    stroke="rgba(240, 240, 245, 0.08)" 
                    vertical={false} 
                  />
                  <XAxis 
                    dataKey="label" 
                    stroke="var(--text-muted)" 
                    fontSize={11}
                    tickLine={false}
                    fontFamily="var(--font-mono)"
                  />
                  <YAxis 
                    stroke="var(--text-muted)" 
                    fontSize={10}
                    tickLine={false}
                    fontFamily="var(--font-mono)"
                    tickFormatter={(val) => {
                      if (val >= 1000000) return `${(val / 1000000).toFixed(0)}jt`;
                      if (val >= 1000) return `${(val / 1000).toFixed(0)}rb`;
                      return String(val);
                    }}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar 
                    dataKey="income" 
                    name="Pemasukan" 
                    fill="var(--accent-sage)" 
                    stroke="#121316"
                    strokeWidth={1.5}
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar 
                    dataKey="expense" 
                    name="Pengeluaran" 
                    fill="var(--accent-terracotta)" 
                    stroke="#121316"
                    strokeWidth={1.5}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                <BarChart3 className="w-10 h-10 text-[var(--text-muted)] mb-2" />
                <p className="text-xs text-[var(--text-secondary)] font-mono">
                  Belum ada data transaksi untuk divisualisasikan.
                </p>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-muted)] flex items-center justify-between">
            <span>Total Catatan: {trendData.length} Titik Waktu</span>
            <span className="text-[var(--accent-sand-light)]">Grafik Interaktif Neo-Brutalisme</span>
          </div>
        </div>

        {/* GRAFIK 2 (DOUGHNUT / PIE CHART): KOMPOSISI PENGELUARAN PER KATEGORI */}
        <div className="brutal-card p-3.5 bg-[var(--bg-surface)] flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
            <div>
              <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-[var(--accent-terracotta)]" />
                Komposisi Pengeluaran
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                Berdasarkan pos dan kategori belanja
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[var(--accent-terracotta-light)]">
              {categoryBreakdown.length} Kategori
            </span>
          </div>

          {/* 2. Klasifikasi Pengeluaran: Kewajiban Rutin vs Gaya Hidup */}
          <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-heading font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                <span>Kewajiban Rutin vs Gaya Hidup</span>
              </span>
              <span className="text-[10px] font-bold text-[var(--accent-sand-light)]">
                {metrics.fixedExpensePercent}% : {metrics.variableExpensePercent}%
              </span>
            </div>

            {/* Split Progress Bar Neo-Brutalism */}
            <div className="h-2 w-full bg-[var(--bg-muted)] border border-black rounded-[2px] overflow-hidden flex">
              <div 
                className="h-full bg-[var(--accent-blue)] transition-all duration-300"
                style={{ width: `${metrics.fixedExpensePercent || 0}%` }}
                title={`Kewajiban Rutin: ${formatRupiah(metrics.fixedExpenseTotal || 0)} (${metrics.fixedExpensePercent}%)`}
              />
              <div 
                className="h-full bg-[var(--accent-lavender)] transition-all duration-300"
                style={{ width: `${metrics.variableExpensePercent || 0}%` }}
                title={`Gaya Hidup / Fleksibel: ${formatRupiah(metrics.variableExpenseTotal || 0)} (${metrics.variableExpensePercent}%)`}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-[var(--accent-blue)] inline-block border border-black rounded-[1px]" />
                <span className="text-[var(--text-secondary)]">Kewajiban (Tagihan/Utang/Alokasi):</span>
                <span className="font-bold text-white">{formatRupiah(metrics.fixedExpenseTotal || 0)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-[var(--accent-lavender)] inline-block border border-black rounded-[1px]" />
                <span className="text-[var(--text-secondary)]">Gaya Hidup / Fleksibel:</span>
                <span className="font-bold text-white">{formatRupiah(metrics.variableExpenseTotal || 0)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            {/* Pie Container */}
            <div className="h-60 sm:h-64 w-full relative flex items-center justify-center">
              {categoryBreakdown.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<CustomPieTooltip />} />
                      <Pie
                        data={categoryBreakdown}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={3}
                        stroke="#181b20"
                        strokeWidth={2.5}
                      >
                        {categoryBreakdown.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color} 
                            cursor="pointer"
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Total Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-mono font-bold">
                      Total Keluar
                    </span>
                    <span className="text-xs font-bold font-mono text-white">
                      {formatRupiah(metrics.totalExpense)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center text-center p-3 border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                  <PieIcon className="w-10 h-10 text-[var(--text-muted)] mb-2" />
                  <p className="text-xs text-[var(--text-secondary)] font-mono">
                    Tidak ada transaksi pengeluaran.
                  </p>
                </div>
              )}
            </div>

            {/* Legend / Category List Samping */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {categoryBreakdown.length > 0 ? (
                categoryBreakdown.slice(0, 6).map((cat, idx) => (
                  <div 
                    key={idx}
                    className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] flex items-center justify-between text-xs hover:border-[var(--border-color)] transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span 
                        className="w-3 h-3 rounded-[2px] border border-black shrink-0" 
                        style={{ backgroundColor: cat.color }} 
                      />
                      <span className="font-heading font-bold text-white truncate" title={cat.category}>
                        {cat.category}
                      </span>
                    </div>
                    <div className="text-right shrink-0 font-mono text-[11px]">
                      <div className="text-white font-bold">{formatRupiah(cat.amount)}</div>
                      <div className="text-[var(--text-muted)] text-[10px]">{cat.percentage}%</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--text-muted)] font-mono italic">
                  Kosong
                </p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-muted)] flex items-center justify-between">
            <span>Kategori Terbesar: {categoryBreakdown[0]?.category || '-'}</span>
            <span className="text-[var(--accent-terracotta-light)]">
              {categoryBreakdown[0] ? `${categoryBreakdown[0].percentage}% pos` : ''}
            </span>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3B. ANALISIS ALOKASI DANA KATEGORI (ATURAN 50/30/20 EXPERT)          */}
      {/* ===================================================================== */}
      <section className="brutal-card p-3.5 bg-[var(--bg-surface)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--accent-sand)]" />
            <div>
              <h3 className="font-heading font-bold text-sm text-white">
                Analisis Alokasi Dana Kategori (Metode 50 / 30 / 20)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-mono">
                Evaluasi proporsi pengeluaran terhadap standar kesehatan finansial
              </p>
            </div>
          </div>
          <span className="brutal-badge text-[10px] bg-[var(--accent-sand)] text-[#111] font-bold">
            Aturan Emas Budgeting
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 1. Kebutuhan Pokok (Needs) */}
          <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-heading font-bold text-white flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-blue)]" />
                Kebutuhan Pokok (Needs)
              </span>
              <span className={`font-mono font-bold text-xs ${allocation503020.needsPct > 55 ? 'text-[var(--accent-terracotta-light)]' : 'text-[var(--accent-sage-light)]'}`}>
                {allocation503020.needsPct}% / Target 50%
              </span>
            </div>
            <p className="font-mono font-bold text-lg text-white">
              {formatRupiah(allocation503020.needs)}
            </p>
            <div className="h-2.5 w-full bg-[var(--bg-muted)] border border-black rounded-[2px] overflow-hidden">
              <div 
                className="h-full bg-[var(--accent-blue)] transition-all duration-300"
                style={{ width: `${Math.min(100, allocation503020.needsPct)}%` }}
              />
            </div>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">
              Tagihan, makanan pokok, transport & cicilan utang
            </p>
          </div>

          {/* 2. Keinginan & Gaya Hidup (Wants) */}
          <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-heading font-bold text-white flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-terracotta)]" />
                Gaya Hidup (Wants)
              </span>
              <span className={`font-mono font-bold text-xs ${allocation503020.wantsPct > 35 ? 'text-[var(--accent-terracotta-light)]' : 'text-[var(--accent-sage-light)]'}`}>
                {allocation503020.wantsPct}% / Target 30%
              </span>
            </div>
            <p className="font-mono font-bold text-lg text-white">
              {formatRupiah(allocation503020.wants)}
            </p>
            <div className="h-2.5 w-full bg-[var(--bg-muted)] border border-black rounded-[2px] overflow-hidden">
              <div 
                className="h-full bg-[var(--accent-terracotta)] transition-all duration-300"
                style={{ width: `${Math.min(100, allocation503020.wantsPct)}%` }}
              />
            </div>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">
              Hiburan, makan luar, hobi, belanja fleksibel
            </p>
          </div>

          {/* 3. Tabungan & Investasi (Savings) */}
          <div className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-heading font-bold text-white flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-sage)]" />
                Tabungan & Investasi
              </span>
              <span className="font-mono font-bold text-xs text-[var(--accent-sage-light)]">
                {allocation503020.savingsPct}% / Target 20%
              </span>
            </div>
            <p className="font-mono font-bold text-lg text-[var(--accent-sage-light)]">
              {formatRupiah(allocation503020.savings)}
            </p>
            <div className="h-2.5 w-full bg-[var(--bg-muted)] border border-black rounded-[2px] overflow-hidden">
              <div 
                className="h-full bg-[var(--accent-sage)] transition-all duration-300"
                style={{ width: `${Math.min(100, allocation503020.savingsPct)}%` }}
              />
            </div>
            <p className="text-[10px] font-mono text-[var(--text-muted)]">
              Alokasi Sinking Funds, portofolio & dana darurat
            </p>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3C. EXPENSE SOURCES / STATUS ALOKASI BUDGET KATEGORI (GAMBAR 3)       */}
      {/* ===================================================================== */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-heading font-extrabold text-lg text-[var(--text-primary)]">
              Expense Sources
            </h3>
            <p className="text-xs text-[var(--text-secondary)] font-mono">
              Monitoring kepatuhan alokasi dana per kategori bulan ini
            </p>
          </div>

          <div className="flex items-center gap-1 border-b-2 border-black dark:border-white/20 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setExpenseSourcesTab('overview')}
              className={`py-1.5 px-3 text-xs font-bold font-heading flex items-center gap-1.5 transition-all ${
                expenseSourcesTab === 'overview'
                  ? 'border-b-2 border-black dark:border-white text-[var(--text-primary)] font-extrabold -mb-[2px]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setExpenseSourcesTab('detail')}
              className={`py-1.5 px-3 text-xs font-bold font-heading flex items-center gap-1.5 transition-all ${
                expenseSourcesTab === 'detail'
                  ? 'border-b-2 border-black dark:border-white text-[var(--text-primary)] font-extrabold -mb-[2px]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Detail</span>
            </button>
          </div>
        </div>

        {/* Grid Kartu Expense Sources persis seperti Gambar 3 */}
        {expenseSourcesData.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
            <p className="text-xs text-[var(--text-secondary)] font-mono">
              Belum ada kategori pengeluaran atau alokasi budget yang terdaftar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {expenseSourcesData.map((item) => {
              const isExceeded = item.status === 'BUDGET_EXCEEDED';
              const isLimit = item.status === 'LIMIT_REACHED';
              const isOnBudget = item.status === 'ON_BUDGET';

              return (
                <div 
                  key={item.category}
                  className="brutal-card p-3 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] space-y-3 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all flex flex-col justify-between"
                >
                  {/* Top Row: Icon + Category Name */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {renderCategoryIcon(item.category)}
                      <h4 className="font-heading font-bold text-sm text-[var(--text-primary)] truncate" title={item.category}>
                        {item.category}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-[var(--text-muted)]">
                      <Leaf className="w-3 h-3 text-emerald-500" />
                      <span className="truncate">{activeLedger?.name || 'Personal'}</span>
                    </div>
                  </div>

                  {/* Middle Rows: Monthly Budget & Spent this Month */}
                  <div className="space-y-2 py-2 border-y border-[var(--border-subtle)] text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block uppercase font-bold">
                        Monthly Budget
                      </span>
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {item.budget > 0 ? formatRupiah(item.budget) : 'Fleksibel'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block uppercase font-bold">
                        Spent this Month
                      </span>
                      <span className="font-bold text-sm text-[var(--text-primary)]">
                        {formatRupiah(item.spent)}
                      </span>
                    </div>

                    {expenseSourcesTab === 'detail' && item.budget > 0 && (
                      <div className="pt-1 space-y-1">
                        <div className="h-1.5 w-full bg-[var(--bg-muted)] rounded-full overflow-hidden border border-black/30 dark:border-white/20">
                          <div 
                            className={`h-full transition-all duration-300 ${
                              isExceeded ? 'bg-rose-500' : isLimit ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, item.pct)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-[var(--text-muted)] block">
                          {item.count} transaksi tercatat
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Status Badge & Percentage Ring */}
                  <div className="pt-1 flex items-center justify-between">
                    <div>
                      {isOnBudget && (
                        <span className="text-xs font-mono font-bold text-emerald-500">
                          {formatRupiah(item.remaining)} Remaining
                        </span>
                      )}
                      {isLimit && (
                        <span className="text-xs font-mono font-bold text-amber-500">
                          LIMIT REACHED
                        </span>
                      )}
                      {isExceeded && (
                        <span className="text-xs font-mono font-bold text-rose-500">
                          BUDGET EXCEEDED
                        </span>
                      )}
                      {item.status === 'FLEXIBLE' && (
                        <span className="text-xs font-mono font-bold text-[var(--text-muted)]">
                          ON BUDGET
                        </span>
                      )}
                    </div>

                    {/* Percentage with circle indicator */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-mono font-bold text-[var(--text-secondary)]">
                        {item.budget > 0 ? `${item.pct}%` : '0%'}
                      </span>
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        isExceeded 
                          ? 'border-rose-500 bg-rose-500/20' 
                          : isLimit 
                          ? 'border-amber-500 bg-amber-500/20' 
                          : 'border-emerald-500 bg-emerald-500/20'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          isExceeded ? 'bg-rose-500' : isLimit ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* 4. DETAIL TABEL: RINCIAN KATEGORI & TOP 5 PENGELUARAN TERBESAR         */}
      {/* ===================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* TABEL RINCIAN SEMUA KATEGORI PENGELUARAN */}
        <div className="lg:col-span-2 brutal-card p-3.5 bg-[var(--bg-surface)] space-y-3">
          <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
            <div>
              <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--accent-blue)]" />
                Rincian Alokasi Pengeluaran per Pos
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                Persentase dan nominal pengeluaran diurutkan dari yang tertinggi
              </p>
            </div>
            <span className="text-xs font-mono text-[var(--text-muted)]">
              {categoryBreakdown.length} Pos Teridentifikasi
            </span>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <p className="text-xs text-[var(--text-secondary)] font-mono">
                Belum ada pos pengeluaran dalam rentang tanggal terpilih.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {categoryBreakdown.map((item, idx) => (
                <div 
                  key={idx}
                  className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2 hover:border-[var(--border-color)] transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-3 h-3 rounded-[2px] border border-black shrink-0" 
                        style={{ backgroundColor: item.color }} 
                      />
                      <span className="font-heading font-bold text-white">
                        {item.category}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                        ({item.count} transaksi)
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-bold text-white text-sm">
                        {formatRupiah(item.amount)}
                      </span>
                      <span className="text-xs text-[var(--accent-sand-light)] ml-2">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Neo-brutalist Progress Bar */}
                  <div className="h-2 w-full bg-[var(--bg-muted)] border border-black rounded-[2px] overflow-hidden">
                    <div 
                      className="h-full transition-all duration-300"
                      style={{ 
                        width: `${Math.min(100, item.percentage)}%`,
                        backgroundColor: item.color 
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TOP 5 PENGELUARAN TUNGGAL TERBESAR (TOP EXPENSES) */}
        <div className="brutal-card p-3.5 bg-[var(--bg-surface)] space-y-3">
          <div className="border-b-2 border-[var(--border-subtle)] pb-3">
            <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--accent-terracotta)]" />
              Top 5 Transaksi Terbesar
            </h3>
            <p className="text-[11px] text-[var(--text-secondary)] font-mono">
              Item pengeluaran terbesar periode ini
            </p>
          </div>

          {topExpenses.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
              <p className="text-xs text-[var(--text-secondary)] font-mono">
                Tidak ada pengeluaran tercatat.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {topExpenses.map((tx, idx) => {
                const acc = accounts.find(a => a.id === tx.accountId);
                return (
                  <div 
                    key={tx.id}
                    className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1 hover:border-[var(--border-color)] transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-heading font-bold text-white truncate max-w-[140px]" title={tx.note || tx.category}>
                        {tx.note || tx.category || 'Pengeluaran'}
                      </span>
                      <span className="font-mono font-bold text-[var(--accent-terracotta-light)]">
                        -{formatRupiah(tx.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                      <span>{tx.date} • {tx.category}</span>
                      <span className="text-[var(--text-secondary)] font-bold">{acc?.name || 'Kas'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Action Link ke Modul 1 */}
          {onNavigateToTab && (
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => onNavigateToTab('module1')}
                className="w-full brutal-btn brutal-btn-ghost text-xs py-2 flex items-center justify-center gap-1.5 font-bold"
              >
                <span>Lihat Semua Transaksi di Modul 1</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

      </section>

    </div>
  );
};