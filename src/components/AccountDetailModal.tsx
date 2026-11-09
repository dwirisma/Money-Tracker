import React, { useState } from 'react';
import { 
  X, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowRightLeft, 
  Plus, 
  Trash2, 
  Pencil, 
  PiggyBank, 
  CreditCard, 
  Landmark, 
  Layers, 
  History,
  Check,
  Percent
} from 'lucide-react';
import type { Account, AccountPocket, Transaction } from '../types';
import { formatRupiah } from '../utils/calculator';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  transactions: Transaction[];
  accounts: Account[];
  onAddPocket: (accountId: string, pocket: Omit<AccountPocket, 'id' | 'createdAt'>) => Promise<void>;
  onUpdatePocket: (accountId: string, pocketId: string, updates: Partial<AccountPocket>) => Promise<void>;
  onDeletePocket: (accountId: string, pocketId: string) => Promise<void>;
  onSelectForTransaction: (accountId: string) => void;
  onSelectForTransfer: (accountId: string) => void;
  onEditAccount: (account: Account) => void;
  onDeleteTransaction: (tx: Transaction) => void;
  onEditTransaction: (tx: Transaction) => void;
}

export function AccountDetailModal({
  isOpen,
  onClose,
  account,
  transactions,
  accounts,
  onAddPocket,
  onUpdatePocket: _onUpdatePocket,
  onDeletePocket,
  onSelectForTransaction,
  onSelectForTransfer,
  onEditAccount,
  onDeleteTransaction,
  onEditTransaction
}: Props) {
  const [activeTab, setActiveTab] = useState<'mutations' | 'pockets'>('mutations');
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');

  // Form tambah kantong state
  const [isAddingPocket, setIsAddingPocket] = useState(false);
  const [pocketName, setPocketName] = useState('');
  const [pocketEmoji, setPocketEmoji] = useState('🎯');
  const [pocketBalance, setPocketBalance] = useState('');
  const [pocketTarget, setPocketTarget] = useState('');
  const [pocketType, setPocketType] = useState<'spending' | 'saving' | 'locked' | 'bills'>('saving');
  const [isSubmittingPocket, setIsSubmittingPocket] = useState(false);

  if (!isOpen || !account) return null;

  // Filter mutasi khusus akun ini
  const accountMutations = transactions.filter(t => {
    return t.accountId === account.id || t.toAccountId === account.id;
  });

  const filteredMutations = accountMutations.filter(t => {
    // Type filter
    if (txTypeFilter !== 'all') {
      if (txTypeFilter === 'transfer' && t.type !== 'transfer') return false;
      if (txTypeFilter === 'income' && (t.type !== 'income' || t.accountId !== account.id)) return false;
      if (txTypeFilter === 'expense' && (t.type !== 'expense' || t.accountId !== account.id)) return false;
    }
    // Search query
    if (txSearch) {
      const q = txSearch.toLowerCase();
      const matchCat = (t.category || '').toLowerCase().includes(q);
      const matchNote = (t.note || '').toLowerCase().includes(q);
      const matchAmt = String(t.amount).includes(q);
      return matchCat || matchNote || matchAmt;
    }
    return true;
  });

  // Hitung total alokasi di kantong
  const pockets = account.pockets || [];
  const totalInPockets = pockets.reduce((sum, p) => sum + (p.balance || 0), 0);
  const unallocatedBalance = Math.max(0, account.balance - totalInPockets);

  async function handleCreatePocket(e: React.FormEvent) {
    e.preventDefault();
    if (!pocketName.trim() || !account) return;

    setIsSubmittingPocket(true);
    try {
      const initBal = parseFloat(pocketBalance.replace(/\D/g, '')) || 0;
      const targetBal = parseFloat(pocketTarget.replace(/\D/g, '')) || undefined;

      await onAddPocket(account.id, {
        name: pocketName.trim(),
        balance: initBal,
        targetAmount: targetBal,
        emoji: pocketEmoji || '🎯',
        type: pocketType,
        colorAccent: account.colorAccent || '#7a9eb3'
      });

      setPocketName('');
      setPocketBalance('');
      setPocketTarget('');
      setIsAddingPocket(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingPocket(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="brutal-card bg-[var(--bg-surface)] border-2 border-black dark:border-slate-700 max-w-2xl w-full my-auto space-y-4 p-5 sm:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b-2 border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl border-2 border-black dark:border-white/20 flex items-center justify-center text-white shadow-[2px_2px_0px_#000]"
              style={{ backgroundColor: account.colorAccent || 'var(--accent-sage)' }}
            >
              {account.type === 'bank' && <Landmark className="w-6 h-6" />}
              {account.type === 'credit_card' && <CreditCard className="w-6 h-6" />}
              {account.type === 'ewallet' && <Wallet className="w-6 h-6" />}
              {account.type === 'cash' && <PiggyBank className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-black text-xl text-[var(--text-primary)]">
                  {account.name}
                </h2>
                <span className="brutal-badge text-[10px] uppercase font-mono">
                  {account.type}
                </span>
              </div>
              <p className="text-xs font-mono text-[var(--text-secondary)]">
                Detail Akun & Mutasi Transaksi
              </p>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose}
            className="p-1.5 rounded-lg border-2 border-black dark:border-white/20 bg-[var(--bg-elevated)] hover:bg-[var(--accent-terracotta)] hover:text-white transition-all shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saldo & Quick Actions Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-xl">
          <div className="sm:col-span-7 space-y-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
              {account.type === 'credit_card' ? 'Tagihan Berjalan Saat Ini' : 'Saldo Akun Utama'}
            </span>
            <div className="font-heading font-black text-2xl sm:text-3xl text-[var(--text-primary)]">
              {formatRupiah(account.balance)}
            </div>
            {account.type !== 'credit_card' && pockets.length > 0 && (
              <p className="text-xs font-mono text-[var(--accent-sand)]">
                Terbagi: {formatRupiah(totalInPockets)} di {pockets.length} Kantong • Sisa Bebas: {formatRupiah(unallocatedBalance)}
              </p>
            )}
            {account.creditLimit && (
              <p className="text-xs font-mono text-[var(--text-muted)]">
                Limit Kartu: {formatRupiah(account.creditLimit)}
              </p>
            )}
          </div>

          {/* Quick Shortcuts */}
          <div className="sm:col-span-5 flex flex-wrap sm:flex-col justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectForTransaction(account.id);
              }}
              className="brutal-btn brutal-btn-sand text-xs py-1.5 px-3 flex items-center justify-center gap-1.5 font-bold shadow-[2px_2px_0px_#000]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Catat di Akun Ini</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectForTransfer(account.id);
              }}
              className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-3 flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_#000]"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>⇄ Transfer dari Sini</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onEditAccount(account);
              }}
              className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-3 flex items-center justify-center gap-1.5"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit Akun</span>
            </button>
          </div>
        </div>

        {/* Tab Selector: Mutasi vs Kantong */}
        <div className="flex border-b-2 border-[var(--border-subtle)] gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('mutations')}
            className={`pb-2.5 px-3 font-heading font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'mutations'
                ? 'border-[var(--accent-sand)] text-[var(--accent-sand)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Riwayat Mutasi ({accountMutations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pockets')}
            className={`pb-2.5 px-3 font-heading font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'pockets'
                ? 'border-[var(--accent-sage)] text-[var(--accent-sage)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Kantong / Pockets ({pockets.length})</span>
            {pockets.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-[var(--accent-sage)] animate-pulse" />
            )}
          </button>
        </div>

        {/* TAB 1: MUTASI TRANSAKSI */}
        {activeTab === 'mutations' && (
          <div className="space-y-3">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Cari mutasi di akun ini..."
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
                className="brutal-input text-xs py-1.5 flex-1"
              />
              <div className="flex gap-1">
                {(['all', 'income', 'expense', 'transfer'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTxTypeFilter(k)}
                    className={`px-2 py-1 text-xs font-mono rounded border ${
                      txTypeFilter === k 
                        ? 'bg-[var(--accent-sand)] text-black font-bold border-black' 
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                    }`}
                  >
                    {k === 'all' ? 'Semua' : k === 'income' ? 'Masuk' : k === 'expense' ? 'Keluar' : 'Transfer'}
                  </button>
                ))}
              </div>
            </div>

            {/* List Mutasi */}
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {filteredMutations.length === 0 ? (
                <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)]">
                  Belum ada riwayat transaksi yang melibatkan akun ini.
                </div>
              ) : (
                filteredMutations.map(tx => {
                  const isIncome = tx.type === 'income' || (tx.type === 'transfer' && tx.toAccountId === account.id);
                  const isTransferOut = tx.type === 'transfer' && tx.accountId === account.id;

                  const otherAccName = tx.type === 'transfer'
                    ? accounts.find(a => a.id === (isIncome ? tx.accountId : tx.toAccountId))?.name || 'Akun Lain'
                    : null;

                  return (
                    <div 
                      key={tx.id}
                      className="p-3 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-xl flex items-center justify-between gap-3 hover:border-[var(--border-color)] transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-lg border-2 border-black flex items-center justify-center shrink-0 ${
                          isIncome 
                            ? 'bg-[var(--accent-sage-dark)] text-[var(--accent-sage-light)]' 
                            : 'bg-[var(--accent-terracotta-dark)] text-[var(--accent-terracotta-light)]'
                        }`}>
                          {tx.type === 'transfer' ? (
                            <ArrowRightLeft className="w-4 h-4" />
                          ) : isIncome ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="font-heading font-bold text-xs text-[var(--text-primary)] truncate">
                            {tx.type === 'transfer' 
                              ? isIncome ? `Transfer Masuk dari ${otherAccName}` : `Transfer Keluar ke ${otherAccName}`
                              : tx.category || 'Transaksi'}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)]">
                            <span>{tx.date}</span>
                            {tx.note && <span className="truncate max-w-[150px]">“{tx.note}”</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-mono font-bold text-xs ${
                          isIncome ? 'text-[var(--accent-sage-light)]' : 'text-[var(--accent-terracotta-light)]'
                        }`}>
                          {isIncome ? '+' : '-'}{formatRupiah(tx.amount)}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onEditTransaction(tx);
                          }}
                          className="p-1 hover:text-[var(--accent-sand)] text-[var(--text-muted)]"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onDeleteTransaction(tx);
                          }}
                          className="p-1 hover:text-[var(--accent-terracotta)] text-[var(--text-muted)]"
                          title="Hapus"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: KANTONG / POCKETS (BANK JAGO CONCEPT) */}
        {activeTab === 'pockets' && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-start justify-between bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-xs">
              <div className="space-y-0.5">
                <p className="font-bold text-amber-300">💡 Konsep Kantong (Bank Pockets):</p>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Bagi saldo rekening ini ke beberapa pos alokasi (misal: Belanja Harian, Nabung, Tagihan) tanpa harus membuka rekening baru dan kena biaya admin ganda.
                </p>
              </div>

              {!isAddingPocket && (
                <button
                  type="button"
                  onClick={() => setIsAddingPocket(true)}
                  className="brutal-btn brutal-btn-sand text-xs py-1.5 px-3 shrink-0 flex items-center gap-1 font-bold shadow-[2px_2px_0px_#000]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Buat Kantong</span>
                </button>
              )}
            </div>

            {/* Form Tambah Kantong */}
            {isAddingPocket && (
              <form onSubmit={handleCreatePocket} className="p-4 bg-[var(--bg-elevated)] border-2 border-black dark:border-white/20 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                  <h4 className="font-heading font-bold text-xs text-[var(--text-primary)]">
                    + Tambah Kantong di {account.name}
                  </h4>
                  <button 
                    type="button" 
                    onClick={() => setIsAddingPocket(false)}
                    className="text-xs text-[var(--text-muted)] hover:text-white"
                  >
                    Batal
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">Nama Kantong</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kantong Jajan, Nabung Gadget"
                      value={pocketName}
                      onChange={e => setPocketName(e.target.value)}
                      className="brutal-input text-xs py-1.5 w-full mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">Emoji / Ikon</label>
                    <div className="flex gap-1.5 mt-1">
                      {['🎯', '🍔', '✈️', '🎮', '🚗', '💊', '📚', '🏠'].map(em => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setPocketEmoji(em)}
                          className={`w-7 h-7 text-sm rounded border flex items-center justify-center ${
                            pocketEmoji === em ? 'border-amber-400 bg-amber-400/20' : 'border-slate-700 bg-slate-800'
                          }`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">Saldo Alokasi Awal (Rp)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={pocketBalance}
                      onChange={e => setPocketBalance(e.target.value)}
                      className="brutal-input text-xs py-1.5 w-full mt-1 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">Target Nominal (Opsional)</label>
                    <input
                      type="number"
                      placeholder="e.g. 5000000"
                      value={pocketTarget}
                      onChange={e => setPocketTarget(e.target.value)}
                      className="brutal-input text-xs py-1.5 w-full mt-1 font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setIsAddingPocket(false)}
                    className="brutal-btn brutal-btn-ghost text-xs py-1 px-3"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPocket || !pocketName.trim()}
                    className="brutal-btn brutal-btn-sage text-xs py-1 px-3 flex items-center gap-1 font-bold shadow-[2px_2px_0px_#000]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan Kantong</span>
                  </button>
                </div>
              </form>
            )}

            {/* List Kantong */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
              {pockets.length === 0 ? (
                <div className="col-span-2 p-8 text-center text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)]">
                  Belum ada kantong dibuat di akun ini. Buat kantong untuk mengalokasikan saldo secara rapi!
                </div>
              ) : (
                pockets.map(pocket => {
                  const hasTarget = pocket.targetAmount && pocket.targetAmount > 0;
                  const pct = hasTarget 
                    ? Math.min(100, Math.round(((pocket.balance || 0) / pocket.targetAmount!) * 100))
                    : 0;

                  return (
                    <div
                      key={pocket.id}
                      className="p-3.5 bg-[var(--bg-elevated)] border-2 border-black dark:border-white/20 rounded-xl space-y-2 shadow-[2px_2px_0px_#000]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{pocket.emoji || '🎯'}</span>
                          <div>
                            <p className="font-heading font-bold text-xs text-[var(--text-primary)]">
                              {pocket.name}
                            </p>
                            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">
                              {pocket.type || 'saving'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onDeletePocket(account.id, pocket.id)}
                          className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-terracotta)]"
                          title="Hapus Kantong"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="pt-1">
                        <div className="text-sm font-mono font-bold text-white">
                          {formatRupiah(pocket.balance || 0)}
                        </div>

                        {hasTarget && (
                          <div className="space-y-1 mt-1.5">
                            <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)]">
                              <span>Target: {formatRupiah(pocket.targetAmount!)}</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                              <div
                                className="h-full bg-[var(--accent-sage)] rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
