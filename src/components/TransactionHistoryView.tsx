import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  ArrowRightLeft, 
  Pencil, 
  Trash2, 
  Calendar, 
  Plus, 
  Download, 
  Tag, 
  Wallet,
  ArrowUpDown
} from 'lucide-react';
import type { Account, Ledger, Transaction } from '../types';
import { formatRupiah } from '../utils/calculator';
import type { ModuleId } from './layout/navConfig';

interface Props {
  currentLedger: Ledger;
  transactions: Transaction[];
  accounts: Account[];
  onNavigate: (id: ModuleId) => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (tx: Transaction) => void;
}

export function TransactionHistoryView({
  currentLedger,
  transactions,
  accounts,
  onNavigate,
  onEditTransaction,
  onDeleteTransaction
}: Props) {
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Categories list extracted from transactions
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set).sort();
  }, [transactions]);

  // Account map
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach(a => map.set(a.id, a.name));
    return map;
  }, [accounts]);

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      // Type filter
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;

      // Category filter
      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;

      // Account filter
      if (selectedAccount !== 'all') {
        const matchesAccount = t.accountId === selectedAccount || t.toAccountId === selectedAccount;
        if (!matchesAccount) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const catMatch = (t.category || '').toLowerCase().includes(q);
        const noteMatch = (t.note || '').toLowerCase().includes(q);
        const amtMatch = String(t.amount).includes(q);
        const accSourceMatch = (accountMap.get(t.accountId) || '').toLowerCase().includes(q);
        const accDestMatch = t.toAccountId ? (accountMap.get(t.toAccountId) || '').toLowerCase().includes(q) : false;
        if (!catMatch && !noteMatch && !amtMatch && !accSourceMatch && !accDestMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      const cmp = (b.date || '').localeCompare(a.date || '') || Number(b.createdAt) - Number(a.createdAt);
      return sortOrder === 'desc' ? cmp : -cmp;
    });
  }, [transactions, typeFilter, selectedCategory, selectedAccount, searchQuery, sortOrder, accountMap]);

  // Metrics for filtered results
  const metrics = useMemo(() => {
    let inc = 0, exp = 0;
    filtered.forEach(t => {
      if (t.type === 'income') inc += t.amount;
      else if (t.type === 'expense') exp += t.amount;
    });
    return {
      income: inc,
      expense: exp,
      net: inc - exp,
      count: filtered.length
    };
  }, [filtered]);

  return (
    <div className="space-y-3 w-full">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b-2 border-[var(--border-subtle)] pb-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-[var(--text-primary)]">
            Riwayat Transaksi
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Daftar lengkap seluruh arus kas dan mutasi di buku <b>{currentLedger.name}</b>.
          </p>
        </div>
      </div>

      {/* METRICS SUMMARY KARTU */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="brutal-card p-3 bg-[var(--bg-surface)] border-l-4 border-l-[var(--accent-sage)] space-y-1">
          <span className="text-[10px] font-mono uppercase text-[var(--text-secondary)] font-bold">Total Masuk</span>
          <p className="font-mono font-bold text-sm sm:text-lg text-[var(--accent-sage-light)] truncate">
            {formatRupiah(metrics.income)}
          </p>
        </div>

        <div className="brutal-card p-3 bg-[var(--bg-surface)] border-l-4 border-l-[var(--accent-terracotta)] space-y-1">
          <span className="text-[10px] font-mono uppercase text-[var(--text-secondary)] font-bold">Total Keluar</span>
          <p className="font-mono font-bold text-sm sm:text-lg text-[var(--accent-terracotta-light)] truncate">
            {formatRupiah(metrics.expense)}
          </p>
        </div>

        <div className="brutal-card p-3 bg-[var(--bg-surface)] border-l-4 border-l-[var(--accent-blue)] space-y-1">
          <span className="text-[10px] font-mono uppercase text-[var(--text-secondary)] font-bold">Arus Kas Bersih</span>
          <p className={`font-mono font-bold text-sm sm:text-lg truncate ${
            metrics.net >= 0 ? 'text-[var(--accent-sage-light)]' : 'text-[var(--accent-terracotta-light)]'
          }`}>
            {metrics.net >= 0 ? '+' : ''}{formatRupiah(metrics.net)}
          </p>
        </div>

        <div className="brutal-card p-3 bg-[var(--bg-surface)] border-l-4 border-l-[var(--accent-sand)] space-y-1">
          <span className="text-[10px] font-mono uppercase text-[var(--text-secondary)] font-bold">Jumlah Transaksi</span>
          <p className="font-mono font-bold text-sm sm:text-lg text-[var(--text-primary)]">
            {metrics.count} <span className="text-xs font-normal text-[var(--text-muted)]">data</span>
          </p>
        </div>
      </div>

      {/* FILTER & PENCARIAN CONTROLS */}
      <div className="brutal-card p-3 bg-[var(--bg-surface)] space-y-3">
        {/* Row 1: Search + Quick Type Pills */}
        <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari transaksi berdasarkan catatan, nominal, akun..."
              className="brutal-input text-xs !pl-11 w-full"
            />
          </div>

          {/* Type Segmented Buttons */}
          <div className="flex p-1 bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-[var(--radius-sm)] gap-1 shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 text-xs font-heading font-bold rounded-[var(--radius-xs)] transition-all ${
                typeFilter === 'all'
                  ? 'bg-[var(--accent-sand)] text-[#111] shadow-[1px_1px_0px_#000]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('expense')}
              className={`px-3 py-1 text-xs font-heading font-bold rounded-[var(--radius-xs)] transition-all ${
                typeFilter === 'expense'
                  ? 'bg-[var(--accent-terracotta)] text-white shadow-[1px_1px_0px_#000]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('income')}
              className={`px-3 py-1 text-xs font-heading font-bold rounded-[var(--radius-xs)] transition-all ${
                typeFilter === 'income'
                  ? 'bg-[var(--accent-sage)] text-[#111] shadow-[1px_1px_0px_#000]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Pemasukan
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('transfer')}
              className={`px-3 py-1 text-xs font-heading font-bold rounded-[var(--radius-xs)] transition-all ${
                typeFilter === 'transfer'
                  ? 'bg-[var(--accent-blue)] text-white shadow-[1px_1px_0px_#000]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Transfer
            </button>
          </div>
        </div>

        {/* Row 2: Dropdowns Kategori, Akun, & Urutan */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[var(--border-subtle)] text-xs">
          <div>
            <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1">Kategori</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="brutal-select text-xs py-1.5"
            >
              <option value="all">Semua Kategori ({availableCategories.length})</option>
              {availableCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1">Akun Terkait</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="brutal-select text-xs py-1.5"
            >
              <option value="all">Semua Akun ({accounts.length})</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1">Urutan Tanggal</label>
            <button
              type="button"
              onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
              className="brutal-btn text-xs py-1.5 w-full flex items-center justify-center gap-1.5 font-mono"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'desc' ? 'Terbaru ke Terlama' : 'Terlama ke Terbaru'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* DAFTAR TRANSAKSI TABLE / CARDS */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="brutal-card p-10 text-center space-y-3 bg-[var(--bg-surface)]">
            <p className="font-heading font-bold text-sm text-[var(--text-secondary)]">
              Tidak ada transaksi yang cocok dengan filter
            </p>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              Coba reset filter atau catat transaksi baru.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('all');
                setSelectedCategory('all');
                setSelectedAccount('all');
              }}
              className="brutal-btn brutal-btn-sand text-xs py-2 px-3 inline-flex items-center gap-1 font-bold"
            >
              Reset Semua Filter
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(tx => {
              const sourceName = accountMap.get(tx.accountId) || 'Akun Dihapus';
              const destName = tx.toAccountId ? (accountMap.get(tx.toAccountId) || 'Akun Dihapus') : null;

              return (
                <div
                  key={tx.id}
                  className="brutal-card p-3 sm:p-3 bg-[var(--bg-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 group hover:border-[var(--accent-sand)] transition-all"
                  style={{
                    borderLeftWidth: '5px',
                    borderLeftColor: tx.type === 'income' ? 'var(--accent-sage)' : tx.type === 'expense' ? 'var(--accent-terracotta)' : 'var(--accent-blue)'
                  }}
                >
                  {/* Left: Info Transaksi */}
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div 
                      className={`w-9 h-9 rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] shadow-[1px_1px_0px_#000] flex items-center justify-center shrink-0 ${
                        tx.type === 'income' ? 'bg-[var(--accent-sage)] text-[#111]' : tx.type === 'expense' ? 'bg-[var(--accent-terracotta)] text-white' : 'bg-[var(--accent-blue)] text-white'
                      }`}
                    >
                      {tx.type === 'income' ? <TrendingUp className="w-4 h-4" /> : tx.type === 'expense' ? <TrendingDown className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="font-heading font-bold text-sm text-[var(--text-primary)] truncate">
                          {tx.category || (tx.type === 'transfer' ? 'Transfer Saldo' : 'Lainnya')}
                        </span>
                        {tx.type === 'transfer' && (
                          <span className="brutal-badge text-[9px] bg-[var(--accent-blue-light)] text-[#111]">
                            Transfer
                          </span>
                        )}
                        {tx.goalId && (
                          <span className="brutal-badge text-[9px] bg-[var(--accent-sand-light)] text-[#111]">
                            Alokasi Goal
                          </span>
                        )}
                        {tx.billId && (
                          <span className="brutal-badge text-[9px] bg-[var(--accent-terracotta-light)] text-white">
                            Tagihan
                          </span>
                        )}
                        {tx.debtId && (
                          <span className="brutal-badge text-[9px] bg-[var(--accent-lavender-light)] text-[#111]">
                            Cicilan Utang
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {tx.date}
                        </span>
                        <span>•</span>
                        <span className="font-mono text-[11px] text-[var(--accent-sand-light)]">
                          {tx.type === 'transfer' ? `${sourceName} → ${destName}` : sourceName}
                        </span>
                      </div>

                      {tx.note && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 italic truncate">
                          "{tx.note}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Nominal & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
                    <span className={`font-mono font-bold text-sm sm:text-lg ${
                      tx.type === 'income' ? 'text-[var(--accent-sage-light)]' : tx.type === 'expense' ? 'text-[var(--accent-terracotta-light)]' : 'text-[var(--accent-blue-light)]'
                    }`}>
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '⇄'} {formatRupiah(tx.amount)}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEditTransaction(tx)}
                        className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded shadow-[1px_1px_0px_#000] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all active:translate-x-0.5 active:translate-y-0.5"
                        title="Edit Transaksi"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteTransaction(tx)}
                        className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded shadow-[1px_1px_0px_#000] text-[var(--text-secondary)] hover:text-[var(--accent-terracotta-light)] transition-all active:translate-x-0.5 active:translate-y-0.5"
                        title="Hapus Transaksi"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
