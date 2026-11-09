/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen,
  Briefcase,
  ChevronDown,
  Wallet, 
  Landmark, 
  Smartphone, 
  CreditCard, 
  Plus, 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  Trash2, 
  Pencil,
  Calculator, 
  Tag, 
  FileText, 
  X, 
  Check, 
  ArrowLeft,
  AlertTriangle,
  Info,
  CheckCircle2,
  FolderPlus,
  Target,
  Sparkles,
  Compass,
  Calendar,
  Coins,
  PiggyBank,
  Award,
  CheckSquare,
  History,
  Eye,
  Receipt,
  RotateCw,
  Clock,
  CalendarCheck,
  AlertCircle,
  Banknote,
  DollarSign,
  Zap,
  Play,
  Power,
  ToggleLeft,
  ToggleRight,
  Sliders,
  Cpu,
  BarChart3
} from 'lucide-react';
import { Module5Reports } from './components/Module5Reports';
import { Module6SalaryShift } from './components/Module6SalaryShift';
import { 
  Ledger, 
  Account, 
  Transaction, 
  AccountType, 
  Goal, 
  GoalType, 
  Bill, 
  Debt, 
  BillCycle, 
  BillPricingType, 
  CustomIntervalUnit,
  AutomationRule,
  AutomationType,
  AutomationCycle
} from './types';
import { 
  fetchLedgers,
  createLedger,
  updateLedger,
  deleteLedger,
  getActiveLedgerId,
  setActiveLedgerId,
  fetchAccountsByLedger, 
  createAccount, 
  updateAccountData,
  deleteAccount, 
  calculateNetWorthAccounts, 
  fetchTransactionsByLedger, 
  createTransaction, 
  updateTransactionWithBalanceSync,
  executeAccountTransfer, 
  deleteTransaction,
  fetchGoalsByLedger,
  createGoal,
  updateGoalData,
  deleteGoal,
  allocateFundsToGoal,
  fetchGoalAllocationHistory,
  fetchBillsByLedger,
  createBill,
  updateBill,
  deleteBill,
  payBill,
  advancePaymentDate,
  stepBackPaymentDate,
  getCycleLabel,
  getBillDueStatus,
  fetchDebtsByLedger,
  createDebt,
  updateDebt,
  deleteDebt,
  payDebtInstallment,
  fetchAutomations,
  createAutomation,
  updateAutomation,
  toggleAutomationActive,
  deleteAutomation,
  executeSingleAutomation,
  checkAndRunAutomations
} from './services/cashManagementService';
import { evaluateMathExpression, formatRupiah } from './utils/calculator';
import { useUI } from './context/UIContext';
import { AppNav } from './components/layout/AppNav';
import { HeaderTools } from './components/layout/HeaderTools';
import { DashboardPage } from './components/DashboardPage';
import { SettingsPage } from './components/SettingsPage';
import { AutopilotList, AutopilotFields, submitAutopilot, emptyApDraft, type ApDraft } from './components/AutopilotPanel';
import type { AutopilotKind } from './services/autopilotService';
import { SixMonthReport } from './components/SixMonthReport';
import { scanReceipt } from './services/receiptScanService';
import { getGeminiKey, getGeminiModel } from './services/geminiSettings';
import { Camera as ScanCamera, PiggyBank as ApPiggy, Receipt as ApReceipt, Landmark as ApLandmark } from 'lucide-react';
import { runAutopilot, type AutopilotResult } from './services/autopilotService';
import { useCategories } from './hooks/useCategories';

export default function App() {
  // =========================================================================
  // STATE NAVIGASI SPA: MODUL 1 (KAS), MODUL 2 (GOALS), MODUL 3 (UTANG), MODUL 4 (OTOMASI), MODUL 5 (LAPORAN), MODUL 6 (GAJI & SHIFT)
  // =========================================================================
const [isAddAutomationOpen, setIsAddAutomationOpen] = useState(false);  
const [activeModule, setActiveModule] = useState<'dashboard' | 'settings' | 'module1' | 'module2' | 'module3' | 'module4' | 'module5' | 'module6'>('dashboard');
  useUI(); // langganan tema/privasi: re-render seluruh pohon saat toggle
  const categories = useCategories();

  // Scan Struk (AI): isi form transaksi dari foto struk; pengguna tetap memeriksa sebelum menyimpan
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  async function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const apiKey = getGeminiKey();
    if (!apiKey) {
      showToast('Isi kunci Gemini dulu di Pengaturan > Scan Struk (AI).', 'error');
      setActiveModule('settings');
      return;
    }
    setIsScanning(true);
    try {
      const r = await scanReceipt(file, categories.lists.expense, { apiKey, model: getGeminiModel() });
      setTxType('expense');
      setTxAmount(String(r.amount));
      if (r.date) setTxDate(r.date);
      if (r.category) setTxCategory(r.category);
      if (r.note) setTxNote(r.note);
      showToast('Struk terbaca. Periksa lagi sebelum menyimpan.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membaca struk.', 'error');
    } finally {
      setIsScanning(false);
    }
  }

  // Autopilot di dalam modal "Aturan Baru"
  const [apKind, setApKind] = useState<AutopilotKind | null>(null);
  const [apDraft, setApDraft] = useState<ApDraft>(emptyApDraft);
  const [apVersion, setApVersion] = useState(0);
  function handleCreateAutopilot(e: React.FormEvent) {
    e.preventDefault();
    if (!apKind) return;
    try {
      submitAutopilot(apKind, apDraft, { ledgerId: currentLedger.id, accounts, goals, bills, debts });
      showToast('Aturan Autopilot disimpan.', 'success');
      setApVersion(v => v + 1);
      setIsAddAutomationOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan aturan Autopilot.', 'error');
    }
  }

  // Autopilot: jalankan aturan lalu muat ulang data yang terpengaruh
  useEffect(() => { if (!isAddAutomationOpen) { setApKind(null); setApDraft(emptyApDraft()); } }, [isAddAutomationOpen]);

  async function runAutopilotAndRefresh(ledgerId: string): Promise<AutopilotResult> {
    const res = await runAutopilot(ledgerId);
    if (res.executed.length > 0) {
      const [a, t, g, b, d] = await Promise.all([
        fetchAccountsByLedger(undefined, ledgerId), fetchTransactionsByLedger(undefined, ledgerId),
        fetchGoalsByLedger(undefined, ledgerId), fetchBillsByLedger(undefined, ledgerId), fetchDebtsByLedger(undefined, ledgerId),
      ]);
      setAccounts(a); setTransactions(t); setGoals(g); setBills(b); setDebts(d);
      showToast(`Autopilot: ${res.executed.map(x => x.message).join(', ')}`, 'success');
    }
    if (res.failed.length > 0) showToast(`Autopilot: ${res.failed.length} aturan gagal (${res.failed[0].error})`, 'error');
    return res;
  }

  // =========================================================================
  // STATE BUKU KAS (LEDGERS)
  // =========================================================================
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [activeLedgerIdState, setActiveLedgerIdState] = useState<string>(() => getActiveLedgerId());
  const [isLedgerDropdownOpen, setIsLedgerDropdownOpen] = useState(false);
  const [isAddLedgerOpen, setIsAddLedgerOpen] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState('');
  const [newLedgerDesc, setNewLedgerDesc] = useState('');
  const [newLedgerColor, setNewLedgerColor] = useState('#8fa892');
  
  // State Edit Buku Kas
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);
  const [editLedgerName, setEditLedgerName] = useState('');
  const [editLedgerDesc, setEditLedgerDesc] = useState('');
  const [editLedgerColor, setEditLedgerColor] = useState('#8fa892');

  // State Hapus Buku Kas
  const [ledgerToDelete, setLedgerToDelete] = useState<Ledger | null>(null);

  // =========================================================================
  // STATE MODUL 2: GOALS (WISHLIST & SINKING FUNDS)
  // =========================================================================
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalFilter, setGoalFilter] = useState<'all' | 'sinking_fund' | 'wishlist' | 'completed'>('all');

  // Modal Tambah Goal Baru
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalType, setNewGoalType] = useState<GoalType>('sinking_fund');
  const [newGoalTarget, setNewGoalTarget] = useState('5000000');
  const [newGoalInitial, setNewGoalInitial] = useState('0');
  const [newGoalDeadline, setNewGoalDeadline] = useState('');
  const [newGoalSourceAccount, setNewGoalSourceAccount] = useState('');
  const [newGoalColor, setNewGoalColor] = useState('#d4bc82');
  const [newGoalNote, setNewGoalNote] = useState('');
  const [goalCalcNotice, setGoalCalcNotice] = useState<string | null>(null);

  // Modal Alokasikan Dana ke Goal
  const [allocatingGoal, setAllocatingGoal] = useState<Goal | null>(null);
  const [allocAmount, setAllocAmount] = useState('');
  const [allocSourceAccount, setAllocSourceAccount] = useState('');
  const [allocDate, setAllocDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [allocNote, setAllocNote] = useState('');
  const [allocCalcNotice, setAllocCalcNotice] = useState<string | null>(null);

  // Modal Edit Goal
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editGoalName, setEditGoalName] = useState('');
  const [editGoalType, setEditGoalType] = useState<GoalType>('sinking_fund');
  const [editGoalTarget, setEditGoalTarget] = useState('');
  const [editGoalCurrent, setEditGoalCurrent] = useState('');
  const [editGoalDeadline, setEditGoalDeadline] = useState('');
  const [editGoalSourceAccount, setEditGoalSourceAccount] = useState('');
  const [editGoalColor, setEditGoalColor] = useState('#d4bc82');
  const [editGoalNote, setEditGoalNote] = useState('');

  // Modal Hapus Goal
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);

  // Modal Detail & Riwayat Target Khusus
  const [selectedGoalForDetail, setSelectedGoalForDetail] = useState<Goal | null>(null);
  const [goalAllocationHistory, setGoalAllocationHistory] = useState<Transaction[]>([]);
  const [isLoadingGoalHistory, setIsLoadingGoalHistory] = useState(false);

  // =========================================================================
  // STATE MODUL 3: UTANG & TAGIHAN RUTIN (DEBTS & SUBSCRIPTIONS)
  // =========================================================================
  const [bills, setBills] = useState<Bill[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [billFilter, setBillFilter] = useState<'all' | 'monthly' | 'yearly' | 'overdue'>('all');
  const [debtFilter, setDebtFilter] = useState<'all' | 'active' | 'paid_off'>('all');

  // Modal Tambah Tagihan Baru
  const [isAddBillOpen, setIsAddBillOpen] = useState(false);
  const [newBillName, setNewBillName] = useState('');
  const [newBillCycle, setNewBillCycle] = useState<BillCycle>('monthly');
  const [newBillCustomCount, setNewBillCustomCount] = useState<number>(10);
  const [newBillCustomUnit, setNewBillCustomUnit] = useState<CustomIntervalUnit>('days');
  const [newBillPricingType, setNewBillPricingType] = useState<BillPricingType>('fixed');
  const [newBillAmount, setNewBillAmount] = useState('150000');
  const [newBillLastNominal, setNewBillLastNominal] = useState('350000');
  const [newBillLastNominalCalcNotice, setNewBillLastNominalCalcNotice] = useState<string | null>(null);
  const [newBillNextDate, setNewBillNextDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [newBillCategory, setNewBillCategory] = useState('Tagihan & Utilitas');
  const [newBillSourceAccount, setNewBillSourceAccount] = useState('');
  const [newBillColor, setNewBillColor] = useState('#7a9eb3');
  const [newBillNote, setNewBillNote] = useState('');
  const [billCalcNotice, setBillCalcNotice] = useState<string | null>(null);

  // Modal Bayar Tagihan ("Bayar Sekarang")
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payBillAmount, setPayBillAmount] = useState('');
  const [payBillSourceAccount, setPayBillSourceAccount] = useState('');
  const [payBillDate, setPayBillDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payBillNote, setPayBillNote] = useState('');
  const [payBillCalcNotice, setPayBillCalcNotice] = useState<string | null>(null);

  // Modal Edit Tagihan
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [editBillName, setEditBillName] = useState('');
  const [editBillCycle, setEditBillCycle] = useState<BillCycle>('monthly');
  const [editBillCustomCount, setEditBillCustomCount] = useState<number>(10);
  const [editBillCustomUnit, setEditBillCustomUnit] = useState<CustomIntervalUnit>('days');
  const [editBillPricingType, setEditBillPricingType] = useState<BillPricingType>('fixed');
  const [editBillAmount, setEditBillAmount] = useState('');
  const [editBillLastNominal, setEditBillLastNominal] = useState('');
  const [editBillLastNominalCalcNotice, setEditBillLastNominalCalcNotice] = useState<string | null>(null);
  const [editBillNextDate, setEditBillNextDate] = useState('');
  const [editBillCategory, setEditBillCategory] = useState('Tagihan & Utilitas');
  const [editBillSourceAccount, setEditBillSourceAccount] = useState('');
  const [editBillColor, setEditBillColor] = useState('#7a9eb3');
  const [editBillNote, setEditBillNote] = useState('');

  // Modal Hapus Tagihan
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);

  // Modal Tambah Utang Baru
  const [isAddDebtOpen, setIsAddDebtOpen] = useState(false);
  const [newDebtName, setNewDebtName] = useState('');
  const [newDebtLender, setNewDebtLender] = useState('');
  const [newDebtTotal, setNewDebtTotal] = useState('5000000');
  const [newDebtRemaining, setNewDebtRemaining] = useState('5000000');
  const [newDebtNextDate, setNewDebtNextDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [newDebtCycle, setNewDebtCycle] = useState<BillCycle>('monthly');
  const [newDebtCustomCount, setNewDebtCustomCount] = useState<number>(10);
  const [newDebtCustomUnit, setNewDebtCustomUnit] = useState<CustomIntervalUnit>('days');
  const [newDebtDueDate, setNewDebtDueDate] = useState('');
  const [newDebtColor, setNewDebtColor] = useState('#c88265');
  const [newDebtNote, setNewDebtNote] = useState('');
  const [debtCalcNotice, setDebtCalcNotice] = useState<string | null>(null);

  // Modal Bayar Cicilan Utang
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [payDebtAmount, setPayDebtAmount] = useState('');
  const [payDebtSourceAccount, setPayDebtSourceAccount] = useState('');
  const [payDebtDate, setPayDebtDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payDebtNote, setPayDebtNote] = useState('');
  const [payDebtCalcNotice, setPayDebtCalcNotice] = useState<string | null>(null);

  // Modal Edit Utang
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [editDebtName, setEditDebtName] = useState('');
  const [editDebtLender, setEditDebtLender] = useState('');
  const [editDebtTotal, setEditDebtTotal] = useState('');
  const [editDebtRemaining, setEditDebtRemaining] = useState('');
  const [editDebtNextDate, setEditDebtNextDate] = useState('');
  const [editDebtCycle, setEditDebtCycle] = useState<BillCycle>('monthly');
  const [editDebtCustomCount, setEditDebtCustomCount] = useState<number>(10);
  const [editDebtCustomUnit, setEditDebtCustomUnit] = useState<CustomIntervalUnit>('days');
  const [editDebtDueDate, setEditDebtDueDate] = useState('');
  const [editDebtColor, setEditDebtColor] = useState('#c88265');
  const [editDebtNote, setEditDebtNote] = useState('');

  // Modal Hapus Utang
  const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);

  // Modal Detail & Riwayat (Progressive Disclosure Modul 3)
  const [selectedBillForDetail, setSelectedBillForDetail] = useState<Bill | null>(null);
  const [selectedDebtForDetail, setSelectedDebtForDetail] = useState<Debt | null>(null);

  // =========================================================================
  // STATE MODUL 4: OTOMATISASI TRANSAKSI (AUTO-INCOME, AUTO-EXPENSE, AUTO-TRANSFER)
  // =========================================================================
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [automationFilter, setAutomationFilter] = useState<'all' | 'active' | 'income' | 'expense' | 'transfer'>('all');
  const [isExecutingCron, setIsExecutingCron] = useState(false);

  // Modal Tambah Aturan Baru
  const [newAutoName, setNewAutoName] = useState('');
  const [newAutoType, setNewAutoType] = useState<AutomationType>('income');
  const [newAutoCategory, setNewAutoCategory] = useState('Gaji & Pendapatan');
  const [newAutoAmount, setNewAutoAmount] = useState('5000000');
  const [newAutoSourceAccount, setNewAutoSourceAccount] = useState('');
  const [newAutoToAccount, setNewAutoToAccount] = useState('');
  const [newAutoCycle, setNewAutoCycle] = useState<AutomationCycle>('monthly');
  const [newAutoMonthlyDay, setNewAutoMonthlyDay] = useState<number>(25);
  const [newAutoCustomCount, setNewAutoCustomCount] = useState<number>(1);
  const [newAutoCustomUnit, setNewAutoCustomUnit] = useState<CustomIntervalUnit>('months');
  const [newAutoNextDate, setNewAutoNextDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [newAutoColor, setNewAutoColor] = useState('#8fa892');
  const [newAutoNote, setNewAutoNote] = useState('');
  const [autoCalcNotice, setAutoCalcNotice] = useState<string | null>(null);

  // Modal Edit Aturan
  const [editingAutomation, setEditingAutomation] = useState<AutomationRule | null>(null);
  const [editAutoName, setEditAutoName] = useState('');
  const [editAutoType, setEditAutoType] = useState<AutomationType>('income');
  const [editAutoCategory, setEditAutoCategory] = useState('');
  const [editAutoAmount, setEditAutoAmount] = useState('');
  const [editAutoSourceAccount, setEditAutoSourceAccount] = useState('');
  const [editAutoToAccount, setEditAutoToAccount] = useState('');
  const [editAutoCycle, setEditAutoCycle] = useState<AutomationCycle>('monthly');
  const [editAutoMonthlyDay, setEditAutoMonthlyDay] = useState<number>(25);
  const [editAutoCustomCount, setEditAutoCustomCount] = useState<number>(1);
  const [editAutoCustomUnit, setEditAutoCustomUnit] = useState<CustomIntervalUnit>('months');
  const [editAutoNextDate, setEditAutoNextDate] = useState('');
  const [editAutoColor, setEditAutoColor] = useState('#8fa892');
  const [editAutoNote, setEditAutoNote] = useState('');
  const [editAutoCalcNotice, setEditAutoCalcNotice] = useState<string | null>(null);

  // Modal Hapus Aturan & Modal Detail
  const [automationToDelete, setAutomationToDelete] = useState<AutomationRule | null>(null);
  const [selectedAutomationForDetail, setSelectedAutomationForDetail] = useState<AutomationRule | null>(null);

  const ledgerDropdownRef = useRef<HTMLDivElement>(null);

  // =========================================================================
  // STATE AKUN & TRANSAKSI (ISOLASI PER BUKU KAS)
  // =========================================================================
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // In-App Toast Notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(text: string, type: 'success' | 'error' | 'info' = 'success') {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  }

  // UI STATE MANAGEMENT: Toggle Eksklusif Form Transaksi vs Transfer
  const [activeFormMode, setActiveFormMode] = useState<'transaction' | 'transfer'>('transaction');

  // Filter Riwayat Transaksi
  const [txFilter, setTxFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');

  // State Modal Tambah Akun
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>('bank');
  const [newAccBalance, setNewAccBalance] = useState('1000000');
  const [newAccColor, setNewAccColor] = useState('#7a9eb3');

  // State Modal Edit Akun
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editAccName, setEditAccName] = useState('');
  const [editAccType, setEditAccType] = useState<AccountType>('bank');
  const [editAccBalance, setEditAccBalance] = useState('');
  const [editAccColor, setEditAccColor] = useState('#7a9eb3');

  // State Modal Edit Transaksi
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editTxType, setEditTxType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [editTxAmount, setEditTxAmount] = useState('');
  const [editTxAccountId, setEditTxAccountId] = useState('');
  const [editTxToAccountId, setEditTxToAccountId] = useState('');
  const [editTxCategory, setEditTxCategory] = useState('');
  const [editTxNote, setEditTxNote] = useState('');
  const [editTxDate, setEditTxDate] = useState('');
  const [editCalcNotice, setEditCalcNotice] = useState<string | null>(null);

  // State Modal Konfirmasi Hapus
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);

  // Form Input Transaksi Baru
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [txAmount, setTxAmount] = useState('');
  const [txAccountId, setTxAccountId] = useState('');
  const [txCategory, setTxCategory] = useState('Makanan & Minuman');
  useEffect(() => {
    const valid = txType === 'expense' ? categories.lists.expense : txType === 'income' ? categories.lists.income : null;
    if (valid && !valid.includes(txCategory)) setTxCategory(valid[0]);
  }, [txType, txCategory, categories.lists]);
  const [txNote, setTxNote] = useState('');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [calcNotice, setCalcNotice] = useState<string | null>(null);

  // Form Transfer Baru
  const [transferSource, setTransferSource] = useState('');
  const [transferDest, setTransferDest] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferNotice, setTransferNotice] = useState<string | null>(null);

  // Tutup dropdown jika klik di luar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ledgerDropdownRef.current && !ledgerDropdownRef.current.contains(event.target as Node)) {
        setIsLedgerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load Awal: Ledgers & Data Buku Kas Aktif
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      const allLedgers = await fetchLedgers();
      setLedgers(allLedgers);

      let currentId = activeLedgerIdState;
      if (!allLedgers.find(l => l.id === currentId)) {
        currentId = allLedgers[0]?.id || 'ledger_personal_default';
        setActiveLedgerIdState(currentId);
        setActiveLedgerId(currentId);
      }

      await loadLedgerData(currentId);

      // EKSEKUSI CLIENT-SIDE CRON JOB SAAT APP INIT (MODUL 4)
      try {
        const cronResult = await checkAndRunAutomations(undefined, currentId);
        if (cronResult.executedCount > 0) {
          showToast(`${cronResult.executedCount} Transaksi Otomatis Berhasil Dieksekusi`, 'success');
          // Muat ulang data terbaru yang terpengaruh eksekusi otomatis
          const [freshAccs, freshTxs, freshAutos] = await Promise.all([
            fetchAccountsByLedger(undefined, currentId),
            fetchTransactionsByLedger(undefined, currentId),
            fetchAutomations(undefined, currentId)
          ]);
          setAccounts(freshAccs);
          setTransactions(freshTxs);
          setAutomations(freshAutos);
        }
      } catch (err) {
        console.warn('Gagal menjalankan cron automations:', err);
      }

      try {
        await runAutopilotAndRefresh(currentId);
      } catch (err) {
        console.warn('Gagal menjalankan Autopilot:', err);
      }

      setIsLoading(false);
    }
    init();
  }, []);

  // Fungsi memuat data HANYA untuk buku kas yang dipilih
  async function loadLedgerData(targetLedgerId: string) {
    setIsLoading(true);
    const [accs, txs, gls, bls, dts, autos] = await Promise.all([
      fetchAccountsByLedger(undefined, targetLedgerId),
      fetchTransactionsByLedger(undefined, targetLedgerId),
      fetchGoalsByLedger(undefined, targetLedgerId),
      fetchBillsByLedger(undefined, targetLedgerId),
      fetchDebtsByLedger(undefined, targetLedgerId),
      fetchAutomations(undefined, targetLedgerId)
    ]);
    setAccounts(accs);
    setTransactions(txs);
    setGoals(gls);
    setBills(bls);
    setDebts(dts);
    setAutomations(autos);

    if (accs.length > 0) {
      setTxAccountId(accs[0].id);
      setTransferSource(accs[0].id);
      setTransferDest(accs.length > 1 ? accs[1].id : '');
      setNewGoalSourceAccount(accs[0].id);
      setAllocSourceAccount(accs[0].id);
      setNewBillSourceAccount(accs[0].id);
      setPayBillSourceAccount(accs[0].id);
      setPayDebtSourceAccount(accs[0].id);
      setNewAutoSourceAccount(accs[0].id);
      setNewAutoToAccount(accs.length > 1 ? accs[1].id : '');
    } else {
      setTxAccountId('');
      setTransferSource('');
      setTransferDest('');
      setNewGoalSourceAccount('');
      setAllocSourceAccount('');
      setNewBillSourceAccount('');
      setPayBillSourceAccount('');
      setPayDebtSourceAccount('');
      setNewAutoSourceAccount('');
      setNewAutoToAccount('');
    }
    setIsLoading(false);
  }

  // Handler Beralih Buku Kas (Active Ledger Switcher)
  async function handleSwitchLedger(ledgerId: string) {
    if (ledgerId === activeLedgerIdState) {
      setIsLedgerDropdownOpen(false);
      return;
    }
    setActiveLedgerIdState(ledgerId);
    setActiveLedgerId(ledgerId);
    setIsLedgerDropdownOpen(false);

    const targetLedger = ledgers.find(l => l.id === ledgerId);
    showToast(`Beralih ke Buku Kas: "${targetLedger?.name || ledgerId}"`, 'info');
    await loadLedgerData(ledgerId);
  }

  // Handler Buat Buku Kas Baru
  async function handleCreateLedger(e: React.FormEvent) {
    e.preventDefault();
    if (!newLedgerName.trim()) return;

    const created = await createLedger(undefined, {
      name: newLedgerName.trim(),
      description: newLedgerDesc.trim(),
      colorAccent: newLedgerColor
    });

    const updatedLedgers = [...ledgers, created];
    setLedgers(updatedLedgers);
    setIsAddLedgerOpen(false);
    setNewLedgerName('');
    setNewLedgerDesc('');

    // Otomatis beralih ke buku kas yang baru dibuat
    await handleSwitchLedger(created.id);
    showToast(`Buku Kas "${created.name}" berhasil dibuat & aktif!`, 'success');
  }

  // Handler Buka Modal Edit Buku Kas
  function openEditLedgerModal(ledger: Ledger, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setEditingLedger(ledger);
    setEditLedgerName(ledger.name);
    setEditLedgerDesc(ledger.description || '');
    setEditLedgerColor(ledger.colorAccent || '#8fa892');
    setIsLedgerDropdownOpen(false);
  }

  // Handler Simpan Perubahan Buku Kas
  async function handleSaveEditedLedger(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLedger || !editLedgerName.trim()) return;

    const updated = await updateLedger(undefined, editingLedger.id, {
      name: editLedgerName.trim(),
      description: editLedgerDesc.trim(),
      colorAccent: editLedgerColor
    });

    setLedgers(prev => prev.map(l => l.id === updated.id ? updated : l));
    setEditingLedger(null);
    showToast(`Buku Kas "${updated.name}" berhasil diperbarui!`, 'success');
  }

  // Handler Buka Modal Konfirmasi Hapus Buku Kas
  function promptDeleteLedger(ledger: Ledger, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (ledgers.length <= 1) {
      showToast('Tidak dapat menghapus buku kas terakhir! Minimal harus ada 1 buku kas aktif.', 'error');
      return;
    }
    setLedgerToDelete(ledger);
    setIsLedgerDropdownOpen(false);
  }

  // Handler Eksekusi Hapus Buku Kas Terpilih
  async function confirmExecuteDeleteLedger() {
    if (!ledgerToDelete) return;
    const targetId = ledgerToDelete.id;
    const targetName = ledgerToDelete.name;

    if (ledgers.length <= 1) {
      showToast('Minimal harus ada 1 buku kas aktif!', 'error');
      setLedgerToDelete(null);
      return;
    }

    await deleteLedger(undefined, targetId);

    const remaining = ledgers.filter(l => l.id !== targetId);
    setLedgers(remaining);
    setLedgerToDelete(null);

    // Jika yang dihapus adalah buku kas aktif, beralih ke buku kas pertama yang tersisa
    if (activeLedgerIdState === targetId) {
      const nextLedger = remaining[0];
      setActiveLedgerIdState(nextLedger.id);
      setActiveLedgerId(nextLedger.id);
      await loadLedgerData(nextLedger.id);
      showToast(`Buku Kas "${targetName}" dihapus. Beralih ke "${nextLedger.name}".`, 'info');
    } else {
      showToast(`Buku Kas "${targetName}" berhasil dihapus.`, 'info');
    }
  }

  // Buku kas aktif saat ini
  const currentLedger = ledgers.find(l => l.id === activeLedgerIdState) || ledgers[0] || {
    id: 'ledger_personal_default',
    name: 'Keuangan Pribadi',
    description: 'Arus kas harian',
    colorAccent: '#8fa892'
  };

  // Kalkulasi total saldo KHUSUS untuk buku kas yang aktif
  const totals = calculateNetWorthAccounts(accounts);

  // =========================================================================
  // KALKULATOR MINI LOGIC
  // =========================================================================

  function handleTxAmountBlur() {
    if (!txAmount) return;
    const { success, result, displayValue } = evaluateMathExpression(txAmount);
    if (success && displayValue !== txAmount) {
      setCalcNotice(`Kalkulator: ${txAmount} = ${formatRupiah(result)}`);
      setTxAmount(displayValue);
      setTimeout(() => setCalcNotice(null), 4000);
    }
  }

  function handleTransferAmountBlur() {
    if (!transferAmount) return;
    const { success, result, displayValue } = evaluateMathExpression(transferAmount);
    if (success && displayValue !== transferAmount) {
      setTransferNotice(`Kalkulator: ${transferAmount} = ${formatRupiah(result)}`);
      setTransferAmount(displayValue);
      setTimeout(() => setTransferNotice(null), 4000);
    }
  }

  function handleEditTxAmountBlur() {
    if (!editTxAmount) return;
    const { success, result, displayValue } = evaluateMathExpression(editTxAmount);
    if (success && displayValue !== editTxAmount) {
      setEditCalcNotice(`Kalkulator: ${editTxAmount} = ${formatRupiah(result)}`);
      setEditTxAmount(displayValue);
      setTimeout(() => setEditCalcNotice(null), 4000);
    }
  }

  function addQuickAmount(val: number) {
    const current = parseInt(txAmount.replace(/[^\d]/g, '') || '0', 10);
    setTxAmount((current + val).toString());
  }

  // =========================================================================
  // CRUD AKUN TERIKAT KE BUKU KAS AKTIF
  // =========================================================================

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccName.trim()) return;

    const { result } = evaluateMathExpression(newAccBalance);

    const created = await createAccount(undefined, {
      ledgerId: activeLedgerIdState, // Terikat wajib ke Buku Kas Aktif
      name: newAccName.trim(),
      type: newAccType,
      balance: result,
      colorAccent: newAccColor
    });

    const updated = [...accounts, created];
    setAccounts(updated);
    if (!txAccountId) setTxAccountId(created.id);
    if (!transferDest && updated.length > 1) setTransferDest(created.id);

    setNewAccName('');
    setNewAccBalance('0');
    setIsAddAccountOpen(false);
    showToast(`Akun "${created.name}" ditambahkan ke ${currentLedger.name}!`, 'success');
  }

  function openEditAccountModal(acc: Account) {
    setEditingAccount(acc);
    setEditAccName(acc.name);
    setEditAccType(acc.type);
    setEditAccBalance(acc.balance.toString());
    setEditAccColor(acc.colorAccent || '#7a9eb3');
  }

  async function handleSaveEditedAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAccount || !editAccName.trim()) return;

    const { result } = evaluateMathExpression(editAccBalance);
    const updated = await updateAccountData(undefined, editingAccount.id, {
      name: editAccName.trim(),
      type: editAccType,
      balance: result,
      colorAccent: editAccColor
    });

    setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a));
    setEditingAccount(null);
    showToast(`Akun "${updated.name}" berhasil diperbarui!`, 'success');
  }

  async function confirmExecuteDeleteAccount() {
    if (!accountToDelete) return;
    const accId = accountToDelete.id;
    const accName = accountToDelete.name;

    await deleteAccount(undefined, accId);
    const updatedAccs = await fetchAccountsByLedger(undefined, activeLedgerIdState);
    setAccounts(updatedAccs);
    if (txAccountId === accId && updatedAccs.length > 0) {
      setTxAccountId(updatedAccs[0].id);
    }
    setAccountToDelete(null);
    showToast(`Akun "${accName}" berhasil dihapus.`, 'info');
  }

  // =========================================================================
  // CRUD TRANSAKSI TERIKAT KE BUKU KAS AKTIF
  // =========================================================================

  async function handleSaveTransaction(e: React.FormEvent) {
    e.preventDefault();
    const { result } = evaluateMathExpression(txAmount);
    if (result <= 0) {
      showToast('Masukkan nominal transaksi yang valid (lebih dari 0)!', 'error');
      return;
    }
    if (!txAccountId) {
      showToast('Pilih akun sumber dana terlebih dahulu!', 'error');
      return;
    }

    const created = await createTransaction(undefined, {
      ledgerId: activeLedgerIdState, // Terikat wajib ke Buku Kas Aktif
      accountId: txAccountId,
      type: txType,
      amount: result,
      category: txCategory,
      note: txNote,
      date: txDate
    });

    const refreshedAccs = await fetchAccountsByLedger(undefined, activeLedgerIdState);
    const refreshedTxs = await fetchTransactionsByLedger(undefined, activeLedgerIdState);
    setAccounts(refreshedAccs);
    setTransactions(refreshedTxs);

    setTxAmount('');
    setTxNote('');
    setCalcNotice(null);
    showToast(`Transaksi ${txType === 'income' ? 'Pemasukan' : 'Pengeluaran'} dicatat di ${currentLedger.name}!`, 'success');
  }

  function openEditTransactionModal(tx: Transaction) {
    setEditingTx(tx);
    setEditTxType(tx.type);
    setEditTxAmount(tx.amount.toString());
    setEditTxAccountId(tx.accountId);
    setEditTxToAccountId(tx.toAccountId || '');
    setEditTxCategory(tx.category || (tx.type === 'transfer' ? 'Transfer Saldo' : ''));
    setEditTxNote(tx.note || '');
    setEditTxDate(tx.date || new Date().toISOString().split('T')[0]);
    setEditCalcNotice(null);
  }

  async function handleSaveEditedTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTx) return;

    const { result } = evaluateMathExpression(editTxAmount);
    if (result <= 0) {
      showToast('Nominal harus lebih dari 0!', 'error');
      return;
    }

    if (editTxType === 'transfer') {
      if (!editTxToAccountId) {
        showToast('Pilih akun tujuan transfer!', 'error');
        return;
      }
      if (editTxAccountId === editTxToAccountId) {
        showToast('Akun asal dan akun tujuan tidak boleh sama!', 'error');
        return;
      }
    }

    await updateTransactionWithBalanceSync(undefined, editingTx, {
      ledgerId: activeLedgerIdState,
      accountId: editTxAccountId,
      toAccountId: editTxType === 'transfer' ? editTxToAccountId : null,
      goalId: editingTx.goalId,
      type: editTxType,
      amount: result,
      category: editTxType === 'transfer' ? 'Transfer Saldo' : (editTxCategory || 'Lainnya'),
      note: editTxNote,
      date: editTxDate
    });

    const [refreshedAccs, refreshedTxs, refreshedGoals, refreshedBills, refreshedDebts] = await Promise.all([
      fetchAccountsByLedger(undefined, activeLedgerIdState),
      fetchTransactionsByLedger(undefined, activeLedgerIdState),
      fetchGoalsByLedger(undefined, activeLedgerIdState),
      fetchBillsByLedger(undefined, activeLedgerIdState),
      fetchDebtsByLedger(undefined, activeLedgerIdState)
    ]);
    setAccounts(refreshedAccs);
    setTransactions(refreshedTxs);
    setGoals(refreshedGoals);
    setBills(refreshedBills);
    setDebts(refreshedDebts);

    // Jika modal detail sedang terbuka untuk target ini, sinkronkan rinciannya secara realtime
    if (selectedGoalForDetail && (editingTx.goalId === selectedGoalForDetail.id || selectedGoalForDetail.id === editingTx.goalId)) {
      const updatedTarget = refreshedGoals.find(g => g.id === selectedGoalForDetail.id) || null;
      if (updatedTarget) setSelectedGoalForDetail(updatedTarget);
      const updatedHistory = await fetchGoalAllocationHistory(undefined, selectedGoalForDetail.id);
      setGoalAllocationHistory(updatedHistory);
    }

    setEditingTx(null);
    showToast(
      editingTx.goalId 
        ? 'Perubahan alokasi tersimpan! Saldo kas & dana target disinkronkan secara atomik.' 
        : 'Perubahan transaksi tersimpan & saldo disinkronisasi!',
      'success'
    );
  }

  async function confirmExecuteDeleteTx() {
    if (!txToDelete) return;
    const tx = txToDelete;

    await deleteTransaction(undefined, tx.id);
    const [refreshedAccs, refreshedTxs, refreshedGoals, refreshedBills, refreshedDebts] = await Promise.all([
      fetchAccountsByLedger(undefined, activeLedgerIdState),
      fetchTransactionsByLedger(undefined, activeLedgerIdState),
      fetchGoalsByLedger(undefined, activeLedgerIdState),
      fetchBillsByLedger(undefined, activeLedgerIdState),
      fetchDebtsByLedger(undefined, activeLedgerIdState)
    ]);
    setAccounts(refreshedAccs);
    setTransactions(refreshedTxs);
    setGoals(refreshedGoals);
    setBills(refreshedBills);
    setDebts(refreshedDebts);

    // Jika modal detail target yang bersangkutan sedang terbuka, update tampilan secara realtime
    if (selectedGoalForDetail && (tx.goalId === selectedGoalForDetail.id || selectedGoalForDetail.id === tx.goalId)) {
      const updatedTarget = refreshedGoals.find(g => g.id === selectedGoalForDetail.id) || null;
      if (updatedTarget) setSelectedGoalForDetail(updatedTarget);
      const updatedHistory = await fetchGoalAllocationHistory(undefined, selectedGoalForDetail.id);
      setGoalAllocationHistory(updatedHistory);
    }

    // Jika modal detail tagihan sedang terbuka, update tampilan secara realtime
    if (selectedBillForDetail && tx.billId === selectedBillForDetail.id) {
      const updatedB = refreshedBills.find(b => b.id === selectedBillForDetail.id) || null;
      if (updatedB) setSelectedBillForDetail(updatedB);
    }

    // Jika modal detail utang sedang terbuka, update tampilan secara realtime
    if (selectedDebtForDetail && tx.debtId === selectedDebtForDetail.id) {
      const updatedD = refreshedDebts.find(d => d.id === selectedDebtForDetail.id) || null;
      if (updatedD) setSelectedDebtForDetail(updatedD);
    }

    setTxToDelete(null);

    if (tx.goalId) {
      showToast(
        `Alokasi target berhasil dihapus! Saldo kas dikembalikan (+${formatRupiah(tx.amount)}) dan dana target otomatis dikurangi.`,
        'success'
      );
    } else if (tx.billId) {
      showToast(
        `Pembayaran tagihan dibatalkan! Saldo dikembalikan (+${formatRupiah(tx.amount)}) dan tanggal jatuh tempo di-rollback ke periode sebelumnya.`,
        'success'
      );
    } else if (tx.debtId) {
      showToast(
        `Pembayaran cicilan dibatalkan! Saldo dikembalikan (+${formatRupiah(tx.amount)}), sisa utang dipulihkan, dan jatuh tempo di-rollback.`,
        'success'
      );
    } else {
      const rollbackText = tx.type === 'expense' 
        ? `Saldo dikembalikan (+${formatRupiah(tx.amount)})`
        : tx.type === 'income'
        ? `Saldo dikoreksi (-${formatRupiah(tx.amount)})`
        : 'Saldo transfer telah di-rollback';

      showToast(`Transaksi berhasil dihapus! ${rollbackText}`, 'success');
    }
  }

  // =========================================================================
  // TRANSFER ANTAR AKUN (DALAM SATU BUKU KAS)
  // =========================================================================

  async function handleExecuteTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (transferSource === transferDest) {
      showToast('Akun asal dan akun tujuan tidak boleh sama!', 'error');
      return;
    }
    const { result } = evaluateMathExpression(transferAmount);
    if (result <= 0) {
      showToast('Nominal transfer harus lebih dari 0!', 'error');
      return;
    }

    try {
      await executeAccountTransfer(undefined, {
        ledgerId: activeLedgerIdState,
        sourceAccountId: transferSource,
        destinationAccountId: transferDest,
        amount: result,
        note: transferNote,
        date: txDate
      });

      const refreshedAccs = await fetchAccountsByLedger(undefined, activeLedgerIdState);
      const refreshedTxs = await fetchTransactionsByLedger(undefined, activeLedgerIdState);
      setAccounts(refreshedAccs);
      setTransactions(refreshedTxs);

      setTransferAmount('');
      setTransferNote('');
      setActiveFormMode('transaction');
      setTransferNotice(null);
      showToast('Transfer saldo antar akun berhasil dieksekusi secara atomik!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal melakukan transfer.', 'error');
    }
  }

  function getAccountIcon(type: AccountType) {
    switch (type) {
      case 'bank': return <Landmark className="w-5 h-5" />;
      case 'ewallet': return <Smartphone className="w-5 h-5" />;
      case 'credit_card': return <CreditCard className="w-5 h-5" />;
      default: return <Wallet className="w-5 h-5" />;
    }
  }

  const filteredTransactions = transactions.filter(t => {
    if (txFilter === 'all') return true;
    return t.type === txFilter;
  });

  // =========================================================================
  // MODUL 2: HANDLER GOALS & SINKING FUNDS
  // =========================================================================

  function handleNewGoalTargetBlur() {
    if (!newGoalTarget) return;
    const { success, result, displayValue } = evaluateMathExpression(newGoalTarget);
    if (success && displayValue !== newGoalTarget) {
      setGoalCalcNotice(`Kalkulator: ${newGoalTarget} = ${formatRupiah(result)}`);
      setNewGoalTarget(displayValue);
      setTimeout(() => setGoalCalcNotice(null), 4000);
    }
  }

  function handleAllocAmountBlur() {
    if (!allocAmount) return;
    const { success, result, displayValue } = evaluateMathExpression(allocAmount);
    if (success && displayValue !== allocAmount) {
      setAllocCalcNotice(`Kalkulator: ${allocAmount} = ${formatRupiah(result)}`);
      setAllocAmount(displayValue);
      setTimeout(() => setAllocCalcNotice(null), 4000);
    }
  }

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!newGoalName.trim()) return;

    const { result: targetVal } = evaluateMathExpression(newGoalTarget);
    const { result: initVal } = evaluateMathExpression(newGoalInitial || '0');

    if (targetVal <= 0) {
      showToast('Nominal target harus lebih dari 0!', 'error');
      return;
    }

    const created = await createGoal(undefined, {
      ledgerId: activeLedgerIdState,
      name: newGoalName.trim(),
      type: newGoalType,
      targetAmount: targetVal,
      initialAmount: initVal,
      deadline: newGoalDeadline,
      sourceAccountId: newGoalType === 'sinking_fund' ? (newGoalSourceAccount || (accounts[0]?.id || '')) : undefined,
      colorAccent: newGoalColor,
      note: newGoalNote
    });

    const refreshedGoals = await fetchGoalsByLedger(undefined, activeLedgerIdState);
    setGoals(refreshedGoals);

    setIsAddGoalOpen(false);
    setNewGoalName('');
    setNewGoalTarget('5000000');
    setNewGoalInitial('0');
    setNewGoalDeadline('');
    setNewGoalNote('');
    setGoalCalcNotice(null);

    showToast(`Target "${created.name}" berhasil dibuat di ${currentLedger.name}!`, 'success');
  }

  async function openGoalDetailModal(goal: Goal) {
    setSelectedGoalForDetail(goal);
    setIsLoadingGoalHistory(true);
    try {
      const history = await fetchGoalAllocationHistory(undefined, goal.id);
      setGoalAllocationHistory(history);
    } catch (e) {
      console.warn('Gagal memuat riwayat target:', e);
      setGoalAllocationHistory([]);
    } finally {
      setIsLoadingGoalHistory(false);
    }
  }

  function openAllocateModal(goal: Goal) {
    setAllocatingGoal(goal);
    setAllocAmount('');
    const defaultSource = goal.sourceAccountId || (accounts.length > 0 ? accounts[0].id : '');
    setAllocSourceAccount(defaultSource);
    setAllocDate(new Date().toISOString().split('T')[0]);
    setAllocNote('');
    setAllocCalcNotice(null);
  }

  async function handleExecuteAllocation(e: React.FormEvent) {
    e.preventDefault();
    if (!allocatingGoal) return;

    const { result: allocVal } = evaluateMathExpression(allocAmount);
    if (allocVal <= 0) {
      showToast('Masukkan nominal alokasi yang valid (lebih dari 0)!', 'error');
      return;
    }

    if (allocatingGoal.type === 'sinking_fund' && !allocSourceAccount) {
      showToast('Pilih akun sumber dana untuk Sinking Fund!', 'error');
      return;
    }

    if (allocSourceAccount) {
      const srcAcc = accounts.find(a => a.id === allocSourceAccount);
      if (srcAcc && srcAcc.balance < allocVal) {
        showToast(`Saldo akun "${srcAcc.name}" tidak mencukupi (${formatRupiah(srcAcc.balance)})!`, 'error');
        return;
      }
    }

    try {
      await allocateFundsToGoal(undefined, {
        goalId: allocatingGoal.id,
        amount: allocVal,
        sourceAccountId: allocSourceAccount || undefined,
        date: allocDate,
        note: allocNote
      });

      const refreshedAccs = await fetchAccountsByLedger(undefined, activeLedgerIdState);
      const refreshedTxs = await fetchTransactionsByLedger(undefined, activeLedgerIdState);
      const refreshedGoals = await fetchGoalsByLedger(undefined, activeLedgerIdState);

      setAccounts(refreshedAccs);
      setTransactions(refreshedTxs);
      setGoals(refreshedGoals);

      // Sinkronkan modal detail jika target yang dialokasikan sedang dibuka
      if (selectedGoalForDetail && selectedGoalForDetail.id === allocatingGoal.id) {
        const updatedTarget = refreshedGoals.find(g => g.id === allocatingGoal.id) || null;
        setSelectedGoalForDetail(updatedTarget);
        const updatedHistory = await fetchGoalAllocationHistory(undefined, allocatingGoal.id);
        setGoalAllocationHistory(updatedHistory);
      }

      setAllocatingGoal(null);

      const isNowCompleted = (allocatingGoal.currentAmount + allocVal) >= allocatingGoal.targetAmount;
      if (isNowCompleted) {
        showToast(`🎉 Target "${allocatingGoal.name}" telah 100% TERCAPAI!`, 'success');
      } else {
        showToast(`Dana ${formatRupiah(allocVal)} dialokasikan ke "${allocatingGoal.name}"!`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal mengalokasikan dana.', 'error');
    }
  }

  function openEditGoalModal(goal: Goal) {
    setEditingGoal(goal);
    setEditGoalName(goal.name);
    setEditGoalType(goal.type);
    setEditGoalTarget(goal.targetAmount.toString());
    setEditGoalCurrent(goal.currentAmount.toString());
    setEditGoalDeadline(goal.deadline || '');
    setEditGoalSourceAccount(goal.sourceAccountId || (accounts[0]?.id || ''));
    setEditGoalColor(goal.colorAccent || '#d4bc82');
    setEditGoalNote(goal.note || '');
  }

  async function handleSaveEditedGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGoal || !editGoalName.trim()) return;

    const { result: targetVal } = evaluateMathExpression(editGoalTarget);
    const { result: currentVal } = evaluateMathExpression(editGoalCurrent);

    if (targetVal <= 0) {
      showToast('Nominal target harus lebih dari 0!', 'error');
      return;
    }

    const updated = await updateGoalData(undefined, editingGoal.id, {
      name: editGoalName.trim(),
      type: editGoalType,
      targetAmount: targetVal,
      currentAmount: currentVal,
      deadline: editGoalDeadline,
      sourceAccountId: editGoalType === 'sinking_fund' ? editGoalSourceAccount : undefined,
      colorAccent: editGoalColor,
      note: editGoalNote
    });

    const refreshedGoals = await fetchGoalsByLedger(undefined, activeLedgerIdState);
    setGoals(refreshedGoals);
    setEditingGoal(null);
    showToast(`Target "${updated.name}" berhasil diperbarui!`, 'success');
  }

  async function confirmExecuteDeleteGoal() {
    if (!goalToDelete) return;
    const name = goalToDelete.name;
    await deleteGoal(undefined, goalToDelete.id);

    const refreshedGoals = await fetchGoalsByLedger(undefined, activeLedgerIdState);
    setGoals(refreshedGoals);
    setGoalToDelete(null);
    showToast(`Target "${name}" telah dihapus.`, 'info');
  }

  const filteredGoals = goals.filter(g => {
    if (goalFilter === 'all') return true;
    if (goalFilter === 'sinking_fund') return g.type === 'sinking_fund';
    if (goalFilter === 'wishlist') return g.type === 'wishlist';
    if (goalFilter === 'completed') return g.isCompleted;
    return true;
  });

  const totalGoalsTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalGoalsSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const goalsOverallProgress = totalGoalsTarget > 0 ? Math.min(100, Math.round((totalGoalsSaved / totalGoalsTarget) * 100)) : 0;

  // =========================================================================
  // HANDLERS & LOGIKA MODUL 3: BILLS (TAGIHAN & LANGGANAN)
  // =========================================================================
  function handleBillAmountCalcChange(val: string) {
    setNewBillAmount(val);
    const { success, result } = evaluateMathExpression(val);
    if (success && !isNaN(result)) {
      setBillCalcNotice(`= ${formatRupiah(result)}`);
    } else {
      setBillCalcNotice(null);
    }
  }

  function handleBillLastNominalCalcChange(val: string) {
    setNewBillLastNominal(val);
    const { success, result } = evaluateMathExpression(val);
    if (success && !isNaN(result)) {
      setNewBillLastNominalCalcNotice(`= ${formatRupiah(result)}`);
    } else {
      setNewBillLastNominalCalcNotice(null);
    }
  }

  function handleEditBillLastNominalCalcChange(val: string) {
    setEditBillLastNominal(val);
    const { success, result } = evaluateMathExpression(val);
    if (success && !isNaN(result)) {
      setEditBillLastNominalCalcNotice(`= ${formatRupiah(result)}`);
    } else {
      setEditBillLastNominalCalcNotice(null);
    }
  }

  function handlePayBillAmountCalcChange(val: string) {
    setPayBillAmount(val);
    const { success, result } = evaluateMathExpression(val);
    if (success && !isNaN(result)) {
      setPayBillCalcNotice(`= ${formatRupiah(result)}`);
    } else {
      setPayBillCalcNotice(null);
    }
  }

  async function handleCreateBill(e: React.FormEvent) {
    e.preventDefault();
    if (!newBillName.trim() || !newBillNextDate) return;

    let fixedAmt: number | undefined = undefined;
    let lastNominalVal: number | undefined = undefined;

    if (newBillPricingType === 'fixed') {
      const { result } = evaluateMathExpression(newBillAmount);
      fixedAmt = Math.max(0, result || 0);
    } else {
      const { result } = evaluateMathExpression(newBillLastNominal);
      lastNominalVal = Math.max(0, result || 0);
    }

    const created = await createBill(undefined, {
      ledgerId: activeLedgerIdState,
      name: newBillName.trim(),
      cycle: newBillCycle,
      customIntervalCount: newBillCycle === 'custom' ? newBillCustomCount : undefined,
      customIntervalUnit: newBillCycle === 'custom' ? newBillCustomUnit : undefined,
      pricingType: newBillPricingType,
      fixedAmount: fixedAmt,
      lastNominal: lastNominalVal,
      nextPaymentDate: newBillNextDate,
      category: newBillCategory.trim() || 'Tagihan & Utilitas',
      sourceAccountId: newBillSourceAccount || (accounts[0]?.id || ''),
      colorAccent: newBillColor,
      note: newBillNote.trim()
    });

    setBills(prev => [created, ...prev]);
    setIsAddBillOpen(false);
    setNewBillName('');
    setNewBillNote('');
    setBillCalcNotice(null);
    setNewBillLastNominalCalcNotice(null);
    showToast(`Tagihan "${created.name}" berhasil ditambahkan!`, 'success');
  }

  function openEditBillModal(b: Bill) {
    setEditingBill(b);
    setEditBillName(b.name);
    setEditBillCycle(b.cycle);
    setEditBillCustomCount(b.customIntervalCount || 10);
    setEditBillCustomUnit(b.customIntervalUnit || 'days');
    setEditBillPricingType(b.pricingType);
    setEditBillAmount(b.fixedAmount ? String(b.fixedAmount) : '');
    setEditBillLastNominal(b.lastNominal !== undefined ? String(b.lastNominal) : '');
    setEditBillLastNominalCalcNotice(null);
    setEditBillNextDate(b.nextPaymentDate);
    setEditBillCategory(b.category || 'Tagihan & Utilitas');
    setEditBillSourceAccount(b.sourceAccountId || accounts[0]?.id || '');
    setEditBillColor(b.colorAccent || '#7a9eb3');
    setEditBillNote(b.note || '');
  }

  async function handleSaveEditedBill(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBill || !editBillName.trim() || !editBillNextDate) return;

    let fixedAmt: number | undefined = undefined;
    let lastNominalVal: number | undefined = undefined;

    if (editBillPricingType === 'fixed') {
      const { result } = evaluateMathExpression(editBillAmount);
      fixedAmt = Math.max(0, result || 0);
    } else {
      const { result } = evaluateMathExpression(editBillLastNominal);
      lastNominalVal = Math.max(0, result || 0);
    }

    const updated = await updateBill(undefined, editingBill.id, {
      name: editBillName.trim(),
      cycle: editBillCycle,
      customIntervalCount: editBillCycle === 'custom' ? editBillCustomCount : undefined,
      customIntervalUnit: editBillCycle === 'custom' ? editBillCustomUnit : undefined,
      pricingType: editBillPricingType,
      fixedAmount: fixedAmt,
      lastNominal: lastNominalVal,
      nextPaymentDate: editBillNextDate,
      category: editBillCategory.trim(),
      sourceAccountId: editBillSourceAccount,
      colorAccent: editBillColor,
      note: editBillNote.trim()
    });

    setBills(prev => prev.map(b => b.id === updated.id ? updated : b));
    if (selectedBillForDetail && selectedBillForDetail.id === updated.id) {
      setSelectedBillForDetail(updated);
    }
    setEditingBill(null);
    showToast(`Tagihan "${updated.name}" berhasil diperbarui!`, 'success');
  }

  async function confirmExecuteDeleteBill() {
    if (!billToDelete) return;
    const name = billToDelete.name;
    await deleteBill(undefined, billToDelete.id);
    setBills(prev => prev.filter(b => b.id !== billToDelete.id));
    if (selectedBillForDetail && selectedBillForDetail.id === billToDelete.id) {
      setSelectedBillForDetail(null);
    }
    setBillToDelete(null);
    showToast(`Tagihan "${name}" berhasil dihapus.`, 'info');
  }

  function openPayBillModal(b: Bill) {
    setPayingBill(b);
    setPayBillAmount(b.pricingType === 'fixed' && b.fixedAmount ? String(b.fixedAmount) : (b.lastNominal ? String(b.lastNominal) : ''));
    setPayBillSourceAccount(b.sourceAccountId || accounts[0]?.id || '');
    setPayBillDate(new Date().toISOString().split('T')[0]);
    const cycleText = getCycleLabel(b.cycle, b.customIntervalCount, b.customIntervalUnit);
    setPayBillNote(`Pembayaran tagihan ${b.name} (${cycleText})`);
    setPayBillCalcNotice(null);
  }

  async function handleExecutePayBill(e: React.FormEvent) {
    e.preventDefault();
    if (!payingBill) return;

    let payAmount = 0;
    if (payingBill.pricingType === 'fixed') {
      payAmount = payingBill.fixedAmount || 0;
      if (payBillAmount.trim()) {
        const { result } = evaluateMathExpression(payBillAmount);
        if (result > 0) payAmount = result;
      }
    } else {
      const { result } = evaluateMathExpression(payBillAmount);
      payAmount = result;
    }

    if (payAmount <= 0) {
      showToast('Masukkan nominal pembayaran yang valid (lebih dari 0).', 'error');
      return;
    }

    if (!payBillSourceAccount) {
      showToast('Pilih akun kas sumber dana terlebih dahulu.', 'error');
      return;
    }

    try {
      const result = await payBill(undefined, {
        billId: payingBill.id,
        amount: payAmount,
        sourceAccountId: payBillSourceAccount,
        date: payBillDate,
        note: payBillNote
      });

      setBills(prev => prev.map(b => b.id === result.bill.id ? result.bill : b));
      if (selectedBillForDetail && selectedBillForDetail.id === result.bill.id) {
        setSelectedBillForDetail(result.bill);
      }
      setAccounts(prev => prev.map(a => a.id === result.updatedAccount.id ? result.updatedAccount : a));
      setTransactions(prev => [result.transaction, ...prev]);

      setPayingBill(null);
      showToast(`Tagihan "${result.bill.name}" dibayar! Jatuh tempo baru: ${result.bill.nextPaymentDate}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal memproses pembayaran tagihan.', 'error');
    }
  }

  // =========================================================================
  // HANDLERS & LOGIKA MODUL 3: DEBTS (UTANG & CICILAN)
  // =========================================================================
  function handleDebtTotalCalcChange(val: string) {
    setNewDebtTotal(val);
    const { success, result } = evaluateMathExpression(val);
    if (success && !isNaN(result)) {
      setDebtCalcNotice(`= ${formatRupiah(result)}`);
      setNewDebtRemaining(String(result));
    } else {
      setDebtCalcNotice(null);
    }
  }

  function handlePayDebtAmountCalcChange(val: string) {
    setPayDebtAmount(val);
    const { success, result } = evaluateMathExpression(val);
    if (success && !isNaN(result)) {
      setPayDebtCalcNotice(`= ${formatRupiah(result)}`);
    } else {
      setPayDebtCalcNotice(null);
    }
  }

  async function handleCreateDebt(e: React.FormEvent) {
    e.preventDefault();
    if (!newDebtName.trim() || !newDebtNextDate) {
      showToast('Nama utang dan tanggal jatuh tempo berikutnya wajib diisi.', 'error');
      return;
    }

    const { result: totalVal } = evaluateMathExpression(newDebtTotal);
    const { result: remainVal } = evaluateMathExpression(newDebtRemaining || newDebtTotal);

    if (totalVal <= 0) {
      showToast('Total nominal utang harus lebih besar dari 0.', 'error');
      return;
    }

    const created = await createDebt(undefined, {
      ledgerId: activeLedgerIdState,
      name: newDebtName.trim(),
      lender: newDebtLender.trim(),
      totalDebt: totalVal,
      remainingDebt: Math.max(0, remainVal !== undefined ? remainVal : totalVal),
      nextPaymentDate: newDebtNextDate,
      cycle: newDebtCycle,
      customIntervalCount: newDebtCycle === 'custom' ? newDebtCustomCount : undefined,
      customIntervalUnit: newDebtCycle === 'custom' ? newDebtCustomUnit : undefined,
      dueDate: newDebtDueDate,
      colorAccent: newDebtColor,
      note: newDebtNote.trim()
    });

    setDebts(prev => [created, ...prev]);
    setIsAddDebtOpen(false);
    setNewDebtName('');
    setNewDebtLender('');
    setNewDebtNote('');
    setDebtCalcNotice(null);
    showToast(`Utang "${created.name}" berhasil dicatat!`, 'success');
  }

  function openEditDebtModal(d: Debt) {
    setEditingDebt(d);
    setEditDebtName(d.name);
    setEditDebtLender(d.lender || '');
    setEditDebtTotal(String(d.totalDebt));
    setEditDebtRemaining(String(d.remainingDebt));
    setEditDebtNextDate(d.nextPaymentDate || '');
    setEditDebtCycle(d.cycle || 'monthly');
    setEditDebtCustomCount(d.customIntervalCount || 10);
    setEditDebtCustomUnit(d.customIntervalUnit || 'days');
    setEditDebtDueDate(d.dueDate || '');
    setEditDebtColor(d.colorAccent || '#c88265');
    setEditDebtNote(d.note || '');
  }

  async function handleSaveEditedDebt(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDebt || !editDebtName.trim()) return;

    const { result: totalVal } = evaluateMathExpression(editDebtTotal);
    const { result: remainVal } = evaluateMathExpression(editDebtRemaining);

    const updated = await updateDebt(undefined, editingDebt.id, {
      name: editDebtName.trim(),
      lender: editDebtLender.trim(),
      totalDebt: Math.max(1, totalVal || 0),
      remainingDebt: Math.max(0, remainVal || 0),
      nextPaymentDate: editDebtNextDate,
      cycle: editDebtCycle,
      customIntervalCount: editDebtCycle === 'custom' ? editDebtCustomCount : undefined,
      customIntervalUnit: editDebtCycle === 'custom' ? editDebtCustomUnit : undefined,
      dueDate: editDebtDueDate,
      colorAccent: editDebtColor,
      note: editDebtNote.trim()
    });

    setDebts(prev => prev.map(d => d.id === updated.id ? updated : d));
    if (selectedDebtForDetail && selectedDebtForDetail.id === updated.id) {
      setSelectedDebtForDetail(updated);
    }
    setEditingDebt(null);
    showToast(`Data utang "${updated.name}" berhasil diperbarui!`, 'success');
  }

  async function confirmExecuteDeleteDebt() {
    if (!debtToDelete) return;
    const name = debtToDelete.name;
    await deleteDebt(undefined, debtToDelete.id);
    setDebts(prev => prev.filter(d => d.id !== debtToDelete.id));
    if (selectedDebtForDetail && selectedDebtForDetail.id === debtToDelete.id) {
      setSelectedDebtForDetail(null);
    }
    setDebtToDelete(null);
    showToast(`Utang "${name}" berhasil dihapus.`, 'info');
  }

  function openPayDebtModal(d: Debt) {
    setPayingDebt(d);
    setPayDebtAmount('');
    setPayDebtSourceAccount(accounts[0]?.id || '');
    setPayDebtDate(new Date().toISOString().split('T')[0]);
    const cycleText = getCycleLabel(d.cycle, d.customIntervalCount, d.customIntervalUnit);
    setPayDebtNote(`Cicilan utang: ${d.name} (${d.lender || 'Pinjaman'} • ${cycleText})`);
    setPayDebtCalcNotice(null);
  }

  async function handleExecutePayDebt(e: React.FormEvent) {
    e.preventDefault();
    if (!payingDebt) return;

    const { result: payAmt } = evaluateMathExpression(payDebtAmount);
    if (payAmt <= 0) {
      showToast('Masukkan nominal cicilan yang valid (lebih dari 0).', 'error');
      return;
    }

    if (!payDebtSourceAccount) {
      showToast('Pilih akun kas sumber dana terlebih dahulu.', 'error');
      return;
    }

    try {
      const result = await payDebtInstallment(undefined, {
        debtId: payingDebt.id,
        amount: payAmt,
        sourceAccountId: payDebtSourceAccount,
        date: payDebtDate,
        note: payDebtNote
      });

      setDebts(prev => prev.map(d => d.id === result.debt.id ? result.debt : d));
      if (selectedDebtForDetail && selectedDebtForDetail.id === result.debt.id) {
        setSelectedDebtForDetail(result.debt);
      }
      setAccounts(prev => prev.map(a => a.id === result.updatedAccount.id ? result.updatedAccount : a));
      setTransactions(prev => [result.transaction, ...prev]);

      setPayingDebt(null);
      if (result.debt.isPaidOff) {
        showToast(`Selamat! Utang "${result.debt.name}" telah LUNAS sepenuhnya 🎉`, 'success');
      } else {
        const nextDateMsg = result.debt.nextPaymentDate ? ` Jatuh tempo baru: ${result.debt.nextPaymentDate}` : '';
        showToast(`Cicilan "${result.debt.name}" dibayar ${formatRupiah(payAmt)}. Sisa utang: ${formatRupiah(result.debt.remainingDebt)}.${nextDateMsg}`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memproses pembayaran cicilan utang.', 'error');
    }
  }

  // Filtered lists Modul 3
  const filteredBills = bills.filter(b => {
    if (billFilter === 'all') return true;
    if (billFilter === 'monthly') return b.cycle === 'monthly';
    if (billFilter === 'yearly') return b.cycle === 'yearly';
    if (billFilter === 'overdue') {
      const s = getBillDueStatus(b.nextPaymentDate);
      return s.isOverdue || s.isToday || (s.daysLeft > 0 && s.daysLeft <= 3);
    }
    return true;
  });

  const filteredDebts = debts.filter(d => {
    if (debtFilter === 'all') return true;
    if (debtFilter === 'active') return !d.isPaidOff;
    if (debtFilter === 'paid_off') return d.isPaidOff;
    return true;
  });

  // Metrik Modul 3
  const totalRemainingDebt = debts.reduce((sum, d) => sum + (d.remainingDebt || 0), 0);
  const totalOriginalDebt = debts.reduce((sum, d) => sum + (d.totalDebt || 0), 0);
  const debtPayoffProgress = totalOriginalDebt > 0 ? Math.min(100, Math.round(((totalOriginalDebt - totalRemainingDebt) / totalOriginalDebt) * 100)) : 100;
  
  const monthlyFixedBills = bills.filter(b => b.pricingType === 'fixed' && b.cycle === 'monthly').reduce((sum, b) => sum + (b.fixedAmount || 0), 0);
  const yearlyFixedBillsMonthly = bills.filter(b => b.pricingType === 'fixed' && b.cycle === 'yearly').reduce((sum, b) => sum + Math.round((b.fixedAmount || 0) / 12), 0);
  const estimatedMonthlyBills = monthlyFixedBills + yearlyFixedBillsMonthly;
  const variableBillsCount = bills.filter(b => b.pricingType === 'variable').length;
  const totalBillsPaid = bills.reduce((sum, b) => sum + (b.totalPaid || 0), 0);
  const urgentBillsCount = bills.filter(b => {
    const s = getBillDueStatus(b.nextPaymentDate);
    return s.isOverdue || s.isToday;
  }).length;

  // =========================================================================
  // HANDLERS & LOGIKA MODUL 4: OTOMATISASI TRANSAKSI
  // =========================================================================

  function handleAutoAmountCalcChange(val: string) {
    setNewAutoAmount(val);
    const { success, result, displayValue } = evaluateMathExpression(val);
    if (success && displayValue !== val.trim()) {
      setAutoCalcNotice(`= ${formatRupiah(result)}`);
    } else {
      setAutoCalcNotice(null);
    }
  }

  function handleEditAutoAmountCalcChange(val: string) {
    setEditAutoAmount(val);
    const { success, result, displayValue } = evaluateMathExpression(val);
    if (success && displayValue !== val.trim()) {
      setEditAutoCalcNotice(`= ${formatRupiah(result)}`);
    } else {
      setEditAutoCalcNotice(null);
    }
  }

  async function handleCreateAutomation(e: React.FormEvent) {
    e.preventDefault();
    if (!newAutoName.trim()) {
      showToast('Nama aturan otomatis wajib diisi.', 'error');
      return;
    }
    const { success, result } = evaluateMathExpression(newAutoAmount);
    const finalAmt = success ? result : parseInt(newAutoAmount.replace(/[^\d]/g, '') || '0', 10);
    if (finalAmt <= 0) {
      showToast('Nominal transaksi harus lebih dari 0.', 'error');
      return;
    }
    if (!newAutoSourceAccount) {
      showToast('Pilih akun kas sumber dana terlebih dahulu.', 'error');
      return;
    }
    if (newAutoType === 'transfer' && !newAutoToAccount) {
      showToast('Pilih akun kas tujuan untuk transfer otomatis.', 'error');
      return;
    }
    if (newAutoType === 'transfer' && newAutoSourceAccount === newAutoToAccount) {
      showToast('Akun sumber dan akun tujuan transfer tidak boleh sama.', 'error');
      return;
    }

    try {
      const created = await createAutomation(undefined, {
        ledgerId: activeLedgerIdState,
        name: newAutoName,
        type: newAutoType,
        amount: finalAmt,
        category: newAutoCategory,
        sourceAccountId: newAutoSourceAccount,
        toAccountId: newAutoType === 'transfer' ? newAutoToAccount : null,
        cycle: newAutoCycle,
        monthlyDay: newAutoCycle === 'monthly' ? newAutoMonthlyDay : undefined,
        customIntervalCount: newAutoCustomCount,
        customIntervalUnit: newAutoCustomUnit,
        nextRunDate: newAutoNextDate,
        colorAccent: newAutoColor,
        note: newAutoNote
      });

      setAutomations(prev => [created, ...prev]);
      setIsAddAutomationOpen(false);
      // Reset form
      setNewAutoName('');
      setNewAutoAmount('5000000');
      setAutoCalcNotice(null);
      setNewAutoNote('');
      showToast(`Aturan otomatis "${created.name}" berhasil dibuat!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan aturan otomatis.', 'error');
    }
  }

  function openEditAutomationModal(rule: AutomationRule, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditingAutomation(rule);
    setEditAutoName(rule.name);
    setEditAutoType(rule.type);
    setEditAutoCategory(rule.category || '');
    setEditAutoAmount(String(rule.amount));
    setEditAutoSourceAccount(rule.sourceAccountId);
    setEditAutoToAccount(rule.toAccountId || '');
    setEditAutoCycle(rule.cycle);
    setEditAutoMonthlyDay(rule.monthlyDay || 25);
    setEditAutoCustomCount(rule.customIntervalCount || 1);
    setEditAutoCustomUnit(rule.customIntervalUnit || 'months');
    setEditAutoNextDate(rule.nextRunDate);
    setEditAutoColor(rule.colorAccent || '#8fa892');
    setEditAutoNote(rule.note || '');
    setEditAutoCalcNotice(null);
  }

  async function handleSaveEditedAutomation(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAutomation) return;
    if (!editAutoName.trim()) {
      showToast('Nama aturan otomatis wajib diisi.', 'error');
      return;
    }
    const { success, result } = evaluateMathExpression(editAutoAmount);
    const finalAmt = success ? result : parseInt(editAutoAmount.replace(/[^\d]/g, '') || '0', 10);
    if (finalAmt <= 0) {
      showToast('Nominal transaksi harus lebih dari 0.', 'error');
      return;
    }
    if (!editAutoSourceAccount) {
      showToast('Pilih akun kas sumber terlebih dahulu.', 'error');
      return;
    }
    if (editAutoType === 'transfer' && !editAutoToAccount) {
      showToast('Pilih akun tujuan untuk transfer otomatis.', 'error');
      return;
    }
    if (editAutoType === 'transfer' && editAutoSourceAccount === editAutoToAccount) {
      showToast('Akun sumber dan akun tujuan tidak boleh sama.', 'error');
      return;
    }

    try {
      const updated = await updateAutomation(undefined, editingAutomation.id, {
        name: editAutoName.trim(),
        type: editAutoType,
        amount: finalAmt,
        category: editAutoCategory.trim() || undefined,
        sourceAccountId: editAutoSourceAccount,
        toAccountId: editAutoType === 'transfer' ? editAutoToAccount : null,
        cycle: editAutoCycle,
        monthlyDay: editAutoCycle === 'monthly' ? editAutoMonthlyDay : undefined,
        customIntervalCount: editAutoCustomCount,
        customIntervalUnit: editAutoCustomUnit,
        nextRunDate: editAutoNextDate,
        colorAccent: editAutoColor,
        note: editAutoNote.trim()
      });

      setAutomations(prev => prev.map(a => a.id === updated.id ? updated : a));
      if (selectedAutomationForDetail && selectedAutomationForDetail.id === updated.id) {
        setSelectedAutomationForDetail(updated);
      }
      setEditingAutomation(null);
      showToast(`Perubahan aturan "${updated.name}" berhasil disimpan!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan perubahan aturan otomatis.', 'error');
    }
  }

  async function handleToggleAutomation(ruleId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      const toggled = await toggleAutomationActive(undefined, ruleId);
      setAutomations(prev => prev.map(a => a.id === toggled.id ? toggled : a));
      if (selectedAutomationForDetail && selectedAutomationForDetail.id === toggled.id) {
        setSelectedAutomationForDetail(toggled);
      }
      showToast(
        toggled.isActive 
          ? `Aturan "${toggled.name}" telah DIAKTIFKAN.` 
          : `Aturan "${toggled.name}" telah DINONAKTIFKAN.`,
        'info'
      );
    } catch (err: any) {
      showToast(err.message || 'Gagal mengubah status aturan.', 'error');
    }
  }

  function promptDeleteAutomation(rule: AutomationRule, e?: React.MouseEvent) {
    e?.stopPropagation();
    setAutomationToDelete(rule);
  }

  async function confirmExecuteDeleteAutomation() {
    if (!automationToDelete) return;
    try {
      await deleteAutomation(undefined, automationToDelete.id);
      setAutomations(prev => prev.filter(a => a.id !== automationToDelete.id));
      if (selectedAutomationForDetail && selectedAutomationForDetail.id === automationToDelete.id) {
        setSelectedAutomationForDetail(null);
      }
      showToast(`Aturan otomatis "${automationToDelete.name}" berhasil dihapus.`, 'info');
      setAutomationToDelete(null);
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus aturan otomatis.', 'error');
    }
  }

  async function handleManualExecuteAutomation(rule: AutomationRule, e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      const result = await executeSingleAutomation(undefined, rule.id);
      setAutomations(prev => prev.map(a => a.id === result.rule.id ? result.rule : a));
      if (selectedAutomationForDetail && selectedAutomationForDetail.id === result.rule.id) {
        setSelectedAutomationForDetail(result.rule);
      }
      // Update accounts and transactions in state
      setAccounts(prev => {
        const map = new Map(prev.map(a => [a.id, a]));
        result.updatedAccounts.forEach(ua => map.set(ua.id, ua));
        return Array.from(map.values());
      });
      setTransactions(prev => [result.transaction, ...prev]);

      showToast(`⚡ Aturan "${rule.name}" berhasil dieksekusi sekarang!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengeksekusi aturan otomatis.', 'error');
    }
  }

  async function handleRunCronManual() {
    setIsExecutingCron(true);
    try {
      const res = await checkAndRunAutomations(undefined, activeLedgerIdState);
      if (res.executedCount > 0) {
        showToast(`${res.executedCount} Transaksi Otomatis Berhasil Dieksekusi`, 'success');
        const [freshAccs, freshTxs, freshAutos] = await Promise.all([
          fetchAccountsByLedger(undefined, activeLedgerIdState),
          fetchTransactionsByLedger(undefined, activeLedgerIdState),
          fetchAutomations(undefined, activeLedgerIdState)
        ]);
        setAccounts(freshAccs);
        setTransactions(freshTxs);
        setAutomations(freshAutos);
      } else {
        showToast('Semua aturan otomatisasi sudah mutakhir (tidak ada yang jatuh tempo hari ini).', 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memeriksa otomatisasi.', 'error');
    } finally {
      setIsExecutingCron(false);
    }
  }

  // Filtered automations & Metrik Modul 4
  const filteredAutomations = automations.filter(a => {
    if (automationFilter === 'all') return true;
    if (automationFilter === 'active') return a.isActive;
    if (automationFilter === 'income') return a.type === 'income';
    if (automationFilter === 'expense') return a.type === 'expense';
    if (automationFilter === 'transfer') return a.type === 'transfer';
    return true;
  });

  const activeAutomationsCount = automations.filter(a => a.isActive).length;
  const estimatedMonthlyAutoIncome = automations
    .filter(a => a.isActive && a.type === 'income')
    .reduce((sum, a) => sum + (a.amount || 0), 0);
  const estimatedMonthlyAutoExpense = automations
    .filter(a => a.isActive && a.type === 'expense')
    .reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalAutomationExecutions = automations.reduce((sum, a) => sum + (a.executionCount || 0), 0);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col font-sans md:pl-[var(--sidebar-w)] transition-[padding] duration-150">
      <AppNav active={activeModule} onNavigate={setActiveModule} />
      
      {/* Toast Notification Banner (Floating di Atas Layar) */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className={`brutal-card p-3.5 flex items-center gap-3 shadow-[var(--shadow-lg)] ${
            toastMessage.type === 'success' 
              ? 'bg-[var(--accent-sage-dark)] border-[var(--accent-sage)] text-white' 
              : toastMessage.type === 'error'
              ? 'bg-[var(--accent-terracotta-dark)] border-[var(--accent-terracotta)] text-white'
              : 'bg-[var(--bg-elevated)] border-[var(--border-color)] text-white'
          }`}>
            {toastMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[var(--accent-sage-light)] shrink-0" />}
            {toastMessage.type === 'error' && <AlertTriangle className="w-5 h-5 text-[var(--accent-terracotta-light)] shrink-0" />}
            {toastMessage.type === 'info' && <Info className="w-5 h-5 text-[var(--accent-blue-light)] shrink-0" />}
            <p className="text-xs sm:text-sm font-heading font-semibold flex-1">{toastMessage.text}</p>
            <button onClick={() => setToastMessage(null)} className="p-1 hover:opacity-75">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. TOP HEADER DENGAN ACTIVE LEDGER SWITCHER (DROPDOWN BUKU KAS)       */}
      {/* ===================================================================== */}
      {/* ===================================================================== */}
      {/* 1. TOP STICKY HEADER & NAVIGATION BAR (UNIFIED NEO-BRUTALISME)         */}
      {/* Menyatukan Header dan Navigasi agar tidak tumpang tindih atau terpotong */}
      {/* ===================================================================== */}
      <div className="sticky top-0 z-30 bg-[var(--bg-surface)] border-b-[2.5px] border-[var(--border-color)] shadow-[0_3px_0px_#000]">
        
        {/* 1A. Top Header Bar */}
        <header className="border-b border-[var(--border-subtle)] px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            
            {/* Logo & Dropdown Buku Kas Aktif */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[var(--accent-sage)] text-[var(--text-inverted)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] flex items-center justify-center font-heading font-bold text-xl shrink-0 md:hidden">
                A
              </div>

              <div className="flex items-center gap-2.5">
                <span className="font-heading font-bold text-base sm:text-lg tracking-tight md:hidden">ARTHA</span>
                
                {/* ACTIVE LEDGER SWITCHER DROPDOWN (GAYA NEO-BRUTALISME) */}
                <div className="relative" ref={ledgerDropdownRef}>
                  <button 
                    id="ledger-switcher-btn"
                    type="button"
                    onClick={() => setIsLedgerDropdownOpen(!isLedgerDropdownOpen)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] text-xs font-heading font-bold text-white transition-all active:translate-x-0.5 active:translate-y-0.5"
                    style={{ borderLeftColor: currentLedger.colorAccent || 'var(--accent-sage)', borderLeftWidth: '5px' }}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[var(--accent-sand)] shrink-0" />
                    <span className="truncate max-w-[130px] sm:max-w-[160px]">{currentLedger.name}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  </button>

                  {/* Dropdown Menu Retro Card */}
                  {isLedgerDropdownOpen && (
                    <div 
                      id="ledger-dropdown-menu" 
                      className="absolute left-0 top-full mt-2 w-80 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-2.5 z-50 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150"
                    >
                      <div className="px-2 py-1 border-b border-[var(--border-subtle)] flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] font-bold">Pilih Buku Kas Aktif</span>
                        <span className="text-[10px] font-mono text-[var(--accent-sand)]">{ledgers.length} Buku</span>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
                        {ledgers.map(l => {
                          const isActive = l.id === activeLedgerIdState;
                          return (
                            <div
                              key={l.id}
                              className={`w-full p-2 rounded-[var(--radius-sm)] border transition-all flex items-center justify-between gap-2 ${
                                isActive 
                                  ? 'bg-[var(--bg-elevated)] border-white shadow-[2px_2px_0px_#000]' 
                                  : 'border-transparent hover:bg-[var(--bg-elevated)] hover:border-[var(--border-subtle)] text-[var(--text-secondary)]'
                              }`}
                            >
                              {/* Area Klik untuk Mengaktifkan Buku Kas */}
                              <button
                                type="button"
                                onClick={() => handleSwitchLedger(l.id)}
                                className="flex-1 text-left min-w-0 flex items-start gap-2 focus:outline-none"
                              >
                                <span 
                                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" 
                                  style={{ backgroundColor: l.colorAccent || '#8fa892' }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-heading font-bold text-xs text-white truncate">{l.name}</p>
                                    {isActive && <Check className="w-3.5 h-3.5 text-[var(--accent-sage)] shrink-0" />}
                                  </div>
                                  {l.description ? (
                                    <p className="text-[10px] text-[var(--text-muted)] truncate">{l.description}</p>
                                  ) : (
                                    <p className="text-[9px] text-[var(--text-muted)] font-mono italic">Tanpa deskripsi</p>
                                  )}
                                </div>
                              </button>

                              {/* Tombol Aksi per Buku Kas: Edit & Hapus */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => openEditLedgerModal(l, e)}
                                  className="p-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded text-[var(--text-secondary)] hover:text-white transition-colors"
                                  title={`Edit nama & warna ${l.name}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                {ledgers.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => promptDeleteLedger(l, e)}
                                    className="p-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded text-[var(--text-secondary)] hover:text-[var(--accent-terracotta)] transition-colors"
                                    title={`Hapus buku kas ${l.name}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="pt-2 border-t border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={() => { setIsLedgerDropdownOpen(false); setIsAddLedgerOpen(true); }}
                          className="w-full brutal-btn brutal-btn-sand text-xs py-1.5 flex items-center justify-center gap-1.5"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          <span>+ Buat Buku Kas Baru</span>
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>

          {/* Action Buttons Top Header (Tergantung Modul yang Aktif) */}
          <div className="flex items-center gap-2 shrink-0">
            <HeaderTools />
            {/* Saat Modul 1 Aktif: Sembunyikan semua tombol pembuatan modul lain */}

            {/* Saat Modul 2 Aktif: Tampilkan HANYA tombol "+ Buat Target Baru" */}
            {/* Saat Modul 2 Aktif: Tampilkan HANYA tombol "Target Baru" */}
            {activeModule === 'module2' && (
              <button
                id="header-btn-add-goal"
                type="button"
                onClick={() => setIsAddGoalOpen(true)}
                className="brutal-btn brutal-btn-sand text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-[2px_2px_0px_#000] animate-in fade-in duration-150 font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Target Baru</span>
              </button>
            )}

            {/* Saat Modul 3 Aktif: Tampilkan HANYA tombol "Tagihan Baru" dan "Catat Utang" */}
            {activeModule === 'module3' && (
              <div id="header-modul-3-actions" className="flex items-center gap-2 animate-in fade-in duration-150">
                <button
                  id="header-btn-add-bill"
                  type="button"
                  onClick={() => setIsAddBillOpen(true)}
                  className="brutal-btn brutal-btn-blue text-xs py-1.5 px-2.5 sm:px-3 flex items-center gap-1.5 shadow-[2px_2px_0px_#000] font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tagihan Baru</span>
                </button>
                <button
                  id="header-btn-add-debt"
                  type="button"
                  onClick={() => setIsAddDebtOpen(true)}
                  className="brutal-btn brutal-btn-terracotta text-xs py-1.5 px-2.5 sm:px-3 flex items-center gap-1.5 shadow-[2px_2px_0px_#000] font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Catat Utang</span>
                </button>
              </div>
            )}

            {/* Saat Modul 4 Aktif: Tampilkan HANYA tombol "Aturan Baru" */}
            {activeModule === 'module4' && (
              <button
                id="header-btn-add-automation"
                type="button"
                onClick={() => setIsAddAutomationOpen(true)}
                className="brutal-btn brutal-btn-sand text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-[2px_2px_0px_#000] animate-in fade-in duration-150 font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Aturan Baru</span>
              </button>
            )}

            {/* Saat Modul 6 Aktif: Tampilkan Tombol "Komponen Gaji (Bonus/THR)" */}
            {activeModule === 'module6' && (
              <button
                id="header-btn-add-salary-addon"
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-salary-addon-modal'));
                }}
                className="brutal-btn brutal-btn-sand text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-[2px_2px_0px_#000] animate-in fade-in duration-150 font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Komponen Gaji (Bonus/THR)</span>
              </button>
            )}
          </div>

        </div>
      </header>

    </div>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-7 pb-24">
        
        {/* =================================================================== */}
        {/* KONTEN MODUL 1: KAS & TRANSAKSI                                     */}
        {/* =================================================================== */}
        <div id="container-settings" className={activeModule === 'settings' ? 'space-y-7' : 'hidden'}>
          <SettingsPage categories={categories} />
        </div>

        <div id="container-dashboard" className={activeModule === 'dashboard' ? 'space-y-7' : 'hidden'}>
          <DashboardPage
            ledgerName={currentLedger.name}
            accounts={accounts}
            transactions={transactions}
            goals={goals}
            bills={bills}
            debts={debts}
            onNavigate={setActiveModule}
          />
        </div>

        <div id="container-modul-1" className={activeModule === 'module1' ? 'space-y-7' : 'hidden'}>
          
          {/* RINGKASAN SALDO KHUSUS BUKU KAS AKTIF (TOTAL SALDO / ASET / TAGIHAN)*/}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-sage)] space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Total Saldo Bersih</p>
              <span className="brutal-badge text-[9px]">{currentLedger.name}</span>
            </div>
            <p id="total-balance-display" className="text-3xl font-mono font-bold text-white tracking-tight">
              {formatRupiah(totals.netBalance)}
            </p>
            <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
              (Total Aset Kas - Tagihan Kredit di Buku Ini)
            </p>
          </div>

          <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-blue)] space-y-1">
            <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Total Aset Kas & Bank</p>
            <p id="total-assets-display" className="text-3xl font-mono font-bold text-[var(--accent-blue-light)] tracking-tight">
              {formatRupiah(totals.totalAssets)}
            </p>
            <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
              Dari {accounts.filter(a => a.type !== 'credit_card').length} akun di buku kas ini
            </p>
          </div>

          <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-terracotta)] space-y-1">
            <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Tagihan Kartu Kredit</p>
            <p id="total-debt-display" className="text-3xl font-mono font-bold text-[var(--accent-terracotta-light)] tracking-tight">
              {formatRupiah(totals.totalCreditDebt)}
            </p>
            <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
              Kewajiban pelunasan berjalan
            </p>
          </div>
        </section>

        {/* =================================================================== */}
        {/* DAFTAR AKUN (ACCOUNTS BY ACTIVE LEDGER)                             */}
        {/* =================================================================== */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[var(--accent-sage)]" />
              <h2 className="font-heading font-bold text-lg text-white">
                Daftar Akun: {currentLedger.name}
              </h2>
            </div>
            <button 
              onClick={() => setIsAddAccountOpen(true)}
              className="text-xs font-mono text-[var(--accent-sage)] hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Akun ke Buku Ini
            </button>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)] animate-pulse">
              Memuat akun untuk {currentLedger.name}...
            </div>
          ) : accounts.length === 0 ? (
            <div className="brutal-card p-8 text-center space-y-3 bg-[var(--bg-surface)]">
              <p className="font-heading text-sm text-[var(--text-secondary)]">
                Belum ada akun di Buku Kas "{currentLedger.name}"
              </p>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                Buat akun simpanan (Bank, Dompet Tunai, E-Wallet) khusus untuk buku kas ini.
              </p>
              <button
                type="button"
                onClick={() => setIsAddAccountOpen(true)}
                className="brutal-btn brutal-btn-sage text-xs inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Buat Akun Pertama di Buku Ini</span>
              </button>
            </div>
          ) : (
            <div id="accounts-list-container" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {accounts.map(acc => {
                const isCredit = acc.type === 'credit_card';
                return (
                  <div 
                    key={acc.id}
                    className="brutal-card p-4 space-y-3 bg-[var(--bg-surface)] group"
                    style={{ borderTopColor: acc.colorAccent || 'var(--border-color)', borderTopWidth: '5px' }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-8 h-8 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] shadow-[1px_1px_0px_#000] flex items-center justify-center text-white"
                          style={{ backgroundColor: acc.colorAccent || 'var(--bg-elevated)' }}
                        >
                          {getAccountIcon(acc.type)}
                        </div>
                        <div>
                          <p className="font-heading font-bold text-sm text-white truncate max-w-[110px]">{acc.name}</p>
                          <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">{acc.type}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => openEditAccountModal(acc)}
                          className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                          title="Edit Akun"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setAccountToDelete(acc)}
                          className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-terracotta)] rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                          title="Hapus Akun"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-heading uppercase text-[var(--text-secondary)]">
                        {isCredit ? 'Tagihan Berjalan' : 'Saldo Tersedia'}
                      </p>
                      <p className={`text-xl font-mono font-bold tracking-tight ${isCredit ? 'text-[var(--accent-terracotta-light)]' : 'text-white'}`}>
                        {formatRupiah(acc.balance)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* BAGIAN UTAMA: FORM EKSKLUSIF (TRANSAKSI vs TRANSFER) & RIWAYAT      */}
        {/* =================================================================== */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* KOLOM KIRI (5 cols): CONTAINER FORM MUTUALLY EXCLUSIVE */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* CONTAINER 1: FORM INPUT TRANSAKSI MANUAL */}
            <div 
              id="container-transaksi" 
              style={{ display: activeFormMode === 'transaction' ? 'block' : 'none' }}
              className={`brutal-card p-5 bg-[var(--bg-surface)] space-y-4 ${
                activeFormMode === 'transaction' ? '' : 'hidden'
              }`}
            >
              <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[var(--accent-sand)]" />
                  <div>
                    <h3 className="font-heading font-bold text-base text-white">Input Transaksi</h3>
                    <p className="text-[10px] font-mono text-[var(--accent-sage-light)]">Buku: {currentLedger.name}</p>
                  </div>
                </div>

                <div className="flex p-0.5 bg-[var(--bg-primary)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)]">
                  <button
                    type="button"
                    onClick={() => setTxType('expense')}
                    className={`px-3 py-1 text-xs font-heading font-bold rounded-[var(--radius-sm)] transition-all ${
                      txType === 'expense' 
                        ? 'bg-[var(--accent-terracotta)] text-[var(--text-inverted)] shadow-[2px_2px_0px_#000]' 
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Pengeluaran
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('income')}
                    className={`px-3 py-1 text-xs font-heading font-bold rounded-[var(--radius-sm)] transition-all ${
                      txType === 'income' 
                        ? 'bg-[var(--accent-sage)] text-[var(--text-inverted)] shadow-[2px_2px_0px_#000]' 
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Pemasukan
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveTransaction} className="space-y-4">
                <input ref={receiptInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleReceiptFile} />
                <button type="button" onClick={() => receiptInputRef.current?.click()} disabled={isScanning} className="brutal-btn brutal-btn-lavender text-xs w-full flex items-center justify-center gap-2">
                  <ScanCamera className="w-4 h-4" />
                  {isScanning ? 'Membaca struk…' : 'Scan Struk (AI)'}
                </button>
                {/* Field Nominal dengan Segmented Addon (Anti-overlap 'Rp') */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0 flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                      Nominal Transaksi
                    </label>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">
                      Contoh: 50000+15000
                    </span>
                  </div>

                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden focus-within:border-[var(--accent-sage)] focus-within:shadow-[3px_3px_0px_var(--accent-sage-dark)] transition-all">
                    <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-sand)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      id="tx-amount-input"
                      type="text"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      onBlur={handleTxAmountBlur}
                      placeholder="0 atau hitung ekspresi..."
                      className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                      required
                    />
                  </div>

                  {calcNotice && (
                    <div className="mt-1.5 p-2 bg-[var(--bg-elevated)] border border-[var(--accent-sand)] rounded-[var(--radius-sm)] text-xs font-mono text-[var(--accent-sand-light)] flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      {calcNotice}
                    </div>
                  )}

                  {/* Quick Chips */}
                  <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                    {[10000, 20000, 50000, 100000, 500000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => addQuickAmount(amt)}
                        className="px-2 py-0.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded text-[11px] font-mono text-[var(--text-secondary)] whitespace-nowrap"
                      >
                        +{amt >= 1000 ? `${amt / 1000}k` : amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Akun Sumber */}
                <div>
                  <label className="brutal-label">Akun Sumber Dana ({currentLedger.name})</label>
                  <select 
                    id="tx-account-select"
                    value={txAccountId}
                    onChange={(e) => setTxAccountId(e.target.value)}
                    className="brutal-select account-select-dropdown"
                    required
                  >
                    {accounts.length === 0 ? (
                      <option value="">Belum ada akun di buku ini</option>
                    ) : (
                      accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} — {formatRupiah(acc.balance)}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Kategori & Tanggal */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="brutal-label">Kategori</label>
                    <select 
                      value={txCategory}
                      onChange={(e) => setTxCategory(e.target.value)}
                      className="brutal-select"
                    >
                      {(txType === 'expense' ? categories.lists.expense : categories.lists.income).map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="brutal-label">Tanggal</label>
                    <input 
                      type="date"
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="brutal-input text-xs"
                      required
                    />
                  </div>
                </div>

                {/* Catatan */}
                <div>
                  <label className="brutal-label">Catatan (Opsional)</label>
                  <input 
                    type="text"
                    value={txNote}
                    onChange={(e) => setTxNote(e.target.value)}
                    placeholder="Misal: Makan siang bersama tim"
                    className="brutal-input text-sm"
                  />
                </div>

                {/* Tombol Simpan Transaksi & Link Cepat ke Transfer */}
                <div className="space-y-2 pt-1">
                  <button 
                    type="submit"
                    disabled={accounts.length === 0}
                    className={`brutal-btn w-full ${txType === 'income' ? 'brutal-btn-sage' : 'brutal-btn-terracotta'}`}
                  >
                    {txType === 'income' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span>Simpan Transaksi {txType === 'income' ? 'Pemasukan' : 'Pengeluaran'}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setActiveFormMode('transfer')}
                    className="w-full text-center text-xs font-mono text-[var(--accent-blue-light)] hover:underline flex items-center justify-center gap-1.5 pt-1"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Mau transfer saldo antar akun? Klik di sini
                  </button>
                </div>
              </form>
            </div>

            {/* CONTAINER 2: FORM TRANSFER ANTAR AKUN (EKSKLUSIF) */}
            <div 
              id="container-transfer" 
              style={{ display: activeFormMode === 'transfer' ? 'block' : 'none' }}
              className={`brutal-card p-5 bg-[var(--bg-surface)] border-2 border-[var(--accent-blue)] space-y-4 ${
                activeFormMode === 'transfer' ? '' : 'hidden'
              }`}
            >
              <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-[var(--accent-blue)]" />
                  <div>
                    <h3 className="font-heading font-bold text-base text-white">Transfer Antar Akun</h3>
                    <p className="text-[10px] font-mono text-[var(--accent-blue-light)]">Buku: {currentLedger.name}</p>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={() => setActiveFormMode('transaction')}
                  className="brutal-btn brutal-btn-ghost text-xs py-1 px-2.5 flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Kembali</span>
                </button>
              </div>

              <form onSubmit={handleExecuteTransfer} className="space-y-4">
                <div>
                  <label className="brutal-label">Akun Asal (Pengirim)</label>
                  <select 
                    value={transferSource}
                    onChange={(e) => setTransferSource(e.target.value)}
                    className="brutal-select"
                    required
                  >
                    {accounts.length === 0 ? (
                      <option value="">Belum ada akun di buku ini</option>
                    ) : (
                      accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} — {formatRupiah(acc.balance)}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="brutal-label">Akun Tujuan (Penerima)</label>
                  <select 
                    value={transferDest}
                    onChange={(e) => setTransferDest(e.target.value)}
                    className="brutal-select"
                    required
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id} disabled={acc.id === transferSource}>
                        {acc.name} {acc.id === transferSource ? '(Tidak boleh sama)' : `(${formatRupiah(acc.balance)})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Nominal Transfer</label>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">
                      Kalkulator: misal 100000+25000
                    </span>
                  </div>

                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden focus-within:border-[var(--accent-blue)] focus-within:shadow-[3px_3px_0px_var(--accent-blue-dark)] transition-all">
                    <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-sand)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      onBlur={handleTransferAmountBlur}
                      placeholder="0"
                      className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                      required
                    />
                  </div>
                  {transferNotice && (
                    <p className="text-xs font-mono text-[var(--accent-sand)] mt-1">{transferNotice}</p>
                  )}
                </div>

                <div>
                  <label className="brutal-label">Catatan Transfer (Opsional)</label>
                  <input 
                    type="text"
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    placeholder="Misal: Top up saldo GoPay"
                    className="brutal-input text-sm"
                  />
                </div>

                <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] text-[var(--text-secondary)] font-mono">
                  ℹ️ Dieksekusi secara <strong>atomik (batch write)</strong> di Firestore: saldo asal terdebet dan saldo tujuan terkredit serentak.
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setActiveFormMode('transaction')}
                    className="brutal-btn brutal-btn-ghost flex-1 text-xs"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit" 
                    disabled={accounts.length < 2}
                    className="brutal-btn brutal-btn-blue flex-2 text-xs"
                  >
                    Eksekusi Transfer
                  </button>
                </div>
              </form>
            </div>

          </div>

          {/* KOLOM KANAN (7 cols): RIWAYAT TRANSAKSI SESUAI BUKU KAS AKTIF */}
          <div className="lg:col-span-7 brutal-card p-5 bg-[var(--bg-surface)] space-y-4 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--accent-blue)]" />
                <div>
                  <h3 className="font-heading font-bold text-base text-white">
                    Riwayat Transaksi
                  </h3>
                  <p className="text-[10px] font-mono text-[var(--text-muted)]">Buku: {currentLedger.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {(['all', 'expense', 'income', 'transfer'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setTxFilter(tab)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-[var(--radius-sm)] border border-[var(--border-color)] transition-all ${
                      txFilter === tab 
                        ? 'bg-[var(--accent-blue)] text-[var(--text-inverted)] font-bold shadow-[2px_2px_0px_#000]' 
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* List Transaksi */}
            <div id="transactions-list-container" className="flex-1 space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {isLoading ? (
                <div className="py-12 text-center text-xs font-mono text-[var(--text-muted)] animate-pulse">
                  Memuat riwayat transaksi...
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <p className="font-heading text-sm text-[var(--text-secondary)]">Belum ada transaksi di Buku Kas ini</p>
                  <p className="text-xs text-[var(--text-muted)] font-mono">Gunakan form di samping untuk mencatat transaksi pertama</p>
                </div>
              ) : (
                filteredTransactions.map(tx => {
                  const sourceAcc = accounts.find(a => a.id === tx.accountId);
                  const destAcc = tx.toAccountId ? accounts.find(a => a.id === tx.toAccountId) : null;

                  return (
                    <div 
                      key={tx.id}
                      className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-[var(--radius-sm)] border border-[var(--border-color)] flex items-center justify-center shrink-0 ${
                          tx.type === 'income' 
                            ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)]' 
                            : tx.type === 'expense' 
                            ? 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)]' 
                            : 'bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)]'
                        }`}>
                          {tx.type === 'income' && <TrendingUp className="w-4 h-4" />}
                          {tx.type === 'expense' && <TrendingDown className="w-4 h-4" />}
                          {tx.type === 'transfer' && <ArrowRightLeft className="w-4 h-4" />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-heading font-bold text-sm text-white">{tx.category}</span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">{tx.date}</span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                            {tx.type === 'transfer' ? (
                              <span className="font-mono text-[11px] text-[var(--accent-blue-light)]">
                                {sourceAcc?.name || 'Akun'} → {destAcc?.name || 'Tujuan'}
                              </span>
                            ) : (
                              <span className="font-mono text-[11px]">
                                {sourceAcc?.name || 'Akun'}
                              </span>
                            )}
                            {tx.note && <span className="text-[var(--text-muted)] truncate max-w-[130px]">• {tx.note}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className={`font-mono font-bold text-sm sm:text-base ${
                          tx.type === 'income' 
                            ? 'text-[var(--accent-sage-light)]' 
                            : tx.type === 'expense' 
                            ? 'text-[var(--accent-terracotta-light)]' 
                            : 'text-[var(--accent-blue-light)]'
                        }`}>
                          {tx.type === 'income' && '+'}
                          {tx.type === 'expense' && '-'}
                          {formatRupiah(tx.amount)}
                        </span>

                        {/* Tombol Edit & Hapus Transaksi (Semua tipe termasuk Transfer) */}
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => openEditTransactionModal(tx)}
                            className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                            title="Edit Transaksi (Hitung otomatis selisih saldo)"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setTxToDelete(tx)}
                            className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-terracotta)] rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                            title="Hapus Transaksi & Kembalikan Saldo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </section>

        </div>
        {/* AKHIR KONTEN MODUL 1 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 2: GOALS & MASA DEPAN (WISHLIST & SINKING FUNDS)       */}
        {/* =================================================================== */}
        <div id="container-modul-2" className={activeModule === 'module2' ? 'space-y-7' : 'hidden'}>
          
          {/* 1. RINGKASAN METRIK TARGET BUKU KAS AKTIF */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-sand)] space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Total Target Dana</p>
                <span className="brutal-badge text-[9px]">{currentLedger.name}</span>
              </div>
              <p id="total-goals-target-display" className="text-3xl font-mono font-bold text-white tracking-tight">
                {formatRupiah(totalGoalsTarget)}
              </p>
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
                Dari {goals.length} target di buku kas ini
              </p>
            </div>

            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-sage)] space-y-1">
              <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Total Dana Terkumpul</p>
              <p id="total-goals-saved-display" className="text-3xl font-mono font-bold text-[var(--accent-sage-light)] tracking-tight">
                {formatRupiah(totalGoalsSaved)}
              </p>
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
                {goals.filter(g => g.isCompleted).length} target telah tercapai 100%
              </p>
            </div>

            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-blue)] space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Progres Keseluruhan</p>
                <span className="font-mono font-bold text-sm text-[var(--accent-blue-light)]">{goalsOverallProgress}%</span>
              </div>
              <div className="brutal-progress-container mt-2">
                <div 
                  className="brutal-progress-bar"
                  style={{ width: `${goalsOverallProgress}%`, backgroundColor: 'var(--accent-blue)' }}
                />
              </div>
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
                Rata-rata pencapaian tujuan finansial
              </p>
            </div>
          </section>

          {/* 2. FILTER TABS & SUB-HEADER TARGET */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-[var(--accent-sand)]" />
                <div>
                  <h2 className="font-heading font-bold text-lg text-white">
                    Wishlist & Sinking Funds: {currentLedger.name}
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] font-mono">
                    Sisihkan dana bertahap secara teratur untuk mencegah lonjakan pengeluaran mendadak.
                  </p>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'Semua', count: goals.length },
                  { id: 'sinking_fund', label: 'Sinking Funds', count: goals.filter(g => g.type === 'sinking_fund').length },
                  { id: 'wishlist', label: 'Wishlist', count: goals.filter(g => g.type === 'wishlist').length },
                  { id: 'completed', label: 'Tercapai 🎉', count: goals.filter(g => g.isCompleted).length }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setGoalFilter(tab.id as any)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-[var(--radius-sm)] border transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      goalFilter === tab.id
                        ? 'bg-[var(--accent-sand)] text-[var(--text-inverted)] font-bold border-white shadow-[2px_2px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-white'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] opacity-75">({tab.count})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. GRID KARTU TARGET (WISH & SINKING FUNDS) */}
            {isLoading ? (
              <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)] animate-pulse">
                Memuat target untuk {currentLedger.name}...
              </div>
            ) : filteredGoals.length === 0 ? (
              <div className="brutal-card p-8 text-center space-y-3 bg-[var(--bg-surface)]">
                <div className="w-12 h-12 mx-auto rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] flex items-center justify-center text-[var(--accent-sand)] shadow-[2px_2px_0px_#000]">
                  <Compass className="w-6 h-6" />
                </div>
                <p className="font-heading font-bold text-sm text-white">
                  {goalFilter === 'all'
                    ? `Belum ada target atau dana bertahap di Buku Kas "${currentLedger.name}"`
                    : `Tidak ada target dengan filter "${goalFilter}"`}
                </p>
                <p className="text-xs text-[var(--text-muted)] font-mono max-w-md mx-auto">
                  Buat Sinking Fund untuk kebutuhan terencana (pajak kendaraan, servis, liburan) atau Wishlist untuk barang impian.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddGoalOpen(true)}
                  className="brutal-btn brutal-btn-sand text-xs inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Buat Target Pertama di Buku Ini</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredGoals.map(goal => {
                  const progress = goal.targetAmount > 0 
                    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
                    : 0;
                  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
                  const sourceAcc = accounts.find(a => a.id === goal.sourceAccountId);

                  return (
                    <div
                      key={goal.id}
                      onClick={() => openGoalDetailModal(goal)}
                      className="brutal-card p-5 bg-[var(--bg-surface)] space-y-4 flex flex-col justify-between group cursor-pointer transition-all duration-150 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] active:translate-y-0"
                      style={{ borderTopColor: goal.colorAccent || 'var(--border-color)', borderTopWidth: '5px' }}
                      title="Klik untuk melihat Detail & Riwayat Alokasi"
                    >
                      <div className="space-y-3">
                        {/* Header Kartu: Tipe Badge & Tombol Aksi */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {goal.type === 'sinking_fund' ? (
                              <span className="brutal-badge brutal-badge-sand text-[10px] font-mono font-bold">
                                SINKING FUND
                              </span>
                            ) : (
                              <span className="brutal-badge brutal-badge-blue text-[10px] font-mono font-bold">
                                WISHLIST
                              </span>
                            )}

                            {goal.isCompleted && (
                              <span className="brutal-badge brutal-badge-sage text-[10px] font-mono font-bold flex items-center gap-1">
                                <Award className="w-3 h-3" /> TERCAPAI
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditGoalModal(goal);
                              }}
                              className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                              title="Edit Target"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setGoalToDelete(goal);
                              }}
                              className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-terracotta)] rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                              title="Hapus Target"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Judul & Catatan */}
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-heading font-bold text-base text-white line-clamp-1 group-hover:text-[var(--accent-sand-light)] transition-colors">
                              {goal.name}
                            </h3>
                            <span className="text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--accent-sand-light)] shrink-0 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              <Eye className="w-3 h-3" /> Riwayat
                            </span>
                          </div>
                          {goal.note && (
                            <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{goal.note}</p>
                          )}
                        </div>

                        {/* Metadata: Sumber Akun & Deadline */}
                        <div className="space-y-1 pt-1">
                          {goal.deadline && (
                            <div className="flex items-center gap-1.5 text-xs font-mono text-[var(--accent-sand-light)]">
                              <Calendar className="w-3.5 h-3.5 text-[var(--accent-sand)] shrink-0" />
                              <span>Jatuh tempo: <strong>{goal.deadline}</strong></span>
                            </div>
                          )}

                          {goal.type === 'sinking_fund' && sourceAcc && (
                            <div className="flex items-center gap-1.5 text-xs font-mono text-[var(--text-muted)]">
                              <Wallet className="w-3.5 h-3.5 text-[var(--accent-sage)] shrink-0" />
                              <span>Akun Sumber: <span className="text-white">{sourceAcc.name}</span></span>
                            </div>
                          )}
                        </div>

                        {/* Progress Bar Neo-Brutalism */}
                        <div className="space-y-1.5 pt-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs font-mono font-bold text-white">
                              {formatRupiah(goal.currentAmount)}
                            </span>
                            <span className="text-xs font-mono font-bold text-[var(--accent-sand-light)]">
                              {progress}%
                            </span>
                          </div>

                          <div className="brutal-progress-container">
                            <div
                              className="brutal-progress-bar"
                              style={{
                                width: `${progress}%`,
                                backgroundColor: goal.isCompleted 
                                  ? 'var(--accent-sage)' 
                                  : (goal.colorAccent || 'var(--accent-sand)')
                              }}
                            />
                          </div>

                          <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-muted)] pt-0.5">
                            <span>Target: {formatRupiah(goal.targetAmount)}</span>
                            <span>{goal.isCompleted ? 'Lunas / Lengkap' : `Sisa: ${formatRupiah(remaining)}`}</span>
                          </div>
                        </div>
                      </div>

                      {/* Tombol Aksi: + Alokasikan Dana */}
                      <div className="pt-3 border-t border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAllocateModal(goal);
                          }}
                          disabled={goal.isCompleted}
                          className={`w-full brutal-btn text-xs py-2 flex items-center justify-center gap-1.5 ${
                            goal.isCompleted 
                              ? 'opacity-60 bg-[var(--bg-elevated)] border-[var(--border-subtle)] cursor-not-allowed text-[var(--text-secondary)]'
                              : 'brutal-btn-sand'
                          }`}
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>{goal.isCompleted ? 'Target Selesai Tercapai 🎉' : '+ Alokasikan Dana'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
        {/* AKHIR KONTEN MODUL 2 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 3: UTANG & TAGIHAN RUTIN (DEBT & SUBSCRIPTIONS)         */}
        {/* =================================================================== */}
        <div id="container-modul-3" className={activeModule === 'module3' ? 'space-y-7' : 'hidden'}>
          
          {/* 1. RINGKASAN METRIK MODUL 3 */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-terracotta)] space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Total Beban Utang Berjalan</p>
                <span className="brutal-badge text-[9px]">{currentLedger.name}</span>
              </div>
              <p id="total-debts-remaining-display" className="text-3xl font-mono font-bold text-[var(--accent-terracotta-light)] tracking-tight">
                {formatRupiah(totalRemainingDebt)}
              </p>
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
                Dari {debts.filter(d => !d.isPaidOff).length} utang aktif (Total pinjaman: {formatRupiah(totalOriginalDebt)})
              </p>
            </div>

            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-blue)] space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Estimasi Tagihan Bulanan</p>
                <span className="text-[10px] font-mono text-[var(--accent-blue-light)] font-bold">{bills.length} Tagihan</span>
              </div>
              <p id="total-monthly-bills-display" className="text-3xl font-mono font-bold text-white tracking-tight">
                {formatRupiah(estimatedMonthlyBills)}
              </p>
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
                {variableBillsCount > 0 ? `+ ${variableBillsCount} tagihan fluktuatif` : 'Semua tagihan bernominal tetap'} · Total dibayar: {formatRupiah(totalBillsPaid)}
              </p>
            </div>

            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-sage)] space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Progres Pelunasan Utang</p>
                <span className="font-mono font-bold text-sm text-[var(--accent-sage-light)]">{debtPayoffProgress}%</span>
              </div>
              <div className="brutal-progress-container mt-2">
                <div 
                  className="brutal-progress-bar"
                  style={{ width: `${debtPayoffProgress}%`, backgroundColor: 'var(--accent-sage)' }}
                />
              </div>
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
                {debts.filter(d => d.isPaidOff).length} dari {debts.length} pinjaman telah lunas 100%
              </p>
            </div>
          </section>

          {/* 2. LAYOUT ATAS-BAWAH (STACKED): TAGIHAN RUTIN DI ATAS, UTANG & CICILAN DI BAWAH */}
          <section className="space-y-12">

            {/* =============================================================== */}
            {/* CONTAINER ATAS: TAGIHAN RUTIN & LANGGANAN                       */}
            {/* =============================================================== */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <RotateCw className="w-5 h-5 text-[var(--accent-blue)]" />
                  <div>
                    <h2 className="font-heading font-bold text-base sm:text-lg text-white">
                      Tagihan Rutin & Langganan
                    </h2>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Siklus otomatis & pengingat jatuh tempo • Klik kartu untuk melihat detail & riwayat
                    </p>
                  </div>
                </div>
              </div>

              {/* Filter Tabs Tagihan */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
                {[
                  { id: 'all', label: `Semua (${bills.length})` },
                  { id: 'monthly', label: `Bulanan (${bills.filter(b => b.cycle === 'monthly').length})` },
                  { id: 'yearly', label: `Tahunan (${bills.filter(b => b.cycle === 'yearly').length})` },
                  { 
                    id: 'overdue', 
                    label: `Perlu Bayar (${bills.filter(b => {
                      const s = getBillDueStatus(b.nextPaymentDate);
                      return s.isOverdue || s.isToday || (s.daysLeft > 0 && s.daysLeft <= 3);
                    }).length})` 
                  }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setBillFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-[var(--radius-sm)] border transition-all shrink-0 ${
                      billFilter === f.id
                        ? 'bg-[var(--accent-blue)] text-black border-white font-bold shadow-[2px_2px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* List Kartu Tagihan (Grid Responsif 3 Kolom) */}
              {filteredBills.length === 0 ? (
                <div className="brutal-card p-8 bg-[var(--bg-surface)] text-center space-y-3 border-dashed border-2 border-[var(--border-subtle)]">
                  <div className="w-12 h-12 mx-auto rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)]">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-sm text-white">Belum Ada Tagihan Terdaftar</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
                      Catat tagihan rutin bulanan atau tahunan dengan nominal tetap maupun fluktuatif.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddBillOpen(true)}
                    className="brutal-btn brutal-btn-blue text-xs py-1.5 px-4 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Tagihan Pertama</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredBills.map(b => {
                    const dueStatus = getBillDueStatus(b.nextPaymentDate);

                    return (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBillForDetail(b)}
                        className="brutal-card p-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all border-2 border-[var(--border-color)] hover:border-white space-y-3 shadow-[var(--shadow-sm)] cursor-pointer group flex flex-col justify-between"
                        style={{ borderLeftColor: b.colorAccent || '#7a9eb3', borderLeftWidth: '6px' }}
                      >
                        <div className="space-y-3">
                          {/* Header Kartu: Nama & Badge Sisa Hari */}
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-heading font-bold text-base text-white group-hover:text-[var(--accent-blue-light)] transition-colors truncate flex-1" title={b.name}>
                              {b.name}
                            </h3>

                            {/* Badge Status Jatuh Tempo */}
                            <div className="shrink-0">
                              {dueStatus.isOverdue ? (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-terracotta)] text-white border-2 border-black shadow-[2px_2px_0px_#000] flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-3 h-3" />
                                  TERLAMBAT {Math.abs(dueStatus.daysLeft)} HARI
                                </span>
                              ) : dueStatus.isToday ? (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-terracotta)] text-white border-2 border-black shadow-[2px_2px_0px_#000] flex items-center gap-1 animate-pulse">
                                  <Clock className="w-3 h-3" />
                                  HARI INI!
                                </span>
                              ) : dueStatus.daysLeft <= 3 ? (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-sand)] text-black border-2 border-black shadow-[2px_2px_0px_#000] flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Sisa {dueStatus.daysLeft} Hari
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                                  Sisa {dueStatus.daysLeft} Hari
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Ringkasan Pokok: Nominal & Tanggal Jatuh Tempo */}
                          <div className="grid grid-cols-2 gap-2 p-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                            <div>
                              <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Nominal</p>
                              {b.pricingType === 'fixed' ? (
                                <p className="font-mono font-bold text-sm text-[var(--accent-blue-light)]">
                                  {formatRupiah(b.fixedAmount || 0)}
                                </p>
                              ) : (
                                <p className="font-mono font-bold text-xs text-[var(--accent-sand-light)]">
                                  Estimasi/Bulan Lalu: {formatRupiah(b.lastNominal || 0)}
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Jatuh Tempo</p>
                              <p className="font-mono font-semibold text-xs text-white flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                                <span className="truncate">{b.nextPaymentDate}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Tombol Aksi */}
                        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPayBillModal(b);
                              }}
                              className="flex-1 brutal-btn brutal-btn-blue text-xs py-1.5 flex items-center justify-center gap-1.5 font-bold"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Bayar Sekarang</span>
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditBillModal(b);
                                }}
                                className="p-1.5 text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-muted)] border border-transparent hover:border-[var(--border-subtle)] rounded transition-colors"
                                title="Edit Tagihan"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setBillToDelete(b);
                                }}
                                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-terracotta)] hover:bg-[var(--accent-terracotta-dark)]/30 border border-transparent hover:border-[var(--accent-terracotta)] rounded transition-colors"
                                title="Hapus Tagihan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[9px] font-mono text-[var(--text-muted)] text-center group-hover:text-[var(--accent-blue-light)] transition-colors">
                            Klik kartu untuk detail lengkap & riwayat pembayaran →
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* =============================================================== */}
            {/* CONTAINER BAWAH: UTANG & CICILAN                                */}
            {/* =============================================================== */}
            <div className="space-y-4 pt-6 border-t-2 border-[var(--border-subtle)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[var(--accent-terracotta)]" />
                  <div>
                    <h2 className="font-heading font-bold text-base sm:text-lg text-white">
                      Utang & Cicilan
                    </h2>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Lacak pinjaman, sisa pokok & pelunasan • Klik kartu untuk melihat detail & riwayat cicilan
                    </p>
                  </div>
                </div>
              </div>

              {/* Filter Tabs Utang */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
                {[
                  { id: 'all', label: `Semua (${debts.length})` },
                  { id: 'active', label: `Cicilan Aktif (${debts.filter(d => !d.isPaidOff).length})` },
                  { id: 'paid_off', label: `Lunas (${debts.filter(d => d.isPaidOff).length})` }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDebtFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-[var(--radius-sm)] border transition-all shrink-0 ${
                      debtFilter === f.id
                        ? 'bg-[var(--accent-terracotta)] text-white border-white font-bold shadow-[2px_2px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* List Kartu Utang (Grid Responsif 3 Kolom) */}
              {filteredDebts.length === 0 ? (
                <div className="brutal-card p-8 bg-[var(--bg-surface)] text-center space-y-3 border-dashed border-2 border-[var(--border-subtle)]">
                  <div className="w-12 h-12 mx-auto rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)]">
                    <CheckCircle2 className="w-6 h-6 text-[var(--accent-sage)]" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-sm text-white">Tidak Ada Utang Terdaftar</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
                      Kondisi bebas utang atau belum ada data cicilan tercatat di buku kas ini.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddDebtOpen(true)}
                    className="brutal-btn brutal-btn-terracotta text-xs py-1.5 px-4 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Catat Pinjaman Baru</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDebts.map(d => {
                    const progress = d.totalDebt > 0 ? Math.min(100, Math.round(((d.totalDebt - d.remainingDebt) / d.totalDebt) * 100)) : 100;
                    const dueStatus = getBillDueStatus(d.nextPaymentDate || d.dueDate || '');

                    return (
                      <div
                        key={d.id}
                        onClick={() => setSelectedDebtForDetail(d)}
                        className={`brutal-card p-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all border-2 border-[var(--border-color)] hover:border-white space-y-3 shadow-[var(--shadow-sm)] cursor-pointer group flex flex-col justify-between ${
                          d.isPaidOff ? 'opacity-80' : ''
                        }`}
                        style={{ borderLeftColor: d.colorAccent || '#c88265', borderLeftWidth: '6px' }}
                      >
                        <div className="space-y-3">
                          {/* Header Kartu: Nama & Badge Countdown Status */}
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-heading font-bold text-base text-white group-hover:text-[var(--accent-terracotta-light)] transition-colors truncate flex-1" title={d.name}>
                              {d.name}
                            </h3>

                            <div className="shrink-0">
                              {d.isPaidOff ? (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border border-[var(--accent-sage)] flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  LUNAS 🎉
                                </span>
                              ) : dueStatus.isOverdue ? (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-terracotta)] text-white border-2 border-black shadow-[2px_2px_0px_#000] flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-3 h-3" />
                                  TERLAMBAT {Math.abs(dueStatus.daysLeft)} HARI
                                </span>
                              ) : dueStatus.isToday ? (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-terracotta)] text-white border-2 border-black shadow-[2px_2px_0px_#000] flex items-center gap-1 animate-pulse">
                                  <Clock className="w-3 h-3" />
                                  HARI INI!
                                </span>
                              ) : dueStatus.daysLeft <= 3 ? (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-[var(--radius-sm)] bg-[var(--accent-sand)] text-black border-2 border-black shadow-[2px_2px_0px_#000] flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Sisa {dueStatus.daysLeft} Hari
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                                  Sisa {dueStatus.daysLeft} Hari
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Ringkasan Pokok: Sisa Utang & Jatuh Tempo Terdekat */}
                          <div className="grid grid-cols-2 gap-2 p-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                            <div>
                              <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Sisa Utang</p>
                              <p className="font-mono font-bold text-sm text-[var(--accent-terracotta-light)]">
                                {formatRupiah(d.remainingDebt)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Jatuh Tempo</p>
                              <p className="font-mono font-semibold text-xs text-white flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                                <span className="truncate">{d.nextPaymentDate || d.dueDate || 'Tanpa jadwal'}</span>
                              </p>
                            </div>
                          </div>

                          {/* Progress Bar Pelunasan Neo-Brutalism */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[10px] font-mono">
                              <span className="text-[var(--text-muted)]">Pelunasan</span>
                              <span className="text-[var(--accent-sand)] font-bold">{progress}% Lunas</span>
                            </div>
                            <div className="brutal-progress-container h-2.5">
                              <div
                                className="brutal-progress-bar h-full"
                                style={{ 
                                  width: `${progress}%`, 
                                  backgroundColor: d.isPaidOff ? 'var(--accent-sage)' : (d.colorAccent || 'var(--accent-sand)') 
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Tombol Aksi */}
                        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPayDebtModal(d);
                              }}
                              disabled={d.isPaidOff}
                              className={`flex-1 brutal-btn text-xs py-1.5 flex items-center justify-center gap-1.5 font-bold ${
                                d.isPaidOff 
                                  ? 'opacity-60 bg-[var(--bg-elevated)] border-[var(--border-subtle)] cursor-not-allowed text-[var(--text-secondary)]' 
                                  : 'brutal-btn-terracotta'
                              }`}
                            >
                              <Banknote className="w-3.5 h-3.5" />
                              <span>{d.isPaidOff ? 'Utang Telah Lunas 🎉' : 'Bayar Cicilan'}</span>
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditDebtModal(d);
                                }}
                                className="p-1.5 text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-muted)] border border-transparent hover:border-[var(--border-subtle)] rounded transition-colors"
                                title="Edit Utang"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDebtToDelete(d);
                                }}
                                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-terracotta)] hover:bg-[var(--accent-terracotta-dark)]/30 border border-transparent hover:border-[var(--accent-terracotta)] rounded transition-colors"
                                title="Hapus Utang"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[9px] font-mono text-[var(--text-muted)] text-center group-hover:text-[var(--accent-terracotta-light)] transition-colors">
                            Klik kartu untuk detail lengkap & riwayat cicilan →
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </section>

        </div>
        {/* AKHIR KONTEN MODUL 3 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 4: OTOMATISASI TRANSAKSI (AUTO-INCOME/EXPENSE/TRANSFER)*/}
        {/* =================================================================== */}
        <div id="container-modul-4" className={activeModule === 'module4' ? 'space-y-7' : 'hidden'}>
          <AutopilotList
            ledgerId={currentLedger.id}
            accounts={accounts}
            goals={goals}
            bills={bills}
            debts={debts}
            version={apVersion}
            onRun={() => runAutopilotAndRefresh(currentLedger.id)}
          />
          
          {/* 1. RINGKASAN METRIK OTOMATISASI BUKU KAS AKTIF */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-sand)] space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Aturan Aktif</p>
                <span className="brutal-badge text-[9px]">{currentLedger.name}</span>
              </div>
              <p className="text-3xl font-mono font-bold text-white tracking-tight">
                {activeAutomationsCount} <span className="text-sm font-normal text-[var(--text-muted)] font-mono">/ {automations.length}</span>
              </p>
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
                Aturan siap dieksekusi terjadwal
              </p>
            </div>

            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-sage)] space-y-1">
              <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Estimasi Auto-Income</p>
              <p className="text-2xl font-mono font-bold text-[var(--accent-sage-light)] tracking-tight">
                +{formatRupiah(estimatedMonthlyAutoIncome)}
              </p>
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
                Pemasukan rutin otomatis per siklus
              </p>
            </div>

            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-terracotta)] space-y-1">
              <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Estimasi Auto-Expense</p>
              <p className="text-2xl font-mono font-bold text-[var(--accent-terracotta-light)] tracking-tight">
                -{formatRupiah(estimatedMonthlyAutoExpense)}
              </p>
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1">
                Pengeluaran & potongan rutin
              </p>
            </div>

            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-blue)] space-y-1 flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-heading">Total Eksekusi</p>
                <p className="text-2xl font-mono font-bold text-white tracking-tight">
                  {totalAutomationExecutions}x
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunCronManual}
                disabled={isExecutingCron}
                className="mt-2 w-full brutal-btn brutal-btn-blue text-[11px] py-1 px-2 flex items-center justify-center gap-1.5 font-bold"
                title="Periksa dan jalankan aturan yang jatuh tempo hari ini"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isExecutingCron ? 'animate-spin' : ''}`} />
                <span>{isExecutingCron ? 'Memeriksa...' : 'Cek Jadwal Hari Ini'}</span>
              </button>
            </div>
          </section>

          {/* 2. SECTION DAFTAR ATURAN OTOMATIS */}
          <section className="space-y-4">
            
            {/* Header List & Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-[var(--accent-sand)]" />
                <div>
                  <h2 className="font-heading font-bold text-base sm:text-lg text-white">
                    Daftar Aturan Otomatisasi (Automation Rules)
                  </h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Auto-Income, Auto-Expense & Auto-Transfer otomatis berjalan saat aplikasi dibuka
                  </p>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
                {[
                  { id: 'all', label: `Semua (${automations.length})` },
                  { id: 'active', label: `Aktif (${automations.filter(a => a.isActive).length})` },
                  { id: 'income', label: `Pemasukan (${automations.filter(a => a.type === 'income').length})` },
                  { id: 'expense', label: `Pengeluaran (${automations.filter(a => a.type === 'expense').length})` },
                  { id: 'transfer', label: `Transfer (${automations.filter(a => a.type === 'transfer').length})` },
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setAutomationFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-[var(--radius-sm)] border transition-all shrink-0 ${
                      automationFilter === f.id
                        ? 'bg-[var(--accent-sand)] text-black border-white font-bold shadow-[2px_2px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List Cards Grid */}
            {filteredAutomations.length === 0 ? (
              <div className="brutal-card p-8 bg-[var(--bg-surface)] text-center space-y-3 border-dashed border-2 border-[var(--border-subtle)]">
                <div className="w-12 h-12 mx-auto rounded-full bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-sand)]">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-white">Belum Ada Aturan Otomatisasi</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
                    Buat aturan untuk menjadwalkan pemasukan rutin (gaji), pengeluaran tetap (biaya admin, langganan), atau transfer antar rekening secara otomatis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddAutomationOpen(true)}
                  className="brutal-btn brutal-btn-sand text-xs py-1.5 px-4 inline-flex items-center gap-1.5 font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Buat Aturan Otomatis Pertama</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAutomations.map(rule => {
                  const sourceAcc = accounts.find(a => a.id === rule.sourceAccountId);
                  const destAcc = rule.toAccountId ? accounts.find(a => a.id === rule.toAccountId) : null;
                  const dueStatus = getBillDueStatus(rule.nextRunDate);
                  const cycleLabel = getCycleLabel(rule.cycle, rule.customIntervalCount, rule.customIntervalUnit);
                  const cycleDisplay = rule.cycle === 'monthly' && rule.monthlyDay 
                    ? `Setiap tgl ${rule.monthlyDay} per bulan`
                    : cycleLabel;

                  return (
                    <div
                      key={rule.id}
                      onClick={() => setSelectedAutomationForDetail(rule)}
                      className="brutal-card p-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all border-2 border-[var(--border-color)] hover:border-white space-y-3 shadow-[var(--shadow-sm)] cursor-pointer group flex flex-col justify-between"
                      style={{ 
                        borderLeftColor: rule.colorAccent || (rule.type === 'income' ? '#8fa892' : rule.type === 'expense' ? '#c88265' : '#7a9eb3'), 
                        borderLeftWidth: '6px' 
                      }}
                    >
                      <div className="space-y-3">
                        {/* Header Kartu: Tipe Badge & Toggle Switch */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={`brutal-badge text-[9px] font-mono font-bold ${
                            rule.type === 'income'
                              ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border border-[var(--accent-sage)]'
                              : rule.type === 'expense'
                              ? 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border border-[var(--accent-terracotta)]'
                              : 'bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border border-[var(--accent-blue)]'
                          }`}>
                            {rule.type === 'income' ? 'PEMASUKAN OTOMATIS' : rule.type === 'expense' ? 'PENGELUARAN OTOMATIS' : 'TRANSFER OTOMATIS'}
                          </span>

                          {/* Toggle Aktif/Nonaktif */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleAutomation(rule.id, e)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border flex items-center gap-1 transition-all ${
                              rule.isActive
                                ? 'bg-[var(--accent-sage-dark)] border-[var(--accent-sage)] text-[var(--accent-sage-light)] hover:bg-[var(--accent-sage)] hover:text-black'
                                : 'bg-[var(--bg-muted)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white'
                            }`}
                            title={rule.isActive ? 'Klik untuk menonaktifkan aturan ini' : 'Klik untuk mengaktifkan aturan ini'}
                          >
                            <Power className="w-2.5 h-2.5" />
                            <span>{rule.isActive ? 'AKTIF' : 'NONAKTIF'}</span>
                          </button>
                        </div>

                        {/* Nama Aturan & Nominal */}
                        <div>
                          <h3 className="font-heading font-bold text-base text-white group-hover:text-[var(--accent-sand-light)] transition-colors truncate" title={rule.name}>
                            {rule.name}
                          </h3>
                          <p className={`font-mono font-bold text-lg mt-0.5 ${
                            rule.type === 'income'
                              ? 'text-[var(--accent-sage-light)]'
                              : rule.type === 'expense'
                              ? 'text-[var(--accent-terracotta-light)]'
                              : 'text-[var(--accent-blue-light)]'
                          }`}>
                            {rule.type === 'income' && '+'}
                            {rule.type === 'expense' && '-'}
                            {rule.type === 'transfer' && '⇄ '}
                            {formatRupiah(rule.amount)}
                          </p>
                        </div>

                        {/* Detail Akun & Siklus */}
                        <div className="p-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1.5 text-xs font-mono">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[var(--text-muted)]">Siklus:</span>
                            <span className="font-bold text-white truncate max-w-[170px]" title={cycleDisplay}>
                              {cycleDisplay}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[var(--text-muted)]">
                              {rule.type === 'transfer' ? 'Alur Akun:' : rule.type === 'income' ? 'Rekening Masuk:' : 'Rekening Potong:'}
                            </span>
                            <span className="font-bold text-white truncate max-w-[170px]">
                              {rule.type === 'transfer'
                                ? `${sourceAcc?.name || 'Sumber'} → ${destAcc?.name || 'Tujuan'}`
                                : (sourceAcc?.name || 'Akun')}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--border-subtle)]">
                            <span className="text-[var(--text-muted)]">Jadwal Terdekat:</span>
                            <div className="flex items-center gap-1 font-bold">
                              <span className="text-white">{rule.nextRunDate}</span>
                              {rule.isActive && (
                                dueStatus.isOverdue ? (
                                  <span className="text-[var(--accent-terracotta-light)] font-bold text-[10px]">⚠️ Waktunya Eksekusi</span>
                                ) : dueStatus.isToday ? (
                                  <span className="text-[var(--accent-terracotta-light)] font-bold text-[10px]">⚡ HARI INI</span>
                                ) : (
                                  <span className="text-[var(--accent-sand)] text-[10px]">({dueStatus.daysLeft} Hari)</span>
                                )
                              )}
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Tombol Aksi di Kartu */}
                      <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={(e) => handleManualExecuteAutomation(rule, e)}
                            className="flex-1 brutal-btn brutal-btn-sand text-xs py-1.5 flex items-center justify-center gap-1.5 font-bold"
                            title="Eksekusi transaksi otomatis ini sekarang"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Jalankan Sekarang</span>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => openEditAutomationModal(rule, e)}
                              className="p-1.5 text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-muted)] border border-transparent hover:border-[var(--border-subtle)] rounded transition-colors"
                              title="Edit Aturan"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => promptDeleteAutomation(rule, e)}
                              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-terracotta)] hover:bg-[var(--accent-terracotta-dark)]/30 border border-transparent hover:border-[var(--accent-terracotta)] rounded transition-colors"
                              title="Hapus Aturan"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="text-[9px] font-mono text-[var(--text-muted)] text-center group-hover:text-[var(--accent-sand-light)] transition-colors">
                          Klik kartu untuk detail & riwayat eksekusi →
                        </p>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </section>

        </div>
        {/* AKHIR KONTEN MODUL 4 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 5: LAPORAN & ANALITIK                                  */}
        {/* =================================================================== */}
        <div id="container-modul-5" className={activeModule === 'module5' ? 'space-y-7' : 'hidden'}>
          <SixMonthReport transactions={transactions} ledgerName={currentLedger.name} />
          <Module5Reports
            transactions={transactions}
            activeLedger={currentLedger}
            accounts={accounts}
            formatRupiah={formatRupiah}
            formatDate={(val) => new Date(val).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            onNavigateToTab={(tab) => setActiveModule(tab)}
          />
        </div>
        {/* AKHIR KONTEN MODUL 5 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 6: PREDIKSI GAJI & KALENDER SHIFT (GROUP C)            */}
        {/* =================================================================== */}
        <div id="container-modul-6" className={activeModule === 'module6' ? 'space-y-7' : 'hidden'}>
          <Module6SalaryShift
            activeLedger={currentLedger}
            accounts={accounts}
            automations={automations}
            formatRupiah={formatRupiah}
            formatDate={(val) => new Date(val).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            onNavigateToTab={(tab) => setActiveModule(tab)}
            onAutomationUpdated={async () => {
              const refreshedAutos = await fetchAutomations(undefined, activeLedgerIdState);
              setAutomations(refreshedAutos);
            }}
          />
        </div>
        {/* AKHIR KONTEN MODUL 6 */}

      </main>

      {/* =================================================================== */}
      {/* MODAL 0: BUAT BUKU KAS BARU (NEW LEDGER MODAL)                      */}
      {/* =================================================================== */}
      {isAddLedgerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-[var(--accent-sand)]" />
                Buat Buku Kas Baru
              </h3>
              <button 
                onClick={() => setIsAddLedgerOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLedger} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Buku Kas</label>
                <input 
                  type="text"
                  value={newLedgerName}
                  onChange={(e) => setNewLedgerName(e.target.value)}
                  placeholder="Misal: Bisnis Kopi, Proyek Lepas, Dana Liburan"
                  className="brutal-input text-sm"
                  required
                />
              </div>

              <div>
                <label className="brutal-label">Deskripsi / Tujuan Buku Kas</label>
                <input 
                  type="text"
                  value={newLedgerDesc}
                  onChange={(e) => setNewLedgerDesc(e.target.value)}
                  placeholder="Misal: Rekap operasional usaha warung"
                  className="brutal-input text-sm"
                />
              </div>

              <div>
                <label className="brutal-label">Warna Identitas Buku</label>
                <div className="flex gap-2 pt-1">
                  {[
                    { color: '#8fa892', label: 'Sage' },
                    { color: '#7a9eb3', label: 'Blue' },
                    { color: '#c88265', label: 'Terracotta' },
                    { color: '#d4bc82', label: 'Sand' },
                    { color: '#9d94b8', label: 'Lavender' }
                  ].map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setNewLedgerColor(c.color)}
                      className={`w-8 h-8 rounded-[var(--radius-sm)] border-2 transition-transform ${
                        newLedgerColor === c.color 
                          ? 'border-white scale-110 shadow-[2px_2px_0px_#000]' 
                          : 'border-[var(--border-subtle)]'
                      }`}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono">
                ℹ️ Setiap Buku Kas memiliki <strong>Daftar Akun, Saldo, dan Transaksi tersendiri</strong> yang sepenuhnya terisolasi.
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setIsAddLedgerOpen(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-sand text-xs"
                >
                  Simpan & Beralih Buku
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 0B: EDIT BUKU KAS (EDIT LEDGER MODAL)                         */}
      {/* =================================================================== */}
      {editingLedger && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-[var(--accent-sand)]" />
                Edit Buku Kas: {editingLedger.name}
              </h3>
              <button 
                onClick={() => setEditingLedger(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedLedger} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Buku Kas</label>
                <input 
                  type="text"
                  value={editLedgerName}
                  onChange={(e) => setEditLedgerName(e.target.value)}
                  className="brutal-input text-sm"
                  required
                />
              </div>

              <div>
                <label className="brutal-label">Deskripsi / Tujuan Buku Kas</label>
                <input 
                  type="text"
                  value={editLedgerDesc}
                  onChange={(e) => setEditLedgerDesc(e.target.value)}
                  placeholder="Misal: Operasional kantor atau tabungan keluarga"
                  className="brutal-input text-sm"
                />
              </div>

              <div>
                <label className="brutal-label">Warna Identitas Buku</label>
                <div className="flex gap-2 pt-1">
                  {[
                    { color: '#8fa892', label: 'Sage' },
                    { color: '#7a9eb3', label: 'Blue' },
                    { color: '#c88265', label: 'Terracotta' },
                    { color: '#d4bc82', label: 'Sand' },
                    { color: '#9d94b8', label: 'Lavender' }
                  ].map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setEditLedgerColor(c.color)}
                      className={`w-8 h-8 rounded-[var(--radius-sm)] border-2 transition-transform ${
                        editLedgerColor === c.color 
                          ? 'border-white scale-110 shadow-[2px_2px_0px_#000]' 
                          : 'border-[var(--border-subtle)]'
                      }`}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setEditingLedger(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-sand text-xs"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 0C: KONFIRMASI HAPUS BUKU KAS (DELETE LEDGER MODAL)           */}
      {/* =================================================================== */}
      {ledgerToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] border-2 border-[var(--accent-terracotta)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-terracotta-dark)] border-2 border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-white">Hapus Buku Kas?</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Apakah Anda yakin ingin menghapus buku kas <strong className="text-white">"{ledgerToDelete.name}"</strong>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono space-y-1">
              <p className="text-[var(--accent-terracotta-light)] font-bold">⚠️ Perhatian Konsekuensi:</p>
              <p>• Seluruh akun dan riwayat transaksi yang terdaftar di dalam buku kas ini akan dihapus secara permanen.</p>
              {activeLedgerIdState === ledgerToDelete.id && (
                <p className="text-[var(--accent-sand)]">• Karena ini adalah buku kas aktif, aplikasi akan otomatis dialihkan ke buku kas lain yang tersisa.</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setLedgerToDelete(null)}
                className="brutal-btn brutal-btn-ghost text-xs"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={confirmExecuteDeleteLedger}
                className="brutal-btn brutal-btn-terracotta text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Buku Kas</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: TAMBAH AKUN BARU KE BUKU KAS AKTIF                         */}
      {/* =================================================================== */}
      {isAddAccountOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-[var(--accent-sage)]" />
                  Tambah Akun Baru
                </h3>
                <p className="text-[10px] font-mono text-[var(--accent-sand)]">Buku Kas: {currentLedger.name}</p>
              </div>
              <button 
                onClick={() => setIsAddAccountOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Akun</label>
                <input 
                  type="text"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="Contoh: BCA Tabungan, GoPay, Kas Tunai"
                  className="brutal-input text-sm"
                  required
                />
              </div>

              <div>
                <label className="brutal-label">Tipe Akun</label>
                <select 
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as AccountType)}
                  className="brutal-select text-sm"
                >
                  <option value="bank">Bank Konvensional / Digital</option>
                  <option value="ewallet">E-Wallet (GoPay, OVO, ShopeePay)</option>
                  <option value="cash">Tunai / Dompet Fisik</option>
                  <option value="credit_card">Kartu Kredit (Liabilitas)</option>
                </select>
              </div>

              <div>
                <label className="brutal-label">Saldo Awal</label>
                <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                  <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-sand)] flex items-center select-none shrink-0">
                    Rp
                  </span>
                  <input 
                    type="text"
                    value={newAccBalance}
                    onChange={(e) => setNewAccBalance(e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="brutal-label">Warna Aksen</label>
                <div className="flex gap-2 pt-1">
                  {[
                    { color: '#8fa892', label: 'Sage' },
                    { color: '#7a9eb3', label: 'Blue' },
                    { color: '#c88265', label: 'Terracotta' },
                    { color: '#d4bc82', label: 'Sand' },
                    { color: '#9d94b8', label: 'Lavender' }
                  ].map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setNewAccColor(c.color)}
                      className={`w-8 h-8 rounded-[var(--radius-sm)] border-2 transition-transform ${
                        newAccColor === c.color 
                          ? 'border-white scale-110 shadow-[2px_2px_0px_#000]' 
                          : 'border-[var(--border-subtle)]'
                      }`}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setIsAddAccountOpen(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-sage text-xs"
                >
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: EDIT AKUN                                                  */}
      {/* =================================================================== */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-[var(--accent-blue)]" />
                Edit Akun: {editingAccount.name}
              </h3>
              <button 
                onClick={() => setEditingAccount(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedAccount} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Akun</label>
                <input 
                  type="text"
                  value={editAccName}
                  onChange={(e) => setEditAccName(e.target.value)}
                  className="brutal-input text-sm"
                  required
                />
              </div>

              <div>
                <label className="brutal-label">Tipe Akun</label>
                <select 
                  value={editAccType}
                  onChange={(e) => setEditAccType(e.target.value as AccountType)}
                  className="brutal-select text-sm"
                >
                  <option value="bank">Bank Konvensional / Digital</option>
                  <option value="ewallet">E-Wallet (GoPay, OVO, ShopeePay)</option>
                  <option value="cash">Tunai / Dompet Fisik</option>
                  <option value="credit_card">Kartu Kredit (Liabilitas)</option>
                </select>
              </div>

              <div>
                <label className="brutal-label">Penyesuaian Saldo Riil</label>
                <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                  <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-sand)] flex items-center select-none shrink-0">
                    Rp
                  </span>
                  <input 
                    type="text"
                    value={editAccBalance}
                    onChange={(e) => setEditAccBalance(e.target.value)}
                    className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="brutal-label">Warna Aksen</label>
                <div className="flex gap-2 pt-1">
                  {[
                    { color: '#8fa892', label: 'Sage' },
                    { color: '#7a9eb3', label: 'Blue' },
                    { color: '#c88265', label: 'Terracotta' },
                    { color: '#d4bc82', label: 'Sand' },
                    { color: '#9d94b8', label: 'Lavender' }
                  ].map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setEditAccColor(c.color)}
                      className={`w-8 h-8 rounded-[var(--radius-sm)] border-2 transition-transform ${
                        editAccColor === c.color 
                          ? 'border-white scale-110 shadow-[2px_2px_0px_#000]' 
                          : 'border-[var(--border-subtle)]'
                      }`}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setEditingAccount(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-blue text-xs"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: EDIT TRANSAKSI / TRANSFER (DENGAN SINKRONISASI ATOMIK)     */}
      {/* =================================================================== */}
      {editingTx && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                  {editingTx.type === 'transfer' ? (
                    <>
                      <ArrowRightLeft className="w-5 h-5 text-[var(--accent-blue)]" />
                      <span>Edit Transfer Saldo</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="w-5 h-5 text-[var(--accent-sand)]" />
                      <span>{editingTx.goalId ? 'Edit Alokasi Target' : 'Edit Transaksi'}</span>
                    </>
                  )}
                </h3>
                {editingTx.goalId && (
                  <p className="text-[10px] font-mono text-[var(--accent-sand-light)] mt-0.5">
                    🎯 Perubahan nominal akan meng-update saldo kas dan dana target secara serentak
                  </p>
                )}
              </div>
              <button 
                onClick={() => setEditingTx(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedTransaction} className="space-y-4">
              {editingTx.type !== 'transfer' ? (
                <div className="flex p-0.5 bg-[var(--bg-primary)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)]">
                  <button
                    type="button"
                    onClick={() => setEditTxType('expense')}
                    className={`flex-1 py-1 text-xs font-heading font-bold rounded-[var(--radius-sm)] transition-all ${
                      editTxType === 'expense' 
                        ? 'bg-[var(--accent-terracotta)] text-[var(--text-inverted)] shadow-[2px_2px_0px_#000]' 
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Pengeluaran
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTxType('income')}
                    className={`flex-1 py-1 text-xs font-heading font-bold rounded-[var(--radius-sm)] transition-all ${
                      editTxType === 'income' 
                        ? 'bg-[var(--accent-sage)] text-[var(--text-inverted)] shadow-[2px_2px_0px_#000]' 
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Pemasukan
                  </button>
                </div>
              ) : (
                <div className="p-2.5 bg-[var(--bg-elevated)] border border-[var(--accent-blue)] rounded-[var(--radius-sm)] flex items-center gap-2 text-xs font-mono text-[var(--accent-blue-light)]">
                  <ArrowRightLeft className="w-4 h-4 shrink-0" />
                  <span>Mengedit transfer antar akun di {currentLedger.name}</span>
                </div>
              )}

              <div>
                <label className="brutal-label">
                  {editingTx.type === 'transfer' ? 'Nominal Transfer Baru' : 'Nominal Baru'}
                </label>
                <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                  <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-sand)] flex items-center select-none shrink-0">
                    Rp
                  </span>
                  <input 
                    type="text"
                    value={editTxAmount}
                    onChange={(e) => setEditTxAmount(e.target.value)}
                    onBlur={handleEditTxAmountBlur}
                    className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                    required
                  />
                </div>
                {editCalcNotice && (
                  <p className="text-xs font-mono text-[var(--accent-sand)] mt-1">{editCalcNotice}</p>
                )}
              </div>

              {editingTx.type === 'transfer' ? (
                <>
                  <div>
                    <label className="brutal-label">Akun Asal (Pengirim)</label>
                    <select 
                      value={editTxAccountId}
                      onChange={(e) => setEditTxAccountId(e.target.value)}
                      className="brutal-select"
                      required
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} — {formatRupiah(acc.balance)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="brutal-label">Akun Tujuan (Penerima)</label>
                    <select 
                      value={editTxToAccountId}
                      onChange={(e) => setEditTxToAccountId(e.target.value)}
                      className="brutal-select"
                      required
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id} disabled={acc.id === editTxAccountId}>
                          {acc.name} {acc.id === editTxAccountId ? '(Tidak boleh sama)' : `(${formatRupiah(acc.balance)})`}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="brutal-label">Akun Sumber</label>
                    <select 
                      value={editTxAccountId}
                      onChange={(e) => setEditTxAccountId(e.target.value)}
                      className="brutal-select"
                      required
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} — {formatRupiah(acc.balance)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="brutal-label">Kategori</label>
                    <input 
                      type="text"
                      value={editTxCategory}
                      onChange={(e) => setEditTxCategory(e.target.value)}
                      className="brutal-input text-xs"
                      required
                    />
                  </div>
                </>
              )}

              <div>
                <label className="brutal-label">Tanggal</label>
                <input 
                  type="date"
                  value={editTxDate}
                  onChange={(e) => setEditTxDate(e.target.value)}
                  className="brutal-input text-xs"
                  required
                />
              </div>

              <div>
                <label className="brutal-label">Catatan</label>
                <input 
                  type="text"
                  value={editTxNote}
                  onChange={(e) => setEditTxNote(e.target.value)}
                  className="brutal-input text-sm"
                />
              </div>

              <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] text-[var(--text-secondary)] font-mono">
                ℹ️ Sistem otomatis menghitung <strong>selisih nominal</strong> dan merefleksikan saldo akun secara akurat lewat transaksi atomik.
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setEditingTx(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className={`brutal-btn text-xs ${editingTx.type === 'transfer' ? 'brutal-btn-blue' : 'brutal-btn-sage'}`}
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL KONFIRMASI HAPUS TRANSAKSI                                    */}
      {/* =================================================================== */}
      {txToDelete && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] border-2 border-[var(--accent-terracotta)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-terracotta-dark)] border-2 border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-white">Hapus Transaksi?</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Anda akan menghapus transaksi <strong className="text-white">"{txToDelete.category || txToDelete.type}"</strong> sebesar <strong className="font-mono text-white">{formatRupiah(txToDelete.amount)}</strong> di <span className="text-[var(--accent-sand)]">{currentLedger.name}</span>.
                </p>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs font-mono text-[var(--accent-sand-light)] space-y-1">
              <p><strong>ℹ️ Pengembalian Saldo Otomatis:</strong></p>
              <p>
                {txToDelete.type === 'expense' && `Saldo akun sumber akan bertambah kembali (+${formatRupiah(txToDelete.amount)}).`}
                {txToDelete.type === 'income' && `Saldo akun akan otomatis dikurangi kembali (-${formatRupiah(txToDelete.amount)}).`}
                {txToDelete.type === 'transfer' && 'Saldo akun asal dikembalikan dan saldo akun tujuan dikurangi.'}
              </p>
              {txToDelete.goalId && (
                <p className="text-[var(--accent-sand)] font-bold pt-1 border-t border-[var(--border-subtle)]">
                  🎯 Sinkronisasi Modul 2: Transaksi ini adalah alokasi target. Dana terkumpul pada target terkait akan otomatis dikurangi sebesar {formatRupiah(txToDelete.amount)}.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setTxToDelete(null)}
                className="brutal-btn brutal-btn-ghost text-xs"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={confirmExecuteDeleteTx}
                className="brutal-btn brutal-btn-terracotta text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL KONFIRMASI HAPUS AKUN                                         */}
      {/* =================================================================== */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] border-2 border-[var(--accent-terracotta)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-terracotta-dark)] border-2 border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-white">Hapus Akun Keuangan?</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Apakah Anda yakin ingin menghapus akun <strong className="text-white">"{accountToDelete.name}"</strong> dengan saldo saat ini <strong className="font-mono text-white">{formatRupiah(accountToDelete.balance)}</strong> dari Buku Kas <span className="text-[var(--accent-sand)]">{currentLedger.name}</span>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono">
              ⚠️ Akun akan dihapus dari daftar akun aktif dan total saldo buku kas ini akan otomatis menyesuaikan.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setAccountToDelete(null)}
                className="brutal-btn brutal-btn-ghost text-xs"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={confirmExecuteDeleteAccount}
                className="brutal-btn brutal-btn-terracotta text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: BUAT TARGET BARU (WISHLIST & SINKING FUNDS)                */}
      {/* =================================================================== */}
      {isAddGoalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-lg w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-[var(--accent-sand)]" />
                  Buat Target Finansial Baru
                </h3>
                <p className="text-[10px] font-mono text-[var(--accent-sand-light)]">Buku Kas: {currentLedger.name}</p>
              </div>
              <button 
                type="button"
                onClick={() => setIsAddGoalOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="space-y-4">
              {/* Tipe Target: Sinking Fund vs Wishlist */}
              <div>
                <label className="brutal-label">Pilih Tipe Target</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewGoalType('sinking_fund')}
                    className={`p-3 rounded-[var(--radius-sm)] border-2 text-left transition-all ${
                      newGoalType === 'sinking_fund'
                        ? 'bg-[var(--accent-sand-dark)] border-[var(--accent-sand)] text-white shadow-[2px_2px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    <p className="font-heading font-bold text-xs flex items-center gap-1.5 text-[var(--accent-sand-light)]">
                      <Coins className="w-3.5 h-3.5" /> Sinking Fund
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
                      Dana terencana (pajak, darurat, servis) yang disisihkan riil dari kas.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewGoalType('wishlist')}
                    className={`p-3 rounded-[var(--radius-sm)] border-2 text-left transition-all ${
                      newGoalType === 'wishlist'
                        ? 'bg-[var(--accent-blue-dark)] border-[var(--accent-blue)] text-white shadow-[2px_2px_0px_#000]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white'
                    }`}
                  >
                    <p className="font-heading font-bold text-xs flex items-center gap-1.5 text-[var(--accent-blue-light)]">
                      <Sparkles className="w-3.5 h-3.5" /> Wishlist Impian
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
                      Daftar barang impian / belanja yang ingin diwujudkan nanti.
                    </p>
                  </button>
                </div>
              </div>

              {/* Nama Target */}
              <div>
                <label className="brutal-label">Nama Target Finansial</label>
                <input 
                  type="text"
                  value={newGoalName}
                  onChange={(e) => setNewGoalName(e.target.value)}
                  placeholder={newGoalType === 'sinking_fund' ? "Misal: Pajak STNK & Servis Motor" : "Misal: Laptop MacBook M3 Pro"}
                  className="brutal-input text-sm"
                  required
                />
              </div>

              {/* Nominal Target & Awal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Nominal Target</label>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">Kalkulator</span>
                  </div>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-3 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-xs text-[var(--accent-sand)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={newGoalTarget}
                      onChange={(e) => setNewGoalTarget(e.target.value)}
                      onBlur={handleNewGoalTargetBlur}
                      placeholder="0"
                      className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm focus:outline-none"
                      required
                    />
                  </div>
                  {goalCalcNotice && (
                    <p className="text-[10px] font-mono text-[var(--accent-sand)] mt-1">{goalCalcNotice}</p>
                  )}
                </div>

                <div>
                  <label className="brutal-label">Dana Awal (Opsional)</label>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-3 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-xs text-[var(--text-muted)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={newGoalInitial}
                      onChange={(e) => setNewGoalInitial(e.target.value)}
                      placeholder="0"
                      className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Tenggat Waktu & Akun Sumber (Khusus Sinking Fund) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Tenggat Waktu / Deadline</label>
                  <input 
                    type="date"
                    value={newGoalDeadline}
                    onChange={(e) => setNewGoalDeadline(e.target.value)}
                    className="brutal-input text-xs"
                  />
                </div>

                {newGoalType === 'sinking_fund' && (
                  <div>
                    <label className="brutal-label">Akun Sumber Utama</label>
                    <select
                      value={newGoalSourceAccount}
                      onChange={(e) => setNewGoalSourceAccount(e.target.value)}
                      className="brutal-select text-xs"
                    >
                      {accounts.length === 0 ? (
                        <option value="">Belum ada akun di buku ini</option>
                      ) : (
                        accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({formatRupiah(acc.balance)})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
              </div>

              {/* Pilihan Warna Identitas */}
              <div>
                <label className="brutal-label">Warna Identitas Target</label>
                <div className="flex gap-2 pt-1">
                  {[
                    { color: '#d4bc82', label: 'Sand' },
                    { color: '#8fa892', label: 'Sage' },
                    { color: '#7a9eb3', label: 'Blue' },
                    { color: '#c88265', label: 'Terracotta' },
                    { color: '#9d94b8', label: 'Lavender' }
                  ].map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setNewGoalColor(c.color)}
                      className={`w-8 h-8 rounded-[var(--radius-sm)] border-2 transition-transform ${
                        newGoalColor === c.color 
                          ? 'border-white scale-110 shadow-[2px_2px_0px_#000]' 
                          : 'border-[var(--border-subtle)]'
                      }`}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {/* Catatan / Keterangan */}
              <div>
                <label className="brutal-label">Catatan Target (Opsional)</label>
                <input 
                  type="text"
                  value={newGoalNote}
                  onChange={(e) => setNewGoalNote(e.target.value)}
                  placeholder="Misal: Perkiraan servis di bengkel resmi AHASS"
                  className="brutal-input text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setIsAddGoalOpen(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-sand text-xs"
                >
                  Simpan Target Finansial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 5: ALOKASIKAN DANA KE GOAL (DENGAN SINKRONISASI SALDO ATOMIK) */}
      {/* =================================================================== */}
      {allocatingGoal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                  <Coins className="w-5 h-5 text-[var(--accent-sand)]" />
                  Alokasikan Dana
                </h3>
                <p className="text-[11px] font-mono text-[var(--accent-sand-light)]">Target: {allocatingGoal.name}</p>
              </div>
              <button 
                type="button"
                onClick={() => setAllocatingGoal(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview Progres Target Saat Ini */}
            <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Terkumpul: <strong>{formatRupiah(allocatingGoal.currentAmount)}</strong></span>
                <span>Target: <strong>{formatRupiah(allocatingGoal.targetAmount)}</strong></span>
              </div>
              <div className="brutal-progress-container h-2.5">
                <div 
                  className="brutal-progress-bar"
                  style={{
                    width: `${Math.min(100, Math.round((allocatingGoal.currentAmount / allocatingGoal.targetAmount) * 100))}%`,
                    backgroundColor: 'var(--accent-sand)'
                  }}
                />
              </div>
              <p className="text-[11px] text-[var(--accent-sand-light)] text-right">
                Sisa target: {formatRupiah(Math.max(0, allocatingGoal.targetAmount - allocatingGoal.currentAmount))}
              </p>
            </div>

            <form onSubmit={handleExecuteAllocation} className="space-y-4">
              {/* Akun Sumber Pengambilan Dana */}
              <div>
                <label className="brutal-label">
                  Akun Sumber Dana {allocatingGoal.type === 'sinking_fund' ? '(Wajib Dipotong)' : '(Opsional)'}
                </label>
                <select
                  value={allocSourceAccount}
                  onChange={(e) => setAllocSourceAccount(e.target.value)}
                  className="brutal-select"
                  required={allocatingGoal.type === 'sinking_fund'}
                >
                  {allocatingGoal.type === 'wishlist' && (
                    <option value="">(Catat progres tabungan saja, tanpa potong kas)</option>
                  )}
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} — Saldo: {formatRupiah(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nominal Alokasi */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="brutal-label mb-0">Nominal yang Disisihkan</label>
                  <span className="text-[10px] font-mono text-[var(--accent-sand)]">Mendukung kalkulator</span>
                </div>

                <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden focus-within:border-[var(--accent-sand)] transition-all">
                  <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-sand)] flex items-center select-none shrink-0">
                    Rp
                  </span>
                  <input 
                    type="text"
                    value={allocAmount}
                    onChange={(e) => setAllocAmount(e.target.value)}
                    onBlur={handleAllocAmountBlur}
                    placeholder="0 atau hitung ekspresi..."
                    className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                    required
                  />
                </div>

                {allocCalcNotice && (
                  <p className="text-xs font-mono text-[var(--accent-sand)] mt-1">{allocCalcNotice}</p>
                )}

                {/* Quick Chips */}
                <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                  {[50000, 100000, 250000, 500000, 1000000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        const cur = parseInt(allocAmount.replace(/[^\d]/g, '') || '0', 10);
                        setAllocAmount((cur + amt).toString());
                      }}
                      className="px-2 py-0.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded text-[11px] font-mono text-[var(--text-secondary)] whitespace-nowrap"
                    >
                      +{amt >= 1000000 ? `${amt / 1000000}jt` : `${amt / 1000}k`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const rem = Math.max(0, allocatingGoal.targetAmount - allocatingGoal.currentAmount);
                      setAllocAmount(rem.toString());
                    }}
                    className="px-2 py-0.5 bg-[var(--accent-sand-dark)] hover:bg-[var(--bg-muted)] border border-[var(--accent-sand)] rounded text-[11px] font-mono text-[var(--accent-sand-light)] whitespace-nowrap font-bold"
                  >
                    Isi Sisa
                  </button>
                </div>
              </div>

              {/* Tanggal & Catatan Alokasi */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Tanggal</label>
                  <input 
                    type="date"
                    value={allocDate}
                    onChange={(e) => setAllocDate(e.target.value)}
                    className="brutal-input text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="brutal-label">Catatan (Opsional)</label>
                  <input 
                    type="text"
                    value={allocNote}
                    onChange={(e) => setAllocNote(e.target.value)}
                    placeholder="Misal: Sisihan gaji bulan ini"
                    className="brutal-input text-xs"
                  />
                </div>
              </div>

              {/* Info Sinkronisasi Atomik */}
              <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[11px] font-mono text-[var(--text-secondary)] space-y-0.5">
                <p className="text-[var(--accent-sand)] font-bold">ℹ️ Sinkronisasi Saldo Kas:</p>
                <p>Uang akan dipotong dari saldo akun kas dan dicatat sebagai transaksi pengeluaran alokasi agar aset kas tetap akurat.</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setAllocatingGoal(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-sand text-xs flex items-center gap-1.5"
                >
                  <Coins className="w-4 h-4" />
                  <span>Eksekusi Alokasi Dana</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 6: EDIT TARGET (WISHLIST & SINKING FUNDS)                     */}
      {/* =================================================================== */}
      {editingGoal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-[var(--accent-sand)]" />
                Edit Target: {editingGoal.name}
              </h3>
              <button 
                type="button" 
                onClick={() => setEditingGoal(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedGoal} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Target</label>
                <input 
                  type="text"
                  value={editGoalName}
                  onChange={(e) => setEditGoalName(e.target.value)}
                  className="brutal-input text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Nominal Target</label>
                  <input 
                    type="text"
                    value={editGoalTarget}
                    onChange={(e) => setEditGoalTarget(e.target.value)}
                    className="brutal-input text-sm font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="brutal-label">Dana Terkumpul</label>
                  <input 
                    type="text"
                    value={editGoalCurrent}
                    onChange={(e) => setEditGoalCurrent(e.target.value)}
                    className="brutal-input text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Tenggat Waktu</label>
                  <input 
                    type="date"
                    value={editGoalDeadline}
                    onChange={(e) => setEditGoalDeadline(e.target.value)}
                    className="brutal-input text-xs"
                  />
                </div>

                {editGoalType === 'sinking_fund' && (
                  <div>
                    <label className="brutal-label">Akun Sumber</label>
                    <select
                      value={editGoalSourceAccount}
                      onChange={(e) => setEditGoalSourceAccount(e.target.value)}
                      className="brutal-select text-xs"
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="brutal-label">Catatan</label>
                <input 
                  type="text"
                  value={editGoalNote}
                  onChange={(e) => setEditGoalNote(e.target.value)}
                  className="brutal-input text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setEditingGoal(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-sand text-xs"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 7: KONFIRMASI HAPUS TARGET                                    */}
      {/* =================================================================== */}
      {goalToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] border-2 border-[var(--accent-terracotta)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-terracotta-dark)] border-2 border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-white">Hapus Target Finansial?</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Apakah Anda yakin ingin menghapus target <strong className="text-white">"{goalToDelete.name}"</strong> dengan progres saat ini <strong className="font-mono text-white">{formatRupiah(goalToDelete.currentAmount)}</strong>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono">
              ℹ️ Target akan dihapus dari daftar. Transaksi penyisihan dana yang telah lalu tetap tercatat dalam riwayat transaksi kas Anda.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setGoalToDelete(null)}
                className="brutal-btn brutal-btn-ghost text-xs"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={confirmExecuteDeleteGoal}
                className="brutal-btn brutal-btn-terracotta text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Target</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 8: DETAIL & RIWAYAT ALOKASI TARGET (NEO-BRUTALISM)            */}
      {/* =================================================================== */}
      {selectedGoalForDetail && (() => {
        const goal = selectedGoalForDetail;
        const progress = goal.targetAmount > 0 
          ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
          : 0;
        const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
        const sourceAcc = accounts.find(a => a.id === goal.sourceAccountId);

        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
            <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-lg w-full space-y-5 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150 border-2">
              
              {/* Header Modal */}
              <div className="flex items-start justify-between border-b-2 border-[var(--border-subtle)] pb-3 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`brutal-badge text-[10px] font-mono font-bold ${
                      goal.type === 'sinking_fund' ? 'brutal-badge-sand' : 'brutal-badge-blue'
                    }`}>
                      {goal.type === 'sinking_fund' ? 'SINKING FUND' : 'WISHLIST'}
                    </span>
                    {goal.isCompleted && (
                      <span className="brutal-badge brutal-badge-sage text-[10px] font-mono font-bold flex items-center gap-1">
                        <Award className="w-3 h-3" /> TERCAPAI
                      </span>
                    )}
                  </div>
                  <h3 className="font-heading font-bold text-xl text-white tracking-tight">
                    {goal.name}
                  </h3>
                </div>

                <button 
                  type="button" 
                  onClick={() => setSelectedGoalForDetail(null)}
                  className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                  title="Tutup Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Banner Overview / Metrik Progres */}
              <div className="p-4 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] space-y-3 shadow-[var(--shadow-sm)]">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[10px] font-heading uppercase text-[var(--text-secondary)]">Total Dana Terkumpul</p>
                    <p className="text-2xl font-mono font-bold text-white tracking-tight">
                      {formatRupiah(goal.currentAmount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-heading uppercase text-[var(--text-secondary)]">Target Total</p>
                    <p className="text-sm font-mono font-bold text-[var(--accent-sand-light)]">
                      {formatRupiah(goal.targetAmount)}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[var(--text-secondary)]">Pencapaian</span>
                    <span className="font-bold text-[var(--accent-sand-light)]">{progress}%</span>
                  </div>
                  <div className="brutal-progress-container h-3">
                    <div 
                      className="brutal-progress-bar"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: goal.isCompleted 
                          ? 'var(--accent-sage)' 
                          : (goal.colorAccent || 'var(--accent-sand)')
                      }}
                    />
                  </div>
                </div>

                {/* Metadata Ringkas */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs font-mono">
                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">Sisa Dana Dibutuhkan</span>
                    <span className="font-bold text-white">
                      {goal.isCompleted ? 'Target Selesai 🎉' : formatRupiah(remaining)}
                    </span>
                  </div>

                  {goal.deadline ? (
                    <div>
                      <span className="text-[var(--text-muted)] block text-[10px] uppercase">Tenggat Waktu</span>
                      <span className="font-bold text-[var(--accent-sand-light)]">{goal.deadline}</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[var(--text-muted)] block text-[10px] uppercase">Tenggat Waktu</span>
                      <span className="text-[var(--text-secondary)]">Tanpa batas waktu</span>
                    </div>
                  )}

                  {goal.type === 'sinking_fund' && sourceAcc && (
                    <div className="col-span-2 pt-1">
                      <span className="text-[var(--text-muted)] block text-[10px] uppercase">Akun Sumber Potongan</span>
                      <span className="text-[var(--accent-sage-light)] font-bold">{sourceAcc.name}</span>
                    </div>
                  )}

                  {goal.note && (
                    <div className="col-span-2 pt-1 text-[var(--text-secondary)] font-sans text-xs">
                      <span className="text-[var(--text-muted)] block text-[10px] font-mono uppercase">Catatan</span>
                      <p className="mt-0.5">{goal.note}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* List Riwayat Alokasi Transaksi Khusus Target Ini */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[var(--accent-sand)]" />
                    <h4 className="font-heading font-bold text-sm text-white">
                      Riwayat Alokasi Dana
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono rounded text-[var(--text-secondary)]">
                    {goalAllocationHistory.length} Transaksi
                  </span>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {isLoadingGoalHistory ? (
                    <div className="py-8 text-center text-xs font-mono text-[var(--text-muted)] animate-pulse space-y-2">
                      <div className="w-6 h-6 border-2 border-[var(--accent-sand)] border-t-transparent rounded-full animate-spin mx-auto" />
                      <p>Memuat riwayat alokasi dari Firestore...</p>
                    </div>
                  ) : goalAllocationHistory.length === 0 ? (
                    <div className="p-6 bg-[var(--bg-elevated)] border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center space-y-2">
                      <Coins className="w-6 h-6 text-[var(--accent-sand)] mx-auto opacity-70" />
                      <p className="font-heading text-xs font-bold text-white">
                        Belum ada riwayat alokasi dana untuk target ini
                      </p>
                      <p className="text-[11px] font-mono text-[var(--text-muted)]">
                        Klik tombol "+ Alokasikan Dana" di bawah untuk mulai menabung ke target ini.
                      </p>
                    </div>
                  ) : (
                    goalAllocationHistory.map(tx => {
                      const acc = accounts.find(a => a.id === tx.accountId);
                      return (
                        <div
                          key={tx.id}
                          className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent-sand-dark)] border border-[var(--accent-sand)] text-[var(--accent-sand-light)] flex items-center justify-center shrink-0">
                              <Coins className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-white">
                                  {tx.date}
                                </span>
                                {acc && (
                                  <span className="text-[10px] font-mono text-[var(--accent-sage-light)] bg-[var(--bg-muted)] px-1.5 py-0.2 rounded border border-[var(--border-subtle)]">
                                    {acc.name}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
                                {tx.note || tx.category || 'Alokasi Tabungan'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <span className="font-mono font-bold text-sm text-[var(--accent-sand-light)]">
                              +{formatRupiah(tx.amount)}
                            </span>

                            {/* Tombol Aksi Minimalis Edit & Hapus */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditTransactionModal(tx)}
                                className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-colors"
                                title="Edit Alokasi Ini"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTxToDelete(tx)}
                                className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-terracotta)] rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-colors"
                                title="Hapus Alokasi Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer Tombol Aksi Modal */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    const targetToAlloc = goal;
                    setSelectedGoalForDetail(null);
                    openAllocateModal(targetToAlloc);
                  }}
                  disabled={goal.isCompleted}
                  className={`brutal-btn text-xs py-2 px-3 flex items-center gap-1.5 ${
                    goal.isCompleted 
                      ? 'opacity-60 bg-[var(--bg-elevated)] border-[var(--border-subtle)] cursor-not-allowed text-[var(--text-secondary)]' 
                      : 'brutal-btn-sand'
                  }`}
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>{goal.isCompleted ? 'Target Telah Tercapai 🎉' : '+ Alokasikan Dana'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedGoalForDetail(null)}
                  className="brutal-btn brutal-btn-ghost text-xs py-2 px-4"
                >
                  Tutup
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* =================================================================== */}
      {/* MODAL 9: TAMBAH TAGIHAN RUTIN BARU (NEW BILL MODAL)                 */}
      {/* =================================================================== */}
      {isAddBillOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-[var(--accent-blue)]" />
                  Tambah Tagihan Rutin
                </h3>
                <p className="text-[10px] font-mono text-[var(--accent-sand)]">Buku Kas: {currentLedger.name}</p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAddBillOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBill} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Tagihan / Langganan</label>
                <input 
                  type="text"
                  value={newBillName}
                  onChange={(e) => setNewBillName(e.target.value)}
                  placeholder="Misal: Netflix Premium, Indihome, BPJS, Listrik PLN"
                  className="brutal-input text-sm"
                  required
                />
              </div>

              {/* Tipe Siklus & Tipe Nominal */}
              <div className="space-y-3">
                <div>
                  <label className="brutal-label">Siklus Pembayaran</label>
                  <div className="grid grid-cols-5 gap-1 p-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    {[
                      { id: 'daily', label: 'Harian' },
                      { id: 'weekly', label: 'Mingguan' },
                      { id: 'monthly', label: 'Bulanan' },
                      { id: 'yearly', label: 'Tahunan' },
                      { id: 'custom', label: 'Kustom' }
                    ].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setNewBillCycle(item.id as BillCycle)}
                        className={`py-1 text-[11px] font-mono font-bold rounded transition-all ${
                          newBillCycle === item.id
                            ? 'bg-[var(--accent-blue)] text-black shadow-[1px_1px_0px_#000]'
                            : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Interval Kustom */}
                {newBillCycle === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] animate-in fade-in duration-150">
                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block uppercase mb-1">Setiap Kelipatan</label>
                      <input
                        type="number"
                        min={1}
                        value={newBillCustomCount}
                        onChange={(e) => setNewBillCustomCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="brutal-input text-xs py-1.5"
                        placeholder="Misal: 10"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block uppercase mb-1">Satuan Waktu</label>
                      <select
                        value={newBillCustomUnit}
                        onChange={(e) => setNewBillCustomUnit(e.target.value as CustomIntervalUnit)}
                        className="brutal-select text-xs py-1.5"
                      >
                        <option value="days">Hari</option>
                        <option value="weeks">Minggu</option>
                        <option value="months">Bulan</option>
                        <option value="years">Tahun</option>
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="brutal-label">Tipe Nominal</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <button
                      type="button"
                      onClick={() => setNewBillPricingType('fixed')}
                      className={`py-1 text-xs font-mono font-bold rounded transition-all ${
                        newBillPricingType === 'fixed'
                          ? 'bg-[var(--accent-blue)] text-black shadow-[1px_1px_0px_#000]'
                          : 'text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      Tetap
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewBillPricingType('variable')}
                      className={`py-1 text-xs font-mono font-bold rounded transition-all ${
                        newBillPricingType === 'variable'
                          ? 'bg-[var(--accent-sand)] text-black shadow-[1px_1px_0px_#000]'
                          : 'text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      Fluktuatif
                    </button>
                  </div>
                </div>
              </div>

              {/* Input Nominal Tetap vs Estimasi Periode Lalu */}
              {newBillPricingType === 'fixed' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Nominal Tetap per Siklus</label>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">Mendukung kalkulator</span>
                  </div>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-blue-light)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={newBillAmount}
                      onChange={(e) => handleBillAmountCalcChange(e.target.value)}
                      placeholder="Contoh: 186000 atau 54000+10000"
                      className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                      required
                    />
                  </div>
                  {billCalcNotice && (
                    <p className="text-xs font-mono text-[var(--accent-blue-light)] mt-1">{billCalcNotice}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Nominal Periode Lalu (Estimasi)</label>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">Mendukung kalkulator</span>
                  </div>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-sand-light)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={newBillLastNominal}
                      onChange={(e) => handleBillLastNominalCalcChange(e.target.value)}
                      placeholder="Contoh: 450000 atau 200000+50000"
                      className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                      required
                    />
                  </div>
                  {newBillLastNominalCalcNotice && (
                    <p className="text-xs font-mono text-[var(--accent-sand-light)] mt-1">{newBillLastNominalCalcNotice}</p>
                  )}
                  <p className="text-[11px] font-mono text-[var(--text-muted)]">
                    💡 Ditampilkan di kartu sebagai <strong>Estimasi/Bulan Lalu</strong> dan otomatis terbarui saat Anda membayar tagihan aktual berikutnya.
                  </p>
                </div>
              )}

              {/* Tanggal Jatuh Tempo Berikutnya */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Jatuh Tempo Berikutnya</label>
                  <input 
                    type="date"
                    value={newBillNextDate}
                    onChange={(e) => setNewBillNextDate(e.target.value)}
                    className="brutal-input text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="brutal-label">Kategori</label>
                  <input 
                    type="text"
                    value={newBillCategory}
                    onChange={(e) => setNewBillCategory(e.target.value)}
                    placeholder="Tagihan & Utilitas"
                    className="brutal-input text-xs"
                  />
                </div>
              </div>

              {/* Akun Default Pembayaran */}
              <div>
                <label className="brutal-label">Akun Kas Sumber Default (Opsional)</label>
                <select
                  value={newBillSourceAccount}
                  onChange={(e) => setNewBillSourceAccount(e.target.value)}
                  className="brutal-select text-xs"
                >
                  <option value="">Pilih akun saat pembayaran nanti</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} — Saldo: {formatRupiah(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Catatan */}
              <div>
                <label className="brutal-label">Catatan Tambahan (Opsional)</label>
                <input 
                  type="text"
                  value={newBillNote}
                  onChange={(e) => setNewBillNote(e.target.value)}
                  placeholder="Misal: ID Pelanggan: 123456789 atau paket bersama"
                  className="brutal-input text-xs"
                />
              </div>

              {/* Warna Kartu */}
              <div>
                <label className="brutal-label">Warna Aksen Kartu</label>
                <div className="flex gap-2 pt-1">
                  {[
                    { color: '#7a9eb3', label: 'Blue' },
                    { color: '#8fa892', label: 'Sage' },
                    { color: '#c88265', label: 'Terracotta' },
                    { color: '#d4bc82', label: 'Sand' },
                    { color: '#9d94b8', label: 'Lavender' }
                  ].map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setNewBillColor(c.color)}
                      className={`w-7 h-7 rounded-[var(--radius-sm)] border-2 transition-transform ${
                        newBillColor === c.color 
                          ? 'border-white scale-110 shadow-[2px_2px_0px_#000]' 
                          : 'border-[var(--border-subtle)]'
                      }`}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setIsAddBillOpen(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-blue text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Simpan Tagihan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 10: BAYAR SEKARANG (PAY BILL MODAL) DENGAN AUTO-RENEWAL        */}
      {/* =================================================================== */}
      {payingBill && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150 border-2 border-[var(--accent-blue)]">
            <div className="flex items-start justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <span className="brutal-badge text-[9px] brutal-badge-blue mb-1">
                  PEMBAYARAN {payingBill.cycle === 'yearly' ? 'TAHUNAN' : 'BULANAN'}
                </span>
                <h3 className="font-heading font-bold text-lg text-white">
                  Bayar Tagihan: {payingBill.name}
                </h3>
                <p className="text-xs font-mono text-[var(--text-muted)]">
                  Jatuh tempo saat ini: <strong className="text-white">{payingBill.nextPaymentDate}</strong>
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setPayingBill(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecutePayBill} className="space-y-4">
              {/* Nominal Pembayaran */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="brutal-label mb-0">
                    {payingBill.pricingType === 'variable' 
                      ? 'Masukkan Nominal Tagihan Periode Ini' 
                      : 'Konfirmasi Nominal Pembayaran'}
                  </label>
                  <span className="text-[10px] font-mono text-[var(--accent-sand)]">Mendukung kalkulator</span>
                </div>

                <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden focus-within:border-[var(--accent-blue)] transition-all">
                  <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-blue-light)] flex items-center select-none shrink-0">
                    Rp
                  </span>
                  <input 
                    type="text"
                    value={payBillAmount}
                    onChange={(e) => handlePayBillAmountCalcChange(e.target.value)}
                    placeholder="Contoh: 150000 atau 75000+2500"
                    className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                    required
                  />
                </div>
                {payBillCalcNotice && (
                  <p className="text-xs font-mono text-[var(--accent-blue-light)] mt-1">{payBillCalcNotice}</p>
                )}
              </div>

              {/* Akun Sumber Pengambilan Kas */}
              <div>
                <label className="brutal-label">Pilih Akun Sumber Dana</label>
                <select
                  value={payBillSourceAccount}
                  onChange={(e) => setPayBillSourceAccount(e.target.value)}
                  className="brutal-select text-sm"
                  required
                >
                  <option value="">Pilih akun kas...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type}) — Saldo: {formatRupiah(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tanggal & Catatan */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Tanggal Bayar</label>
                  <input 
                    type="date"
                    value={payBillDate}
                    onChange={(e) => setPayBillDate(e.target.value)}
                    className="brutal-input text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="brutal-label">Catatan</label>
                  <input 
                    type="text"
                    value={payBillNote}
                    onChange={(e) => setPayBillNote(e.target.value)}
                    className="brutal-input text-xs"
                  />
                </div>
              </div>

              {/* Info Auto-Renewal Tanggal */}
              <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono space-y-1">
                <p className="text-[var(--accent-blue-light)] font-bold flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5" />
                  Auto-Renewal Siklus Tanggal:
                </p>
                <p>
                  Setelah pembayaran berhasil, tanggal jatuh tempo akan otomatis dimajukan 
                  <strong className="text-white"> {payingBill.cycle === 'yearly' ? '1 Tahun' : '1 Bulan'} ke depan</strong>, 
                  dan total akumulasi yang dibayarkan akan bertambah.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setPayingBill(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-blue text-xs flex items-center gap-1.5 font-bold"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Bayar Sekarang</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 11: EDIT TAGIHAN                                              */}
      {/* =================================================================== */}
      {editingBill && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-[var(--accent-blue)]" />
                Edit Tagihan: {editingBill.name}
              </h3>
              <button 
                type="button" 
                onClick={() => setEditingBill(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedBill} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Tagihan</label>
                <input 
                  type="text"
                  value={editBillName}
                  onChange={(e) => setEditBillName(e.target.value)}
                  className="brutal-input text-sm"
                  required
                />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="brutal-label">Siklus Pembayaran</label>
                  <div className="grid grid-cols-5 gap-1 p-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    {[
                      { id: 'daily', label: 'Harian' },
                      { id: 'weekly', label: 'Mingguan' },
                      { id: 'monthly', label: 'Bulanan' },
                      { id: 'yearly', label: 'Tahunan' },
                      { id: 'custom', label: 'Kustom' }
                    ].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEditBillCycle(item.id as BillCycle)}
                        className={`py-1 text-[11px] font-mono font-bold rounded transition-all ${
                          editBillCycle === item.id
                            ? 'bg-[var(--accent-blue)] text-black shadow-[1px_1px_0px_#000]'
                            : 'text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Interval Kustom */}
                {editBillCycle === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] animate-in fade-in duration-150">
                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block uppercase mb-1">Setiap Kelipatan</label>
                      <input
                        type="number"
                        min={1}
                        value={editBillCustomCount}
                        onChange={(e) => setEditBillCustomCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="brutal-input text-xs py-1.5"
                        placeholder="Misal: 10"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block uppercase mb-1">Satuan Waktu</label>
                      <select
                        value={editBillCustomUnit}
                        onChange={(e) => setEditBillCustomUnit(e.target.value as CustomIntervalUnit)}
                        className="brutal-select text-xs py-1.5"
                      >
                        <option value="days">Hari</option>
                        <option value="weeks">Minggu</option>
                        <option value="months">Bulan</option>
                        <option value="years">Tahun</option>
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="brutal-label">Tipe Nominal</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)]">
                    <button
                      type="button"
                      onClick={() => setEditBillPricingType('fixed')}
                      className={`py-1 text-xs font-mono font-bold rounded transition-all ${
                        editBillPricingType === 'fixed'
                          ? 'bg-[var(--accent-blue)] text-black shadow-[1px_1px_0px_#000]'
                          : 'text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      Tetap
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditBillPricingType('variable')}
                      className={`py-1 text-xs font-mono font-bold rounded transition-all ${
                        editBillPricingType === 'variable'
                          ? 'bg-[var(--accent-sand)] text-black shadow-[1px_1px_0px_#000]'
                          : 'text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      Fluktuatif
                    </button>
                  </div>
                </div>
              </div>

              {editBillPricingType === 'fixed' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Nominal Tetap per Siklus</label>
                  </div>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-blue-light)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={editBillAmount}
                      onChange={(e) => setEditBillAmount(e.target.value)}
                      className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Nominal Periode Lalu (Estimasi)</label>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">Mendukung kalkulator</span>
                  </div>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-sand-light)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={editBillLastNominal}
                      onChange={(e) => handleEditBillLastNominalCalcChange(e.target.value)}
                      placeholder="Contoh: 450000"
                      className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                    />
                  </div>
                  {editBillLastNominalCalcNotice && (
                    <p className="text-xs font-mono text-[var(--accent-sand-light)] mt-1">{editBillLastNominalCalcNotice}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Jatuh Tempo Berikutnya</label>
                  <input 
                    type="date"
                    value={editBillNextDate}
                    onChange={(e) => setEditBillNextDate(e.target.value)}
                    className="brutal-input text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="brutal-label">Kategori</label>
                  <input 
                    type="text"
                    value={editBillCategory}
                    onChange={(e) => setEditBillCategory(e.target.value)}
                    className="brutal-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="brutal-label">Akun Kas Sumber</label>
                <select
                  value={editBillSourceAccount}
                  onChange={(e) => setEditBillSourceAccount(e.target.value)}
                  className="brutal-select text-xs"
                >
                  <option value="">Pilih akun kas...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="brutal-label">Catatan</label>
                <input 
                  type="text"
                  value={editBillNote}
                  onChange={(e) => setEditBillNote(e.target.value)}
                  className="brutal-input text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setEditingBill(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-blue text-xs font-bold"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 12: KONFIRMASI HAPUS TAGIHAN                                  */}
      {/* =================================================================== */}
      {billToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] border-2 border-[var(--accent-terracotta)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-terracotta-dark)] border-2 border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-white">Hapus Tagihan?</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Apakah Anda yakin ingin menghapus tagihan <strong className="text-white">"{billToDelete.name}"</strong>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono">
              ℹ️ Pengingat tagihan ini akan dihapus. Riwayat transaksi pembayaran yang sudah dilakukan sebelumnya tetap tersimpan di riwayat kas Anda.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setBillToDelete(null)}
                className="brutal-btn brutal-btn-ghost text-xs"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={confirmExecuteDeleteBill}
                className="brutal-btn brutal-btn-terracotta text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Tagihan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 13: CATAT UTANG BARU (NEW DEBT MODAL)                         */}
      {/* =================================================================== */}
      {isAddDebtOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[var(--accent-terracotta)]" />
                  Catat Utang / Pinjaman Baru
                </h3>
                <p className="text-[10px] font-mono text-[var(--accent-sand)]">Buku Kas: {currentLedger.name}</p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAddDebtOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDebt} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Utang / Pinjaman</label>
                <input 
                  type="text"
                  value={newDebtName}
                  onChange={(e) => setNewDebtName(e.target.value)}
                  placeholder="Misal: Cicilan Motor Honda, KPR Mandiri, Pinjaman Teman Budi"
                  className="brutal-input text-sm"
                  required
                />
              </div>

              <div>
                <label className="brutal-label">Pihak Pemberi Pinjaman (Lender)</label>
                <input 
                  type="text"
                  value={newDebtLender}
                  onChange={(e) => setNewDebtLender(e.target.value)}
                  placeholder="Misal: BCA Finance, FIF, Teman Budi"
                  className="brutal-input text-sm"
                />
              </div>

              {/* Total Utang & Sisa Utang */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Total Utang Awal</label>
                  </div>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-2.5 py-1.5 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-xs text-[var(--accent-terracotta-light)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={newDebtTotal}
                      onChange={(e) => handleDebtTotalCalcChange(e.target.value)}
                      placeholder="10000000"
                      className="w-full bg-transparent px-2.5 py-1.5 text-[var(--text-primary)] font-mono font-bold text-sm focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Sisa Pokok Saat Ini</label>
                  </div>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-2.5 py-1.5 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-xs text-[var(--accent-terracotta-light)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={newDebtRemaining}
                      onChange={(e) => setNewDebtRemaining(e.target.value)}
                      placeholder="Sisa belum lunas"
                      className="w-full bg-transparent px-2.5 py-1.5 text-[var(--text-primary)] font-mono font-bold text-sm focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {debtCalcNotice && (
                <p className="text-xs font-mono text-[var(--accent-terracotta-light)]">{debtCalcNotice}</p>
              )}

              {/* Tanggal Jatuh Tempo Berikutnya (Wajib/Terdekat) */}
              <div>
                <label className="brutal-label">Tanggal Jatuh Tempo Terdekat / Berikutnya</label>
                <input 
                  type="date"
                  value={newDebtNextDate}
                  onChange={(e) => setNewDebtNextDate(e.target.value)}
                  className="brutal-input text-xs"
                  required
                />
                <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
                  Jadwal siklus pembayaran terdekat untuk kalkulasi countdown pengingat.
                </p>
              </div>

              {/* Siklus Pembayaran Cicilan */}
              <div>
                <label className="brutal-label">Siklus Pembayaran Cicilan</label>
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  {[
                    { id: 'daily', label: 'Harian' },
                    { id: 'weekly', label: 'Mingguan' },
                    { id: 'monthly', label: 'Bulanan' },
                    { id: 'yearly', label: 'Tahunan' },
                    { id: 'custom', label: 'Kustom' },
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewDebtCycle(c.id as any)}
                      className={`py-1.5 px-1 text-center font-mono text-xs rounded border-2 transition-all ${
                        newDebtCycle === c.id
                          ? 'border-[var(--accent-terracotta)] bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] font-bold shadow-[2px_2px_0px_#000]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Input Khusus Interval Kustom */}
                {newDebtCycle === 'custom' && (
                  <div className="mt-3 p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2">
                    <p className="text-xs font-mono text-[var(--accent-terracotta-light)] font-bold">
                      Pengaturan Interval Kustom
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-[var(--text-secondary)] block mb-1">Setiap Berapa</label>
                        <input 
                          type="number"
                          min="1"
                          max="365"
                          value={newDebtCustomCount}
                          onChange={(e) => setNewDebtCustomCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="brutal-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-[var(--text-secondary)] block mb-1">Satuan Waktu</label>
                        <select
                          value={newDebtCustomUnit}
                          onChange={(e) => setNewDebtCustomUnit(e.target.value as CustomIntervalUnit)}
                          className="brutal-select text-xs"
                        >
                          <option value="days">Hari</option>
                          <option value="weeks">Minggu</option>
                          <option value="months">Bulan</option>
                          <option value="years">Tahun</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tanggal Target Pelunasan Akhir (Opsional) */}
              <div>
                <label className="brutal-label">Target Pelunasan Akhir (Opsional)</label>
                <input 
                  type="date"
                  value={newDebtDueDate}
                  onChange={(e) => setNewDebtDueDate(e.target.value)}
                  className="brutal-input text-xs"
                />
              </div>

              {/* Catatan */}
              <div>
                <label className="brutal-label">Catatan (Opsional)</label>
                <input 
                  type="text"
                  value={newDebtNote}
                  onChange={(e) => setNewDebtNote(e.target.value)}
                  placeholder="Misal: Jatuh tempo tanggal 25 tiap bulan, bunga 0%"
                  className="brutal-input text-xs"
                />
              </div>

              {/* Pilihan Warna */}
              <div>
                <label className="brutal-label">Warna Identitas Utang</label>
                <div className="flex gap-2 pt-1">
                  {[
                    { color: '#c88265', label: 'Terracotta' },
                    { color: '#d4bc82', label: 'Sand' },
                    { color: '#7a9eb3', label: 'Blue' },
                    { color: '#8fa892', label: 'Sage' },
                    { color: '#9d94b8', label: 'Lavender' }
                  ].map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setNewDebtColor(c.color)}
                      className={`w-7 h-7 rounded-[var(--radius-sm)] border-2 transition-transform ${
                        newDebtColor === c.color 
                          ? 'border-white scale-110 shadow-[2px_2px_0px_#000]' 
                          : 'border-[var(--border-subtle)]'
                      }`}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setIsAddDebtOpen(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-terracotta text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Simpan Catatan Utang</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 14: BAYAR CICILAN UTANG (PAY DEBT INSTALLMENT MODAL)          */}
      {/* =================================================================== */}
      {payingDebt && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150 border-2 border-[var(--accent-terracotta)]">
            <div className="flex items-start justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <span className="brutal-badge text-[9px] brutal-badge-terracotta mb-1">
                  PEMBAYARAN CICILAN
                </span>
                <h3 className="font-heading font-bold text-lg text-white">
                  {payingDebt.name}
                </h3>
                {payingDebt.lender && (
                  <p className="text-xs font-mono text-[var(--accent-sand)]">
                    Pemberi Pinjaman: {payingDebt.lender}
                  </p>
                )}
              </div>
              <button 
                type="button" 
                onClick={() => setPayingDebt(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Banner Status Sisa Utang */}
            <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Sisa Utang Saat Ini</p>
                <p className="font-mono font-bold text-lg text-[var(--accent-terracotta-light)]">
                  {formatRupiah(payingDebt.remainingDebt)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Total Awal</p>
                <p className="font-mono font-semibold text-xs text-white">
                  {formatRupiah(payingDebt.totalDebt)}
                </p>
              </div>
            </div>

            <form onSubmit={handleExecutePayDebt} className="space-y-4">
              {/* Nominal Pembayaran Cicilan */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="brutal-label mb-0">Nominal Cicilan yang Dibayar</label>
                  <span className="text-[10px] font-mono text-[var(--accent-sand)]">Mendukung kalkulator</span>
                </div>

                <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden focus-within:border-[var(--accent-terracotta)] transition-all">
                  <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-terracotta-light)] flex items-center select-none shrink-0">
                    Rp
                  </span>
                  <input 
                    type="text"
                    value={payDebtAmount}
                    onChange={(e) => handlePayDebtAmountCalcChange(e.target.value)}
                    placeholder="Contoh: 500000 atau 250000*2"
                    className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                    required
                  />
                </div>
                {payDebtCalcNotice && (
                  <p className="text-xs font-mono text-[var(--accent-terracotta-light)] mt-1">{payDebtCalcNotice}</p>
                )}

                {/* Quick Chips Nominal Cicilan */}
                <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                  {[250000, 500000, 1000000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        const cur = parseInt(payDebtAmount.replace(/[^\d]/g, '') || '0', 10);
                        setPayDebtAmount((cur + amt).toString());
                      }}
                      className="px-2 py-0.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded text-[11px] font-mono text-[var(--text-secondary)] whitespace-nowrap"
                    >
                      +{amt >= 1000000 ? `${amt / 1000000}jt` : `${amt / 1000}k`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setPayDebtAmount(String(payingDebt.remainingDebt));
                    }}
                    className="px-2 py-0.5 bg-[var(--accent-terracotta-dark)] hover:bg-[var(--bg-muted)] border border-[var(--accent-terracotta)] rounded text-[11px] font-mono text-[var(--accent-terracotta-light)] whitespace-nowrap font-bold"
                  >
                    Lunasi Semua Sisa
                  </button>
                </div>
              </div>

              {/* Akun Kas Sumber Dana */}
              <div>
                <label className="brutal-label">Pilih Akun Kas Pemotong Saldo</label>
                <select
                  value={payDebtSourceAccount}
                  onChange={(e) => setPayDebtSourceAccount(e.target.value)}
                  className="brutal-select text-sm"
                  required
                >
                  <option value="">Pilih akun kas...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} — Saldo: {formatRupiah(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tanggal & Catatan */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Tanggal Bayar</label>
                  <input 
                    type="date"
                    value={payDebtDate}
                    onChange={(e) => setPayDebtDate(e.target.value)}
                    className="brutal-input text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="brutal-label">Catatan</label>
                  <input 
                    type="text"
                    value={payDebtNote}
                    onChange={(e) => setPayDebtNote(e.target.value)}
                    className="brutal-input text-xs"
                  />
                </div>
              </div>

              <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono space-y-0.5">
                <p className="text-[var(--accent-terracotta-light)] font-bold">ℹ️ Integrasi Atomik Transaksi:</p>
                <p>Nominal cicilan akan langsung memotong saldo akun kas, mencatat transaksi pengeluaran di Firestore, dan mengurangi sisa pokok utang secara serentak.</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setPayingDebt(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-terracotta text-xs flex items-center gap-1.5 font-bold"
                >
                  <Banknote className="w-4 h-4" />
                  <span>Bayar Cicilan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 15: EDIT UTANG                                                */}
      {/* =================================================================== */}
      {editingDebt && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-[var(--accent-terracotta)]" />
                Edit Utang: {editingDebt.name}
              </h3>
              <button 
                type="button" 
                onClick={() => setEditingDebt(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedDebt} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Utang</label>
                <input 
                  type="text"
                  value={editDebtName}
                  onChange={(e) => setEditDebtName(e.target.value)}
                  className="brutal-input text-sm"
                  required
                />
              </div>

              <div>
                <label className="brutal-label">Pemberi Pinjaman (Lender)</label>
                <input 
                  type="text"
                  value={editDebtLender}
                  onChange={(e) => setEditDebtLender(e.target.value)}
                  className="brutal-input text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Total Utang Awal</label>
                  <input 
                    type="text"
                    value={editDebtTotal}
                    onChange={(e) => setEditDebtTotal(e.target.value)}
                    className="brutal-input text-sm font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="brutal-label">Sisa Pokok Utang</label>
                  <input 
                    type="text"
                    value={editDebtRemaining}
                    onChange={(e) => setEditDebtRemaining(e.target.value)}
                    className="brutal-input text-sm font-mono"
                    required
                  />
                </div>
              </div>

              {/* Tanggal Jatuh Tempo Terdekat / Berikutnya */}
              <div>
                <label className="brutal-label">Tanggal Jatuh Tempo Terdekat / Berikutnya</label>
                <input 
                  type="date"
                  value={editDebtNextDate}
                  onChange={(e) => setEditDebtNextDate(e.target.value)}
                  className="brutal-input text-xs"
                  required
                />
              </div>

              {/* Siklus Pembayaran Cicilan */}
              <div>
                <label className="brutal-label">Siklus Pembayaran Cicilan</label>
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  {[
                    { id: 'daily', label: 'Harian' },
                    { id: 'weekly', label: 'Mingguan' },
                    { id: 'monthly', label: 'Bulanan' },
                    { id: 'yearly', label: 'Tahunan' },
                    { id: 'custom', label: 'Kustom' },
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditDebtCycle(c.id as any)}
                      className={`py-1.5 px-1 text-center font-mono text-xs rounded border-2 transition-all ${
                        editDebtCycle === c.id
                          ? 'border-[var(--accent-terracotta)] bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] font-bold shadow-[2px_2px_0px_#000]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Input Khusus Interval Kustom */}
                {editDebtCycle === 'custom' && (
                  <div className="mt-3 p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2">
                    <p className="text-xs font-mono text-[var(--accent-terracotta-light)] font-bold">
                      Pengaturan Interval Kustom
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-[var(--text-secondary)] block mb-1">Setiap Berapa</label>
                        <input 
                          type="number"
                          min="1"
                          max="365"
                          value={editDebtCustomCount}
                          onChange={(e) => setEditDebtCustomCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="brutal-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-[var(--text-secondary)] block mb-1">Satuan Waktu</label>
                        <select
                          value={editDebtCustomUnit}
                          onChange={(e) => setEditDebtCustomUnit(e.target.value as CustomIntervalUnit)}
                          className="brutal-select text-xs"
                        >
                          <option value="days">Hari</option>
                          <option value="weeks">Minggu</option>
                          <option value="months">Bulan</option>
                          <option value="years">Tahun</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="brutal-label">Tanggal Target Pelunasan Akhir (Opsional)</label>
                <input 
                  type="date"
                  value={editDebtDueDate}
                  onChange={(e) => setEditDebtDueDate(e.target.value)}
                  className="brutal-input text-xs"
                />
              </div>

              <div>
                <label className="brutal-label">Catatan</label>
                <input 
                  type="text"
                  value={editDebtNote}
                  onChange={(e) => setEditDebtNote(e.target.value)}
                  className="brutal-input text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setEditingDebt(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-terracotta text-xs font-bold"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 16: KONFIRMASI HAPUS UTANG                                    */}
      {/* =================================================================== */}
      {debtToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] border-2 border-[var(--accent-terracotta)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-terracotta-dark)] border-2 border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-white">Hapus Data Utang?</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Apakah Anda yakin ingin menghapus data utang <strong className="text-white">"{debtToDelete.name}"</strong> dengan sisa utang saat ini <strong className="font-mono text-white">{formatRupiah(debtToDelete.remainingDebt)}</strong>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono">
              ℹ️ Dokumen utang ini akan dihapus. Riwayat transaksi cicilan yang telah dicatat sebelumnya tetap tersimpan di riwayat kas Anda.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setDebtToDelete(null)}
                className="brutal-btn brutal-btn-ghost text-xs"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={confirmExecuteDeleteDebt}
                className="brutal-btn brutal-btn-terracotta text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Utang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 17: DETAIL & RIWAYAT TAGIHAN (PROGRESSIVE DISCLOSURE)        */}
      {/* =================================================================== */}
      {selectedBillForDetail && (() => {
        const bill = bills.find(b => b.id === selectedBillForDetail.id) || selectedBillForDetail;
        const dueStatus = getBillDueStatus(bill.nextPaymentDate);
        const sourceAcc = accounts.find(a => a.id === bill.sourceAccountId);
        const billTransactions = transactions.filter(t => t.billId === bill.id);

        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
            <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-lg w-full space-y-5 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150 border-2">
              
              {/* Header Modal */}
              <div className="flex items-start justify-between border-b-2 border-[var(--border-subtle)] pb-3 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="brutal-badge text-[10px] font-mono font-bold bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                      {getCycleLabel(bill.cycle, bill.customIntervalCount, bill.customIntervalUnit).toUpperCase()}
                    </span>
                    <span className={`brutal-badge text-[10px] font-mono font-bold ${
                      bill.pricingType === 'fixed' 
                        ? 'bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border border-[var(--accent-blue)]' 
                        : 'bg-[var(--accent-sand-dark)] text-[var(--accent-sand-light)] border border-[var(--accent-sand)]'
                    }`}>
                      {bill.pricingType === 'fixed' ? 'NOMINAL TETAP' : 'NOMINAL BERVARIASI'}
                    </span>
                    {bill.category && (
                      <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-muted)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                        {bill.category}
                      </span>
                    )}
                  </div>
                  <h3 className="font-heading font-bold text-xl text-white tracking-tight">
                    {bill.name}
                  </h3>
                </div>

                <button 
                  type="button" 
                  onClick={() => setSelectedBillForDetail(null)}
                  className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                  title="Tutup Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Banner Overview / Metadata Ringkas */}
              <div className="p-4 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] space-y-3 shadow-[var(--shadow-sm)]">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[10px] font-heading uppercase text-[var(--text-secondary)]">Nominal Tagihan</p>
                    {bill.pricingType === 'fixed' ? (
                      <p className="text-2xl font-mono font-bold text-[var(--accent-blue-light)] tracking-tight">
                        {formatRupiah(bill.fixedAmount || 0)}
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        <p className="text-xl font-mono font-bold text-[var(--accent-sand)]">
                          {bill.lastNominal ? `Estimasi: ${formatRupiah(bill.lastNominal)}` : 'Estimasi: Rp 0'}
                        </p>
                        <p className="text-[10px] font-mono text-[var(--text-muted)]">
                          {bill.lastNominal ? '(Berdasarkan pembayaran terakhir)' : '(Menunggu pembayaran aktual pertama)'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-heading uppercase text-[var(--text-secondary)]">Total Dibayarkan Sejauh Ini</p>
                    <p className="text-sm font-mono font-bold text-white">
                      {formatRupiah(bill.totalPaid || 0)}
                    </p>
                  </div>
                </div>

                {/* Metadata Tambahan */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs font-mono">
                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">Jatuh Tempo Berikutnya</span>
                    <span className="font-bold text-white flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                      {bill.nextPaymentDate}
                    </span>
                  </div>

                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">Status Pembayaran</span>
                    <span className="inline-block mt-0.5 font-bold">
                      {dueStatus.isOverdue ? (
                        <span className="text-[var(--accent-terracotta-light)]">⚠️ Terlambat {Math.abs(dueStatus.daysLeft)} Hari</span>
                      ) : dueStatus.isToday ? (
                        <span className="text-[var(--accent-terracotta-light)]">⚡ Hari Ini!</span>
                      ) : (
                        <span className="text-[var(--accent-sage-light)]">✓ Sisa {dueStatus.daysLeft} Hari</span>
                      )}
                    </span>
                  </div>

                  {sourceAcc && (
                    <div className="col-span-2 pt-1">
                      <span className="text-[var(--text-muted)] block text-[10px] uppercase">Akun Kas Sumber Terkait</span>
                      <span className="text-[var(--accent-blue-light)] font-bold">{sourceAcc.name} (Saldo: {formatRupiah(sourceAcc.balance)})</span>
                    </div>
                  )}

                  {bill.note && (
                    <div className="col-span-2 pt-1 text-[var(--text-secondary)] font-sans text-xs">
                      <span className="text-[var(--text-muted)] block text-[10px] font-mono uppercase">Catatan</span>
                      <p className="mt-0.5">{bill.note}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* List Riwayat Pembayaran Tagihan */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[var(--accent-blue)]" />
                    <h4 className="font-heading font-bold text-sm text-white">
                      Riwayat Pembayaran Tagihan
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono rounded text-[var(--text-secondary)]">
                    {billTransactions.length} Pembayaran
                  </span>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {billTransactions.length === 0 ? (
                    <div className="p-6 bg-[var(--bg-elevated)] border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center space-y-2">
                      <Receipt className="w-6 h-6 text-[var(--accent-blue)] mx-auto opacity-70" />
                      <p className="font-heading text-xs font-bold text-white">
                        Belum ada riwayat pembayaran untuk tagihan ini
                      </p>
                      <p className="text-[11px] font-mono text-[var(--text-muted)]">
                        Klik tombol "+ Bayar Sekarang" di bawah untuk mencatat pembayaran periode ini.
                      </p>
                    </div>
                  ) : (
                    billTransactions.map(tx => {
                      const acc = accounts.find(a => a.id === tx.accountId);
                      return (
                        <div
                          key={tx.id}
                          className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent-blue-dark)] border border-[var(--accent-blue)] text-[var(--accent-blue-light)] flex items-center justify-center shrink-0">
                              <CreditCard className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-white">
                                  {tx.date}
                                </span>
                                {acc && (
                                  <span className="text-[10px] font-mono text-[var(--accent-sage-light)] bg-[var(--bg-muted)] px-1.5 py-0.2 rounded border border-[var(--border-subtle)]">
                                    {acc.name}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
                                {tx.note || tx.category || 'Pembayaran Tagihan'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <span className="font-mono font-bold text-sm text-[var(--accent-blue-light)]">
                              -{formatRupiah(tx.amount)}
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditTransactionModal(tx)}
                                className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-colors"
                                title="Edit Transaksi Ini"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTxToDelete(tx)}
                                className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-terracotta)] rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-colors"
                                title="Hapus Transaksi Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer Tombol Aksi Modal */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    const targetBill = bill;
                    setSelectedBillForDetail(null);
                    openPayBillModal(targetBill);
                  }}
                  className="brutal-btn brutal-btn-blue text-xs py-2 px-4 flex items-center gap-1.5 font-bold"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>+ Bayar Sekarang</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedBillForDetail(null)}
                  className="brutal-btn brutal-btn-ghost text-xs py-2 px-4"
                >
                  Tutup
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* =================================================================== */}
      {/* MODAL 18: DETAIL & RIWAYAT UTANG / CICILAN                         */}
      {/* =================================================================== */}
      {selectedDebtForDetail && (() => {
        const debt = debts.find(d => d.id === selectedDebtForDetail.id) || selectedDebtForDetail;
        const progress = debt.totalDebt > 0 ? Math.min(100, Math.round(((debt.totalDebt - debt.remainingDebt) / debt.totalDebt) * 100)) : 100;
        const paidAmount = Math.max(0, debt.totalDebt - debt.remainingDebt);
        const debtTransactions = transactions.filter(t => t.debtId === debt.id);
        const dueStatus = getBillDueStatus(debt.nextPaymentDate);

        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
            <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-lg w-full space-y-5 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150 border-2">
              
              {/* Header Modal */}
              <div className="flex items-start justify-between border-b-2 border-[var(--border-subtle)] pb-3 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {debt.isPaidOff ? (
                      <span className="brutal-badge brutal-badge-sage text-[10px] font-mono font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> LUNAS SEPENUHNYA
                      </span>
                    ) : (
                      <span className="brutal-badge brutal-badge-terracotta text-[10px] font-mono font-bold">
                        CICILAN BERJALAN
                      </span>
                    )}
                    <span className="brutal-badge text-[10px] font-mono font-bold bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                      SIKLUS: {getCycleLabel(debt.cycle, debt.customIntervalCount, debt.customIntervalUnit).toUpperCase()}
                    </span>
                    {debt.lender && (
                      <span className="text-[10px] font-mono text-[var(--accent-sand-light)] bg-[var(--bg-muted)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                        Lender: {debt.lender}
                      </span>
                    )}
                  </div>
                  <h3 className="font-heading font-bold text-xl text-white tracking-tight">
                    {debt.name}
                  </h3>
                </div>

                <button 
                  type="button" 
                  onClick={() => setSelectedDebtForDetail(null)}
                  className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                  title="Tutup Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Banner Overview / Metrik Utang */}
              <div className="p-4 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] space-y-3 shadow-[var(--shadow-sm)]">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[10px] font-heading uppercase text-[var(--text-secondary)]">Sisa Pokok Utang</p>
                    <p className="text-2xl font-mono font-bold text-[var(--accent-terracotta-light)] tracking-tight">
                      {formatRupiah(debt.remainingDebt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-heading uppercase text-[var(--text-secondary)]">Total Pinjaman Awal</p>
                    <p className="text-sm font-mono font-bold text-white">
                      {formatRupiah(debt.totalDebt)}
                    </p>
                  </div>
                </div>

                {/* Progress Bar Pelunasan */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[var(--text-secondary)]">Telah Dilunasi</span>
                    <span className="font-bold text-[var(--accent-sand)]">{progress}% ({formatRupiah(paidAmount)})</span>
                  </div>
                  <div className="brutal-progress-container h-3">
                    <div 
                      className="brutal-progress-bar"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: debt.isPaidOff 
                          ? 'var(--accent-sage)' 
                          : (debt.colorAccent || 'var(--accent-terracotta)')
                      }}
                    />
                  </div>
                </div>

                {/* Metadata Tambahan */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs font-mono">
                  {debt.nextPaymentDate && (
                    <div>
                      <span className="text-[var(--text-muted)] block text-[10px] uppercase">Jatuh Tempo Terdekat</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-bold text-white flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[var(--accent-terracotta-light)]" />
                          {debt.nextPaymentDate}
                        </span>
                        {!debt.isPaidOff && (
                          <span className="inline-block font-bold">
                            {dueStatus.isOverdue ? (
                              <span className="text-[var(--accent-terracotta-light)]">⚠️ H-{Math.abs(dueStatus.daysLeft)}</span>
                            ) : dueStatus.isToday ? (
                              <span className="text-[var(--accent-terracotta-light)]">⚡ Hari Ini!</span>
                            ) : (
                              <span className="text-[var(--accent-sage-light)]">✓ {dueStatus.daysLeft} Hari</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">Siklus Cicilan</span>
                    <span className="font-bold text-[var(--accent-sand)]">{getCycleLabel(debt.cycle, debt.customIntervalCount, debt.customIntervalUnit)}</span>
                  </div>

                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">Pihak Pemberi Pinjaman</span>
                    <span className="font-bold text-white">{debt.lender || 'Tidak disebutkan'}</span>
                  </div>

                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">Target Pelunasan Akhir</span>
                    <span className="font-bold text-white">{debt.dueDate || 'Tanpa batas waktu'}</span>
                  </div>

                  {debt.note && (
                    <div className="col-span-2 pt-1 text-[var(--text-secondary)] font-sans text-xs">
                      <span className="text-[var(--text-muted)] block text-[10px] font-mono uppercase">Catatan Pinjaman</span>
                      <p className="mt-0.5">{debt.note}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* List Riwayat Pembayaran Cicilan */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[var(--accent-terracotta)]" />
                    <h4 className="font-heading font-bold text-sm text-white">
                      Riwayat Pembayaran Cicilan
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono rounded text-[var(--text-secondary)]">
                    {debtTransactions.length} Transaksi
                  </span>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {debtTransactions.length === 0 ? (
                    <div className="p-6 bg-[var(--bg-elevated)] border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center space-y-2">
                      <Banknote className="w-6 h-6 text-[var(--accent-terracotta)] mx-auto opacity-70" />
                      <p className="font-heading text-xs font-bold text-white">
                        Belum ada riwayat pembayaran cicilan untuk utang ini
                      </p>
                      <p className="text-[11px] font-mono text-[var(--text-muted)]">
                        Klik tombol "+ Bayar Cicilan" di bawah untuk mencatat pembayaran pokok utang.
                      </p>
                    </div>
                  ) : (
                    debtTransactions.map(tx => {
                      const acc = accounts.find(a => a.id === tx.accountId);
                      return (
                        <div
                          key={tx.id}
                          className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent-terracotta-dark)] border border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)] flex items-center justify-center shrink-0">
                              <Banknote className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-white">
                                  {tx.date}
                                </span>
                                {acc && (
                                  <span className="text-[10px] font-mono text-[var(--accent-sage-light)] bg-[var(--bg-muted)] px-1.5 py-0.2 rounded border border-[var(--border-subtle)]">
                                    {acc.name}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
                                {tx.note || 'Pembayaran Cicilan Utang'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <span className="font-mono font-bold text-sm text-[var(--accent-terracotta-light)]">
                              -{formatRupiah(tx.amount)}
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditTransactionModal(tx)}
                                className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-colors"
                                title="Edit Cicilan Ini"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTxToDelete(tx)}
                                className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-terracotta)] rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-colors"
                                title="Hapus Cicilan Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer Tombol Aksi Modal */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    const targetDebt = debt;
                    setSelectedDebtForDetail(null);
                    openPayDebtModal(targetDebt);
                  }}
                  disabled={debt.isPaidOff}
                  className={`brutal-btn text-xs py-2 px-4 flex items-center gap-1.5 font-bold ${
                    debt.isPaidOff 
                      ? 'opacity-60 bg-[var(--bg-elevated)] border-[var(--border-subtle)] cursor-not-allowed text-[var(--text-secondary)]'
                      : 'brutal-btn-terracotta'
                  }`}
                >
                  <Banknote className="w-3.5 h-3.5" />
                  <span>{debt.isPaidOff ? 'Utang Telah Lunas 🎉' : '+ Bayar Cicilan'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedDebtForDetail(null)}
                  className="brutal-btn brutal-btn-ghost text-xs py-2 px-4"
                >
                  Tutup
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* =================================================================== */}
      {/* MODAL 19: BUAT ATURAN OTOMATISASI BARU (NEW AUTOMATION RULE)        */}
      {/* =================================================================== */}
      {isAddAutomationOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[var(--accent-sand)]" />
                  Buat Aturan Otomatisasi Baru
                </h3>
                <p className="text-[10px] font-mono text-[var(--accent-sand-light)]">Buku Kas: {currentLedger.name}</p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAddAutomationOpen(false)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={apKind ? handleCreateAutopilot : handleCreateAutomation} className="space-y-4">
              {/* Tipe Transaksi Otomatis */}
              <div>
                <label className="brutal-label">Tipe Transaksi Otomatis</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'income', label: 'Pemasukan', icon: TrendingUp, color: 'var(--accent-sage)', desc: 'Auto-Income (Gaji, Dividen)' },
                    { id: 'expense', label: 'Pengeluaran', icon: TrendingDown, color: 'var(--accent-terracotta)', desc: 'Auto-Expense (Biaya Admin)' },
                    { id: 'transfer', label: 'Transfer', icon: ArrowRightLeft, color: 'var(--accent-blue)', desc: 'Auto-Transfer (Nabung)' },
                    { id: 'ap_goal_topup', label: 'Top-up Tabungan', icon: ApPiggy, color: 'var(--accent-sand)', desc: 'Setor ke Sinking Fund' },
                    { id: 'ap_pay_bill', label: 'Bayar Tagihan', icon: ApReceipt, color: 'var(--accent-lavender)', desc: 'Lunasi saat jatuh tempo' },
                    { id: 'ap_pay_debt', label: 'Cicil Utang', icon: ApLandmark, color: 'var(--accent-terracotta)', desc: 'Cicilan otomatis' }
                  ].map(t => {
                    const IconComp = t.icon;
                    const isAp = t.id.startsWith('ap_');
                    const isSelected = isAp ? apKind === t.id.slice(3) : (!apKind && newAutoType === t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          if (isAp) { setApKind(t.id.slice(3) as AutopilotKind); setApDraft(emptyApDraft()); return; }
                          setApKind(null);
                          setNewAutoType(t.id as AutomationType);
                          if (t.id === 'income') {
                            setNewAutoCategory('Gaji & Pendapatan');
                            setNewAutoColor('#8fa892');
                          } else if (t.id === 'expense') {
                            setNewAutoCategory('Biaya Layanan & Admin');
                            setNewAutoColor('#c88265');
                          } else {
                            setNewAutoCategory('Transfer Tabungan');
                            setNewAutoColor('#7a9eb3');
                          }
                        }}
                        className={`p-2.5 rounded-[var(--radius-sm)] border-2 text-left transition-all ${
                          isSelected
                            ? 'bg-[var(--bg-elevated)] border-white text-white shadow-[2px_2px_0px_#000]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-heading font-bold text-xs" style={{ color: t.color }}>
                          <IconComp className="w-3.5 h-3.5" />
                          <span>{t.label}</span>
                        </div>
                        <p className="text-[9px] text-[var(--text-muted)] mt-1 font-mono leading-tight">{t.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {apKind ? (
                <AutopilotFields kind={apKind} draft={apDraft} onChange={setApDraft} accounts={accounts} goals={goals} bills={bills} debts={debts} />
              ) : (<>
              {/* Nama Aturan */}
              <div>
                <label className="brutal-label">Nama Aturan Otomatis</label>
                <input 
                  type="text"
                  value={newAutoName}
                  onChange={(e) => setNewAutoName(e.target.value)}
                  placeholder={
                    newAutoType === 'income' 
                      ? "Misal: Gaji Bulanan Kantor, Passive Income Sewa" 
                      : newAutoType === 'expense' 
                      ? "Misal: Potongan Admin Bank, Iuran Kebersihan" 
                      : "Misal: Sisihkan Gaji ke Jago, Alokasi Dana Dingin"
                  }
                  className="brutal-input text-sm"
                  required
                />
              </div>

              {/* Kategori & Nominal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Kategori</label>
                  <input 
                    type="text"
                    value={newAutoCategory}
                    onChange={(e) => setNewAutoCategory(e.target.value)}
                    placeholder="Misal: Gaji, Operasional, Tabungan"
                    className="brutal-input text-xs"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Nominal Transaksi</label>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">Kalkulator</span>
                  </div>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-2.5 py-1.5 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-xs text-white flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={newAutoAmount}
                      onChange={(e) => handleAutoAmountCalcChange(e.target.value)}
                      placeholder="1000000"
                      className="w-full bg-transparent px-2.5 py-1.5 text-[var(--text-primary)] font-mono font-bold text-sm focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {autoCalcNotice && (
                <p className="text-xs font-mono text-[var(--accent-sand-light)]">{autoCalcNotice}</p>
              )}

              {/* Akun Sumber & Akun Tujuan (Khusus Transfer) */}
              <div className={`grid ${newAutoType === 'transfer' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3`}>
                <div>
                  <label className="brutal-label">
                    {newAutoType === 'income' ? 'Rekening / Kas Penerima' : newAutoType === 'expense' ? 'Rekening / Kas Pemotong' : 'Rekening Asal (Sumber)'}
                  </label>
                  <select
                    value={newAutoSourceAccount}
                    onChange={(e) => setNewAutoSourceAccount(e.target.value)}
                    className="brutal-select text-xs"
                    required
                  >
                    <option value="">Pilih akun kas...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — Saldo: {formatRupiah(acc.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                {newAutoType === 'transfer' && (
                  <div>
                    <label className="brutal-label">Rekening Tujuan (Penerima)</label>
                    <select
                      value={newAutoToAccount}
                      onChange={(e) => setNewAutoToAccount(e.target.value)}
                      className="brutal-select text-xs"
                      required
                    >
                      <option value="">Pilih akun tujuan...</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id} disabled={acc.id === newAutoSourceAccount}>
                          {acc.name} — Saldo: {formatRupiah(acc.balance)} {acc.id === newAutoSourceAccount ? '(Akun Sumber)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Siklus Eksekusi */}
              <div>
                <label className="brutal-label">Siklus Eksekusi Rutin</label>
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  {[
                    { id: 'daily', label: 'Harian' },
                    { id: 'weekly', label: 'Mingguan' },
                    { id: 'monthly', label: 'Bulanan' },
                    { id: 'yearly', label: 'Tahunan' },
                    { id: 'custom', label: 'Kustom' },
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewAutoCycle(c.id as any)}
                      className={`py-1.5 px-1 text-center font-mono text-xs rounded border-2 transition-all ${
                        newAutoCycle === c.id
                          ? 'border-[var(--accent-sand)] bg-[var(--accent-sand-dark)] text-white font-bold shadow-[2px_2px_0px_#000]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Pengaturan Tambahan Siklus Bulanan */}
                {newAutoCycle === 'monthly' && (
                  <div className="mt-3 p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono font-bold text-white">Eksekusi Tanggal Berapa?</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono">Dijalankan otomatis tiap bulan pada tanggal ini</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-mono text-[var(--text-secondary)]">Tgl</span>
                      <input 
                        type="number"
                        min="1"
                        max="31"
                        value={newAutoMonthlyDay}
                        onChange={(e) => {
                          const val = Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1));
                          setNewAutoMonthlyDay(val);
                          // Auto update next date
                          const d = new Date();
                          const currentDay = d.getDate();
                          if (currentDay > val) {
                            d.setMonth(d.getMonth() + 1);
                          }
                          d.setDate(val);
                          setNewAutoNextDate(d.toISOString().split('T')[0]);
                        }}
                        className="w-16 brutal-input text-xs font-mono font-bold text-center"
                      />
                    </div>
                  </div>
                )}

                {/* Pengaturan Tambahan Siklus Kustom */}
                {newAutoCycle === 'custom' && (
                  <div className="mt-3 p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2">
                    <p className="text-xs font-mono text-[var(--accent-sand-light)] font-bold">
                      Pengaturan Interval Kustom
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-[var(--text-secondary)] block mb-1">Setiap Berapa</label>
                        <input 
                          type="number"
                          min="1"
                          max="365"
                          value={newAutoCustomCount}
                          onChange={(e) => setNewAutoCustomCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="brutal-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-[var(--text-secondary)] block mb-1">Satuan Waktu</label>
                        <select
                          value={newAutoCustomUnit}
                          onChange={(e) => setNewAutoCustomUnit(e.target.value as CustomIntervalUnit)}
                          className="brutal-select text-xs"
                        >
                          <option value="days">Hari</option>
                          <option value="weeks">Minggu</option>
                          <option value="months">Bulan</option>
                          <option value="years">Tahun</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tanggal Eksekusi Berikutnya */}
              <div>
                <label className="brutal-label">Tanggal Eksekusi Pertama / Berikutnya</label>
                <input 
                  type="date"
                  value={newAutoNextDate}
                  onChange={(e) => setNewAutoNextDate(e.target.value)}
                  className="brutal-input text-xs"
                  required
                />
                <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
                  Saat aplikasi dibuka pada atau setelah tanggal ini, sistem akan otomatis mengeksekusi transaksi.
                </p>
              </div>

              {/* Catatan (Opsional) */}
              <div>
                <label className="brutal-label">Catatan Tambahan (Opsional)</label>
                <input 
                  type="text"
                  value={newAutoNote}
                  onChange={(e) => setNewAutoNote(e.target.value)}
                  placeholder="Misal: Catatan transaksi otomatis"
                  className="brutal-input text-xs"
                />
              </div>

              <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono space-y-1">
                <p className="text-[var(--accent-sand-light)] font-bold">ℹ️ Mekanisme Otomatisasi Terintegrasi:</p>
                <p>Ketika tanggal jatuh tempo tiba dan aplikasi dibuka, sistem secara atomik akan memotong/menambah saldo akun, mencatat transaksi bertanda [Otomatis], dan memajukan jadwal eksekusi ke siklus selanjutnya.</p>
              </div>

              </>)}

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setIsAddAutomationOpen(false)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-sand text-xs flex items-center gap-1.5 font-bold"
                >
                  <Plus className="w-4 h-4" />
                  <span>Simpan Aturan Otomatis</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 20: EDIT ATURAN OTOMATISASI                                   */}
      {/* =================================================================== */}
      {editingAutomation && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="font-heading font-bold text-lg text-white flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-[var(--accent-sand)]" />
                  Edit Aturan: {editingAutomation.name}
                </h3>
                <p className="text-[10px] font-mono text-[var(--accent-sand-light)]">Buku Kas: {currentLedger.name}</p>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingAutomation(null)}
                className="p-1 text-[var(--text-muted)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedAutomation} className="space-y-4">
              <div>
                <label className="brutal-label">Nama Aturan</label>
                <input 
                  type="text"
                  value={editAutoName}
                  onChange={(e) => setEditAutoName(e.target.value)}
                  className="brutal-input text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Kategori</label>
                  <input 
                    type="text"
                    value={editAutoCategory}
                    onChange={(e) => setEditAutoCategory(e.target.value)}
                    className="brutal-input text-xs"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0">Nominal Transaksi</label>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">Kalkulator</span>
                  </div>
                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden">
                    <span className="px-2.5 py-1.5 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-xs text-white flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={editAutoAmount}
                      onChange={(e) => handleEditAutoAmountCalcChange(e.target.value)}
                      className="w-full bg-transparent px-2.5 py-1.5 text-[var(--text-primary)] font-mono font-bold text-sm focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {editAutoCalcNotice && (
                <p className="text-xs font-mono text-[var(--accent-sand-light)]">{editAutoCalcNotice}</p>
              )}

              <div className={`grid ${editAutoType === 'transfer' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3`}>
                <div>
                  <label className="brutal-label">
                    {editAutoType === 'income' ? 'Rekening / Kas Penerima' : editAutoType === 'expense' ? 'Rekening / Kas Pemotong' : 'Rekening Asal'}
                  </label>
                  <select
                    value={editAutoSourceAccount}
                    onChange={(e) => setEditAutoSourceAccount(e.target.value)}
                    className="brutal-select text-xs"
                    required
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — Saldo: {formatRupiah(acc.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                {editAutoType === 'transfer' && (
                  <div>
                    <label className="brutal-label">Rekening Tujuan</label>
                    <select
                      value={editAutoToAccount}
                      onChange={(e) => setEditAutoToAccount(e.target.value)}
                      className="brutal-select text-xs"
                      required
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id} disabled={acc.id === editAutoSourceAccount}>
                          {acc.name} — Saldo: {formatRupiah(acc.balance)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Siklus Eksekusi */}
              <div>
                <label className="brutal-label">Siklus Eksekusi</label>
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  {[
                    { id: 'daily', label: 'Harian' },
                    { id: 'weekly', label: 'Mingguan' },
                    { id: 'monthly', label: 'Bulanan' },
                    { id: 'yearly', label: 'Tahunan' },
                    { id: 'custom', label: 'Kustom' },
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditAutoCycle(c.id as any)}
                      className={`py-1.5 px-1 text-center font-mono text-xs rounded border-2 transition-all ${
                        editAutoCycle === c.id
                          ? 'border-[var(--accent-sand)] bg-[var(--accent-sand-dark)] text-white font-bold shadow-[2px_2px_0px_#000]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {editAutoCycle === 'monthly' && (
                  <div className="mt-3 p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] flex items-center justify-between gap-3">
                    <p className="text-xs font-mono font-bold text-white">Eksekusi Tanggal Berapa?</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-[var(--text-secondary)]">Tgl</span>
                      <input 
                        type="number"
                        min="1"
                        max="31"
                        value={editAutoMonthlyDay}
                        onChange={(e) => setEditAutoMonthlyDay(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                        className="w-16 brutal-input text-xs font-mono font-bold text-center"
                      />
                    </div>
                  </div>
                )}

                {editAutoCycle === 'custom' && (
                  <div className="mt-3 p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] space-y-2">
                    <p className="text-xs font-mono text-[var(--accent-sand-light)] font-bold">
                      Interval Kustom
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-[var(--text-secondary)] block mb-1">Setiap</label>
                        <input 
                          type="number"
                          min="1"
                          max="365"
                          value={editAutoCustomCount}
                          onChange={(e) => setEditAutoCustomCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="brutal-input text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-[var(--text-secondary)] block mb-1">Satuan</label>
                        <select
                          value={editAutoCustomUnit}
                          onChange={(e) => setEditAutoCustomUnit(e.target.value as CustomIntervalUnit)}
                          className="brutal-select text-xs"
                        >
                          <option value="days">Hari</option>
                          <option value="weeks">Minggu</option>
                          <option value="months">Bulan</option>
                          <option value="years">Tahun</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="brutal-label">Tanggal Eksekusi Berikutnya</label>
                <input 
                  type="date"
                  value={editAutoNextDate}
                  onChange={(e) => setEditAutoNextDate(e.target.value)}
                  className="brutal-input text-xs"
                  required
                />
              </div>

              <div>
                <label className="brutal-label">Catatan</label>
                <input 
                  type="text"
                  value={editAutoNote}
                  onChange={(e) => setEditAutoNote(e.target.value)}
                  className="brutal-input text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button 
                  type="button" 
                  onClick={() => setEditingAutomation(null)}
                  className="brutal-btn brutal-btn-ghost text-xs"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="brutal-btn brutal-btn-sand text-xs font-bold"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 21: KONFIRMASI HAPUS ATURAN OTOMATISASI                       */}
      {/* =================================================================== */}
      {automationToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="brutal-card p-6 bg-[var(--bg-surface)] border-2 border-[var(--accent-terracotta)] max-w-md w-full space-y-4 shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--accent-terracotta-dark)] border-2 border-[var(--accent-terracotta)] text-[var(--accent-terracotta-light)] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-white">Hapus Aturan Otomatis?</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Apakah Anda yakin ingin menghapus aturan <strong className="text-white">"{automationToDelete.name}"</strong>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] font-mono">
              ℹ️ Aturan penjadwalan ini akan dihapus. Semua riwayat transaksi yang pernah dibuat oleh aturan ini sebelumnya tetap aman tersimpan di riwayat kas Anda.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setAutomationToDelete(null)}
                className="brutal-btn brutal-btn-ghost text-xs"
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={confirmExecuteDeleteAutomation}
                className="brutal-btn brutal-btn-terracotta text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Aturan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 22: DETAIL & RIWAYAT EKSEKUSI ATURAN OTOMATISASI              */}
      {/* =================================================================== */}
      {selectedAutomationForDetail && (() => {
        const rule = automations.find(a => a.id === selectedAutomationForDetail.id) || selectedAutomationForDetail;
        const sourceAcc = accounts.find(a => a.id === rule.sourceAccountId);
        const destAcc = rule.toAccountId ? accounts.find(a => a.id === rule.toAccountId) : null;
        const dueStatus = getBillDueStatus(rule.nextRunDate);
        const autoTransactions = transactions.filter(t => t.automationId === rule.id);
        const cycleLabel = getCycleLabel(rule.cycle, rule.customIntervalCount, rule.customIntervalUnit);
        const cycleDisplay = rule.cycle === 'monthly' && rule.monthlyDay 
          ? `Setiap tgl ${rule.monthlyDay} per bulan`
          : cycleLabel;

        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-[2px]">
            <div className="brutal-card p-6 bg-[var(--bg-surface)] max-w-lg w-full space-y-5 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-xl)] animate-in fade-in zoom-in-95 duration-150 border-2">
              
              {/* Header Modal */}
              <div className="flex items-start justify-between border-b-2 border-[var(--border-subtle)] pb-3 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`brutal-badge text-[10px] font-mono font-bold ${
                      rule.type === 'income'
                        ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border border-[var(--accent-sage)]'
                        : rule.type === 'expense'
                        ? 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border border-[var(--accent-terracotta)]'
                        : 'bg-[var(--accent-blue-dark)] text-[var(--accent-blue-light)] border border-[var(--accent-blue)]'
                    }`}>
                      {rule.type === 'income' ? 'PEMASUKAN OTOMATIS' : rule.type === 'expense' ? 'PENGELUARAN OTOMATIS' : 'TRANSFER OTOMATIS'}
                    </span>
                    <span className={`brutal-badge text-[10px] font-mono font-bold ${
                      rule.isActive
                        ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border border-[var(--accent-sage)]'
                        : 'bg-[var(--bg-muted)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                    }`}>
                      {rule.isActive ? 'STATUS: AKTIF' : 'STATUS: NONAKTIF'}
                    </span>
                  </div>
                  <h3 className="font-heading font-bold text-xl text-white tracking-tight">
                    {rule.name}
                  </h3>
                </div>

                <button 
                  type="button" 
                  onClick={() => setSelectedAutomationForDetail(null)}
                  className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                  title="Tutup Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Banner Overview / Metadata Ringkas */}
              <div className="p-4 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] space-y-3 shadow-[var(--shadow-sm)]">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[10px] font-heading uppercase text-[var(--text-secondary)]">Nominal Eksekusi</p>
                    <p className={`text-2xl font-mono font-bold tracking-tight ${
                      rule.type === 'income'
                        ? 'text-[var(--accent-sage-light)]'
                        : rule.type === 'expense'
                        ? 'text-[var(--accent-terracotta-light)]'
                        : 'text-[var(--accent-blue-light)]'
                    }`}>
                      {rule.type === 'income' && '+'}
                      {rule.type === 'expense' && '-'}
                      {rule.type === 'transfer' && '⇄ '}
                      {formatRupiah(rule.amount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-heading uppercase text-[var(--text-secondary)]">Total Dieksekusi</p>
                    <p className="text-sm font-mono font-bold text-white">
                      {rule.executionCount || 0} Kali
                    </p>
                  </div>
                </div>

                {/* Metadata Tambahan */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs font-mono">
                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">Siklus Penjadwalan</span>
                    <span className="font-bold text-white">{cycleDisplay}</span>
                  </div>

                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">Jadwal Eksekusi Berikutnya</span>
                    <span className="font-bold text-white flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                      {rule.nextRunDate}
                    </span>
                  </div>

                  <div>
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                      {rule.type === 'transfer' ? 'Akun Sumber' : rule.type === 'income' ? 'Rekening Masuk' : 'Rekening Potong'}
                    </span>
                    <span className="font-bold text-white">{sourceAcc?.name || 'Akun'}</span>
                  </div>

                  {rule.type === 'transfer' && (
                    <div>
                      <span className="text-[var(--text-muted)] block text-[10px] uppercase">Akun Tujuan</span>
                      <span className="font-bold text-[var(--accent-blue-light)]">{destAcc?.name || 'Tujuan'}</span>
                    </div>
                  )}

                  <div className="col-span-2 pt-1">
                    <span className="text-[var(--text-muted)] block text-[10px] uppercase">Terakhir Dijalankan</span>
                    <span className="font-bold text-[var(--text-secondary)]">
                      {rule.lastRunDate ? `${rule.lastRunDate} (Telah berjalan)` : 'Belum pernah dieksekusi'}
                    </span>
                  </div>

                  {rule.note && (
                    <div className="col-span-2 pt-1 text-[var(--text-secondary)] font-sans text-xs">
                      <span className="text-[var(--text-muted)] block text-[10px] font-mono uppercase">Catatan</span>
                      <p className="mt-0.5">{rule.note}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* List Riwayat Transaksi yang Dihasilkan */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-[var(--accent-sand)]" />
                    <h4 className="font-heading font-bold text-sm text-white">
                      Riwayat Transaksi dari Aturan Ini
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono rounded text-[var(--text-secondary)]">
                    {autoTransactions.length} Transaksi
                  </span>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {autoTransactions.length === 0 ? (
                    <div className="p-6 bg-[var(--bg-elevated)] border-2 border-dashed border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center space-y-2">
                      <Zap className="w-6 h-6 text-[var(--accent-sand)] mx-auto opacity-70" />
                      <p className="font-heading text-xs font-bold text-white">
                        Belum ada riwayat eksekusi transaksi
                      </p>
                      <p className="text-[11px] font-mono text-[var(--text-muted)]">
                        Klik tombol "⚡ Jalankan Sekarang" di bawah untuk memicu eksekusi manual pertama.
                      </p>
                    </div>
                  ) : (
                    autoTransactions.map(tx => {
                      const acc = accounts.find(a => a.id === tx.accountId);
                      const toAcc = tx.toAccountId ? accounts.find(a => a.id === tx.toAccountId) : null;
                      return (
                        <div
                          key={tx.id}
                          className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent-sand-dark)] border border-[var(--accent-sand)] text-[var(--accent-sand-light)] flex items-center justify-center shrink-0">
                              <Zap className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[11px] font-bold text-white">
                                  {tx.date}
                                </span>
                                {acc && (
                                  <span className="text-[10px] font-mono text-[var(--accent-sage-light)] bg-[var(--bg-muted)] px-1.5 py-0.2 rounded border border-[var(--border-subtle)]">
                                    {toAcc ? `${acc.name} → ${toAcc.name}` : acc.name}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
                                {tx.note || tx.category || 'Otomatisasi'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            <span className={`font-mono font-bold text-sm ${
                              tx.type === 'income' ? 'text-[var(--accent-sage-light)]' : tx.type === 'expense' ? 'text-[var(--accent-terracotta-light)]' : 'text-[var(--accent-blue-light)]'
                            }`}>
                              {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '⇄ '}{formatRupiah(tx.amount)}
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditTransactionModal(tx)}
                                className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-colors"
                                title="Edit Transaksi Ini"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTxToDelete(tx)}
                                className="p-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-terracotta)] rounded shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-colors"
                                title="Hapus Transaksi Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer Tombol Aksi Modal */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t-2 border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={(e) => {
                    handleManualExecuteAutomation(rule, e);
                  }}
                  className="brutal-btn brutal-btn-sand text-xs py-2 px-4 flex items-center gap-1.5 font-bold"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Jalankan Sekarang</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      setSelectedAutomationForDetail(null);
                      openEditAutomationModal(rule, e);
                    }}
                    className="brutal-btn brutal-btn-ghost text-xs py-2 px-3 flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAutomationForDetail(null)}
                    className="brutal-btn brutal-btn-ghost text-xs py-2 px-4"
                  >
                    Tutup
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <footer className="border-t-[2.5px] border-[var(--border-color)] bg-[var(--bg-surface)] py-3 px-4 pb-20 md:pb-3 text-center text-xs font-mono text-[var(--text-secondary)]">
        Artha Neo-Brutalism • Multi-Buku Kas (Active: {currentLedger.name}) & Firestore Offline-First
      </footer>
    </div>
  );
}
