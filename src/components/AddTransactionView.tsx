import React, { useState, useRef, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowRightLeft, 
  Calculator, 
  Calendar, 
  Camera as ScanCamera, 
  Check, 
  Plus, 
  Settings2, 
  Settings,
  Pencil,
  RotateCcw,
  Sliders,
  PieChart,
  Tag, 
  Trash2, 
  X,
  History,
  AlertCircle
} from 'lucide-react';
import type { Account, Ledger, Transaction } from '../types';
import { evaluateMathExpression, formatRupiah } from '../utils/calculator';
import { useCategories, LOCKED_CATEGORY } from '../hooks/useCategories';
import { getCategoryBudgets, saveCategoryBudgets, type CategoryBudgetMap } from '../services/budgetService';
import { scanReceipt } from '../services/receiptScanService';
import { getGeminiKey, getGeminiModel, saveGeminiSettings } from '../services/geminiSettings';
import type { ModuleId } from './layout/navConfig';

interface Props {
  currentLedger: Ledger;
  accounts: Account[];
  recentTransactions: Transaction[];
  onSaveTransaction: (data: {
    type: 'income' | 'expense';
    amount: number;
    accountId: string;
    category: string;
    date: string;
    note: string;
  }) => Promise<void>;
  onExecuteTransfer: (data: {
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;
    note: string;
    date: string;
  }) => Promise<void>;
  onNavigate: (id: ModuleId) => void;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export function AddTransactionView({
  currentLedger,
  accounts,
  recentTransactions,
  onSaveTransaction,
  onExecuteTransfer,
  onNavigate,
  showToast
}: Props) {
  // Mode Tab: 'income' | 'expense' | 'transfer'
  const [activeTab, setActiveTab] = useState<'expense' | 'income' | 'transfer'>('expense');
  
  // Form Transaksi (Income / Expense)
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [category, setCategory] = useState('Makanan & Minuman');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [calcNotice, setCalcNotice] = useState<string | null>(null);

  // Form Transfer
  const [transferSource, setTransferSource] = useState(accounts[0]?.id || '');
  const [transferDest, setTransferDest] = useState(accounts[1]?.id || '');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [transferCalcNotice, setTransferCalcNotice] = useState<string | null>(null);

  // Category & Budget Manager Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [modalSubTab, setModalSubTab] = useState<'budget' | 'categories'>('budget');
  const [newCatName, setNewCatName] = useState('');
  const [catError, setCatError] = useState<string | null>(null);
  const [categoryKindInModal, setCategoryKindInModal] = useState<'expense' | 'income'>('expense');
  const [editingCategory, setEditingCategory] = useState<{ kind: 'expense' | 'income'; oldName: string; newName: string } | null>(null);
  const categories = useCategories();

  // Budget State per Kategori
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudgetMap>(() => getCategoryBudgets(currentLedger.id));
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const b = getCategoryBudgets(currentLedger.id);
    setCategoryBudgets(b);
    const initialInputs: Record<string, string> = {};
    categories.lists.expense.forEach(c => {
      initialInputs[c] = b[c] !== undefined ? String(b[c]) : '';
    });
    setBudgetInputs(initialInputs);
  }, [currentLedger.id, categories.lists.expense]);

  // Event listener untuk tombol 'Pengaturan Tab Transaksi' di header navbar
  useEffect(() => {
    const handleOpenSettings = () => {
      setIsCategoryModalOpen(true);
    };
    window.addEventListener('open-tx-tab-settings', handleOpenSettings);
    return () => window.removeEventListener('open-tx-tab-settings', handleOpenSettings);
  }, []);

  // AI Scan Struk
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<{ amount: number; merchant?: string | null } | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [inputApiKey, setInputApiKey] = useState<string>('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Sync default account when accounts change
  useEffect(() => {
    if (accounts.length > 0) {
      if (!accountId || !accounts.find(a => a.id === accountId)) {
        setAccountId(accounts[0].id);
      }
      if (!transferSource || !accounts.find(a => a.id === transferSource)) {
        setTransferSource(accounts[0].id);
      }
      if (!transferDest || !accounts.find(a => a.id === transferDest)) {
        setTransferDest(accounts.length > 1 ? accounts[1].id : '');
      }
    }
  }, [accounts]);

  // Sync category default when tab changes
  useEffect(() => {
    if (activeTab === 'expense') {
      const list = categories.lists.expense;
      if (!list.includes(category)) setCategory(list[0] || 'Lainnya');
    } else if (activeTab === 'income') {
      const list = categories.lists.income;
      if (!list.includes(category)) setCategory(list[0] || 'Lainnya');
    }
  }, [activeTab, categories.lists]);

  // Math Calculator on blur
  function handleAmountBlur() {
    if (!amount) return;
    const { success, result, displayValue } = evaluateMathExpression(amount);
    if (success && displayValue !== amount) {
      setCalcNotice(`Kalkulator: ${amount} = ${formatRupiah(result)}`);
      setAmount(displayValue);
      setTimeout(() => setCalcNotice(null), 4000);
    }
  }

  function handleTransferAmountBlur() {
    if (!transferAmount) return;
    const { success, result, displayValue } = evaluateMathExpression(transferAmount);
    if (success && displayValue !== transferAmount) {
      setTransferCalcNotice(`Kalkulator: ${transferAmount} = ${formatRupiah(result)}`);
      setTransferAmount(displayValue);
      setTimeout(() => setTransferCalcNotice(null), 4000);
    }
  }

  function addQuickAmount(val: number) {
    const cur = parseInt(amount.replace(/[^\d]/g, '') || '0', 10);
    setAmount((cur + val).toString());
  }

  function addQuickTransferAmount(val: number) {
    const cur = parseInt(transferAmount.replace(/[^\d]/g, '') || '0', 10);
    setTransferAmount((cur + val).toString());
  }

  // Handle Scan Struk
  async function processReceiptFile(file: File, keyToUse?: string) {
    const key = keyToUse || getGeminiKey();
    if (!key) {
      setPendingFile(file);
      setShowApiKeyModal(true);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setReceiptPreview(previewUrl);
    setIsScanning(true);

    try {
      const r = await scanReceipt(file, categories.lists.expense, { apiKey: key, model: getGeminiModel() });
      setActiveTab('expense');
      setAmount(String(r.amount));
      if (r.date) setDate(r.date);
      if (r.category) setCategory(r.category);
      if (r.note) setNote(r.note);
      setScannedResult({ amount: r.amount, merchant: r.note });
      showToast(`Struk terbaca! Rp ${r.amount.toLocaleString('id-ID')} (${r.note || 'Belanja'})`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membaca struk.', 'error');
    } finally {
      setIsScanning(false);
    }
  }

  async function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processReceiptFile(file);
  }

  async function handleSaveApiKeyAndScan(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputApiKey.trim();
    if (!trimmed) {
      showToast('API Key tidak boleh kosong', 'error');
      return;
    }
    saveGeminiSettings(trimmed, getGeminiModel());
    setShowApiKeyModal(false);
    showToast('Kunci Gemini tersimpan!', 'success');
    if (pendingFile) {
      const f = pendingFile;
      setPendingFile(null);
      await processReceiptFile(f, trimmed);
    }
  }

  // Submit Handler Transaksi
  async function handleSubmitTransaction(e: React.FormEvent) {
    e.preventDefault();
    const { result } = evaluateMathExpression(amount);
    if (result <= 0) {
      showToast('Nominal harus lebih dari 0!', 'error');
      return;
    }
    if (!accountId) {
      showToast('Pilih akun sumber dana terlebih dahulu!', 'error');
      return;
    }
    if (activeTab === 'transfer') return;

    await onSaveTransaction({
      type: activeTab,
      amount: result,
      accountId,
      category,
      date,
      note
    });

    setAmount('');
    setNote('');
    setCalcNotice(null);
  }

  // Submit Handler Transfer
  async function handleSubmitTransfer(e: React.FormEvent) {
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

    await onExecuteTransfer({
      sourceAccountId: transferSource,
      destinationAccountId: transferDest,
      amount: result,
      note: transferNote,
      date: transferDate
    });

    setTransferAmount('');
    setTransferNote('');
    setTransferCalcNotice(null);
  }

  // Budget and Category Handlers
  function handleSaveAllBudgets(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const updated: CategoryBudgetMap = {};
    categories.lists.expense.forEach(cat => {
      const raw = budgetInputs[cat] || '';
      const num = parseInt(raw.replace(/[^\d]/g, ''), 10) || 0;
      updated[cat] = num;
    });
    saveCategoryBudgets(currentLedger.id, updated);
    setCategoryBudgets(updated);
    showToast('Alokasi pagu dana bulanan berhasil disimpan!', 'success');
  }

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const kind = categoryKindInModal;
    const err = categories.add(kind, newCatName.trim());
    if (err) {
      setCatError(err);
      return;
    }
    const added = newCatName.trim();
    if (kind === 'expense') {
      setBudgetInputs(prev => ({ ...prev, [added]: '500000' }));
    }
    setCategory(added);
    setNewCatName('');
    setCatError(null);
    showToast(`Kategori "${added}" berhasil ditambahkan!`, 'success');
  }

  function handleRenameCategory() {
    if (!editingCategory) return;
    const err = categories.rename(editingCategory.kind, editingCategory.oldName, editingCategory.newName);
    if (err) {
      showToast(err, 'error');
      return;
    }
    if (editingCategory.kind === 'expense') {
      const currentVal = budgetInputs[editingCategory.oldName] || '';
      setBudgetInputs(prev => {
        const next = { ...prev };
        delete next[editingCategory.oldName];
        next[editingCategory.newName] = currentVal;
        return next;
      });
      const b = { ...categoryBudgets };
      if (b[editingCategory.oldName] !== undefined) {
        b[editingCategory.newName] = b[editingCategory.oldName];
        delete b[editingCategory.oldName];
        saveCategoryBudgets(currentLedger.id, b);
      }
    }
    setEditingCategory(null);
    showToast(`Kategori diubah menjadi "${editingCategory.newName}"`, 'success');
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-4">
        <div>
          <h2 className="font-heading font-bold text-2xl text-[var(--text-primary)]">
            Tambah Transaksi & Transfer
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Catat arus kas masuk, keluar, atau mutasi antar akun di <b>{currentLedger.name}</b>.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onNavigate('history_transaction')}
            className="brutal-btn brutal-btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <History className="w-4 h-4 text-[var(--accent-blue)]" />
            <span>Buka Riwayat Transaksi</span>
          </button>
        </div>
      </div>

      {/* 3 TAB SELECTOR UTAMA (PENGELUARAN, PEMASUKAN, TRANSFER) */}
      <div className="grid grid-cols-3 p-1.5 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('expense')}
          className={`py-2.5 px-3 rounded-[var(--radius-sm)] font-heading font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'expense'
              ? 'bg-[var(--accent-terracotta)] text-[var(--text-inverted)] border-2 border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
              : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface)]'
          }`}
        >
          <TrendingDown className="w-4 h-4 shrink-0" />
          <span>Pengeluaran</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('income')}
          className={`py-2.5 px-3 rounded-[var(--radius-sm)] font-heading font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'income'
              ? 'bg-[var(--accent-sage)] text-[var(--text-inverted)] border-2 border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
              : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface)]'
          }`}
        >
          <TrendingUp className="w-4 h-4 shrink-0" />
          <span>Pemasukan</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transfer')}
          className={`py-2.5 px-3 rounded-[var(--radius-sm)] font-heading font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'transfer'
              ? 'bg-[var(--accent-blue)] text-[var(--text-inverted)] border-2 border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
              : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface)]'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4 shrink-0" />
          <span>Transfer</span>
        </button>
      </div>

      {/* FORM AREA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Kolom Kiri: Form Utama */}
        <div className="lg:col-span-8 space-y-4">
          {activeTab !== 'transfer' ? (
            /* =================== FORM PENGELUARAN / PEMASUKAN =================== */
            <div className="brutal-card p-5 bg-[var(--bg-surface)] space-y-4">
              <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[var(--accent-sand)]" />
                  <div>
                    <h3 className="font-heading font-bold text-base text-[var(--text-primary)]">
                      Input {activeTab === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
                    </h3>
                    <p className="text-[10px] font-mono text-[var(--accent-sage-light)]">Buku Kas: {currentLedger.name}</p>
                  </div>
                </div>

                {/* Tombol AI Scan Struk (Khusus Pengeluaran) */}
                {activeTab === 'expense' && (
                  <div>
                    <input 
                      ref={receiptInputRef} 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      className="hidden" 
                      onChange={handleReceiptFile} 
                    />
                    <button 
                      type="button" 
                      onClick={() => receiptInputRef.current?.click()} 
                      disabled={isScanning} 
                      className="brutal-btn brutal-btn-lavender text-xs py-1.5 px-3 flex items-center gap-1.5 !shadow-[2px_2px_0px_#000]"
                    >
                      <ScanCamera className="w-3.5 h-3.5" />
                      <span>{isScanning ? 'Membaca…' : 'Scan Struk (AI)'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Banner Preview Foto Struk yang Dianalisis */}
              {receiptPreview && activeTab === 'expense' && (
                <div className="p-3 bg-[var(--bg-elevated)] border-2 border-black dark:border-white/20 rounded-xl flex items-center justify-between gap-3 shadow-[2px_2px_0px_#000] animate-in fade-in duration-200">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={receiptPreview}
                      alt="Struk Belanja"
                      className="w-12 h-12 object-cover rounded-lg border-2 border-black dark:border-white/20 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-[var(--text-primary)]">Foto Struk Belanja</span>
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isScanning ? 'bg-amber-400 text-black animate-pulse' : 'bg-emerald-500 text-black'
                        }`}>
                          {isScanning ? 'Sedang AI Scan…' : '✓ Terbaca Gemini AI'}
                        </span>
                      </div>
                      {scannedResult ? (
                        <p className="text-[11px] font-mono text-[var(--accent-sand)] truncate mt-0.5">
                          {scannedResult.merchant ? `${scannedResult.merchant} • ` : ''}{formatRupiah(scannedResult.amount)}
                        </p>
                      ) : (
                        <p className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-0.5">
                          {isScanning ? 'Membaca rincian toko & total nominal...' : 'Data otomatis terisi di bawah'}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setReceiptPreview(null);
                      setScannedResult(null);
                    }}
                    className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--accent-terracotta)] hover:bg-[var(--bg-surface)] transition-all"
                    title="Hapus foto struk"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmitTransaction} className="space-y-4">
                {/* Field Nominal dengan Kalkulator */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0 flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                      Nominal Transaksi
                    </label>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">
                      Bisa hitung ekspresi (cth: 50000+15000)
                    </span>
                  </div>

                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden focus-within:border-[var(--accent-sage)] transition-all">
                    <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-sand)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      id="tx-amount-input"
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onBlur={handleAmountBlur}
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
                  <label className="brutal-label">Akun Sumber ({currentLedger.name})</label>
                  <select 
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="brutal-select"
                    required
                  >
                    {accounts.length === 0 ? (
                      <option value="">Belum ada akun di buku kas ini</option>
                    ) : (
                      accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} — {formatRupiah(acc.balance)}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Kategori dengan Button Pengaturan Kategori Langsung */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="brutal-label mb-0">Kategori</label>
                      <button
                        type="button"
                        onClick={() => setIsCategoryModalOpen(true)}
                        className="text-[11px] font-mono font-bold text-[var(--accent-blue-light)] hover:underline flex items-center gap-1"
                      >
                        <Settings2 className="w-3 h-3" />
                        <span>Kelola Kategori</span>
                      </button>
                    </div>

                    <select 
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="brutal-select"
                    >
                      {(activeTab === 'expense' ? categories.lists.expense : categories.lists.income).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="brutal-label">Tanggal</label>
                    <input 
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
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
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Misal: Makan siang kantor, belanja harian..."
                    className="brutal-input text-sm"
                  />
                </div>

                {/* Submit Button */}
                <button 
                  type="submit"
                  disabled={accounts.length === 0}
                  className={`brutal-btn w-full py-3 text-sm font-bold ${
                    activeTab === 'income' ? 'brutal-btn-sage' : 'brutal-btn-terracotta'
                  }`}
                >
                  {activeTab === 'income' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span>Simpan {activeTab === 'income' ? 'Pemasukan' : 'Pengeluaran'}</span>
                </button>
              </form>
            </div>
          ) : (
            /* =================== FORM TRANSFER ANTAR AKUN =================== */
            <div className="brutal-card p-5 bg-[var(--bg-surface)] border-2 border-[var(--accent-blue)] space-y-4">
              <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-[var(--accent-blue)]" />
                  <div>
                    <h3 className="font-heading font-bold text-base text-[var(--text-primary)]">
                      Transfer Antar Akun
                    </h3>
                    <p className="text-[10px] font-mono text-[var(--accent-blue-light)]">Buku Kas: {currentLedger.name}</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmitTransfer} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      {accounts.length === 0 ? (
                        <option value="">Belum ada akun di buku ini</option>
                      ) : (
                        accounts.map(acc => (
                          <option key={acc.id} value={acc.id} disabled={acc.id === transferSource}>
                            {acc.name} {acc.id === transferSource ? '(Akun Asal)' : `— ${formatRupiah(acc.balance)}`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Nominal Transfer */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="brutal-label mb-0 flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                      Nominal Transfer
                    </label>
                    <span className="text-[10px] font-mono text-[var(--accent-blue-light)]">
                      Bisa hitung ekspresi
                    </span>
                  </div>

                  <div className="flex items-stretch border-[2.5px] border-[var(--border-color)] rounded-[var(--radius-md)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] overflow-hidden focus-within:border-[var(--accent-blue)] transition-all">
                    <span className="px-3.5 py-2 bg-[var(--bg-muted)] border-r-2 border-[var(--border-color)] font-mono font-bold text-sm text-[var(--accent-blue)] flex items-center select-none shrink-0">
                      Rp
                    </span>
                    <input 
                      type="text"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      onBlur={handleTransferAmountBlur}
                      placeholder="0..."
                      className="w-full bg-transparent px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-base focus:outline-none"
                      required
                    />
                  </div>

                  {transferCalcNotice && (
                    <div className="mt-1.5 p-2 bg-[var(--bg-elevated)] border border-[var(--accent-blue)] rounded-[var(--radius-sm)] text-xs font-mono text-[var(--accent-blue-light)] flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      {transferCalcNotice}
                    </div>
                  )}

                  {/* Quick Chips Transfer */}
                  <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                    {[50000, 100000, 250000, 500000, 1000000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => addQuickTransferAmount(amt)}
                        className="px-2 py-0.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded text-[11px] font-mono text-[var(--text-secondary)] whitespace-nowrap"
                      >
                        +{amt >= 1000 ? `${amt / 1000}k` : amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="brutal-label">Tanggal</label>
                    <input 
                      type="date"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                      className="brutal-input text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="brutal-label">Catatan Transfer (Opsional)</label>
                    <input 
                      type="text"
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                      placeholder="Misal: Tarik tunai ATM, topup e-wallet"
                      className="brutal-input text-sm"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={accounts.length < 2}
                  className="brutal-btn brutal-btn-blue w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Eksekusi Transfer Antar Akun</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Kolom Kanan: Rangkuman Cepat Akun & Transaksi Terakhir */}
        <div className="lg:col-span-4 space-y-4">
          {/* Akun Saldo Singkat */}
          <div className="brutal-card p-4 bg-[var(--bg-surface)] space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-xs font-heading font-bold text-[var(--text-primary)] uppercase">
                Akun di Buku Ini
              </span>
              <button
                type="button"
                onClick={() => onNavigate('module1')}
                className="text-[10px] font-mono text-[var(--accent-sage-light)] hover:underline"
              >
                Kelola Akun →
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {accounts.map(acc => (
                <div key={acc.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <span className="font-bold text-[var(--text-primary)] truncate max-w-[120px]">{acc.name}</span>
                  <span className="font-mono text-[var(--accent-sand-light)]">{formatRupiah(acc.balance)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3 Transaksi Terakhir di Buku Ini */}
          <div className="brutal-card p-4 bg-[var(--bg-surface)] space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="text-xs font-heading font-bold text-[var(--text-primary)] uppercase">
                Baru Saja Dicatat
              </span>
              <button
                type="button"
                onClick={() => onNavigate('history_transaction')}
                className="text-[10px] font-mono text-[var(--accent-blue-light)] hover:underline"
              >
                Semua Riwayat →
              </button>
            </div>

            {recentTransactions.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">Belum ada transaksi di buku ini.</p>
            ) : (
              <div className="space-y-2">
                {recentTransactions.slice(0, 3).map(t => (
                  <div key={t.id} className="p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-[var(--text-primary)] truncate">{t.category || t.type}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{t.date}</p>
                    </div>
                    <span className={`font-mono text-xs font-bold shrink-0 ${
                      t.type === 'income' ? 'text-[var(--accent-sage-light)]' : t.type === 'expense' ? 'text-[var(--accent-terracotta-light)]' : 'text-[var(--accent-blue-light)]'
                    }`}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '⇄'} {formatRupiah(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODAL PENGATURAN TAB TRANSAKSI: ALOKASI BUDGET & KELOLA KATEGORI    */}
      {/* =================================================================== */}
      {isCategoryModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-[2px]"
          onClick={() => setIsCategoryModalOpen(false)}
        >
          <div 
            className="w-full max-w-lg bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[var(--accent-sand)]" />
                <div>
                  <h3 className="font-heading font-bold text-base sm:text-lg text-[var(--text-primary)]">
                    Pengaturan Tab Transaksi
                  </h3>
                  <p className="text-[10px] font-mono text-[var(--text-muted)]">
                    Buku Kas: {currentLedger.name}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsCategoryModalOpen(false)} 
                className="brutal-btn !p-1.5"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-Tab Switcher: Alokasi Budget vs Kelola Kategori */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-[var(--radius-sm)]">
              <button
                type="button"
                onClick={() => setModalSubTab('budget')}
                className={`py-1.5 px-3 rounded text-xs font-heading font-bold flex items-center justify-center gap-1.5 transition-all ${
                  modalSubTab === 'budget'
                    ? 'bg-[var(--accent-sand)] text-black border border-black shadow-[1px_1px_0px_#000]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <PieChart className="w-3.5 h-3.5" />
                <span>Alokasi Budget (Bulanan)</span>
              </button>

              <button
                type="button"
                onClick={() => setModalSubTab('categories')}
                className={`py-1.5 px-3 rounded text-xs font-heading font-bold flex items-center justify-center gap-1.5 transition-all ${
                  modalSubTab === 'categories'
                    ? 'bg-[var(--accent-sand)] text-black border border-black shadow-[1px_1px_0px_#000]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Kelola Kategori</span>
              </button>
            </div>

            {/* KONTEN SUB-TAB 1: ALOKASI BUDGET BULANAN */}
            {modalSubTab === 'budget' && (
              <div className="space-y-4">
                <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] leading-relaxed space-y-1">
                  <p className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[var(--accent-sand)]" />
                    Kontrol Pagu Pengeluaran Bulanan
                  </p>
                  <p className="text-[11px] font-mono text-[var(--text-muted)]">
                    Atur alokasi dana per kategori untuk 1 bulan. Status <b>On Budget</b> atau <b>Over Budget</b> akan tampil di Laporan Keuangan secara otomatis.
                  </p>
                </div>

                <form onSubmit={handleSaveAllBudgets} className="space-y-3">
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {categories.lists.expense.map(cat => {
                      const val = budgetInputs[cat] ?? '';
                      const numVal = parseInt(val.replace(/[^\d]/g, '') || '0', 10);
                      return (
                        <div key={cat} className="p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[var(--accent-terracotta)]" />
                              {cat}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              {formatRupiah(numVal)} / bln
                            </span>
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[var(--text-muted)]">
                              Rp
                            </span>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g, '');
                                setBudgetInputs(prev => ({ ...prev, [cat]: raw }));
                              }}
                              placeholder="0 (fleksibel/tanpa limit)"
                              className="brutal-input text-xs py-1.5 pl-8 pr-2 w-full font-mono font-bold"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                    <div className="text-[11px] font-mono text-[var(--text-muted)]">
                      Total Pagu: <strong className="text-[var(--text-primary)] font-bold">
                        {formatRupiah(
                          categories.lists.expense.reduce((sum, c) => {
                            const raw = budgetInputs[c] || '';
                            return sum + (parseInt(raw.replace(/[^\d]/g, ''), 10) || 0);
                          }, 0)
                        )}
                      </strong>
                    </div>

                    <button
                      type="submit"
                      className="brutal-btn brutal-btn-sand text-xs py-2 px-4 font-bold flex items-center gap-1.5 shadow-[2px_2px_0px_#000]"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan Alokasi Budget</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* KONTEN SUB-TAB 2: KELOLA KATEGORI */}
            {modalSubTab === 'categories' && (
              <div className="space-y-4">
                {/* Selector Pengeluaran vs Pemasukan */}
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => { setCategoryKindInModal('expense'); setEditingCategory(null); }}
                    className={`py-1 px-3 rounded font-bold border transition-all ${
                      categoryKindInModal === 'expense'
                        ? 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)] border-[var(--accent-terracotta)]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                    }`}
                  >
                    Pengeluaran ({categories.lists.expense.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCategoryKindInModal('income'); setEditingCategory(null); }}
                    className={`py-1 px-3 rounded font-bold border transition-all ${
                      categoryKindInModal === 'income'
                        ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)] border-[var(--accent-sage)]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                    }`}
                  >
                    Pemasukan ({categories.lists.income.length})
                  </button>
                </div>

                {/* Form Tambah Kategori Baru */}
                <form onSubmit={handleAddCategory} className="space-y-2">
                  <label className="brutal-label text-xs">
                    Tambah Kategori {categoryKindInModal === 'expense' ? 'Pengeluaran' : 'Pemasukan'} Baru
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCatName}
                      onChange={(e) => { setNewCatName(e.target.value); setCatError(null); }}
                      placeholder="Contoh: Langganan SaaS, Servis Motor..."
                      className="brutal-input text-xs flex-1"
                    />
                    <button
                      type="submit"
                      className="brutal-btn brutal-btn-sage text-xs py-2 px-3 flex items-center gap-1 font-bold shrink-0 shadow-[2px_2px_0px_#000]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah</span>
                    </button>
                  </div>
                  {catError && (
                    <p className="text-xs text-[var(--accent-terracotta-light)] font-mono flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {catError}
                    </p>
                  )}
                </form>

                {/* Mode Edit/Rename Kategori */}
                {editingCategory && (
                  <div className="p-3 rounded bg-[var(--bg-elevated)] border-2 border-[var(--accent-blue)] space-y-2">
                    <span className="text-xs font-bold text-[var(--accent-blue-light)] flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Ubah Nama Kategori:
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingCategory.newName}
                        onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                        className="brutal-input text-xs flex-1"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleRenameCategory}
                        className="brutal-btn brutal-btn-sand text-xs py-1.5 px-3 font-bold"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCategory(null)}
                        className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-2"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                {/* List Kategori Saat Ini */}
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase font-bold text-[var(--text-muted)]">
                      Daftar Kategori Aktif:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Kembalikan daftar kategori ke pengaturan default?')) {
                          categories.reset();
                          showToast('Kategori dikembalikan ke default!', 'info');
                        }
                      }}
                      className="text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Default</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {categories.lists[categoryKindInModal].map(c => (
                      <div key={c} className="flex items-center justify-between p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs">
                        <span className="font-bold text-[var(--text-primary)] truncate">{c}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {c !== LOCKED_CATEGORY && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingCategory({ kind: categoryKindInModal, oldName: c, newName: c })}
                                className="text-[var(--text-muted)] hover:text-[var(--accent-blue-light)] p-1"
                                title="Ubah Nama"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => categories.remove(categoryKindInModal, c)}
                                className="text-[var(--text-muted)] hover:text-[var(--accent-terracotta-light)] p-1"
                                title="Hapus Kategori"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsCategoryModalOpen(false)}
                    className="brutal-btn brutal-btn-sand text-xs py-1.5 px-4 font-bold"
                  >
                    Selesai
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL SETUP CEPAT GEMINI API UNTUK SCAN STRUK */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="brutal-card p-5 bg-[var(--bg-surface)] border-2 border-black max-w-md w-full space-y-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <ScanCamera className="w-5 h-5 text-[var(--accent-sand)]" />
                <h3 className="font-heading font-bold text-base text-white">Aktifkan Gemini AI Scanner</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowApiKeyModal(false)} 
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Fitur scan struk otomatis ditenagai oleh <strong>Google Gemini Flash AI Vision</strong>. Masukkan API Key Google AI Studio Anda untuk membaca struk belanja:
            </p>

            <form onSubmit={handleSaveApiKeyAndScan} className="space-y-3">
              <div>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={inputApiKey}
                  onChange={e => setInputApiKey(e.target.value)}
                  className="brutal-input text-xs py-2 w-full font-mono"
                  autoFocus
                />
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[10px] text-amber-400 hover:underline mt-1.5"
                >
                  🔗 Dapatkan API Key Gratis di Google AI Studio →
                </a>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowApiKeyModal(false)}
                  className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-3"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!inputApiKey.trim()}
                  className="brutal-btn brutal-btn-sand text-xs py-1.5 px-4 font-bold shadow-[2px_2px_0px_#000]"
                >
                  Simpan & Scan Sekarang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
