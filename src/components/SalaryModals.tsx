import type { CSSProperties, FormEvent, MouseEvent } from 'react';
import type { Account } from '../types';
import { freeBalanceText } from '../utils/financeUtils';
import { Archive, Banknote, CalendarDays, Check, Clock, FileText, Gift, Plus, RefreshCw, RotateCcw, Settings, Trash2, Utensils, Zap } from 'lucide-react';
import { ModalFrame, NominalPreview } from './ui/BaseUI';

/* ============================ ARSIP RIWAYAT GAJI ============================ */
export interface HistoryItem {
  id: string;
  period: string;
  netSalary: number;
  grossSalary: number;
  totalOtHours: number;
  totalMeals: number;
  createdAt: unknown;
}

interface HistoryProps {
  items: HistoryItem[];
  isLoading: boolean;
  deletingId: string | null;
  formatRupiah: (v: number) => string;
  formatPeriodLabel: (period: string) => string;
  formatTimestamp: (ts: any) => string;
  onRefresh: () => void;
  onOpen: (period: string) => void;
  onDelete: (id: string, period: string, e: MouseEvent) => void;
}

export function SalaryHistorySection(p: HistoryProps) {
  return (
    <section className="ax-panel ax-sec">
      <div className="ax-secthead">
        <div>
          <h3>
            <Archive className="w-5 h-5" style={{ color: 'var(--accent-sand)' }} />Arsip Riwayat Gaji
            <em>{p.items.length} periode</em>
          </h3>
          <p className="ax-sec-sub">Rekam jejak gaji bulanan yang tersimpan dan terintegrasi dengan otomatisasi.</p>
        </div>
        <button type="button" onClick={p.onRefresh} className="brutal-btn ax-btn-light" title="Muat ulang riwayat gaji">
          <RotateCcw className={`w-4 h-4 ${p.isLoading ? 'animate-spin' : ''}`} />Segarkan
        </button>
      </div>

      {p.items.length === 0 ? (
        <div className="ax-emptyh">
          <FileText className="w-7 h-7" style={{ margin: '0 auto 6px', opacity: 0.6 }} />
          <p>Belum ada riwayat gaji tersimpan</p>
          <small>Slip gaji diarsipkan <b>otomatis</b> saat Anda pindah periode atau setelah tanggal tutup buku (tgl 20), lengkap dengan total jam lembur dan ceklis makan. Arsip tetap bisa diedit.</small>
        </div>
      ) : (
        <div className="ax-hist-grid">
          {p.items.map((h) => (
            <article key={h.id} className="ax-hcard">
              <header>
                <div>
                  <b>{p.formatPeriodLabel(h.period)}</b>
                  <small>{h.period}</small>
                </div>
                <span className="ax-tone" data-tone="ok">Tersimpan</span>
              </header>

              <div className="ax-hcard-net">
                <small>Pendapatan bersih (net)</small>
                <b>{p.formatRupiah(h.netSalary)}</b>
                <small>Kotor: {p.formatRupiah(h.grossSalary)}</small>
              </div>

              <div className="ax-hcard-m">
                <span style={{ color: 'var(--accent-sand-light)' }}><Clock className="w-3.5 h-3.5" />{h.totalOtHours} jam lembur</span>
                <span style={{ color: 'var(--accent-blue-light)' }}><Utensils className="w-3.5 h-3.5" />{h.totalMeals}x makan</span>
              </div>

              <footer>
                <small>{p.formatTimestamp(h.createdAt)}</small>
                <div>
                  <button type="button" className="ax-hopen" onClick={() => p.onOpen(h.period)} title="Buka kalender periode ini">
                    <CalendarDays className="w-3.5 h-3.5" />Buka
                  </button>
                  <button type="button" className="ax-ib del" onClick={(e) => p.onDelete(h.id, h.period, e)} disabled={p.deletingId === h.id}
                    title="Hapus arsip riwayat ini" aria-label={`Hapus arsip ${p.formatPeriodLabel(h.period)}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================ EDIT HARI ============================ */
const SHIFTS = [
  { label: 'Shift 1 (Malam)', code: 'I', desc: '23:00 - 07:00', c: 'var(--accent-lavender)' },
  { label: 'Shift 2 (Pagi)', code: 'II', desc: '07:00 - 15:00', c: 'var(--accent-blue)' },
  { label: 'Shift 3 (Sore)', code: 'III', desc: '15:00 - 23:00', c: 'var(--accent-sage)' },
  { label: 'Off (Libur)', code: 'OFF', desc: 'Hari bebas', c: 'var(--accent-terracotta)' }
];

interface EditDayProps {
  dayNumber: number | string;
  dayName: string;
  date: string;
  holidayName?: string;
  shiftLabel: string;
  onShift: (label: string, isWork: boolean) => void;
  ot: string; onOt: (v: string) => void;
  /** Indeks lembur hasil hitung (hanya tampilan). */
  otIndex: number;
  meals: { breakfast: boolean; lunch: boolean; dinner: boolean };
  onMeals: (m: { breakfast: boolean; lunch: boolean; dinner: boolean }) => void;
  note: string; onNote: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function EditDayModal(p: EditDayProps) {
  const MEALS: { key: 'breakfast' | 'lunch' | 'dinner'; label: string; c: string }[] = [
    { key: 'breakfast', label: 'Pagi (P)', c: 'var(--accent-blue)' },
    { key: 'lunch', label: 'Siang (S)', c: 'var(--accent-sand)' },
    { key: 'dinner', label: 'Malam (M)', c: 'var(--accent-lavender)' }
  ];
  return (
    <ModalFrame
      title={`Tanggal ${p.dayNumber} ${p.dayName}`}
      subtitle={`${p.date}${p.holidayName ? ` · 🎉 ${p.holidayName}` : ''}`}
      icon={<CalendarDays className="w-4 h-4" />}
      tint="var(--accent-sand)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form="edit-day-form" className="brutal-btn brutal-btn-sand"><Check className="w-4 h-4" />Simpan perubahan</button>
        </>
      }
    >
      <form id="edit-day-form" onSubmit={p.onSubmit} className="ax-form">
        <div>
          <div className="ax-fl"><span>Jadwal shift</span></div>
          <div className="ax-opts" role="radiogroup" aria-label="Jadwal shift">
            {SHIFTS.map(sh => (
              <button key={sh.label} type="button" role="radio" aria-checked={p.shiftLabel === sh.label} className="ax-opt"
                style={{ '--c': sh.c } as CSSProperties} onClick={() => p.onShift(sh.label, sh.code !== 'OFF')}>
                {sh.label}<small>{sh.desc}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="ax-amt" data-kind="income">
          <label className="ax-fl" htmlFor="edit-day-ot">
            <span><Clock className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Jam lembur tambahan aktual</span>
            <span style={{ letterSpacing: 0, textTransform: 'none' }}>Indeks {p.otIndex}x</span>
          </label>
          <div className="ax-amt-row">
            <span>Jam</span>
            <input id="edit-day-ot" type="number" step="0.01" min="0" max="24" value={p.ot} onChange={e => p.onOt(e.target.value)} placeholder="0" />
          </div>
          <div className="ax-chips-q" style={{ marginTop: 8 }}>
            {[1, 2, 4, 8].map(add => (
              <button key={add} type="button" style={{ '--c': 'var(--accent-sand)' } as CSSProperties}
                onClick={() => p.onOt(String((parseFloat(p.ot) || 0) + add))}>+{add}j</button>
            ))}
            <button type="button" style={{ '--c': 'var(--accent-terracotta)' } as CSSProperties} onClick={() => p.onOt('0')}>Reset</button>
          </div>
        </div>

        <div>
          <div className="ax-fl"><span>Ceklis makan (manual)</span></div>
          <div className="ax-opts three" role="group" aria-label="Ceklis makan">
            {MEALS.map(m => (
              <button key={m.key} type="button" role="checkbox" aria-checked={p.meals[m.key]} className="ax-opt center"
                style={{ '--c': m.c } as CSSProperties} onClick={() => p.onMeals({ ...p.meals, [m.key]: !p.meals[m.key] })}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="brutal-label" htmlFor="edit-day-note">Catatan shift / overtime (opsional)</label>
          <input id="edit-day-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNote(e.target.value)}
            placeholder="Back-up mesin, perbaikan boiler..." />
        </div>
      </form>
    </ModalFrame>
  );
}

/* ============================ PENGATURAN GAJI ============================ */
const GROUPS = [
  { id: 'A', hint: 'Offset 0 hari' }, { id: 'B', hint: 'Offset 7 hari' },
  { id: 'C', hint: 'Offset 14 hari' }, { id: 'D', hint: 'Offset 21 hari' }
];

function NumField(p: { id: string; label: string; value: number | string; onChange: (v: string) => void; step?: string; hint?: string; placeholder?: string }) {
  return (
    <div>
      <label className="brutal-label" htmlFor={p.id}>{p.label}</label>
      <div className="ax-plain-amt">
        <span>Rp</span>
        <input id={p.id} type="number" step={p.step} className="brutal-input" value={p.value} onChange={e => p.onChange(e.target.value)} placeholder={p.placeholder} />
      </div>
      <NominalPreview amount={p.value} />
      {p.hint && <p className="ax-fieldhint">{p.hint}</p>}
    </div>
  );
}

interface SettingsProps {
  group: string; onGroup: (g: string) => void;
  mealRate: number; onMealRate: (n: number) => void;
  ptkp: string; onPtkp: (v: string) => void;
  ptkpOptions: { value: string; label: string; desc: string }[];
  custom: { basicSalary: number; housingAllowance: number; shiftAllowance: number; housingDeduction: number };
  onCustom: (key: 'basicSalary' | 'housingAllowance' | 'shiftAllowance' | 'housingDeduction', v: number) => void;
  autoOT: boolean; onAutoOT: (v: boolean) => void;
  /** Otomasi gaji: masukkan take home pay ke rekening pada tanggal gajian. */
  payrollEnabled: boolean; onPayrollEnabled: (v: boolean) => void;
  payrollAccountId: string; onPayrollAccount: (id: string) => void;
  accounts: Account[];
  autoOTHours: number; onAutoOTHours: (n: number) => void;
  year: number | string;
  holidayCount: number;
  isSyncing: boolean; onSync: () => void;
  newDate: string; onNewDate: (v: string) => void;
  newName: string; onNewName: (v: string) => void;
  onAddHoliday: () => void;
  holidays: { date: string; desc: string; custom: boolean }[];
  onDeleteHoliday: (date: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function SalarySettingsModal(p: SettingsProps) {
  return (
    <ModalFrame
      wide
      title="Pengaturan Gaji"
      subtitle="Grup shift, pajak, Auto OT, dan tanggal merah"
      icon={<Settings className="w-4 h-4" />}
      tint="var(--accent-blue)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form="salary-settings-form" className="brutal-btn brutal-btn-sand"><Check className="w-4 h-4" />Simpan pengaturan</button>
        </>
      }
    >
      <form id="salary-settings-form" onSubmit={p.onSubmit} className="ax-form">
        <div>
          <div className="ax-fl"><span>Regu / grup shift aktif</span></div>
          <div className="ax-chipset" role="radiogroup" aria-label="Grup shift">
            {GROUPS.map(g => (
              <button key={g.id} type="button" role="radio" aria-checked={p.group === g.id} onClick={() => p.onGroup(g.id)} title={g.hint}>Grup {g.id}</button>
            ))}
          </div>
          <p className="ax-fieldhint">{GROUPS.find(g => g.id === p.group)?.hint}</p>
        </div>

        <div className="ax-two">
          <NumField id="ss-meal" label="Tarif per ceklis makan" step="100" value={p.mealRate} onChange={v => p.onMealRate(Math.max(0, parseInt(v, 10) || 0))} placeholder="9800" />
          <div>
            <label className="brutal-label" htmlFor="ss-ptkp">Status PTKP (PPh 21 TER)</label>
            <select id="ss-ptkp" className="brutal-select" value={p.ptkp} onChange={e => p.onPtkp(e.target.value)}>
              {p.ptkpOptions.map(o => <option key={o.value} value={o.value}>{o.label} - {o.desc}</option>)}
            </select>
          </div>
        </div>
        <p className="ax-fieldhint" style={{ marginTop: -6 }}>Menentukan kategori TER (A, B, atau C) dan tarif PPh 21 bulanan sesuai PP 58/2023.</p>

        <div className="ax-sl-box">
          <div className="ax-fl"><span>Komponen gaji pokok & tunjangan</span></div>
          <div className="ax-two">
            <NumField id="ss-basic" label="Gaji pokok" value={p.custom.basicSalary} onChange={v => p.onCustom('basicSalary', Number(v) || 0)} />
            <NumField id="ss-house" label="Tunjangan perumahan" value={p.custom.housingAllowance} onChange={v => p.onCustom('housingAllowance', Number(v) || 0)} />
            <NumField id="ss-shift" label="Tunjangan shift" value={p.custom.shiftAllowance} onChange={v => p.onCustom('shiftAllowance', Number(v) || 0)} />
            <NumField id="ss-mess" label="Potongan mess/housing" value={p.custom.housingDeduction} onChange={v => p.onCustom('housingDeduction', Number(v) || 0)} />
          </div>
        </div>

        <div className="ax-sl-box">
          <div className="ax-sl-bik">
            <button type="button" role="switch" aria-checked={p.autoOT} className="ax-tg" onClick={() => p.onAutoOT(!p.autoOT)}
              title="Aktifkan/Nonaktifkan Auto OT otomatis" aria-label="Auto OT otomatis"><i /></button>
            <div>
              <b><Zap className="w-3.5 h-3.5 inline -mt-0.5 mr-1" style={{ color: 'var(--accent-sand)' }} />Otomatisasi Auto O/T (Minggu Shift III)</b>
              <small>Sesuai kalender shift AGC 4 regu 3 shift: tiap Shift III (Sore) hari Minggu dihitung Auto O/T (1x Minggu = 8,25 jam; 2x = 16,50 jam).</small>
            </div>
          </div>
          {p.autoOT && (
            <div>
              <label className="brutal-label" htmlFor="ss-autoot">Jam Auto O/T per Minggu Shift III</label>
              <input id="ss-autoot" type="number" step="0.25" min="0" max="24" className="brutal-input" value={p.autoOTHours}
                onChange={e => p.onAutoOTHours(Math.max(0, parseFloat(e.target.value) || 0))} />
            </div>
          )}
        </div>

        <div className="ax-sl-box">
          <div className="ax-sl-bik">
            <button type="button" role="switch" aria-checked={p.payrollEnabled} className="ax-tg" onClick={() => p.onPayrollEnabled(!p.payrollEnabled)}
              title="Aktifkan/Nonaktifkan otomasi gaji" aria-label="Otomasi gaji"><i /></button>
            <div>
              <b><Banknote className="w-3.5 h-3.5 inline -mt-0.5 mr-1" style={{ color: 'var(--accent-sage)' }} />Otomasi gaji</b>
              <small>Take home pay otomatis masuk ke rekening pada tanggal gajian. Nominalnya diperbarui otomatis saat lembur, makan, atau komponen berubah, dan dikunci setelah periode ditutup.</small>
            </div>
          </div>
          {p.payrollEnabled && (
            <div>
              <div className="ax-fl"><span>Rekening penerima gaji</span></div>
              <div className="ax-accs" role="radiogroup" aria-label="Rekening penerima gaji">
                {p.accounts.filter(a => !a.isArchived && a.type !== 'credit_card').map(a => (
                  <button key={a.id} type="button" role="radio" aria-checked={p.payrollAccountId === a.id} className="ax-acc" onClick={() => p.onPayrollAccount(a.id)}>
                    <b>{a.name}</b><small>{freeBalanceText(a)}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="ax-fieldhint" style={{ margin: 0 }}>Periode gaji diarsipkan otomatis saat Anda pindah periode atau setelah tanggal tutup buku (tgl 20), dan tetap bisa diedit.</p>
        </div>

        <div className="ax-sl-box">
          <div className="ax-sl-row" style={{ padding: 0, borderBottom: 0 }}>
            <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Kalender tanggal merah & libur pabrik</span>
            <span className="ax-tone" data-tone="low">{p.holidayCount} libur ({p.year})</span>
          </div>

          <button type="button" onClick={p.onSync} disabled={p.isSyncing} className="brutal-btn brutal-btn-sand" style={{ width: '100%', justifyContent: 'center' }}>
            <RefreshCw className={`w-4 h-4 ${p.isSyncing ? 'animate-spin' : ''}`} />
            {p.isSyncing ? 'Menyinkronkan API...' : `Sinkronkan tanggal merah ${p.year}`}
          </button>

          <div className="ax-fl" style={{ marginTop: 4 }}><span>Tambah tanggal merah / libur pabrik manual</span></div>
          <div className="ax-addhol">
            <input type="date" className="brutal-input" value={p.newDate} onChange={e => p.onNewDate(e.target.value)} aria-label="Tanggal libur" />
            <input type="text" className="brutal-input" value={p.newName} onChange={e => p.onNewName(e.target.value)} placeholder="Libur ASC / Cuti Bersama" aria-label="Nama libur" />
            <button type="button" className="ax-sl-add" onClick={p.onAddHoliday} title="Tambahkan tanggal merah"><Plus className="w-4 h-4" />Tambah</button>
          </div>

          <div className="ax-fl" style={{ marginTop: 4 }}><span>Daftar terdaftar ({p.year})</span></div>
          <div className="ax-hollist">
            {p.holidays.map(h => (
              <div key={h.date} className="ax-hol">
                <span><b>{h.date}</b> {h.desc}{h.custom && <em>Manual</em>}</span>
                {h.custom && (
                  <button type="button" className="ax-ib del" onClick={() => p.onDeleteHoliday(h.date)} title="Hapus tanggal merah manual ini" aria-label={`Hapus ${h.date}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </form>
    </ModalFrame>
  );
}

/* ============================ KOMPONEN TAMBAHAN (BONUS / THR) ============================ */
interface AddOnProps {
  editing: boolean;
  name: string; onName: (v: string) => void;
  amount: string; onAmount: (v: string) => void; onAmountBlur: () => void;
  calcNotice: string | null;
  note: string; onNote: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export function AddOnModal(p: AddOnProps) {
  return (
    <ModalFrame
      title={p.editing ? 'Ubah Komponen Tambahan' : 'Tambah Komponen Tambahan'}
      subtitle="Bonus, THR, insentif, atau rapelan"
      icon={<Gift className="w-4 h-4" />}
      tint="var(--accent-sand)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="submit" form="addon-form" className="brutal-btn brutal-btn-sand"><Check className="w-4 h-4" />{p.editing ? 'Simpan perubahan' : 'Tambahkan ke gaji'}</button>
        </>
      }
    >
      <form id="addon-form" onSubmit={p.onSubmit} className="ax-form">
        <div>
          <label className="brutal-label" htmlFor="addon-name">Nama komponen tambahan</label>
          <input id="addon-name" type="text" className="brutal-input" value={p.name} onChange={e => p.onName(e.target.value)}
            placeholder="THR Idul Fitri, Bonus Akhir Tahun..." required autoFocus />
        </div>

        <div className="ax-amt" data-kind="income">
          <label className="ax-fl" htmlFor="addon-amount"><span>Nominal tambahan</span></label>
          <div className="ax-amt-row">
            <span>Rp</span>
            <input id="addon-amount" type="text" inputMode="text" autoComplete="off" value={p.amount} onChange={e => p.onAmount(e.target.value)}
              onBlur={p.onAmountBlur} placeholder="0" required />
          </div>
          <NominalPreview amount={p.amount} />
          <p className="ax-hint">Mendukung ekspresi, contoh: 5000000 + 2000000.</p>
        </div>

        <div>
          <label className="brutal-label" htmlFor="addon-note">Catatan / keterangan (opsional)</label>
          <input id="addon-note" type="text" className="brutal-input" value={p.note} onChange={e => p.onNote(e.target.value)}
            placeholder="SK Direksi No. 12/2026" />
        </div>
      </form>
    </ModalFrame>
  );
}
