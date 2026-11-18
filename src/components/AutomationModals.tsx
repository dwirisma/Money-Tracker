import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { ArrowRightLeft, Calculator, Check, Info, Landmark, Pencil, PiggyBank, Receipt, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import type { Account, AutomationCycle, AutomationType, CustomIntervalUnit } from '../types';
import { formatRupiah } from '../utils/calculator';
import { ModalFrame } from './ui/ModalFrame';
import { CyclePicker } from './ObligationForms';

const ACC_TYPE: Record<string, string> = { cash: 'Dompet', bank: 'Bank', ewallet: 'E-Wallet', credit_card: 'Kartu Kredit' };

const KINDS: { id: string; label: string; desc: string; c: string; Icon: typeof Zap }[] = [
  { id: 'income', label: 'Pemasukan', desc: 'Auto-income: gaji, dividen', c: 'var(--accent-sage)', Icon: TrendingUp },
  { id: 'expense', label: 'Pengeluaran', desc: 'Auto-expense: biaya admin', c: 'var(--accent-terracotta)', Icon: TrendingDown },
  { id: 'transfer', label: 'Transfer', desc: 'Auto-transfer: menabung', c: 'var(--accent-blue)', Icon: ArrowRightLeft },
  { id: 'ap_goal_topup', label: 'Top-up Tabungan', desc: 'Setor ke sinking fund', c: 'var(--accent-sand)', Icon: PiggyBank },
  { id: 'ap_pay_bill', label: 'Bayar Tagihan', desc: 'Lunasi saat jatuh tempo', c: '#e3a8f7', Icon: Receipt },
  { id: 'ap_pay_debt', label: 'Cicil Utang', desc: 'Cicilan otomatis', c: 'var(--accent-terracotta)', Icon: Landmark }
];

const TINT: Record<string, string> = {
  income: 'var(--accent-sage)', expense: 'var(--accent-terracotta)', transfer: 'var(--accent-blue)', ap: 'var(--accent-sand)'
};

/** Pilih akun lewat kartu yang bisa diketuk. */
function AccountPick(p: { label: string; accounts: Account[]; value: string; onChange: (id: string) => void; disabledId?: string; disabledNote?: string }) {
  return (
    <div>
      <div className="ax-fl"><span>{p.label}</span></div>
      {p.accounts.length === 0 ? (
        <p className="ax-fieldhint">Belum ada akun di buku kas ini.</p>
      ) : (
        <div className="ax-accs" role="radiogroup" aria-label={p.label}>
          {p.accounts.map(acc => {
            const off = p.disabledId === acc.id;
            return (
              <button key={acc.id} type="button" role="radio" aria-checked={p.value === acc.id} disabled={off} className="ax-acc"
                style={off ? { opacity: 0.45 } : undefined} onClick={() => p.onChange(acc.id)}>
                <b>{acc.name}</b>
                <small>{off ? p.disabledNote : `${ACC_TYPE[acc.type] || acc.type} · ${formatRupiah(acc.balance)}`}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Props {
  mode: 'create' | 'edit';
  ledgerName: string;
  /** Nama aturan yang sedang diubah (subjudul saat mode edit). */
  ruleName?: string;
  accounts: Account[];
  /** Mode buat: id jenis terpilih ('income', 'expense', 'transfer', atau 'ap_*'). Mode ubah: tipe aturan. */
  kind: string;
  /** Hanya mode buat: dipanggil saat jenis dipilih (logika reset kategori/warna tetap di App.tsx). */
  onKind?: (id: string) => void;
  /** Mode buat dengan jenis autopilot: formulir autopilot menggantikan kolom standar. */
  autopilotFields?: ReactNode;
  name: string; onName: (v: string) => void;
  category: string; onCategory: (v: string) => void;
  amount: string; onAmount: (v: string) => void; calcNotice: string | null;
  sourceAccount: string; onSourceAccount: (id: string) => void;
  toAccount: string; onToAccount: (id: string) => void;
  cycle: AutomationCycle; onCycle: (c: AutomationCycle) => void;
  monthlyDay: number; onMonthlyDay: (n: number) => void;
  customCount: number; onCustomCount: (n: number) => void;
  customUnit: CustomIntervalUnit; onCustomUnit: (u: CustomIntervalUnit) => void;
  nextDate: string; onNextDate: (v: string) => void;
  note: string; onNote: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function AutomationFormModal(p: Props) {
  const create = p.mode === 'create';
  const formId = create ? 'add-auto-form' : 'edit-auto-form';
  const isAp = create && !!p.autopilotFields;
  const type = (isAp ? 'ap' : p.kind) as AutomationType | 'ap';
  const isTransfer = type === 'transfer';
  const tint = TINT[type] ?? 'var(--accent-sand)';
  const sourceLabel = type === 'income' ? 'Rekening penerima' : type === 'expense' ? 'Rekening pemotong' : 'Rekening asal (sumber)';

  return (
    <ModalFrame
      wide
      title={create ? 'Buat Aturan Otomatisasi' : 'Ubah Aturan'}
      subtitle={create ? `Buku kas: ${p.ledgerName}` : p.ruleName}
      icon={create ? <Zap className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
      tint={tint}
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form={formId} className="brutal-btn brutal-btn-sand">
            <Check className="w-4 h-4" />{create ? 'Simpan aturan' : 'Simpan perubahan'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={p.onSubmit} className="ax-form">
        {create && p.onKind && (
          <div>
            <div className="ax-fl"><span>Jenis aturan</span></div>
            <div className="ax-opts" role="radiogroup" aria-label="Jenis aturan">
              {KINDS.map(k => (
                <button key={k.id} type="button" role="radio" aria-checked={p.kind === k.id} className="ax-opt"
                  style={{ '--c': k.c } as CSSProperties} onClick={() => p.onKind!(k.id)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><k.Icon className="w-4 h-4" />{k.label}</span>
                  <small>{k.desc}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {isAp ? p.autopilotFields : (
          <>
            <div>
              <label className="brutal-label" htmlFor={`${formId}-name`}>Nama aturan</label>
              <input id={`${formId}-name`} type="text" className="brutal-input" value={p.name} onChange={e => p.onName(e.target.value)}
                placeholder={type === 'income' ? 'Gaji Bulanan Kantor, Passive Income Sewa'
                  : type === 'expense' ? 'Potongan Admin Bank, Iuran Kebersihan' : 'Sisihkan Gaji ke Jago, Alokasi Dana Dingin'} required />
            </div>

            <div className="ax-amt" data-kind={type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'transfer'}>
              <label className="ax-fl" htmlFor={`${formId}-amt`}>
                <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Nominal transaksi</span>
              </label>
              <div className="ax-amt-row">
                <span>Rp</span>
                <input id={`${formId}-amt`} type="text" inputMode="text" autoComplete="off" value={p.amount} onChange={e => p.onAmount(e.target.value)}
                  placeholder="1000000" required />
              </div>
              {p.calcNotice && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{p.calcNotice}</div>}
              <p className="ax-hint">Mendukung kalkulator, contoh: 5000000+500000.</p>
            </div>

            <div>
              <label className="brutal-label" htmlFor={`${formId}-cat`}>Kategori</label>
              <input id={`${formId}-cat`} type="text" className="brutal-input" value={p.category} onChange={e => p.onCategory(e.target.value)}
                placeholder="Gaji, Operasional, Tabungan" />
            </div>

            <AccountPick label={sourceLabel} accounts={p.accounts} value={p.sourceAccount} onChange={p.onSourceAccount} />
            {isTransfer && (
              <AccountPick label="Rekening tujuan (penerima)" accounts={p.accounts} value={p.toAccount} onChange={p.onToAccount}
                disabledId={p.sourceAccount} disabledNote="Akun sumber" />
            )}

            <CyclePicker label="Siklus eksekusi" idPrefix={create ? 'aa' : 'ae'} cycle={p.cycle} onCycle={p.onCycle}
              customCount={p.customCount} onCustomCount={p.onCustomCount} customUnit={p.customUnit} onCustomUnit={p.onCustomUnit} />

            {p.cycle === 'monthly' && (
              <div className="ax-two" style={{ alignItems: 'end' }}>
                <div>
                  <label className="brutal-label" htmlFor={`${formId}-day`}>Eksekusi tanggal berapa?</label>
                  <input id={`${formId}-day`} type="number" min={1} max={31} className="brutal-input" value={p.monthlyDay}
                    onChange={e => p.onMonthlyDay(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
                </div>
                <p className="ax-fieldhint" style={{ margin: 0 }}>Dijalankan otomatis tiap bulan pada tanggal ini.</p>
              </div>
            )}

            <div>
              <label className="brutal-label" htmlFor={`${formId}-date`}>{create ? 'Tanggal eksekusi pertama / berikutnya' : 'Tanggal eksekusi berikutnya'}</label>
              <input id={`${formId}-date`} type="date" className="brutal-input" value={p.nextDate} onChange={e => p.onNextDate(e.target.value)} required />
              {create && <p className="ax-fieldhint">Saat aplikasi dibuka pada atau setelah tanggal ini, transaksi dieksekusi otomatis.</p>}
            </div>

            <div>
              <label className="brutal-label" htmlFor={`${formId}-note`}>Catatan (opsional)</label>
              <input id={`${formId}-note`} type="text" className="brutal-input" value={p.note} onChange={e => p.onNote(e.target.value)}
                placeholder={create ? 'Catatan transaksi otomatis' : undefined} />
            </div>

            {create && (
              <div className="ax-warn">
                <Info className="w-4 h-4" />
                <span><b>Cara kerjanya: </b>saat jatuh tempo tiba dan aplikasi dibuka, sistem memotong atau menambah saldo akun, mencatat transaksi bertanda [Otomatis], lalu memajukan jadwal ke siklus berikutnya.</span>
              </div>
            )}
          </>
        )}
      </form>
    </ModalFrame>
  );
}
