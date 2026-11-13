import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Pencil,
  Trash2,
  Plus,
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
  const [showFilters, setShowFilters] = useState(false);

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

  const activeFilters =
    (typeFilter !== 'all' ? 1 : 0) + (selectedCategory !== 'all' ? 1 : 0) + (selectedAccount !== 'all' ? 1 : 0) + (searchQuery.trim() ? 1 : 0);

  function resetFilters() {
    setSearchQuery('');
    setTypeFilter('all');
    setSelectedCategory('all');
    setSelectedAccount('all');
  }

  // Kelompokkan per tanggal (urutan mengikuti sortOrder) + total harian
  const groups = useMemo(() => {
    const out: { date: string; items: Transaction[]; net: number }[] = [];
    filtered.forEach(t => {
      const d = t.date || '-';
      let g = out[out.length - 1];
      if (!g || g.date !== d) {
        g = { date: d, items: [], net: 0 };
        out.push(g);
      }
      g.items.push(t);
      if (t.type === 'income') g.net += t.amount;
      else if (t.type === 'expense') g.net -= t.amount;
    });
    return out;
  }, [filtered]);

  function dayLabel(d: string): string {
    const dt = new Date(`${d}T00:00:00`);
    if (isNaN(dt.getTime())) return d;
    const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const yest = new Date(now.getTime() - 864e5);
    const base = dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    if (d === iso(now)) return `Hari ini · ${base}`;
    if (d === iso(yest)) return `Kemarin · ${base}`;
    return base;
  }

  return (
    <div className="ax-add">
      <div className="ax-pagehead">
        <div>
          <h2>Riwayat Transaksi</h2>
          <p>Seluruh arus kas dan mutasi di buku <b>{currentLedger.name}</b></p>
        </div>
        <button type="button" onClick={() => onNavigate('add_transaction')} className="brutal-btn ax-btn-ink">
          <Plus className="w-4 h-4" />Catat
        </button>
      </div>

      {/* RINGKASAN (mengikuti filter aktif) */}
      <div className="ax-stats4">
        <div className="ax-sc s"><span><TrendingUp className="w-3 h-3" />Total masuk</span><b>{formatRupiah(metrics.income)}</b></div>
        <div className="ax-sc t"><span><TrendingDown className="w-3 h-3" />Total keluar</span><b>{formatRupiah(metrics.expense)}</b></div>
        <div className="ax-sc b"><span><Wallet className="w-3 h-3" />Arus kas bersih</span>
          <b style={{ color: metrics.net >= 0 ? 'var(--accent-sage-light)' : 'var(--accent-terracotta-light)' }}>{metrics.net >= 0 ? '+' : ''}{formatRupiah(metrics.net)}</b>
        </div>
        <div className="ax-sc y"><span><Tag className="w-3 h-3" />Jumlah transaksi</span><b>{metrics.count} <small>data</small></b></div>
      </div>

      {/* FILTER */}
      <div className="ax-panel ax-filters">
        <div className="ax-search">
          <Search className="w-4 h-4" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari catatan, nominal, atau akun..." className="brutal-input" aria-label="Cari transaksi" />
        </div>
        <div className="ax-fbar">
          <div className="ax-seg four" role="tablist" aria-label="Jenis transaksi">
            {([['all', 'Semua'], ['expense', 'Keluar'], ['income', 'Masuk'], ['transfer', 'Transfer']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={typeFilter === k} data-on={typeFilter === k} data-k={k === 'all' ? 'sand' : k}
                style={typeFilter === k && k === 'all' ? { background: 'var(--accent-sand)' } : undefined}
                onClick={() => setTypeFilter(k)}>{label}</button>
            ))}
          </div>
          <button type="button" className="ax-filterbtn" data-on={showFilters || activeFilters > 0} onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
            <Filter className="w-4 h-4" />Filter{activeFilters > 0 ? ` (${activeFilters})` : ''}
          </button>
        </div>
        <div className="ax-adv" data-open={showFilters}>
          <div>
            <label className="brutal-label" htmlFor="h-cat">Kategori</label>
            <select id="h-cat" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="brutal-select">
              <option value="all">Semua kategori ({availableCategories.length})</option>
              {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="brutal-label" htmlFor="h-acc">Akun terkait</label>
            <select id="h-acc" value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="brutal-select">
              <option value="all">Semua akun ({accounts.length})</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <span className="brutal-label">Urutan tanggal</span>
            <button type="button" onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')} className="brutal-btn w-full" style={{ minHeight: 42 }}>
              <ArrowUpDown className="w-3.5 h-3.5" />{sortOrder === 'desc' ? 'Terbaru ke terlama' : 'Terlama ke terbaru'}
            </button>
          </div>
        </div>
        {activeFilters > 0 && (
          <button type="button" className="ax-link" style={{ alignSelf: 'flex-start' }} onClick={resetFilters}>Reset semua filter</button>
        )}
      </div>

      {/* DAFTAR PER TANGGAL */}
      {filtered.length === 0 ? (
        <div className="ax-panel ax-emptyc">
          <p>Tidak ada transaksi yang cocok</p>
          <small>Coba reset filter atau catat transaksi baru.</small>
          <button type="button" onClick={resetFilters} className="brutal-btn brutal-btn-sand">Reset semua filter</button>
        </div>
      ) : (
        <div>
          {groups.map(g => (
            <section key={g.date} aria-label={dayLabel(g.date)}>
              <div className="ax-day">
                {dayLabel(g.date)}
                {g.net !== 0 && <span className={g.net > 0 ? 'pos' : 'neg'}>{g.net > 0 ? '+' : '-'}{formatRupiah(Math.abs(g.net))}</span>}
              </div>
              <div className="ax-txl">
                {g.items.map(tx => {
                  const sourceName = accountMap.get(tx.accountId) || 'Akun Dihapus';
                  const destName = tx.toAccountId ? (accountMap.get(tx.toAccountId) || 'Akun Dihapus') : null;
                  const bg = tx.type === 'income' ? 'var(--accent-sage)' : tx.type === 'expense' ? 'var(--accent-terracotta)' : 'var(--accent-blue)';
                  return (
                    <article key={tx.id} className="ax-tx">
                      <span className="ax-txi" style={{ background: bg }}>
                        {tx.type === 'income' ? <TrendingUp className="w-4 h-4" /> : tx.type === 'expense' ? <TrendingDown className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />}
                      </span>
                      <div className="ax-txm">
                        <b>
                          {tx.category || (tx.type === 'transfer' ? 'Transfer Saldo' : 'Lainnya')}
                          {tx.type === 'transfer' && <span className="ax-tag b">Transfer</span>}
                          {tx.goalId && <span className="ax-tag y">Alokasi Goal</span>}
                          {tx.billId && <span className="ax-tag t">Tagihan</span>}
                          {tx.debtId && <span className="ax-tag l">Cicilan Utang</span>}
                        </b>
                        <small>{tx.type === 'transfer' ? `${sourceName} → ${destName}` : sourceName}</small>
                        {tx.note && <em>"{tx.note}"</em>}
                      </div>
                      <div className="ax-txr">
                        <span className={tx.type === 'income' ? 'pos' : tx.type === 'expense' ? 'neg' : 'blu'}>
                          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '⇄'} {formatRupiah(tx.amount)}
                        </span>
                        <div className="ax-acts">
                          <button type="button" className="ax-iconbtn" onClick={() => onEditTransaction(tx)} title="Edit transaksi" aria-label="Edit transaksi"><Pencil className="w-3.5 h-3.5" /></button>
                          <button type="button" className="ax-iconbtn del" onClick={() => onDeleteTransaction(tx)} title="Hapus transaksi" aria-label="Hapus transaksi"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
