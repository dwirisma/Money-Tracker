import type { CSSProperties, FormEvent } from 'react';
import { Banknote, Calculator, Check, Pencil, Receipt } from 'lucide-react';
import type { Account, BillCycle, CustomIntervalUnit } from '../types';
import { evaluateMathExpression, formatRupiah, freeBalanceText } from '../utils/financeUtils';
import { ModalFrame } from './ui/BaseUI';

const CYCLES: { id: BillCycle; label: string }[] = [
  { id: 'daily', label: 'Harian' },
  { id: 'weekly', label: 'Mingguan' },
  { id: 'monthly', label: 'Bulanan' },
  { id: 'yearly', label: 'Tahunan' },
  { id: 'custom', label: 'Kustom' }
];

const ACC_TYPE: Record<string, string> = { cash: 'Dompet', bank: 'Bank', ewallet: 'E-Wallet', credit_card: 'Kartu Kredit' };

/** Pilihan siklus + interval kustom (dipakai tagihan & utang, Tambah maupun Ubah). */
export function CyclePicker(p: {
  label: string;
  cycle: BillCycle;
  onCycle: (c: BillCycle) => void;
  customCount: number;
  onCustomCount: (n: number) => void;
  customUnit: CustomIntervalUnit;
  onCustomUnit: (u: CustomIntervalUnit) => void;
  idPrefix: string;
}) {
  return (
    <div>
      <div className="ax-fl"><span>{p.label}</span></div>
      <div className="ax-chipset" role="radiogroup" aria-label={p.label}>
        {CYCLES.map(c => (
          <button key={c.id} type="button" role="radio" aria-checked={p.cycle === c.id} onClick={() => p.onCycle(c.id)}>{c.label}</button>
        ))}
      </div>
      {p.cycle === 'custom' && (
        <div className="ax-two" style={{ marginTop: 10 }}>
          <div>
            <label className="brutal-label" htmlFor={`${p.idPrefix}-cc`}>Setiap kelipatan</label>
            <input id={`${p.idPrefix}-cc`} type="number" min={1} className="brutal-input" value={p.customCount}
              onChange={e => p.onCustomCount(Math.max(1, parseInt(e.target.value, 10) || 1))} placeholder="Misal: 10" required />
          </div>
          <div>
            <label className="brutal-label" htmlFor={`${p.idPrefix}-cu`}>Satuan waktu</label>
            <select id={`${p.idPrefix}-cu`} className="brutal-select" value={p.customUnit} onChange={e => p.onCustomUnit(e.target.value as CustomIntervalUnit)}>
              <option value="days">Hari</option>
              <option value="weeks">Minggu</option>
              <option value="months">Bulan</option>
              <option value="years">Tahun</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pilihan warna aksen kartu. */
export function ColorPicker(p: { label: string; value: string; onChange: (c: string) => void; options: { color: string; label: string }[] }) {
  return (
    <div>
      <div className="ax-fl"><span>{p.label}</span></div>
      <div className="ax-colors" role="radiogroup" aria-label={p.label}>
        {p.options.map(o => (
          <button key={o.color} type="button" role="radio" aria-checked={p.value === o.color} aria-pressed={p.value === o.color} title={o.label} aria-label={o.label}
            style={{ backgroundColor: o.color }} onClick={() => p.onChange(o.color)}>{p.value === o.color ? '✓' : ''}</button>
        ))}
      </div>
    </div>
  );
}

const BILL_COLORS = [
  { color: '#6c97ff', label: 'Biru' }, { color: '#2dd4a7', label: 'Hijau' }, { color: '#ff7a4d', label: 'Oranye' },
  { color: '#ffc933', label: 'Kuning' }, { color: '#e3a8f7', label: 'Lilac' }
];
const DEBT_COLORS = [
  { color: '#ff7a4d', label: 'Oranye' }, { color: '#ffc933', label: 'Kuning' }, { color: '#6c97ff', label: 'Biru' },
  { color: '#2dd4a7', label: 'Hijau' }, { color: '#e3a8f7', label: 'Lilac' }
];

/* ============================ TAMBAH TAGIHAN ============================ */
interface AddBillProps {
  ledgerName: string;
  accounts: Account[];
  name: string; onName: (v: string) => void;
  cycle: BillCycle; onCycle: (c: BillCycle) => void;
  customCount: number; onCustomCount: (n: number) => void;
  customUnit: CustomIntervalUnit; onCustomUnit: (u: CustomIntervalUnit) => void;
  pricingType: 'fixed' | 'variable'; onPricingType: (t: 'fixed' | 'variable') => void;
  amount: string; onAmount: (v: string) => void; calcNotice: string | null;
  lastNominal: string; onLastNominal: (v: string) => void; lastNominalNotice: string | null;
  nextDate: string; onNextDate: (v: string) => void;
  category: string; onCategory: (v: string) => void;
  sourceAccount: string; onSourceAccount: (id: string) => void;
  note: string; onNote: (v: string) => void;
  color: string; onColor: (c: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function AddBillModal(p: AddBillProps) {
  const fixed = p.pricingType === 'fixed';
  const notice = fixed ? p.calcNotice : p.lastNominalNotice;
  return (
    <ModalFrame
      wide
      title="Tambah Tagihan Rutin"
      subtitle={`Buku kas: ${p.ledgerName}`}
      icon={<Receipt className="w-4 h-4" />}
      tint="var(--accent-blue)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form="add-bill-form" className="brutal-btn brutal-btn-blue"><Check className="w-4 h-4" />Simpan tagihan</button>
        </>
      }
    >
      <form id="add-bill-form" onSubmit={p.onSubmit} className="ax-form">
        <div>
          <label className="brutal-label" htmlFor="ab-name">Nama tagihan / langganan</label>
          <input id="ab-name" type="text" className="brutal-input" value={p.name} onChange={e => p.onName(e.target.value)}
            placeholder="Netflix Premium, Indihome, BPJS, Listrik PLN" required />
        </div>

        <CyclePicker label="Siklus pembayaran" idPrefix="ab" cycle={p.cycle} onCycle={p.onCycle}
          customCount={p.customCount} onCustomCount={p.onCustomCount} customUnit={p.customUnit} onCustomUnit={p.onCustomUnit} />

        <div>
          <div className="ax-fl"><span>Tipe nominal</span></div>
          <div className="ax-opts" role="radiogroup" aria-label="Tipe nominal">
            <button type="button" role="radio" aria-checked={fixed} className="ax-opt" style={{ '--c': 'var(--accent-blue)' } as CSSProperties} onClick={() => p.onPricingType('fixed')}>
              Tetap<small>Nominal sama tiap siklus</small>
            </button>
            <button type="button" role="radio" aria-checked={!fixed} className="ax-opt" style={{ '--c': 'var(--accent-sand)' } as CSSProperties} onClick={() => p.onPricingType('variable')}>
              Fluktuatif<small>Berubah, mis. listrik, air</small>
            </button>
          </div>
        </div>

        <div className="ax-amt" data-kind="transfer">
          <label className="ax-fl" htmlFor="ab-amount">
            <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />{fixed ? 'Nominal tetap per siklus' : 'Nominal periode lalu (estimasi)'}</span>
          </label>
          <div className="ax-amt-row">
            <span>Rp</span>
            {fixed
              ? <input id="ab-amount" type="text" inputMode="text" autoComplete="off" value={p.amount} onChange={e => p.onAmount(e.target.value)} placeholder="186000 atau 54000+10000" required />
              : <input id="ab-amount" type="text" inputMode="text" autoComplete="off" value={p.lastNominal} onChange={e => p.onLastNominal(e.target.value)} placeholder="450000 atau 200000+50000" required />}
          </div>
          {notice && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{notice}</div>}
          <p className="ax-hint">
            {fixed ? 'Mendukung kalkulator, contoh: 54000+10000'
              : 'Tampil di kartu sebagai estimasi bulan lalu dan otomatis diperbarui saat Anda membayar tagihan aktual berikutnya.'}
          </p>
        </div>

        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="ab-date">Jatuh tempo berikutnya</label>
            <input id="ab-date" type="date" className="brutal-input" value={p.nextDate} onChange={e => p.onNextDate(e.target.value)} required />
          </div>
          <div>
            <label className="brutal-label" htmlFor="ab-cat">Kategori</label>
            <input id="ab-cat" type="text" className="brutal-input" value={p.category} onChange={e => p.onCategory(e.target.value)} placeholder="Tagihan & Utilitas" />
          </div>
        </div>

        <div>
          <div className="ax-fl"><span>Akun kas sumber default</span><span style={{ letterSpacing: 0, textTransform: 'none', fontFamily: 'var(--font-heading)' }}>opsional</span></div>
          <div className="ax-accs" role="radiogroup" aria-label="Akun sumber default">
            <button type="button" role="radio" aria-checked={p.sourceAccount === ''} className="ax-acc" onClick={() => p.onSourceAccount('')}>
              <b>Pilih saat bayar</b><small>Tanpa akun default</small>
            </button>
            {p.accounts.map(acc => (
              <button key={acc.id} type="button" role="radio" aria-checked={p.sourceAccount === acc.id} className="ax-acc" onClick={() => p.onSourceAccount(acc.id)}>
                <b>{acc.name}</b><small>{ACC_TYPE[acc.type] || acc.type} · {freeBalanceText(acc)}</small>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="brutal-label" htmlFor="ab-note">Catatan tambahan (opsional)</label>
          <input id="ab-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNote(e.target.value)} placeholder="ID Pelanggan: 123456789 atau paket bersama" />
        </div>

        <ColorPicker label="Warna aksen kartu" value={p.color} onChange={p.onColor} options={BILL_COLORS} />
      </form>
    </ModalFrame>
  );
}

/* ============================ TAMBAH UTANG ============================ */
interface AddDebtProps {
  ledgerName: string;
  name: string; onName: (v: string) => void;
  lender: string; onLender: (v: string) => void;
  total: string; onTotal: (v: string) => void; calcNotice: string | null;
  remaining: string; onRemaining: (v: string) => void;
  nextDate: string; onNextDate: (v: string) => void;
  cycle: BillCycle; onCycle: (c: BillCycle) => void;
  customCount: number; onCustomCount: (n: number) => void;
  customUnit: CustomIntervalUnit; onCustomUnit: (u: CustomIntervalUnit) => void;
  dueDate: string; onDueDate: (v: string) => void;
  note: string; onNote: (v: string) => void;
  color: string; onColor: (c: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function AddDebtModal(p: AddDebtProps) {
  return (
    <ModalFrame
      wide
      title="Catat Utang Baru"
      subtitle={`Buku kas: ${p.ledgerName}`}
      icon={<Banknote className="w-4 h-4" />}
      tint="var(--accent-terracotta)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form="add-debt-form" className="brutal-btn brutal-btn-terracotta"><Check className="w-4 h-4" />Simpan utang</button>
        </>
      }
    >
      <form id="add-debt-form" onSubmit={p.onSubmit} className="ax-form">
        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="ad-name">Nama utang / pinjaman</label>
            <input id="ad-name" type="text" className="brutal-input" value={p.name} onChange={e => p.onName(e.target.value)} placeholder="Cicilan Motor, KPR, Pinjaman Teman" required />
          </div>
          <div>
            <label className="brutal-label" htmlFor="ad-lender">Pemberi pinjaman</label>
            <input id="ad-lender" type="text" className="brutal-input" value={p.lender} onChange={e => p.onLender(e.target.value)} placeholder="BCA Finance, FIF, Teman Budi" />
          </div>
        </div>

        <div className="ax-amt" data-kind="expense">
          <label className="ax-fl" htmlFor="ad-total"><span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Total utang awal</span></label>
          <div className="ax-amt-row">
            <span>Rp</span>
            <input id="ad-total" type="text" inputMode="text" autoComplete="off" value={p.total} onChange={e => p.onTotal(e.target.value)} placeholder="10000000" required />
          </div>
          {p.calcNotice && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{p.calcNotice}</div>}
          <p className="ax-hint">Mendukung kalkulator. Sisa pokok otomatis mengikuti total awal.</p>
        </div>

        <div>
          <label className="brutal-label" htmlFor="ad-rem">Sisa pokok saat ini</label>
          <div className="ax-plain-amt">
            <span>Rp</span>
            <input id="ad-rem" type="number" className="brutal-input" value={p.remaining} onChange={e => p.onRemaining(e.target.value)} placeholder="Sisa belum lunas" required />
          </div>
          <p className="ax-fieldhint">Ubah bila sebagian sudah pernah dibayar.</p>
        </div>

        <div>
          <label className="brutal-label" htmlFor="ad-date">Jatuh tempo terdekat / berikutnya</label>
          <input id="ad-date" type="date" className="brutal-input" value={p.nextDate} onChange={e => p.onNextDate(e.target.value)} required />
          <p className="ax-fieldhint">Dipakai untuk menghitung mundur pengingat jatuh tempo.</p>
        </div>

        <CyclePicker label="Siklus pembayaran cicilan" idPrefix="ad" cycle={p.cycle} onCycle={p.onCycle}
          customCount={p.customCount} onCustomCount={p.onCustomCount} customUnit={p.customUnit} onCustomUnit={p.onCustomUnit} />

        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="ad-due">Target pelunasan akhir (opsional)</label>
            <input id="ad-due" type="date" className="brutal-input" value={p.dueDate} onChange={e => p.onDueDate(e.target.value)} />
          </div>
          <div>
            <label className="brutal-label" htmlFor="ad-note">Catatan (opsional)</label>
            <input id="ad-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNote(e.target.value)} placeholder="Jatuh tempo tgl 25, bunga 0%" />
          </div>
        </div>

        <ColorPicker label="Warna identitas utang" value={p.color} onChange={p.onColor} options={DEBT_COLORS} />
      </form>
    </ModalFrame>
  );
}

/** Hasil kalkulator untuk catatan "= Rp X" (hanya tampilan; hitungan simpan tetap di App.tsx). */
export function calcNoteOf(v: string): string | null {
  if (!v.trim()) return null;
  const { success, result } = evaluateMathExpression(v);
  return success && !isNaN(result) ? `= ${formatRupiah(result)}` : null;
}

/* ============================ UBAH TAGIHAN ============================ */
interface EditBillProps {
  billName: string;
  accounts: Account[];
  name: string; onName: (v: string) => void;
  cycle: BillCycle; onCycle: (c: BillCycle) => void;
  customCount: number; onCustomCount: (n: number) => void;
  customUnit: CustomIntervalUnit; onCustomUnit: (u: CustomIntervalUnit) => void;
  pricingType: 'fixed' | 'variable'; onPricingType: (t: 'fixed' | 'variable') => void;
  amount: string; onAmount: (v: string) => void;
  lastNominal: string; onLastNominal: (v: string) => void; lastNominalNotice: string | null;
  nextDate: string; onNextDate: (v: string) => void;
  category: string; onCategory: (v: string) => void;
  sourceAccount: string; onSourceAccount: (id: string) => void;
  note: string; onNote: (v: string) => void;
  color: string; onColor: (c: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function EditBillModal(p: EditBillProps) {
  const fixed = p.pricingType === 'fixed';
  const notice = fixed ? calcNoteOf(p.amount) : p.lastNominalNotice;
  return (
    <ModalFrame
      wide
      title="Ubah Tagihan"
      subtitle={p.billName}
      icon={<Pencil className="w-4 h-4" />}
      tint="var(--accent-blue)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form="edit-bill-form" className="brutal-btn brutal-btn-blue"><Check className="w-4 h-4" />Simpan perubahan</button>
        </>
      }
    >
      <form id="edit-bill-form" onSubmit={p.onSubmit} className="ax-form">
        <div>
          <label className="brutal-label" htmlFor="eb-name">Nama tagihan</label>
          <input id="eb-name" type="text" className="brutal-input" value={p.name} onChange={e => p.onName(e.target.value)} required />
        </div>

        <CyclePicker label="Siklus pembayaran" idPrefix="eb" cycle={p.cycle} onCycle={p.onCycle}
          customCount={p.customCount} onCustomCount={p.onCustomCount} customUnit={p.customUnit} onCustomUnit={p.onCustomUnit} />

        <div>
          <div className="ax-fl"><span>Tipe nominal</span></div>
          <div className="ax-opts" role="radiogroup" aria-label="Tipe nominal">
            <button type="button" role="radio" aria-checked={fixed} className="ax-opt" style={{ '--c': 'var(--accent-blue)' } as CSSProperties} onClick={() => p.onPricingType('fixed')}>
              Tetap<small>Nominal sama tiap siklus</small>
            </button>
            <button type="button" role="radio" aria-checked={!fixed} className="ax-opt" style={{ '--c': 'var(--accent-sand)' } as CSSProperties} onClick={() => p.onPricingType('variable')}>
              Fluktuatif<small>Berubah, mis. listrik, air</small>
            </button>
          </div>
        </div>

        <div className="ax-amt" data-kind="transfer">
          <label className="ax-fl" htmlFor="eb-amount">
            <span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />{fixed ? 'Nominal tetap per siklus' : 'Nominal periode lalu (estimasi)'}</span>
          </label>
          <div className="ax-amt-row">
            <span>Rp</span>
            {fixed
              ? <input id="eb-amount" type="text" inputMode="text" autoComplete="off" value={p.amount} onChange={e => p.onAmount(e.target.value)} placeholder="186000 atau 54000+10000" required />
              : <input id="eb-amount" type="text" inputMode="text" autoComplete="off" value={p.lastNominal} onChange={e => p.onLastNominal(e.target.value)} placeholder="450000 atau 200000+50000" />}
          </div>
          {notice && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{notice}</div>}
          <p className="ax-hint">Mendukung kalkulator, contoh: 54000+10000</p>
        </div>

        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="eb-date">Jatuh tempo berikutnya</label>
            <input id="eb-date" type="date" className="brutal-input" value={p.nextDate} onChange={e => p.onNextDate(e.target.value)} required />
          </div>
          <div>
            <label className="brutal-label" htmlFor="eb-cat">Kategori</label>
            <input id="eb-cat" type="text" className="brutal-input" value={p.category} onChange={e => p.onCategory(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="ax-fl"><span>Akun kas sumber default</span><span style={{ letterSpacing: 0, textTransform: 'none', fontFamily: 'var(--font-heading)' }}>opsional</span></div>
          <div className="ax-accs" role="radiogroup" aria-label="Akun sumber default">
            <button type="button" role="radio" aria-checked={p.sourceAccount === ''} className="ax-acc" onClick={() => p.onSourceAccount('')}>
              <b>Pilih saat bayar</b><small>Tanpa akun default</small>
            </button>
            {p.accounts.map(acc => (
              <button key={acc.id} type="button" role="radio" aria-checked={p.sourceAccount === acc.id} className="ax-acc" onClick={() => p.onSourceAccount(acc.id)}>
                <b>{acc.name}</b><small>{ACC_TYPE[acc.type] || acc.type} · {freeBalanceText(acc)}</small>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="brutal-label" htmlFor="eb-note">Catatan (opsional)</label>
          <input id="eb-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNote(e.target.value)} />
        </div>

        <ColorPicker label="Warna aksen kartu" value={p.color} onChange={p.onColor} options={BILL_COLORS} />
      </form>
    </ModalFrame>
  );
}

/* ============================ UBAH UTANG ============================ */
interface EditDebtProps {
  debtName: string;
  name: string; onName: (v: string) => void;
  lender: string; onLender: (v: string) => void;
  total: string; onTotal: (v: string) => void;
  remaining: string; onRemaining: (v: string) => void;
  nextDate: string; onNextDate: (v: string) => void;
  cycle: BillCycle; onCycle: (c: BillCycle) => void;
  customCount: number; onCustomCount: (n: number) => void;
  customUnit: CustomIntervalUnit; onCustomUnit: (u: CustomIntervalUnit) => void;
  dueDate: string; onDueDate: (v: string) => void;
  note: string; onNote: (v: string) => void;
  color: string; onColor: (c: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function EditDebtModal(p: EditDebtProps) {
  const totalNote = calcNoteOf(p.total);
  const remainNote = calcNoteOf(p.remaining);
  return (
    <ModalFrame
      wide
      title="Ubah Utang"
      subtitle={p.debtName}
      icon={<Pencil className="w-4 h-4" />}
      tint="var(--accent-terracotta)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form="edit-debt-form" className="brutal-btn brutal-btn-terracotta"><Check className="w-4 h-4" />Simpan perubahan</button>
        </>
      }
    >
      <form id="edit-debt-form" onSubmit={p.onSubmit} className="ax-form">
        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="ed-name">Nama utang</label>
            <input id="ed-name" type="text" className="brutal-input" value={p.name} onChange={e => p.onName(e.target.value)} required />
          </div>
          <div>
            <label className="brutal-label" htmlFor="ed-lender">Pemberi pinjaman</label>
            <input id="ed-lender" type="text" className="brutal-input" value={p.lender} onChange={e => p.onLender(e.target.value)} />
          </div>
        </div>

        <div className="ax-amt" data-kind="expense">
          <label className="ax-fl" htmlFor="ed-total"><span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Total utang awal</span></label>
          <div className="ax-amt-row">
            <span>Rp</span>
            <input id="ed-total" type="text" inputMode="text" autoComplete="off" value={p.total} onChange={e => p.onTotal(e.target.value)} required />
          </div>
          {totalNote && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{totalNote}</div>}
        </div>

        <div>
          <label className="brutal-label" htmlFor="ed-rem">Sisa pokok utang</label>
          <div className="ax-plain-amt">
            <span>Rp</span>
            <input id="ed-rem" type="text" inputMode="text" autoComplete="off" className="brutal-input" value={p.remaining} onChange={e => p.onRemaining(e.target.value)} required />
          </div>
          <p className="ax-fieldhint">{remainNote ?? 'Sisa yang belum dibayar. Mendukung kalkulator.'}</p>
        </div>

        <div>
          <label className="brutal-label" htmlFor="ed-date">Jatuh tempo terdekat / berikutnya</label>
          <input id="ed-date" type="date" className="brutal-input" value={p.nextDate} onChange={e => p.onNextDate(e.target.value)} required />
        </div>

        <CyclePicker label="Siklus pembayaran cicilan" idPrefix="ed" cycle={p.cycle} onCycle={p.onCycle}
          customCount={p.customCount} onCustomCount={p.onCustomCount} customUnit={p.customUnit} onCustomUnit={p.onCustomUnit} />

        <div className="ax-two">
          <div>
            <label className="brutal-label" htmlFor="ed-due">Target pelunasan akhir (opsional)</label>
            <input id="ed-due" type="date" className="brutal-input" value={p.dueDate} onChange={e => p.onDueDate(e.target.value)} />
          </div>
          <div>
            <label className="brutal-label" htmlFor="ed-note">Catatan (opsional)</label>
            <input id="ed-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNote(e.target.value)} />
          </div>
        </div>

        <ColorPicker label="Warna identitas utang" value={p.color} onChange={p.onColor} options={DEBT_COLORS} />
      </form>
    </ModalFrame>
  );
}
