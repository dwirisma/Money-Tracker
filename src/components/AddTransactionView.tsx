import { freeBalanceText, getFreeBalance } from '../utils/accountBalance';
import React, { useState, useRef, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Calculator,
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
import { ModalFrame } from './ui/ModalFrame';

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
    <div className="ax-add">
      <div className="ax-pagehead">
        <div>
          <h2>Catat Transaksi</h2>
          <p>Arus kas masuk, keluar, atau pindah antar akun di <b>{currentLedger.name}</b></p>
        </div>
        <button type="button" onClick={() => onNavigate('history_transaction')} className="brutal-btn ax-btn-light">
          <History className="w-4 h-4" />Riwayat
        </button>
      </div>

      {/* TAB JENIS TRANSAKSI */}
      <div className="ax-seg" role="tablist" aria-label="Jenis transaksi">
        {([
          ['expense', 'Pengeluaran', TrendingDown],
          ['income', 'Pemasukan', TrendingUp],
          ['transfer', 'Transfer', ArrowRightLeft]
        ] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={activeTab === k} data-on={activeTab === k} data-k={k} onClick={() => setActiveTab(k)}>
            <Icon className="w-4 h-4 shrink-0" />{label}
          </button>
        ))}
      </div>

      <div className="ax-addgrid">
        {/* KOLOM UTAMA: FORM */}
        <div className="ax-panel">
          {activeTab !== 'transfer' ? (
            <form onSubmit={handleSubmitTransaction} className="ax-form">
              {/* Scan struk (khusus pengeluaran) */}
              {activeTab === 'expense' && (
                <div className="ax-ph" style={{ margin: 0 }}>
                  <h3><span className="ax-ic" style={{ background: 'var(--accent-lavender)' }}><ScanCamera className="w-3.5 h-3.5" /></span>Input pengeluaran</h3>
                  <div>
                    <input ref={receiptInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleReceiptFile} />
                    <button type="button" onClick={() => receiptInputRef.current?.click()} disabled={isScanning} className="brutal-btn brutal-btn-lavender !py-1.5 !px-3 text-[11px]" title="Pindai foto struk belanja dengan Gemini AI">
                      <ScanCamera className="w-3.5 h-3.5" />{isScanning ? 'Membaca…' : 'Scan Struk'}
                    </button>
                  </div>
                </div>
              )}

              {receiptPreview && activeTab === 'expense' && (
                <div className="ax-scan">
                  <img src={receiptPreview} alt="Struk Belanja" />
                  <div>
                    <b>Foto struk · {isScanning ? 'sedang dibaca AI…' : '✓ terbaca Gemini'}</b>
                    <small>
                      {scannedResult
                        ? `${scannedResult.merchant ? `${scannedResult.merchant} • ` : ''}${formatRupiah(scannedResult.amount)}`
                        : isScanning ? 'Membaca rincian toko & total nominal...' : 'Data otomatis terisi di bawah'}
                    </small>
                  </div>
                  <button type="button" className="ax-iconbtn" title="Hapus foto struk" aria-label="Hapus foto struk" onClick={() => { setReceiptPreview(null); setScannedResult(null); }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* NOMINAL */}
              <div className="ax-amt" data-kind={activeTab}>
                <label className="ax-fl" htmlFor="tx-amount-input">
                  <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Nominal {activeTab === 'expense' ? 'pengeluaran' : 'pemasukan'}</span>
                </label>
                <div className="ax-amt-row">
                  <span>Rp</span>
                  <input id="tx-amount-input" type="text" inputMode="text" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={handleAmountBlur} placeholder="0" required />
                </div>
                {calcNotice && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{calcNotice}</div>}
                <div className="ax-qs" aria-label="Tambah nominal cepat">
                  {[10000, 20000, 50000, 100000, 500000].map(amt => (
                    <button key={amt} type="button" onClick={() => addQuickAmount(amt)}>+{amt >= 1000 ? `${amt / 1000}k` : amt}</button>
                  ))}
                </div>
                <p className="ax-hint">Bisa hitung langsung, contoh: 50000+15000</p>
              </div>

              {/* AKUN SUMBER */}
              <div>
                <div className="ax-fl"><span>{activeTab === 'expense' ? 'Bayar dari akun' : 'Masuk ke akun'}</span>
                  <button type="button" onClick={() => onNavigate('module1')}>Kelola akun</button>
                </div>
                {accounts.length === 0 ? (
                  <p className="ax-empty">Belum ada akun di buku kas ini.</p>
                ) : (
                  <div className="ax-accs" role="radiogroup" aria-label="Akun">
                    {accounts.map(acc => (
                      <button key={acc.id} type="button" role="radio" aria-checked={accountId === acc.id} className="ax-acc" onClick={() => setAccountId(acc.id)}>
                        <b>{acc.name}</b><small>{freeBalanceText(acc)}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* KATEGORI */}
              <div>
                <div className="ax-fl"><span>Kategori</span>
                  <button type="button" onClick={() => setIsCategoryModalOpen(true)}><Settings2 className="w-3 h-3 inline mr-1" />Kelola kategori</button>
                </div>
                <div className="ax-chipset" role="radiogroup" aria-label="Kategori">
                  {(activeTab === 'expense' ? categories.lists.expense : categories.lists.income).map(c => (
                    <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)}>{c}</button>
                  ))}
                </div>
              </div>

              {/* TANGGAL + CATATAN */}
              <div className="ax-two">
                <div>
                  <label className="brutal-label" htmlFor="tx-date">Tanggal</label>
                  <input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="brutal-input" required />
                  <div className="ax-quickdate">
                    <button type="button" onClick={() => setDate(new Date().toISOString().split('T')[0])}>Hari ini</button>
                    <button type="button" onClick={() => setDate(new Date(Date.now() - 864e5).toISOString().split('T')[0])}>Kemarin</button>
                  </div>
                </div>
                <div>
                  <label className="brutal-label" htmlFor="tx-note">Catatan (opsional)</label>
                  <input id="tx-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Misal: makan siang kantor" className="brutal-input" />
                </div>
              </div>

              <div className="ax-sticky">
                <button type="submit" disabled={accounts.length === 0} data-kind={activeTab} className="brutal-btn ax-submit">
                  {activeTab === 'income' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  Simpan {activeTab === 'income' ? 'pemasukan' : 'pengeluaran'}
                  {evaluateMathExpression(amount).result > 0 ? ` · ${formatRupiah(evaluateMathExpression(amount).result)}` : ''}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmitTransfer} className="ax-form">
              <div className="ax-xfer">
                <div>
                  <label className="brutal-label" htmlFor="tf-src">Dari akun</label>
                  <select id="tf-src" value={transferSource} onChange={(e) => setTransferSource(e.target.value)} className="brutal-select" required>
                    {accounts.length === 0 ? <option value="">Belum ada akun di buku ini</option> : accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} — {freeBalanceText(acc)}</option>
                    ))}
                  </select>
                </div>
                <button type="button" className="ax-swap" title="Tukar akun asal dan tujuan" aria-label="Tukar akun asal dan tujuan" onClick={() => { setTransferSource(transferDest); setTransferDest(transferSource); }}>
                  <ArrowRightLeft className="w-4 h-4" />
                </button>
                <div>
                  <label className="brutal-label" htmlFor="tf-dst">Ke akun</label>
                  <select id="tf-dst" value={transferDest} onChange={(e) => setTransferDest(e.target.value)} className="brutal-select" required>
                    {accounts.length === 0 ? <option value="">Belum ada akun di buku ini</option> : accounts.map(acc => (
                      <option key={acc.id} value={acc.id} disabled={acc.id === transferSource}>
                        {acc.name} {acc.id === transferSource ? '(Akun Asal)' : `— ${freeBalanceText(acc)}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ax-amt" data-kind="transfer">
                <label className="ax-fl" htmlFor="tf-amount"><span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Nominal transfer</span></label>
                <div className="ax-amt-row">
                  <span>Rp</span>
                  <input id="tf-amount" type="text" inputMode="text" autoComplete="off" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} onBlur={handleTransferAmountBlur} placeholder="0" required />
                </div>
                {transferCalcNotice && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{transferCalcNotice}</div>}
                <div className="ax-qs" aria-label="Tambah nominal cepat">
                  {[50000, 100000, 250000, 500000, 1000000].map(amt => (
                    <button key={amt} type="button" onClick={() => addQuickTransferAmount(amt)}>+{amt >= 1000 ? `${amt / 1000}k` : amt}</button>
                  ))}
                </div>
                <p className="ax-hint">Bisa hitung langsung, contoh: 250000+50000</p>
              </div>

              <div className="ax-two">
                <div>
                  <label className="brutal-label" htmlFor="tf-date">Tanggal</label>
                  <input id="tf-date" type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="brutal-input" required />
                </div>
                <div>
                  <label className="brutal-label" htmlFor="tf-note">Catatan (opsional)</label>
                  <input id="tf-note" type="text" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="Misal: tarik tunai ATM, top up e-wallet" className="brutal-input" />
                </div>
              </div>

              <div className="ax-sticky">
                <button type="submit" disabled={accounts.length < 2} data-kind="transfer" className="brutal-btn ax-submit">
                  <ArrowRightLeft className="w-4 h-4" />Eksekusi transfer
                  {evaluateMathExpression(transferAmount).result > 0 ? ` · ${formatRupiah(evaluateMathExpression(transferAmount).result)}` : ''}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* KOLOM SAMPING */}
        <div className="ax-side-col">
          <section className="ax-panel">
            <div className="ax-ph">
              <h3><span className="ax-ic" style={{ background: 'var(--accent-sage)' }}><Tag className="w-3.5 h-3.5" /></span>Akun di buku ini</h3>
              <button type="button" className="ax-link" onClick={() => onNavigate('module1')}>Kelola →</button>
            </div>
            <div className="ax-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {accounts.map(acc => (
                <div key={acc.id} className="ax-mini"><span>{acc.name}</span><span>{freeBalanceText(acc)}</span></div>
              ))}
            </div>
          </section>

          <section className="ax-panel">
            <div className="ax-ph">
              <h3><span className="ax-ic" style={{ background: 'var(--accent-blue)' }}><History className="w-3.5 h-3.5" /></span>Baru saja dicatat</h3>
              <button type="button" className="ax-link" onClick={() => onNavigate('history_transaction')}>Semua →</button>
            </div>
            {recentTransactions.length === 0 ? (
              <p className="ax-empty">Belum ada transaksi di buku ini.</p>
            ) : (
              <ul className="ax-list">
                {recentTransactions.slice(0, 3).map(t => (
                  <li key={t.id} className="ax-row static">
                    <span className="ax-row-t"><b>{t.category || t.type}</b><small>{t.date}</small></span>
                    <span className={`ax-row-v ${t.type === 'income' ? 'pos' : t.type === 'expense' ? 'neg' : 'blu'}`}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '⇄'} {formatRupiah(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODAL PENGATURAN TAB TRANSAKSI: ALOKASI BUDGET & KELOLA KATEGORI    */}
      {/* =================================================================== */}
      {isCategoryModalOpen && (() => {
        const close = () => setIsCategoryModalOpen(false);
        const totalPagu = categories.lists.expense.reduce((sum, c) => {
          const raw = budgetInputs[c] || '';
          return sum + (parseInt(raw.replace(/[^\d]/g, ''), 10) || 0);
        }, 0);
        return (
          <ModalFrame
            wide
            title="Pengaturan Tab Transaksi"
            subtitle={`Buku kas: ${currentLedger.name}`}
            icon={<Settings className="w-4 h-4" />}
            tint="var(--accent-sand)"
            onClose={close}
            footer={
              modalSubTab === 'budget' ? (
                <>
                  <button type="button" className="brutal-btn brutal-btn-ghost" onClick={close}>Tutup</button>
                  <button type="submit" form="budget-form" className="brutal-btn brutal-btn-sand"><Check className="w-4 h-4" />Simpan alokasi budget</button>
                </>
              ) : (
                <button type="button" className="brutal-btn brutal-btn-sand" onClick={close}><Check className="w-4 h-4" />Selesai</button>
              )
            }
          >
            <div className="ax-form">
              <div className="ax-chipset" role="radiogroup" aria-label="Pengaturan transaksi">
                <button type="button" role="radio" aria-checked={modalSubTab === 'budget'} onClick={() => setModalSubTab('budget')}>
                  <PieChart className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Alokasi budget (bulanan)
                </button>
                <button type="button" role="radio" aria-checked={modalSubTab === 'categories'} onClick={() => setModalSubTab('categories')}>
                  <Tag className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Kelola kategori
                </button>
              </div>

              {/* SUB-TAB 1: ALOKASI BUDGET BULANAN */}
              {modalSubTab === 'budget' && (
                <form id="budget-form" onSubmit={handleSaveAllBudgets} className="ax-form">
                  <div className="ax-warn">
                    <Sliders className="w-4 h-4" />
                    <span><b>Kontrol pagu pengeluaran bulanan. </b>Atur alokasi dana per kategori untuk 1 bulan. Status <b>On Budget</b> atau <b>Over Budget</b> tampil di Laporan secara otomatis.</span>
                  </div>

                  <div className="ax-rlist" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {categories.lists.expense.map(cat => {
                      const val = budgetInputs[cat] ?? '';
                      const numVal = parseInt(val.replace(/[^\d]/g, '') || '0', 10);
                      return (
                        <div key={cat} className="ax-bgt">
                          <div className="ax-bgt-h">
                            <b>{cat}</b>
                            <small>{formatRupiah(numVal)} / bln</small>
                          </div>
                          <div className="ax-plain-amt">
                            <span>Rp</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              className="brutal-input"
                              value={val}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g, '');
                                setBudgetInputs(prev => ({ ...prev, [cat]: raw }));
                              }}
                              placeholder="0 (fleksibel / tanpa limit)"
                              aria-label={`Pagu ${cat}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="ax-sum">
                    <div><small>Total pagu bulanan</small><b>{formatRupiah(totalPagu)}</b></div>
                    <div><small>Kategori</small><b>{categories.lists.expense.length}</b></div>
                  </div>
                </form>
              )}

              {/* SUB-TAB 2: KELOLA KATEGORI */}
              {modalSubTab === 'categories' && (
                <div className="ax-form">
                  <div className="ax-chipset" role="radiogroup" aria-label="Jenis kategori">
                    <button type="button" role="radio" aria-checked={categoryKindInModal === 'expense'} onClick={() => { setCategoryKindInModal('expense'); setEditingCategory(null); }}>
                      Pengeluaran ({categories.lists.expense.length})
                    </button>
                    <button type="button" role="radio" aria-checked={categoryKindInModal === 'income'} onClick={() => { setCategoryKindInModal('income'); setEditingCategory(null); }}>
                      Pemasukan ({categories.lists.income.length})
                    </button>
                  </div>

                  <form onSubmit={handleAddCategory}>
                    <label className="brutal-label" htmlFor="new-cat-name">Tambah kategori {categoryKindInModal === 'expense' ? 'pengeluaran' : 'pemasukan'} baru</label>
                    <div className="ax-addcat">
                      <input id="new-cat-name" type="text" className="brutal-input" value={newCatName}
                        onChange={(e) => { setNewCatName(e.target.value); setCatError(null); }} placeholder="Langganan SaaS, Servis Motor..." />
                      <button type="submit" className="ax-sl-add"><Plus className="w-4 h-4" />Tambah</button>
                    </div>
                    {catError && <p className="ax-fieldhint" role="alert" style={{ color: 'var(--accent-terracotta-light)', fontWeight: 800 }}>{catError}</p>}
                  </form>

                  {editingCategory && (
                    <div className="ax-sl-box" style={{ borderColor: 'var(--accent-blue)' }}>
                      <div className="ax-fl"><span><Pencil className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Ubah nama kategori</span></div>
                      <div className="ax-addcat">
                        <input type="text" className="brutal-input" value={editingCategory.newName}
                          onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })} autoFocus aria-label="Nama kategori baru" />
                        <button type="button" className="ax-sl-add" onClick={handleRenameCategory}>Simpan</button>
                        <button type="button" className="ax-hopen" onClick={() => setEditingCategory(null)}>Batal</button>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="ax-fl">
                      <span>Daftar kategori aktif</span>
                      <button type="button" className="ax-link"
                        onClick={() => {
                          if (confirm('Kembalikan daftar kategori ke pengaturan default?')) {
                            categories.reset();
                            showToast('Kategori dikembalikan ke default!', 'info');
                          }
                        }}>
                        <RotateCcw className="w-3 h-3 inline -mt-0.5 mr-1" />Reset default
                      </button>
                    </div>
                    <div className="ax-rlist" style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {categories.lists[categoryKindInModal].map(c => (
                        <div key={c} className="ax-catline">
                          <b>{c}</b>
                          {c !== LOCKED_CATEGORY ? (
                            <span style={{ display: 'inline-flex', gap: 2, flex: 'none' }}>
                              <button type="button" className="ax-ib" onClick={() => setEditingCategory({ kind: categoryKindInModal, oldName: c, newName: c })}
                                title="Ubah nama" aria-label={`Ubah nama ${c}`}><Pencil className="w-3.5 h-3.5" /></button>
                              <button type="button" className="ax-ib del" onClick={() => categories.remove(categoryKindInModal, c)}
                                title="Hapus kategori" aria-label={`Hapus kategori ${c}`}><Trash2 className="w-3.5 h-3.5" /></button>
                            </span>
                          ) : (
                            <small style={{ flex: 'none', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Terkunci</small>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ModalFrame>
        );
      })()}

      {/* MODAL SETUP CEPAT GEMINI API UNTUK SCAN STRUK */}
      {showApiKeyModal && (
        <ModalFrame
          title="Aktifkan Gemini AI Scanner"
          subtitle="Scan struk otomatis"
          icon={<ScanCamera className="w-4 h-4" />}
          tint="var(--accent-lavender)"
          onClose={() => setShowApiKeyModal(false)}
          footer={
            <>
              <button type="button" className="brutal-btn brutal-btn-ghost" onClick={() => setShowApiKeyModal(false)}>Batal</button>
              <button type="submit" form="gemini-key-form" disabled={!inputApiKey.trim()} className="brutal-btn brutal-btn-sand"><Check className="w-4 h-4" />Simpan & scan sekarang</button>
            </>
          }
        >
          <form id="gemini-key-form" onSubmit={handleSaveApiKeyAndScan} className="ax-form">
            <p className="ax-sec-sub" style={{ margin: 0 }}>
              Fitur scan struk otomatis ditenagai oleh <b>Google Gemini Flash AI Vision</b>. Masukkan API Key Google AI Studio Anda untuk membaca struk belanja.
            </p>
            <div>
              <label className="brutal-label" htmlFor="gemini-key">API Key</label>
              <input id="gemini-key" type="password" className="brutal-input" placeholder="AIzaSy..." value={inputApiKey}
                onChange={e => setInputApiKey(e.target.value)} autoFocus autoComplete="off" />
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="ax-link" style={{ display: 'inline-block', marginTop: 8 }}>
                🔗 Dapatkan API Key gratis di Google AI Studio →
              </a>
            </div>
          </form>
        </ModalFrame>
      )}
    </div>
  );
}
