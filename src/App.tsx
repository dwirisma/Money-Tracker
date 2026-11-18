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
  BarChart3,
  Settings
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
  checkAndRunAutomations,
  addPocketToAccount,
  updatePocketInAccount,
  deletePocketFromAccount
} from './services/cashManagementService';
import { evaluateMathExpression, formatRupiah } from './utils/calculator';
import { useUI } from './context/UIContext';
import { AppNav } from './components/layout/AppNav';
import { HeaderTools } from './components/layout/HeaderTools';
import { AddBillModal, AddDebtModal, EditBillModal, EditDebtModal } from './components/ObligationForms';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { AutomationFormModal } from './components/AutomationModals';
import { LedgerFormModal, AccountFormModal } from './components/LedgerAccountModals';
import { BillDetailModal, DebtDetailModal, GoalDetailModal, AutomationDetailModal } from './components/DetailModals';
import { AllocateGoalModal, GoalFormModal } from './components/GoalModals';
import { PayBillModal, PayDebtModal } from './components/PaymentModals';
import { EditTransactionModal, DeleteTransactionModal } from './components/TransactionModals';
import { AutomationsView } from './components/AutomationsView';
import { GoalsView } from './components/GoalsView';
import { ObligationsView } from './components/ObligationsView';
import { AccountsView } from './components/AccountsView';
import { DashboardPage } from './components/DashboardPage';
import { SettingsPage } from './components/SettingsPage';
import { AutopilotList, AutopilotFields, AutopilotRuleModal, submitAutopilot, emptyApDraft, type ApDraft, type ApRequest } from './components/AutopilotPanel';
import { getAutopilotRules } from './services/autopilotService';
import type { AutopilotKind } from './services/autopilotService';
import { SixMonthReport } from './components/SixMonthReport';
import { scanReceipt } from './services/receiptScanService';
import { getGeminiKey, getGeminiModel } from './services/geminiSettings';
import { Camera as ScanCamera, PiggyBank as ApPiggy, Receipt as ApReceipt, Landmark as ApLandmark } from 'lucide-react';
import { runAutopilot, type AutopilotResult } from './services/autopilotService';
import { useCategories } from './hooks/useCategories';
import type { ModuleId } from './components/layout/navConfig';
import { AddTransactionView } from './components/AddTransactionView';
import { TransactionHistoryView } from './components/TransactionHistoryView';
import { InvestmentPortfolioView } from './components/InvestmentPortfolioView';
import { AccountDetailModal } from './components/AccountDetailModal';
import { NotificationCenter } from './components/notifications/NotificationCenter';
import { recordAutomationEvent } from './services/notificationService';
import { fetchInvestmentsByLedger } from './services/investmentService';
import type { InvestmentAsset, AccountPocket } from './types';

export default function App() {
  // =========================================================================
  // STATE NAVIGASI SPA
  // =========================================================================
  const [isAddAutomationOpen, setIsAddAutomationOpen] = useState(false);  
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const { toggleMobileDrawer } = useUI(); // langganan tema/privasi/drawer
  const [investments, setInvestments] = useState<InvestmentAsset[]>([]);
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
  const [apRequest, setApRequest] = useState<ApRequest | null>(null);
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

  /** Apakah target (tagihan/utang/target) sudah punya aturan Autopilot di buku kas aktif. */
  function findApRule(kind: AutopilotKind, targetId: string) {
    return getAutopilotRules().find(r => r.ledgerId === currentLedger.id && r.kind === kind && r.targetId === targetId);
  }
  function openAutopilot(kind: AutopilotKind, targetId: string) {
    setApRequest({ kind, targetId, ruleId: findApRule(kind, targetId)?.id });
  }

  async function runAutopilotAndRefresh(ledgerId: string): Promise<AutopilotResult> {
    const res = await runAutopilot(ledgerId);
    if (res.executed.length > 0) {
      const [a, t, g, b, d] = await Promise.all([
        fetchAccountsByLedger(undefined, ledgerId), fetchTransactionsByLedger(undefined, ledgerId),
        fetchGoalsByLedger(undefined, ledgerId), fetchBillsByLedger(undefined, ledgerId), fetchDebtsByLedger(undefined, ledgerId),
      ]);
      setAccounts(a); setTransactions(t); setGoals(g); setBills(b); setDebts(d);
      res.executed.forEach(x => {
        const acc = a.find(item => item.id === x.rule.sourceAccountId);
        recordAutomationEvent(x.rule.name, x.rule.amount, acc?.name || 'Rekening');
      });
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
  const [newLedgerColor, setNewLedgerColor] = useState('#2dd4a7');
  
  // State Edit Buku Kas
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);
  const [editLedgerName, setEditLedgerName] = useState('');
  const [editLedgerDesc, setEditLedgerDesc] = useState('');
  const [editLedgerColor, setEditLedgerColor] = useState('#2dd4a7');

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
  const [newGoalColor, setNewGoalColor] = useState('#ffc933');
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
  const [editGoalColor, setEditGoalColor] = useState('#ffc933');
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
  const [newBillColor, setNewBillColor] = useState('#6c97ff');
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
  const [editBillColor, setEditBillColor] = useState('#6c97ff');
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
  const [newDebtColor, setNewDebtColor] = useState('#ff7a4d');
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
  const [editDebtColor, setEditDebtColor] = useState('#ff7a4d');
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
  const [newAutoColor, setNewAutoColor] = useState('#2dd4a7');
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
  const [editAutoColor, setEditAutoColor] = useState('#2dd4a7');
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
  const [newAccColor, setNewAccColor] = useState('#6c97ff');

  // State Modal Edit Akun
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editAccName, setEditAccName] = useState('');
  const [editAccType, setEditAccType] = useState<AccountType>('bank');
  const [editAccBalance, setEditAccBalance] = useState('');
  const [editAccColor, setEditAccColor] = useState('#6c97ff');

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

  // State Modal Konfirmasi Hapus & Detail Akun
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<Account | null>(null);
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
    const [accs, txs, gls, bls, dts, autos, invs] = await Promise.all([
      fetchAccountsByLedger(undefined, targetLedgerId),
      fetchTransactionsByLedger(undefined, targetLedgerId),
      fetchGoalsByLedger(undefined, targetLedgerId),
      fetchBillsByLedger(undefined, targetLedgerId),
      fetchDebtsByLedger(undefined, targetLedgerId),
      fetchAutomations(undefined, targetLedgerId),
      fetchInvestmentsByLedger(undefined, targetLedgerId)
    ]);
    setAccounts(accs);
    setTransactions(txs);
    setGoals(gls);
    setBills(bls);
    setDebts(dts);
    setAutomations(autos);
    setInvestments(invs);

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
    setEditLedgerColor(ledger.colorAccent || '#2dd4a7');
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
    colorAccent: '#2dd4a7'
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
    setEditAccColor(acc.colorAccent || '#6c97ff');
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

  // Handler Sub-Kantong Alokasi Akun (Konsep Bank Jago)
  async function handleAddPocketToAccount(accountId: string, pocketData: Omit<AccountPocket, 'id' | 'createdAt'>) {
    try {
      const updated = await addPocketToAccount(undefined, accountId, pocketData);
      setAccounts(prev => prev.map(a => a.id === accountId ? updated : a));
      if (selectedAccountForDetail?.id === accountId) {
        setSelectedAccountForDetail(updated);
      }
      showToast('Kantong baru berhasil dibuat!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal membuat kantong', 'error');
    }
  }

  async function handleUpdatePocketInAccount(accountId: string, pocketId: string, updates: Partial<AccountPocket>) {
    try {
      const updated = await updatePocketInAccount(undefined, accountId, pocketId, updates);
      setAccounts(prev => prev.map(a => a.id === accountId ? updated : a));
      if (selectedAccountForDetail?.id === accountId) {
        setSelectedAccountForDetail(updated);
      }
      showToast('Kantong berhasil diperbarui!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal memperbarui kantong', 'error');
    }
  }

  async function handleDeletePocketFromAccount(accountId: string, pocketId: string) {
    try {
      const updated = await deletePocketFromAccount(undefined, accountId, pocketId);
      setAccounts(prev => prev.map(a => a.id === accountId ? updated : a));
      if (selectedAccountForDetail?.id === accountId) {
        setSelectedAccountForDetail(updated);
      }
      showToast('Kantong berhasil dihapus.', 'info');
    } catch (err: any) {
      showToast(err?.message || 'Gagal menghapus kantong', 'error');
    }
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

    // Optimistic UI update: langsung tutup modal dan hapus dari state list
    setTxToDelete(null);
    setTransactions(prev => prev.filter(t => t.id !== tx.id));

    try {
      await deleteTransaction(undefined, tx.id);
      showToast('Transaksi berhasil dihapus & saldo berhasil dipulihkan!', 'success');
    } catch (err) {
      console.error('Error saat menghapus transaksi:', err);
      showToast('Gagal menghapus transaksi dari database', 'error');
    }

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
    setEditGoalColor(goal.colorAccent || '#ffc933');
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
    setEditBillColor(b.colorAccent || '#6c97ff');
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
    setEditDebtColor(d.colorAccent || '#ff7a4d');
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
    setEditAutoColor(rule.colorAccent || '#2dd4a7');
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
        freshAutos.filter(a => a.lastRunDate && (a.executionCount ?? 0) > 0).slice(0, res.executedCount).forEach(rule => {
          const acc = freshAccs.find(item => item.id === rule.sourceAccountId);
          recordAutomationEvent(rule.name, rule.amount, acc?.name || 'Rekening');
        });
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className={`brutal-card p-3 flex items-center gap-2.5 shadow-[var(--shadow-lg)] ${
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
        <header className="border-b border-[var(--border-subtle)] px-2.5 sm:px-3 py-1.5">
          <div className="w-full flex items-center justify-between gap-1.5 sm:gap-2">
            
            {/* Logo & Dropdown Buku Kas Aktif */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
              {/* LOGO A (TOMBOL PEMBUKA SIDEBAR DRAWER KHUSUS MOBILE SESUAI REQUEST USER) */}
              <button
                type="button"
                onClick={toggleMobileDrawer}
                aria-label="Buka Menu Navigasi"
                title="Buka Menu Navigasi Artha"
                className="w-10 h-10 bg-[var(--accent-sand)] text-[#14141a] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] flex items-center justify-center font-heading font-bold text-lg shrink-0 md:hidden hover:opacity-90 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
              >
                A
              </button>

              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-heading font-bold text-sm tracking-tight hidden sm:inline md:hidden">ARTHA</span>
                
                {/* ACTIVE LEDGER SWITCHER DROPDOWN (GAYA NEO-BRUTALISME) */}
                <div className="relative shrink-0" ref={ledgerDropdownRef}>
                  <button 
                    id="ledger-switcher-btn"
                    type="button"
                    onClick={() => setIsLedgerDropdownOpen(!isLedgerDropdownOpen)}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] shadow-[2px_2px_0px_#000] text-xs font-heading font-bold text-white transition-all active:translate-x-0.5 active:translate-y-0.5 max-w-[120px] xs:max-w-[150px] sm:max-w-[180px]"
                    style={{ borderLeftColor: currentLedger.colorAccent || 'var(--accent-sage)', borderLeftWidth: '4px' }}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-[var(--accent-sand)] shrink-0" />
                    <span className="truncate">{currentLedger.name}</span>
                    <ChevronDown className="w-3 h-3 text-[var(--text-secondary)] shrink-0" />
                  </button>

                  {/* Dropdown Menu Retro Card */}
                  {isLedgerDropdownOpen && (
                    <div 
                      id="ledger-dropdown-menu" 
                      className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-2.5 z-50 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150"
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
                                  style={{ backgroundColor: l.colorAccent || '#2dd4a7' }}
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
                                  className="p-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
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
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <HeaderTools />
              <NotificationCenter
                transactions={transactions}
                bills={bills}
                debts={debts}
                goals={goals}
                accounts={accounts}
                currentLedgerId={currentLedger.id}
                currentLedgerName={currentLedger.name}
                onNavigate={(mod) => setActiveModule(mod as ModuleId)}
              />

              {/* Saat Modul 2 Aktif: Tampilkan HANYA tombol + Target */}
              {activeModule === 'module2' && (
                <button
                  id="header-btn-add-goal"
                  type="button"
                  onClick={() => setIsAddGoalOpen(true)}
                  className="brutal-btn brutal-btn-sand !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)] flex items-center justify-center font-bold"
                  title="Tambah Target Baru"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
                </button>
              )}

              {/* Saat Modul 3 Aktif: Tampilkan HANYA tombol + Tagihan dan + Utang */}
              {activeModule === 'module3' && (
                <div id="header-modul-3-actions" className="flex items-center gap-1 sm:gap-2">
                  <button
                    id="header-btn-add-bill"
                    type="button"
                    onClick={() => setIsAddBillOpen(true)}
                    className="brutal-btn brutal-btn-blue !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)] flex items-center justify-center font-bold text-white"
                    title="Tambah Tagihan Baru"
                  >
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <button
                    id="header-btn-add-debt"
                    type="button"
                    onClick={() => setIsAddDebtOpen(true)}
                    className="brutal-btn brutal-btn-terracotta !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)] flex items-center justify-center font-bold text-white"
                    title="Catat Utang Baru"
                  >
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              )}

              {/* Saat Modul 4 Aktif: Tampilkan HANYA tombol + Aturan */}
              {activeModule === 'module4' && (
                <button
                  id="header-btn-add-automation"
                  type="button"
                  onClick={() => setIsAddAutomationOpen(true)}
                  className="brutal-btn brutal-btn-sand !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)] flex items-center justify-center font-bold"
                  title="Tambah Aturan Otomasi Baru"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
                </button>
              )}

              {/* Saat Portofolio Investasi Aktif: Tampilkan tombol + Tambah Aset */}
              {activeModule === 'investments' && (
                <button
                  id="header-btn-add-asset"
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-add-asset-modal'))}
                  className="brutal-btn brutal-btn-sand !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)] flex items-center justify-center font-bold"
                  title="Tambah Aset Investasi Baru"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
                </button>
              )}

              {/* Saat Tambah Transaksi Aktif: Tombol Pengaturan Tab Transaksi (Kategori & Budgeting) */}
              {activeModule === 'add_transaction' && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-tx-tab-settings'))}
                  className="brutal-btn brutal-btn-sand !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)] flex items-center justify-center font-bold"
                  title="Buka Pengaturan Tab Transaksi (Kategori & Alokasi Budget)"
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
                </button>
              )}

              {/* Saat Riwayat Transaksi Aktif: Tombol + Catat */}
              {activeModule === 'history_transaction' && (
                <button
                  type="button"
                  onClick={() => setActiveModule('add_transaction')}
                  className="brutal-btn brutal-btn-sand !p-1.5 sm:!p-2 !shadow-[var(--shadow-sm)] flex items-center justify-center font-bold"
                  title="Catat Transaksi Baru"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-black" />
                </button>
              )}

            </div>

          </div>
        </header>

      </div>


      {/* Main Container */}
      <main className="flex-1 w-full p-2.5 sm:p-3 space-y-3 sm:space-y-3 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10">
        
        {/* =================================================================== */}
        {/* KONTEN MODUL 1: KAS & TRANSAKSI                                     */}
        {/* =================================================================== */}
        <div id="container-settings" className={activeModule === 'settings' ? 'space-y-3' : 'hidden'}>
          <SettingsPage />
        </div>

        <div id="container-dashboard" className={activeModule === 'dashboard' ? 'space-y-3' : 'hidden'}>
          <DashboardPage
            ledgerName={currentLedger.name}
            currentLedger={currentLedger}
            accounts={accounts}
            transactions={transactions}
            goals={goals}
            bills={bills}
            debts={debts}
            investments={investments}
            onNavigate={setActiveModule}
          />
        </div>

        {/* KONTEN TAMBAH TRANSAKSI (DEDICATED VIEW DENGAN 3 TAB & KELOLA KATEGORI) */}
        <div id="container-add-transaction" className={activeModule === 'add_transaction' ? 'space-y-3' : 'hidden'}>
          <AddTransactionView
            currentLedger={currentLedger}
            accounts={accounts}
            recentTransactions={transactions}
            onSaveTransaction={async (data) => {
              await createTransaction(undefined, {
                ledgerId: activeLedgerIdState,
                accountId: data.accountId,
                type: data.type,
                amount: data.amount,
                category: data.category,
                note: data.note,
                date: data.date
              });
              const refreshedAccs = await fetchAccountsByLedger(undefined, activeLedgerIdState);
              const refreshedTxs = await fetchTransactionsByLedger(undefined, activeLedgerIdState);
              setAccounts(refreshedAccs);
              setTransactions(refreshedTxs);
              showToast(`Transaksi ${data.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} dicatat!`, 'success');
            }}
            onExecuteTransfer={async (data) => {
              await executeAccountTransfer(undefined, {
                ledgerId: activeLedgerIdState,
                sourceAccountId: data.sourceAccountId,
                destinationAccountId: data.destinationAccountId,
                amount: data.amount,
                note: data.note,
                date: data.date
              });
              const refreshedAccs = await fetchAccountsByLedger(undefined, activeLedgerIdState);
              const refreshedTxs = await fetchTransactionsByLedger(undefined, activeLedgerIdState);
              setAccounts(refreshedAccs);
              setTransactions(refreshedTxs);
              showToast('Transfer saldo antar akun berhasil!', 'success');
            }}
            onNavigate={setActiveModule}
            showToast={showToast}
          />
        </div>

        {/* KONTEN RIWAYAT TRANSAKSI (DEDICATED SEARCH & FILTER VIEW) */}
        <div id="container-history-transaction" className={activeModule === 'history_transaction' ? 'space-y-3' : 'hidden'}>
          <TransactionHistoryView
            currentLedger={currentLedger}
            transactions={transactions}
            accounts={accounts}
            onNavigate={setActiveModule}
            onEditTransaction={openEditTransactionModal}
            onDeleteTransaction={(tx) => setTxToDelete(tx)}
          />
        </div>

        {/* KONTEN PORTOFOLIO INVESTASI */}
        <div id="container-investments" className={activeModule === 'investments' ? 'space-y-3' : 'hidden'}>
          <InvestmentPortfolioView
            currentLedger={currentLedger}
            investments={investments}
            onRefreshInvestments={async () => {
              const fresh = await fetchInvestmentsByLedger(undefined, activeLedgerIdState);
              setInvestments(fresh);
            }}
            accounts={accounts}
            onDataChanged={async () => {
              const [a, t, inv] = await Promise.all([
                fetchAccountsByLedger(undefined, activeLedgerIdState),
                fetchTransactionsByLedger(undefined, activeLedgerIdState),
                fetchInvestmentsByLedger(undefined, activeLedgerIdState)
              ]);
              setAccounts(a); setTransactions(t); setInvestments(inv);
            }}
            showToast={showToast}
          />
        </div>

        <div id="container-modul-1" className={activeModule === 'module1' ? 'space-y-3' : 'hidden'}>
          <AccountsView
            ledgerName={currentLedger.name}
            accounts={accounts}
            totals={totals}
            isLoading={isLoading}
            onAddAccount={() => setIsAddAccountOpen(true)}
            onOpenDetail={setSelectedAccountForDetail}
            onEditAccount={openEditAccountModal}
            onDeleteAccount={setAccountToDelete}
          />
        </div>
        {/* AKHIR KONTEN MODUL 1 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 2: GOALS & MASA DEPAN (WISHLIST & SINKING FUNDS)       */}
        {/* =================================================================== */}
        <div id="container-modul-2" className={activeModule === 'module2' ? 'space-y-3' : 'hidden'}>
          <GoalsView
            autoOn={(id) => !!findApRule('goal_topup', id)}
            onAutopilot={(id) => openAutopilot('goal_topup', id)}
            ledgerName={currentLedger.name}
            goals={goals}
            filteredGoals={filteredGoals}
            accounts={accounts}
            goalFilter={goalFilter}
            isLoading={isLoading}
            metrics={{ totalGoalsTarget, totalGoalsSaved, goalsOverallProgress }}
            onFilter={setGoalFilter}
            onAddGoal={() => setIsAddGoalOpen(true)}
            onOpenGoal={openGoalDetailModal}
            onEditGoal={openEditGoalModal}
            onDeleteGoal={setGoalToDelete}
            onAllocate={openAllocateModal}
          />
        </div>
        {/* AKHIR KONTEN MODUL 2 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 3: UTANG & TAGIHAN RUTIN (DEBT & SUBSCRIPTIONS)         */}
        {/* =================================================================== */}
        <div id="container-modul-3" className={activeModule === 'module3' ? 'space-y-3' : 'hidden'}>
          <ObligationsView
            autoOn={(kind, id) => !!findApRule(kind, id)}
            onAutopilot={openAutopilot}
            ledgerName={currentLedger.name}
            bills={bills}
            debts={debts}
            filteredBills={filteredBills}
            filteredDebts={filteredDebts}
            billFilter={billFilter}
            debtFilter={debtFilter}
            metrics={{ totalRemainingDebt, totalOriginalDebt, debtPayoffProgress, estimatedMonthlyBills, variableBillsCount, totalBillsPaid }}
            onBillFilter={setBillFilter}
            onDebtFilter={setDebtFilter}
            onAddBill={() => setIsAddBillOpen(true)}
            onAddDebt={() => setIsAddDebtOpen(true)}
            onOpenBill={setSelectedBillForDetail}
            onPayBill={openPayBillModal}
            onEditBill={openEditBillModal}
            onDeleteBill={setBillToDelete}
            onOpenDebt={setSelectedDebtForDetail}
            onPayDebt={openPayDebtModal}
            onEditDebt={openEditDebtModal}
            onDeleteDebt={setDebtToDelete}
          />
        </div>
        {/* AKHIR KONTEN MODUL 3 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 4: OTOMATISASI TRANSAKSI (AUTO-INCOME/EXPENSE/TRANSFER)*/}
        {/* =================================================================== */}
        <div id="container-modul-4" className={activeModule === 'module4' ? 'space-y-3' : 'hidden'}>
<AutomationsView
            ledgerName={currentLedger.name}
            automations={automations}
            filteredAutomations={filteredAutomations}
            accounts={accounts}
            filter={automationFilter}
            isExecutingCron={isExecutingCron}
            metrics={{ activeCount: activeAutomationsCount, estimatedIncome: estimatedMonthlyAutoIncome, estimatedExpense: estimatedMonthlyAutoExpense, totalExecutions: totalAutomationExecutions }}
            onFilter={setAutomationFilter}
            onAdd={() => setIsAddAutomationOpen(true)}
            onRunCron={handleRunCronManual}
            onOpen={setSelectedAutomationForDetail}
            onToggle={handleToggleAutomation}
            onExecute={handleManualExecuteAutomation}
            onEdit={openEditAutomationModal}
            onDelete={promptDeleteAutomation}
          />

          <AutopilotList
            ledgerId={currentLedger.id}
            accounts={accounts}
            goals={goals}
            bills={bills}
            debts={debts}
            version={apVersion}
            onRun={() => runAutopilotAndRefresh(currentLedger.id)}
            onChanged={() => setApVersion(v => v + 1)}
          />
        </div>
        {/* AKHIR KONTEN MODUL 4 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 5: LAPORAN & ANALITIK                                  */}
        {/* =================================================================== */}
        <div id="container-modul-5" className={activeModule === 'module5' ? 'space-y-3' : 'hidden'}>
          <Module5Reports
            transactions={transactions}
            activeLedger={currentLedger}
            accounts={accounts}
            formatRupiah={formatRupiah}
            formatDate={(val) => new Date(val).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            onNavigateToTab={(tab) => setActiveModule(tab)}
          />
          <SixMonthReport transactions={transactions} ledgerName={currentLedger.name} />
        </div>
        {/* AKHIR KONTEN MODUL 5 */}

        {/* =================================================================== */}
        {/* KONTEN MODUL 6: PREDIKSI GAJI & KALENDER SHIFT (GROUP C)            */}
        {/* =================================================================== */}
        <div id="container-modul-6" className={activeModule === 'module6' ? 'space-y-3' : 'hidden'}>
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
      {/* AUTOPILOT: BUAT/UBAH ATURAN DARI KARTU TAGIHAN, UTANG, TARGET */}
      {apRequest && (
        <AutopilotRuleModal
          request={apRequest}
          ledgerId={currentLedger.id}
          accounts={accounts}
          goals={goals}
          bills={bills}
          debts={debts}
          onClose={() => setApRequest(null)}
          onSaved={(message) => { showToast(message, 'success'); setApVersion(v => v + 1); setApRequest(null); }}
        />
      )}

      {/* MODAL 0: BUAT BUKU KAS BARU (NEW LEDGER MODAL)                      */}
      {/* =================================================================== */}
      {isAddLedgerOpen && (
        <LedgerFormModal
          mode="create"
          name={newLedgerName} onName={setNewLedgerName}
          desc={newLedgerDesc} onDesc={setNewLedgerDesc}
          color={newLedgerColor} onColor={setNewLedgerColor}
          onSubmit={handleCreateLedger}
          onClose={() => setIsAddLedgerOpen(false)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 0B: EDIT BUKU KAS (EDIT LEDGER MODAL)                         */}
      {/* =================================================================== */}
      {editingLedger && (
        <LedgerFormModal
          mode="edit"
          ledgerName={editingLedger.name}
          name={editLedgerName} onName={setEditLedgerName}
          desc={editLedgerDesc} onDesc={setEditLedgerDesc}
          color={editLedgerColor} onColor={setEditLedgerColor}
          onSubmit={handleSaveEditedLedger}
          onClose={() => setEditingLedger(null)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 0C: KONFIRMASI HAPUS BUKU KAS (DELETE LEDGER MODAL)           */}
      {/* =================================================================== */}
      {ledgerToDelete && (
        <ConfirmDeleteModal
          severe
          title="Hapus Buku Kas?"
          kind="Buku kas"
          name={ledgerToDelete.name}
          notes={[
            { tone: 'danger', text: <><b>Perhatian: </b>seluruh akun dan riwayat transaksi di dalam buku kas ini akan dihapus secara permanen.</> },
            ...(activeLedgerIdState === ledgerToDelete.id
              ? [{ text: 'Karena ini buku kas aktif, aplikasi akan otomatis dialihkan ke buku kas lain yang tersisa.' }]
              : [])
          ]}
          confirmLabel="Ya, hapus buku kas"
          onClose={() => setLedgerToDelete(null)}
          onConfirm={confirmExecuteDeleteLedger}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 1: TAMBAH AKUN BARU KE BUKU KAS AKTIF                         */}
      {/* =================================================================== */}
      {isAddAccountOpen && (
        <AccountFormModal
          mode="create"
          ledgerName={currentLedger.name}
          name={newAccName} onName={setNewAccName}
          type={newAccType} onType={setNewAccType}
          balance={newAccBalance} onBalance={setNewAccBalance}
          color={newAccColor} onColor={setNewAccColor}
          onSubmit={handleCreateAccount}
          onClose={() => setIsAddAccountOpen(false)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 2: EDIT AKUN                                                  */}
      {/* =================================================================== */}
      {editingAccount && (
        <AccountFormModal
          mode="edit"
          ledgerName={currentLedger.name}
          accountName={editingAccount.name}
          name={editAccName} onName={setEditAccName}
          type={editAccType} onType={setEditAccType}
          balance={editAccBalance} onBalance={setEditAccBalance}
          color={editAccColor} onColor={setEditAccColor}
          onSubmit={handleSaveEditedAccount}
          onClose={() => setEditingAccount(null)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 3: EDIT TRANSAKSI / TRANSFER (DENGAN SINKRONISASI ATOMIK)     */}
      {/* =================================================================== */}
      {editingTx && (
        <EditTransactionModal
          tx={editingTx}
          ledgerName={currentLedger.name}
          accounts={accounts}
          type={editTxType}
          onTypeChange={setEditTxType}
          amount={editTxAmount}
          onAmountChange={setEditTxAmount}
          onAmountBlur={handleEditTxAmountBlur}
          calcNotice={editCalcNotice}
          accountId={editTxAccountId}
          onAccountChange={setEditTxAccountId}
          toAccountId={editTxToAccountId}
          onToAccountChange={setEditTxToAccountId}
          category={editTxCategory}
          onCategoryChange={setEditTxCategory}
          date={editTxDate}
          onDateChange={setEditTxDate}
          note={editTxNote}
          onNoteChange={setEditTxNote}
          onSubmit={handleSaveEditedTransaction}
          onClose={() => setEditingTx(null)}
        />
      )}
      {/* =================================================================== */}
      {/* MODAL KONFIRMASI HAPUS TRANSAKSI                                    */}
      {/* =================================================================== */}
      {txToDelete && (
        <DeleteTransactionModal
          tx={txToDelete}
          accountName={accounts.find(x => x.id === txToDelete.accountId)?.name}
          onClose={() => setTxToDelete(null)}
          onConfirm={confirmExecuteDeleteTx}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL KONFIRMASI HAPUS AKUN                                         */}
      {/* =================================================================== */}
      {accountToDelete && (
        <ConfirmDeleteModal
          severe
          title="Hapus Akun Keuangan?"
          kind={`Akun · ${currentLedger.name}`}
          name={accountToDelete.name}
          detailLabel="Saldo saat ini"
          detail={formatRupiah(accountToDelete.balance)}
          notes={[{ text: 'Akun akan dihapus dari daftar akun aktif dan total saldo buku kas ini otomatis menyesuaikan.' }]}
          confirmLabel="Ya, hapus akun"
          onClose={() => setAccountToDelete(null)}
          onConfirm={confirmExecuteDeleteAccount}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 4: BUAT TARGET BARU (WISHLIST & SINKING FUNDS)                */}
      {/* =================================================================== */}
      {isAddGoalOpen && (
        <GoalFormModal
          mode="create"
          ledgerName={currentLedger.name}
          accounts={accounts}
          type={newGoalType} onType={setNewGoalType}
          name={newGoalName} onName={setNewGoalName}
          target={newGoalTarget} onTarget={setNewGoalTarget} onTargetBlur={handleNewGoalTargetBlur} calcNotice={goalCalcNotice}
          funds={newGoalInitial} onFunds={setNewGoalInitial}
          deadline={newGoalDeadline} onDeadline={setNewGoalDeadline}
          sourceAccount={newGoalSourceAccount} onSourceAccount={setNewGoalSourceAccount}
          color={newGoalColor} onColor={setNewGoalColor}
          note={newGoalNote} onNote={setNewGoalNote}
          onSubmit={handleCreateGoal}
          onClose={() => setIsAddGoalOpen(false)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 5: ALOKASIKAN DANA KE GOAL (DENGAN SINKRONISASI SALDO ATOMIK) */}
      {/* =================================================================== */}
      {allocatingGoal && (
        <AllocateGoalModal
          goal={allocatingGoal}
          accounts={accounts}
          sourceAccount={allocSourceAccount}
          onSourceChange={setAllocSourceAccount}
          amount={allocAmount}
          onAmountChange={setAllocAmount}
          onAmountBlur={handleAllocAmountBlur}
          onSetAmount={setAllocAmount}
          calcNotice={allocCalcNotice}
          date={allocDate}
          onDateChange={setAllocDate}
          note={allocNote}
          onNoteChange={setAllocNote}
          onSubmit={handleExecuteAllocation}
          onClose={() => setAllocatingGoal(null)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 6: EDIT TARGET (WISHLIST & SINKING FUNDS)                     */}
      {/* =================================================================== */}
      {editingGoal && (
        <GoalFormModal
          mode="edit"
          ledgerName={currentLedger.name}
          goalName={editingGoal.name}
          accounts={accounts}
          type={editGoalType}
          name={editGoalName} onName={setEditGoalName}
          target={editGoalTarget} onTarget={setEditGoalTarget}
          funds={editGoalCurrent} onFunds={setEditGoalCurrent}
          deadline={editGoalDeadline} onDeadline={setEditGoalDeadline}
          sourceAccount={editGoalSourceAccount} onSourceAccount={setEditGoalSourceAccount}
          color={editGoalColor} onColor={setEditGoalColor}
          note={editGoalNote} onNote={setEditGoalNote}
          onSubmit={handleSaveEditedGoal}
          onClose={() => setEditingGoal(null)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 7: KONFIRMASI HAPUS TARGET                                    */}
      {/* =================================================================== */}
      {goalToDelete && (
        <ConfirmDeleteModal
          title="Hapus Target Finansial?"
          kind="Target"
          name={goalToDelete.name}
          detailLabel="Progres saat ini"
          detail={formatRupiah(goalToDelete.currentAmount)}
          notes={[{ text: 'Target akan dihapus dari daftar. Transaksi penyisihan dana yang telah lalu tetap tercatat di riwayat transaksi kas Anda.' }]}
          confirmLabel="Ya, hapus target"
          onClose={() => setGoalToDelete(null)}
          onConfirm={confirmExecuteDeleteGoal}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL: DETAIL AKUN, MUTASI TRANSAKSI & KANTONG (BANK JAGO MODEL)   */}
      {/* =================================================================== */}
      <AccountDetailModal
        isOpen={Boolean(selectedAccountForDetail)}
        onClose={() => setSelectedAccountForDetail(null)}
        account={selectedAccountForDetail}
        transactions={transactions}
        accounts={accounts}
        onAddPocket={handleAddPocketToAccount}
        onUpdatePocket={handleUpdatePocketInAccount}
        onDeletePocket={handleDeletePocketFromAccount}
        onSelectForTransaction={(accId) => {
          setTxAccountId(accId);
          setActiveModule('add_transaction');
        }}
        onSelectForTransfer={(accId) => {
          setTransferSource(accId);
          setActiveModule('add_transaction');
        }}
        onEditAccount={(acc) => openEditAccountModal(acc)}
        onDeleteTransaction={(tx) => setTxToDelete(tx)}
        onEditTransaction={(tx) => openEditTransactionModal(tx)}
      />

      {/* =================================================================== */}
      {/* MODAL 8: DETAIL & RIWAYAT ALOKASI TARGET (NEO-BRUTALISM)            */}
      {/* =================================================================== */}
      {selectedGoalForDetail && (
        <GoalDetailModal
          goal={selectedGoalForDetail}
          accounts={accounts}
          history={goalAllocationHistory}
          onClose={() => setSelectedGoalForDetail(null)}
          onEditTx={openEditTransactionModal}
          onDeleteTx={setTxToDelete}
          onAllocate={(g) => { setSelectedGoalForDetail(null); openAllocateModal(g); }}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 9: TAMBAH TAGIHAN RUTIN BARU (NEW BILL MODAL)                 */}
      {/* =================================================================== */}
      {isAddBillOpen && (
        <AddBillModal
          ledgerName={currentLedger.name}
          accounts={accounts}
          name={newBillName} onName={setNewBillName}
          cycle={newBillCycle} onCycle={setNewBillCycle}
          customCount={newBillCustomCount} onCustomCount={setNewBillCustomCount}
          customUnit={newBillCustomUnit} onCustomUnit={setNewBillCustomUnit}
          pricingType={newBillPricingType} onPricingType={setNewBillPricingType}
          amount={newBillAmount} onAmount={handleBillAmountCalcChange} calcNotice={billCalcNotice}
          lastNominal={newBillLastNominal} onLastNominal={handleBillLastNominalCalcChange} lastNominalNotice={newBillLastNominalCalcNotice}
          nextDate={newBillNextDate} onNextDate={setNewBillNextDate}
          category={newBillCategory} onCategory={setNewBillCategory}
          sourceAccount={newBillSourceAccount} onSourceAccount={setNewBillSourceAccount}
          note={newBillNote} onNote={setNewBillNote}
          color={newBillColor} onColor={setNewBillColor}
          onSubmit={handleCreateBill}
          onClose={() => setIsAddBillOpen(false)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 10: BAYAR SEKARANG (PAY BILL MODAL) DENGAN AUTO-RENEWAL        */}
      {/* =================================================================== */}
      {payingBill && (
        <PayBillModal
          bill={payingBill}
          accounts={accounts}
          amount={payBillAmount}
          onAmountChange={handlePayBillAmountCalcChange}
          calcNotice={payBillCalcNotice}
          sourceAccount={payBillSourceAccount}
          onSourceChange={setPayBillSourceAccount}
          date={payBillDate}
          onDateChange={setPayBillDate}
          note={payBillNote}
          onNoteChange={setPayBillNote}
          onSubmit={handleExecutePayBill}
          onClose={() => setPayingBill(null)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 11: EDIT TAGIHAN                                              */}
      {/* =================================================================== */}
      {editingBill && (
        <EditBillModal
          billName={editingBill.name}
          accounts={accounts}
          name={editBillName} onName={setEditBillName}
          cycle={editBillCycle} onCycle={setEditBillCycle}
          customCount={editBillCustomCount} onCustomCount={setEditBillCustomCount}
          customUnit={editBillCustomUnit} onCustomUnit={setEditBillCustomUnit}
          pricingType={editBillPricingType} onPricingType={setEditBillPricingType}
          amount={editBillAmount} onAmount={setEditBillAmount}
          lastNominal={editBillLastNominal} onLastNominal={handleEditBillLastNominalCalcChange} lastNominalNotice={editBillLastNominalCalcNotice}
          nextDate={editBillNextDate} onNextDate={setEditBillNextDate}
          category={editBillCategory} onCategory={setEditBillCategory}
          sourceAccount={editBillSourceAccount} onSourceAccount={setEditBillSourceAccount}
          note={editBillNote} onNote={setEditBillNote}
          color={editBillColor} onColor={setEditBillColor}
          onSubmit={handleSaveEditedBill}
          onClose={() => setEditingBill(null)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 12: KONFIRMASI HAPUS TAGIHAN                                  */}
      {/* =================================================================== */}
      {billToDelete && (
        <ConfirmDeleteModal
          title="Hapus Tagihan?"
          kind="Tagihan"
          name={billToDelete.name}
          notes={[{ text: 'Pengingat tagihan ini akan dihapus. Riwayat transaksi pembayaran yang sudah dilakukan tetap tersimpan di riwayat kas Anda.' }]}
          confirmLabel="Ya, hapus tagihan"
          onClose={() => setBillToDelete(null)}
          onConfirm={confirmExecuteDeleteBill}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 13: CATAT UTANG BARU (NEW DEBT MODAL)                         */}
      {/* =================================================================== */}
      {isAddDebtOpen && (
        <AddDebtModal
          ledgerName={currentLedger.name}
          name={newDebtName} onName={setNewDebtName}
          lender={newDebtLender} onLender={setNewDebtLender}
          total={newDebtTotal} onTotal={handleDebtTotalCalcChange} calcNotice={debtCalcNotice}
          remaining={newDebtRemaining} onRemaining={setNewDebtRemaining}
          nextDate={newDebtNextDate} onNextDate={setNewDebtNextDate}
          cycle={newDebtCycle} onCycle={setNewDebtCycle}
          customCount={newDebtCustomCount} onCustomCount={setNewDebtCustomCount}
          customUnit={newDebtCustomUnit} onCustomUnit={setNewDebtCustomUnit}
          dueDate={newDebtDueDate} onDueDate={setNewDebtDueDate}
          note={newDebtNote} onNote={setNewDebtNote}
          color={newDebtColor} onColor={setNewDebtColor}
          onSubmit={handleCreateDebt}
          onClose={() => setIsAddDebtOpen(false)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 14: BAYAR CICILAN UTANG (PAY DEBT INSTALLMENT MODAL)          */}
      {/* =================================================================== */}
      {payingDebt && (
        <PayDebtModal
          debt={payingDebt}
          accounts={accounts}
          amount={payDebtAmount}
          onAmountChange={handlePayDebtAmountCalcChange}
          onSetAmount={setPayDebtAmount}
          calcNotice={payDebtCalcNotice}
          sourceAccount={payDebtSourceAccount}
          onSourceChange={setPayDebtSourceAccount}
          date={payDebtDate}
          onDateChange={setPayDebtDate}
          note={payDebtNote}
          onNoteChange={setPayDebtNote}
          onSubmit={handleExecutePayDebt}
          onClose={() => setPayingDebt(null)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 15: EDIT UTANG                                                */}
      {/* =================================================================== */}
      {editingDebt && (
        <EditDebtModal
          debtName={editingDebt.name}
          name={editDebtName} onName={setEditDebtName}
          lender={editDebtLender} onLender={setEditDebtLender}
          total={editDebtTotal} onTotal={setEditDebtTotal}
          remaining={editDebtRemaining} onRemaining={setEditDebtRemaining}
          nextDate={editDebtNextDate} onNextDate={setEditDebtNextDate}
          cycle={editDebtCycle} onCycle={setEditDebtCycle}
          customCount={editDebtCustomCount} onCustomCount={setEditDebtCustomCount}
          customUnit={editDebtCustomUnit} onCustomUnit={setEditDebtCustomUnit}
          dueDate={editDebtDueDate} onDueDate={setEditDebtDueDate}
          note={editDebtNote} onNote={setEditDebtNote}
          color={editDebtColor} onColor={setEditDebtColor}
          onSubmit={handleSaveEditedDebt}
          onClose={() => setEditingDebt(null)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 16: KONFIRMASI HAPUS UTANG                                    */}
      {/* =================================================================== */}
      {debtToDelete && (
        <ConfirmDeleteModal
          title="Hapus Data Utang?"
          kind="Utang"
          name={debtToDelete.name}
          detailLabel="Sisa utang"
          detail={formatRupiah(debtToDelete.remainingDebt)}
          notes={[{ text: 'Dokumen utang ini akan dihapus. Riwayat transaksi cicilan yang telah dicatat tetap tersimpan di riwayat kas Anda.' }]}
          confirmLabel="Ya, hapus utang"
          onClose={() => setDebtToDelete(null)}
          onConfirm={confirmExecuteDeleteDebt}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 17: DETAIL & RIWAYAT TAGIHAN (PROGRESSIVE DISCLOSURE)        */}
      {/* =================================================================== */}
      {selectedBillForDetail && (
        <BillDetailModal
          bill={bills.find(b => b.id === selectedBillForDetail.id) || selectedBillForDetail}
          accounts={accounts}
          transactions={transactions}
          onClose={() => setSelectedBillForDetail(null)}
          onEditTx={openEditTransactionModal}
          onDeleteTx={setTxToDelete}
          onPay={(b) => { setSelectedBillForDetail(null); openPayBillModal(b); }}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 18: DETAIL & RIWAYAT UTANG / CICILAN                         */}
      {/* =================================================================== */}
      {selectedDebtForDetail && (
        <DebtDetailModal
          debt={debts.find(d => d.id === selectedDebtForDetail.id) || selectedDebtForDetail}
          accounts={accounts}
          transactions={transactions}
          onClose={() => setSelectedDebtForDetail(null)}
          onEditTx={openEditTransactionModal}
          onDeleteTx={setTxToDelete}
          onPay={(d) => { setSelectedDebtForDetail(null); openPayDebtModal(d); }}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 19: BUAT ATURAN OTOMATISASI BARU (NEW AUTOMATION RULE)        */}
      {/* =================================================================== */}
      {isAddAutomationOpen && (
        <AutomationFormModal
          mode="create"
          ledgerName={currentLedger.name}
          accounts={accounts}
          kind={apKind ? `ap_${apKind}` : newAutoType}
          onKind={(id) => {
            if (id.startsWith('ap_')) { setApKind(id.slice(3) as AutopilotKind); setApDraft(emptyApDraft()); return; }
            setApKind(null);
            setNewAutoType(id as AutomationType);
            if (id === 'income') {
              setNewAutoCategory('Gaji & Pendapatan');
              setNewAutoColor('#2dd4a7');
            } else if (id === 'expense') {
              setNewAutoCategory('Biaya Layanan & Admin');
              setNewAutoColor('#ff7a4d');
            } else {
              setNewAutoCategory('Transfer Tabungan');
              setNewAutoColor('#6c97ff');
            }
          }}
          autopilotFields={apKind ? (
            <AutopilotFields kind={apKind} draft={apDraft} onChange={setApDraft} accounts={accounts} goals={goals} bills={bills} debts={debts} />
          ) : undefined}
          name={newAutoName} onName={setNewAutoName}
          category={newAutoCategory} onCategory={setNewAutoCategory}
          amount={newAutoAmount} onAmount={handleAutoAmountCalcChange} calcNotice={autoCalcNotice}
          sourceAccount={newAutoSourceAccount} onSourceAccount={setNewAutoSourceAccount}
          toAccount={newAutoToAccount} onToAccount={setNewAutoToAccount}
          cycle={newAutoCycle} onCycle={setNewAutoCycle}
          monthlyDay={newAutoMonthlyDay}
          onMonthlyDay={(val) => {
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
          customCount={newAutoCustomCount} onCustomCount={setNewAutoCustomCount}
          customUnit={newAutoCustomUnit} onCustomUnit={setNewAutoCustomUnit}
          nextDate={newAutoNextDate} onNextDate={setNewAutoNextDate}
          note={newAutoNote} onNote={setNewAutoNote}
          onSubmit={apKind ? handleCreateAutopilot : handleCreateAutomation}
          onClose={() => setIsAddAutomationOpen(false)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 20: EDIT ATURAN OTOMATISASI                                   */}
      {/* =================================================================== */}
      {editingAutomation && (
        <AutomationFormModal
          mode="edit"
          ledgerName={currentLedger.name}
          ruleName={editingAutomation.name}
          accounts={accounts}
          kind={editAutoType}
          name={editAutoName} onName={setEditAutoName}
          category={editAutoCategory} onCategory={setEditAutoCategory}
          amount={editAutoAmount} onAmount={handleEditAutoAmountCalcChange} calcNotice={editAutoCalcNotice}
          sourceAccount={editAutoSourceAccount} onSourceAccount={setEditAutoSourceAccount}
          toAccount={editAutoToAccount} onToAccount={setEditAutoToAccount}
          cycle={editAutoCycle} onCycle={setEditAutoCycle}
          monthlyDay={editAutoMonthlyDay} onMonthlyDay={setEditAutoMonthlyDay}
          customCount={editAutoCustomCount} onCustomCount={setEditAutoCustomCount}
          customUnit={editAutoCustomUnit} onCustomUnit={setEditAutoCustomUnit}
          nextDate={editAutoNextDate} onNextDate={setEditAutoNextDate}
          note={editAutoNote} onNote={setEditAutoNote}
          onSubmit={handleSaveEditedAutomation}
          onClose={() => setEditingAutomation(null)}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 21: KONFIRMASI HAPUS ATURAN OTOMATISASI                       */}
      {/* =================================================================== */}
      {automationToDelete && (
        <ConfirmDeleteModal
          title="Hapus Aturan Otomatis?"
          kind="Aturan otomatisasi"
          name={automationToDelete.name}
          notes={[{ text: 'Aturan penjadwalan ini akan dihapus. Riwayat transaksi yang pernah dibuat oleh aturan ini tetap aman di riwayat kas Anda.' }]}
          confirmLabel="Ya, hapus aturan"
          onClose={() => setAutomationToDelete(null)}
          onConfirm={confirmExecuteDeleteAutomation}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL 22: DETAIL & RIWAYAT EKSEKUSI ATURAN OTOMATISASI              */}
      {/* =================================================================== */}
      {selectedAutomationForDetail && (
        <AutomationDetailModal
          rule={automations.find(a => a.id === selectedAutomationForDetail.id) || selectedAutomationForDetail}
          accounts={accounts}
          transactions={transactions}
          onClose={() => setSelectedAutomationForDetail(null)}
          onEditTx={openEditTransactionModal}
          onDeleteTx={setTxToDelete}
          onRunNow={(r, e) => { handleManualExecuteAutomation(r, e); }}
          onEdit={(r, e) => { setSelectedAutomationForDetail(null); openEditAutomationModal(r, e); }}
        />
      )}

      {/* Footer */}
      <footer className="border-t-[2.5px] border-[var(--border-color)] bg-[var(--bg-surface)] py-3 px-3 pb-20 md:pb-3 text-center text-xs font-mono text-[var(--text-secondary)]">
        Artha Neo-Brutalism • Multi-Buku Kas (Active: {currentLedger.name}) & Firestore Offline-First
      </footer>
    </div>
  );
}
