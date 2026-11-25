import React, { useState } from 'react';
import {
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
  Check
} from 'lucide-react';
import type { Account, AccountPocket, Transaction } from '../types';
import { formatRupiah } from '../utils/financeUtils';
import { ModalFrame, NominalPreview } from './ui/BaseUI';

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
  onUpdatePocket,
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

  // Form Tambah / Edit Kantong
  const [isAddingPocket, setIsAddingPocket] = useState(false);
  const [editingPocketId, setEditingPocketId] = useState<string | null>(null);
  const [pocketName, setPocketName] = useState('');
  const [pocketEmoji, setPocketEmoji] = useState('🍔');
  const [pocketBalance, setPocketBalance] = useState('');

  // Transfer Antar Kantong
  const [isTransferringPocket, setIsTransferringPocket] = useState(false);
  const [pocketTransferSource, setPocketTransferSource] = useState<'free' | string>('free');
  const [pocketTransferDest, setPocketTransferDest] = useState<string>('');
  const [pocketTransferAmount, setPocketTransferAmount] = useState('');

  if (!isOpen || !account) return null;

  // Filter mutasi khusus akun ini
  const accountMutations = transactions.filter(t => {
    return t.accountId === account.id || t.toAccountId === account.id;
  });

  const filteredMutations = accountMutations.filter(t => {
    if (txTypeFilter !== 'all') {
      if (txTypeFilter === 'transfer' && t.type !== 'transfer') return false;
      if (txTypeFilter === 'income' && (t.type !== 'income' || t.accountId !== account.id)) return false;
      if (txTypeFilter === 'expense' && (t.type !== 'expense' || t.accountId !== account.id)) return false;
    }
    if (txSearch) {
      const q = txSearch.toLowerCase();
      const matchCat = (t.category || '').toLowerCase().includes(q);
      const matchNote = (t.note || '').toLowerCase().includes(q);
      const matchAmt = String(t.amount).includes(q);
      return matchCat || matchNote || matchAmt;
    }
    return true;
  });

  const pockets = account.pockets || [];
  const totalInPockets = pockets.reduce((sum, p) => sum + (p.balance || 0), 0);
  const unallocatedBalance = Math.max(0, account.balance - totalInPockets);

  function openCreatePocket() {
    setEditingPocketId(null);
    setPocketName('');
    setPocketEmoji('🍔');
    setPocketBalance('');
    setIsAddingPocket(true);
  }

  function openEditPocket(p: AccountPocket) {
    setEditingPocketId(p.id);
    setPocketName(p.name);
    setPocketEmoji(p.emoji || '🎯');
    setPocketBalance(String(p.balance || '0'));
    setIsAddingPocket(true);
  }

  async function handleSavePocket(e: React.FormEvent) {
    e.preventDefault();
    if (!pocketName.trim() || !account) return;

    const numBalance = parseFloat(pocketBalance.replace(/\D/g, '')) || 0;

    if (editingPocketId) {
      await onUpdatePocket(account.id, editingPocketId, {
        name: pocketName.trim(),
        emoji: pocketEmoji,
        balance: numBalance
      });
    } else {
      await onAddPocket(account.id, {
        name: pocketName.trim(),
        balance: numBalance,
        emoji: pocketEmoji,
        colorAccent: account.colorAccent || '#6c97ff'
      });
    }

    setIsAddingPocket(false);
    setEditingPocketId(null);
  }

  async function handleExecutePocketTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    const amount = parseFloat(pocketTransferAmount.replace(/\D/g, '')) || 0;
    if (amount <= 0 || !pocketTransferDest) return;

    if (pocketTransferSource === pocketTransferDest) {
      return;
    }

    // Kasus 1: Dari Saldo Bebas ke Kantong
    if (pocketTransferSource === 'free') {
      const destP = pockets.find(p => p.id === pocketTransferDest);
      if (destP) {
        await onUpdatePocket(account.id, destP.id, {
          balance: (destP.balance || 0) + amount
        });
      }
    } 
    // Kasus 2: Dari Kantong ke Saldo Bebas
    else if (pocketTransferDest === 'free') {
      const srcP = pockets.find(p => p.id === pocketTransferSource);
      if (srcP) {
        await onUpdatePocket(account.id, srcP.id, {
          balance: Math.max(0, (srcP.balance || 0) - amount)
        });
      }
    } 
    // Kasus 3: Antar Kantong (Kantong A -> Kantong B)
    else {
      const srcP = pockets.find(p => p.id === pocketTransferSource);
      const destP = pockets.find(p => p.id === pocketTransferDest);
      if (srcP && destP) {
        await onUpdatePocket(account.id, srcP.id, {
          balance: Math.max(0, (srcP.balance || 0) - amount)
        });
        await onUpdatePocket(account.id, destP.id, {
          balance: (destP.balance || 0) + amount
        });
      }
    }

    setIsTransferringPocket(false);
    setPocketTransferAmount('');
  }

  const TYPE_LABEL: Record<string, string> = { cash: 'Dompet Tunai', bank: 'Bank', ewallet: 'E-Wallet', credit_card: 'Kartu Kredit' };
  const isCredit = account.type === 'credit_card';
  const TypeIcon = account.type === 'bank' ? Landmark : account.type === 'credit_card' ? CreditCard : account.type === 'ewallet' ? Wallet : PiggyBank;
  const poolPct = account.balance > 0 ? Math.min(100, Math.round((totalInPockets / account.balance) * 100)) : 0;
  const closeThen = (fn: () => void) => () => { onClose(); fn(); };

  return (
    <ModalFrame
      wide
      title={account.name}
      subtitle={`${TYPE_LABEL[account.type] || account.type} · Detail akun, mutasi & pos kantong`}
      icon={<TypeIcon className="w-4 h-4" />}
      tint={account.colorAccent || 'var(--accent-sage)'}
      onClose={onClose}
      footer={<button type="button" className="brutal-btn brutal-btn-ghost" onClick={onClose}>Tutup</button>}
    >
      {/* RINGKASAN SALDO */}
      <div className="ax-dhero">
        <div className="ax-dhero-top">
          <div>
            <small>{isCredit ? 'Tagihan berjalan saat ini' : 'Total saldo rekening'}</small>
            <div className={`ax-dhero-v ${isCredit ? 'neg' : ''}`}>{formatRupiah(account.balance)}</div>
          </div>
          {(account.creditLimit || (!isCredit && pockets.length > 0)) && (
            <div style={{ textAlign: 'right' }}>
              <small>{account.creditLimit ? 'Limit kartu' : 'Saldo bebas'}</small>
              <div className="ax-dhero-s">{formatRupiah(account.creditLimit ? account.creditLimit : unallocatedBalance)}</div>
            </div>
          )}
        </div>
        {!isCredit && pockets.length > 0 && (
          <div>
            <div className="ax-ob-row"><span>Terbagi ke {pockets.length} kantong</span><b>{formatRupiah(totalInPockets)}</b></div>
            <div className="ax-share"><i style={{ width: `${poolPct}%`, background: 'var(--accent-sage)' }} /></div>
          </div>
        )}
      </div>

      {/* AKSI CEPAT */}
      <div className="ax-qa">
        <button type="button" className="brutal-btn brutal-btn-sand" onClick={closeThen(() => onSelectForTransaction(account.id))}><Plus className="w-4 h-4" />Catat</button>
        <button type="button" className="brutal-btn brutal-btn-blue" onClick={closeThen(() => onSelectForTransfer(account.id))}><ArrowRightLeft className="w-4 h-4" />Transfer</button>
        <button type="button" className="brutal-btn brutal-btn-ghost" onClick={closeThen(() => onEditAccount(account))}><Pencil className="w-4 h-4" />Edit</button>
      </div>

      {/* TAB */}
      <div className="ax-seg" role="tablist" aria-label="Isi detail akun" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button type="button" role="tab" aria-selected={activeTab === 'mutations'} data-on={activeTab === 'mutations'} data-k="sand" onClick={() => setActiveTab('mutations')}>
          <History className="w-4 h-4" />Mutasi ({accountMutations.length})
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'pockets'} data-on={activeTab === 'pockets'} data-k="sage" onClick={() => setActiveTab('pockets')}>
          <Layers className="w-4 h-4" />Kantong ({pockets.length})
        </button>
      </div>

      {/* TAB 1: MUTASI */}
      {activeTab === 'mutations' && (
        <>
          <input type="text" className="brutal-input" placeholder="Cari mutasi di akun ini..." value={txSearch} onChange={e => setTxSearch(e.target.value)} aria-label="Cari mutasi" />
          <div className="ax-chipset scroll" role="radiogroup" aria-label="Filter jenis mutasi">
            {(['all', 'income', 'expense', 'transfer'] as const).map(k => (
              <button key={k} type="button" role="radio" aria-checked={txTypeFilter === k} onClick={() => setTxTypeFilter(k)}>
                {k === 'all' ? 'Semua' : k === 'income' ? 'Masuk' : k === 'expense' ? 'Keluar' : 'Transfer'}
              </button>
            ))}
          </div>
          {filteredMutations.length === 0 ? (
            <div className="ax-emptyh"><p>Belum ada mutasi</p><small>Belum ada riwayat transaksi yang melibatkan akun ini.</small></div>
          ) : (
            <div className="ax-txl">
              {filteredMutations.map(tx => {
                const isIncome = tx.type === 'income' || (tx.type === 'transfer' && tx.toAccountId === account.id);
                const otherAccName = tx.type === 'transfer'
                  ? accounts.find(a => a.id === (isIncome ? tx.accountId : tx.toAccountId))?.name || 'Akun Lain'
                  : null;
                const txColor = tx.type === 'transfer' ? 'var(--accent-blue)' : isIncome ? 'var(--accent-sage)' : 'var(--accent-terracotta)';
                return (
                  <article key={tx.id} className="ax-tx flat">
                    <span className="ax-txi" style={{ '--c': txColor, background: txColor } as React.CSSProperties}>
                      {tx.type === 'transfer' ? <ArrowRightLeft className="w-4 h-4" /> : isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </span>
                    <div className="ax-txm">
                      <b>{tx.type === 'transfer' ? (isIncome ? `Transfer masuk dari ${otherAccName}` : `Transfer keluar ke ${otherAccName}`) : tx.category || 'Transaksi'}</b>
                      <small>{tx.date}{tx.note ? ` · “${tx.note}”` : ''}</small>
                    </div>
                    <div className="ax-txr">
                      <span className={isIncome ? 'pos' : 'neg'}>{isIncome ? '+' : '-'}{formatRupiah(tx.amount)}</span>
                      <div className="ax-acts">
                        <button type="button" className="ax-iconbtn" title="Edit" aria-label="Edit transaksi" onClick={closeThen(() => onEditTransaction(tx))}><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" className="ax-iconbtn del" title="Hapus" aria-label="Hapus transaksi" onClick={closeThen(() => onDeleteTransaction(tx))}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 2: KANTONG */}
      {activeTab === 'pockets' && (
        <>
          <div className="ax-dhead">
            <p className="ax-sec-sub" style={{ margin: 0, flex: 1 }}>Bagi saldo rekening ini ke pos belanja/operasional agar tidak tercampur.</p>
          </div>
          <div className="ax-btnrow">
            {pockets.length > 0 && !isTransferringPocket && (
              <button type="button" className="brutal-btn brutal-btn-blue" onClick={() => { setPocketTransferDest(pockets[0].id); setIsTransferringPocket(true); setIsAddingPocket(false); }}>
                <ArrowRightLeft className="w-4 h-4" />Pindah saldo
              </button>
            )}
            {!isAddingPocket && (
              <button type="button" className="brutal-btn brutal-btn-sage" onClick={openCreatePocket}><Plus className="w-4 h-4" />Buat kantong</button>
            )}
          </div>

          {/* FORM PINDAH SALDO */}
          {isTransferringPocket && (
            <form onSubmit={handleExecutePocketTransfer} className="ax-subform">
              <h4>Pindah saldo antar pos / kantong</h4>
              <div>
                <label className="brutal-label" htmlFor="pk-src">Dari sumber</label>
                <select id="pk-src" className="brutal-select" value={pocketTransferSource} onChange={e => setPocketTransferSource(e.target.value)}>
                  <option value="free">Saldo bebas rekening ({formatRupiah(unallocatedBalance)})</option>
                  {pockets.map(pk => <option key={pk.id} value={pk.id}>{pk.emoji || '🎯'} {pk.name} ({formatRupiah(pk.balance)})</option>)}
                </select>
              </div>
              <div>
                <label className="brutal-label" htmlFor="pk-dst">Ke tujuan</label>
                <select id="pk-dst" className="brutal-select" value={pocketTransferDest} onChange={e => setPocketTransferDest(e.target.value)}>
                  <option value="free">Saldo bebas rekening ({formatRupiah(unallocatedBalance)})</option>
                  {pockets.map(pk => <option key={pk.id} value={pk.id}>{pk.emoji || '🎯'} {pk.name} ({formatRupiah(pk.balance)})</option>)}
                </select>
              </div>
              <div>
                <label className="brutal-label" htmlFor="pk-amt">Nominal dipindahkan (Rp)</label>
                <input id="pk-amt" type="number" required min="1" placeholder="500000" className="brutal-input" value={pocketTransferAmount} onChange={e => setPocketTransferAmount(e.target.value)} />
                <NominalPreview amount={pocketTransferAmount} />
              </div>
              <div className="ax-btnrow">
                <button type="button" className="brutal-btn brutal-btn-ghost" onClick={() => setIsTransferringPocket(false)}>Batal</button>
                <button type="submit" className="brutal-btn brutal-btn-blue"><Check className="w-4 h-4" />Pindahkan</button>
              </div>
            </form>
          )}

          {/* FORM TAMBAH / EDIT KANTONG */}
          {isAddingPocket && (
            <form onSubmit={handleSavePocket} className="ax-subform">
              <h4>{editingPocketId ? 'Edit pos kantong' : `Tambah pos kantong di ${account.name}`}</h4>
              <div>
                <label className="brutal-label" htmlFor="pk-name">Nama pos kantong</label>
                <input id="pk-name" type="text" required placeholder="Belanja Mingguan, Transportasi" className="brutal-input" value={pocketName} onChange={e => setPocketName(e.target.value)} />
              </div>
              <div>
                <span className="brutal-label">Emoji</span>
                <div className="ax-emojis">
                  {['🍔', '☕', '🚗', '💊', '🎮', '🏠', '🛒', '⚡'].map(em => (
                    <button key={em} type="button" aria-pressed={pocketEmoji === em} aria-label={`Emoji ${em}`} onClick={() => setPocketEmoji(em)}>{em}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="brutal-label" htmlFor="pk-bal">Saldo alokasi pos ini (Rp)</label>
                <input id="pk-bal" type="number" placeholder="0" className="brutal-input" value={pocketBalance} onChange={e => setPocketBalance(e.target.value)} />
                <NominalPreview amount={pocketBalance} />
              </div>
              <div className="ax-btnrow">
                <button type="button" className="brutal-btn brutal-btn-ghost" onClick={() => { setIsAddingPocket(false); setEditingPocketId(null); }}>Batal</button>
                <button type="submit" className="brutal-btn brutal-btn-sage"><Check className="w-4 h-4" />{editingPocketId ? 'Simpan perubahan' : 'Buat kantong'}</button>
              </div>
            </form>
          )}

          {/* DAFTAR KANTONG */}
          {pockets.length === 0 ? (
            <div className="ax-emptyh"><p>Belum ada pos kantong</p><small>Buat kantong pemisah saldo seperti "Belanja Harian", "Transport", atau "Tagihan" agar dana tidak bocor halus.</small></div>
          ) : (
            <div className="ax-txl">
              {pockets.map(pocket => (
                <article key={pocket.id} className="ax-pk">
                  <span className="ax-pk-e" aria-hidden="true">{pocket.emoji || '🍔'}</span>
                  <div className="ax-pk-m"><b>{pocket.name}</b><small>Pos anggaran</small></div>
                  <div className="ax-pk-r">
                    <span className="ax-pk-v">{formatRupiah(pocket.balance || 0)}</span>
                    <div className="ax-acts">
                      <button type="button" className="ax-iconbtn" title="Edit kantong" aria-label={`Edit kantong ${pocket.name}`} onClick={() => openEditPocket(pocket)}><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" className="ax-iconbtn del" title="Hapus kantong" aria-label={`Hapus kantong ${pocket.name}`} onClick={() => onDeletePocket(account.id, pocket.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </ModalFrame>
  );
}
