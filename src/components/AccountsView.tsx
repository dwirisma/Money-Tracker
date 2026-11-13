import type { CSSProperties } from 'react';
import { Landmark, Smartphone, CreditCard, Wallet, Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react';
import type { Account } from '../types';
import { formatRupiah } from '../utils/calculator';

interface Totals {
  netBalance: number;
  totalAssets: number;
  totalCreditDebt: number;
}

interface Props {
  ledgerName: string;
  accounts: Account[];
  totals: Totals;
  isLoading: boolean;
  onAddAccount: () => void;
  onOpenDetail: (acc: Account) => void;
  onEditAccount: (acc: Account) => void;
  onDeleteAccount: (acc: Account) => void;
}

const TYPE_LABEL: Record<string, string> = {
  cash: 'Dompet Tunai',
  bank: 'Bank',
  ewallet: 'E-Wallet',
  credit_card: 'Kartu Kredit'
};

const TYPE_ICON: Record<string, LucideIcon> = {
  bank: Landmark,
  ewallet: Smartphone,
  credit_card: CreditCard
};

export function AccountsView({ ledgerName, accounts, totals, isLoading, onAddAccount, onOpenDetail, onEditAccount, onDeleteAccount }: Props) {
  const nonCredit = accounts.filter(a => a.type !== 'credit_card');

  return (
    <div className="ax-add">
      {/* RINGKASAN */}
      <section className="ax-dash">
        <div className="ax-b s6 ax-panel ax-hero sage">
          <div className="ax-hero-head">
            <div className="ax-eyebrow" style={{ marginTop: 0 }}><Wallet className="w-3.5 h-3.5" />Total saldo bersih</div>
            <span className="ax-badge-s">{ledgerName}</span>
          </div>
          <div className="ax-big" id="total-balance-display" style={{ marginBottom: 6 }}>{formatRupiah(totals.netBalance)}</div>
          <p className="ax-note-h">Total aset kas dikurangi tagihan kartu kredit di buku ini</p>
        </div>
        <div className="ax-b m6 s3 ax-sc b">
          <span><Landmark className="w-3 h-3" />Aset kas & bank</span>
          <b id="total-assets-display">{formatRupiah(totals.totalAssets)}</b>
          <small>Dari {nonCredit.length} akun</small>
        </div>
        <div className="ax-b m6 s3 ax-sc t">
          <span><CreditCard className="w-3 h-3" />Tagihan kartu kredit</span>
          <b id="total-debt-display">{formatRupiah(totals.totalCreditDebt)}</b>
          <small>Kewajiban berjalan</small>
        </div>
      </section>

      {/* DAFTAR AKUN */}
      <div className="ax-secthead">
        <h3>Akun <em>{accounts.length}</em></h3>
        <button type="button" className="brutal-btn brutal-btn-sand" onClick={onAddAccount}>
          <Plus className="w-4 h-4" />Tambah akun
        </button>
      </div>

      {isLoading ? (
        <div className="ax-panel ax-emptyc"><p className="animate-pulse">Memuat akun untuk {ledgerName}...</p></div>
      ) : accounts.length === 0 ? (
        <div className="ax-panel ax-emptyc">
          <p>Belum ada akun di buku kas "{ledgerName}"</p>
          <small>Buat akun simpanan (Bank, Dompet Tunai, E-Wallet) khusus untuk buku kas ini.</small>
          <button type="button" className="brutal-btn brutal-btn-sage" onClick={onAddAccount}>
            <Plus className="w-4 h-4" />Buat akun pertama
          </button>
        </div>
      ) : (
        <div id="accounts-list-container" className="ax-acc-grid">
          {accounts.map(acc => {
            const isCredit = acc.type === 'credit_card';
            const Icon = TYPE_ICON[acc.type] || Wallet;
            const share = !isCredit && totals.totalAssets > 0 ? Math.max(0, Math.min(100, (acc.balance / totals.totalAssets) * 100)) : 0;
            const color = acc.colorAccent || 'var(--accent-sand)';
            return (
              <article
                key={acc.id}
                className="ax-ac"
                style={{ '--c': color } as CSSProperties}
                role="button"
                tabIndex={0}
                aria-label={`Buka detail akun ${acc.name}`}
                onClick={() => onOpenDetail(acc)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(acc); } }}
              >
                <div className="ax-ac-h">
                  <div className="ax-ac-id">
                    <span className="ax-ic" style={{ background: color }}><Icon className="w-4 h-4" /></span>
                    <div><b>{acc.name}</b><small>{TYPE_LABEL[acc.type] || acc.type}</small></div>
                  </div>
                  <div className="ax-acts" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                    <button type="button" className="ax-iconbtn" onClick={() => onEditAccount(acc)} title="Edit akun" aria-label={`Edit akun ${acc.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" className="ax-iconbtn del" onClick={() => onDeleteAccount(acc)} title="Hapus akun" aria-label={`Hapus akun ${acc.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div>
                  <div className="ax-ac-l">
                    <span>{isCredit ? 'Tagihan berjalan' : 'Saldo tersedia'}</span>
                    {acc.pockets && acc.pockets.length > 0 && <span className="ax-pocket">{acc.pockets.length} kantong</span>}
                  </div>
                  <div className={`ax-ac-bal ${isCredit ? 'cr' : ''}`}>{formatRupiah(acc.balance)}</div>
                  {!isCredit && (
                    <>
                      <div className="ax-share" aria-hidden="true"><i style={{ width: `${share}%` }} /></div>
                    </>
                  )}
                </div>

                <div className="ax-ac-f">
                  <span>{isCredit ? 'Mutasi & kantong' : `${Math.round(share)}% dari aset kas`}</span>
                  <span>Lihat detail →</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
