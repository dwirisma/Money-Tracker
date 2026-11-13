import type { CSSProperties, MouseEvent } from 'react';
import { AlertTriangle, Clock, Pencil, Play, Plus, RotateCw, Trash2, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import type { Account, AutomationRule } from '../types';
import { formatRupiah } from '../utils/calculator';
import { getBillDueStatus, getCycleLabel } from '../services/cashManagementService';

type AutoFilter = 'all' | 'active' | 'income' | 'expense' | 'transfer';

interface Props {
  ledgerName: string;
  automations: AutomationRule[];
  filteredAutomations: AutomationRule[];
  accounts: Account[];
  filter: AutoFilter;
  isExecutingCron: boolean;
  metrics: { activeCount: number; estimatedIncome: number; estimatedExpense: number; totalExecutions: number };
  onFilter: (f: AutoFilter) => void;
  onAdd: () => void;
  onRunCron: () => void;
  onOpen: (r: AutomationRule) => void;
  onToggle: (id: string, e: MouseEvent) => void;
  onExecute: (r: AutomationRule, e: MouseEvent) => void;
  onEdit: (r: AutomationRule, e: MouseEvent) => void;
  onDelete: (r: AutomationRule, e: MouseEvent) => void;
}

const TYPE_META = {
  income: { label: 'Pemasukan otomatis', tag: 's', cls: 's', color: 'var(--accent-sage)', sign: '+' },
  expense: { label: 'Pengeluaran otomatis', tag: 't', cls: 't', color: 'var(--accent-terracotta)', sign: '-' },
  transfer: { label: 'Transfer otomatis', tag: 'b', cls: 'b', color: 'var(--accent-blue)', sign: '⇄ ' }
} as const;

export function AutomationsView(p: Props) {
  const { metrics: m } = p;
  const tabs: { id: AutoFilter; label: string }[] = [
    { id: 'all', label: `Semua (${p.automations.length})` },
    { id: 'active', label: `Aktif (${p.automations.filter(a => a.isActive).length})` },
    { id: 'income', label: `Pemasukan (${p.automations.filter(a => a.type === 'income').length})` },
    { id: 'expense', label: `Pengeluaran (${p.automations.filter(a => a.type === 'expense').length})` },
    { id: 'transfer', label: `Transfer (${p.automations.filter(a => a.type === 'transfer').length})` }
  ];

  return (
    <div className="ax-add">
      {/* RINGKASAN */}
      <section className="ax-dash">
        <div className="ax-b s6 ax-panel ax-hero lav">
          <div className="ax-hero-head">
            <div className="ax-eyebrow" style={{ marginTop: 0 }}><Zap className="w-3.5 h-3.5" />Aturan aktif</div>
            <span className="ax-badge-s">{p.ledgerName}</span>
          </div>
          <div className="ax-big" style={{ marginBottom: 4 }}>{m.activeCount} <span style={{ fontSize: '.45em', opacity: .7 }}>/ {p.automations.length}</span></div>
          <p className="ax-note-h">Aturan siap dieksekusi sesuai jadwal</p>
          <div className="ax-hero-foot">
            <button type="button" className="brutal-btn ax-btn-ink" onClick={p.onRunCron} disabled={p.isExecutingCron} title="Periksa dan jalankan aturan yang jatuh tempo hari ini">
              <RotateCw className={`w-3.5 h-3.5 ${p.isExecutingCron ? 'animate-spin' : ''}`} />{p.isExecutingCron ? 'Memeriksa...' : 'Cek jadwal'}
            </button>
            <span>Total eksekusi: {m.totalExecutions}×</span>
          </div>
        </div>
        <div className="ax-b m6 s3 ax-sc s">
          <span><TrendingUp className="w-3 h-3" />Auto-income</span>
          <b>+{formatRupiah(m.estimatedIncome)}</b>
          <small>Pemasukan rutin otomatis</small>
        </div>
        <div className="ax-b m6 s3 ax-sc t">
          <span><TrendingDown className="w-3 h-3" />Auto-expense</span>
          <b>-{formatRupiah(m.estimatedExpense)}</b>
          <small>Pengeluaran rutin</small>
        </div>
      </section>

      {/* DAFTAR ATURAN */}
      <div className="ax-secthead">
        <div>
          <h3><span className="ax-ic" style={{ background: 'var(--accent-lavender)' }}><Zap className="w-3.5 h-3.5" /></span>Aturan otomatisasi</h3>
          <p className="ax-sec-sub">Auto-income, auto-expense, dan auto-transfer berjalan otomatis saat aplikasi dibuka.</p>
        </div>
        <button type="button" className="brutal-btn brutal-btn-lavender" onClick={p.onAdd}><Plus className="w-4 h-4" />Buat aturan</button>
      </div>
      <div className="ax-chipset scroll" role="radiogroup" aria-label="Filter aturan">
        {tabs.map(t => <button key={t.id} type="button" role="radio" aria-checked={p.filter === t.id} onClick={() => p.onFilter(t.id)}>{t.label}</button>)}
      </div>

      {p.filteredAutomations.length === 0 ? (
        <div className="ax-panel ax-emptyc">
          <p>Belum ada aturan otomatisasi</p>
          <small>Jadwalkan pemasukan rutin (gaji), pengeluaran tetap (biaya admin, langganan), atau transfer antar rekening secara otomatis.</small>
          <button type="button" className="brutal-btn brutal-btn-lavender" onClick={p.onAdd}><Plus className="w-4 h-4" />Buat aturan pertama</button>
        </div>
      ) : (
        <div className="ax-acc-grid">
          {p.filteredAutomations.map(rule => {
            const meta = TYPE_META[rule.type];
            const src = p.accounts.find(a => a.id === rule.sourceAccountId);
            const dest = rule.toAccountId ? p.accounts.find(a => a.id === rule.toAccountId) : null;
            const due = getBillDueStatus(rule.nextRunDate);
            const cycle = rule.cycle === 'monthly' && rule.monthlyDay
              ? `Setiap tgl ${rule.monthlyDay} per bulan`
              : getCycleLabel(rule.cycle, rule.customIntervalCount, rule.customIntervalUnit);
            return (
              <article key={rule.id} className={`ax-ac ob ${rule.isActive ? '' : 'off'}`} style={{ '--c': rule.colorAccent || meta.color } as CSSProperties}
                role="button" tabIndex={0} aria-label={`Buka detail aturan ${rule.name}`}
                onClick={() => p.onOpen(rule)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onOpen(rule); } }}>
                <div className="ax-ac-h">
                  <span className={`ax-tag ${meta.tag}`}>{meta.label}</span>
                  <button type="button" role="switch" aria-checked={rule.isActive} className="ax-sw"
                    title={rule.isActive ? 'Klik untuk menonaktifkan aturan ini' : 'Klik untuk mengaktifkan aturan ini'}
                    onClick={e => { e.stopPropagation(); p.onToggle(rule.id, e); }} onKeyDown={e => e.stopPropagation()}>
                    <i />{rule.isActive ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>

                <div>
                  <span className="ax-ob-name" style={{ display: 'block', fontSize: 15.5 }} title={rule.name}>{rule.name}</span>
                  <div className={`ax-amt-b ${meta.cls}`}>{meta.sign}{formatRupiah(rule.amount)}</div>
                </div>

                <div className="ax-ob-list">
                  <div className="ax-ob-row2"><span>Siklus</span><b title={cycle}>{cycle}</b></div>
                  <div className="ax-ob-row2">
                    <span>{rule.type === 'transfer' ? 'Alur akun' : rule.type === 'income' ? 'Rekening masuk' : 'Rekening potong'}</span>
                    <b>{rule.type === 'transfer' ? `${src?.name || 'Sumber'} → ${dest?.name || 'Tujuan'}` : (src?.name || 'Akun')}</b>
                  </div>
                  <div className="ax-ob-row2">
                    <span>Jadwal terdekat</span>
                    <b style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {rule.nextRunDate}
                      {rule.isActive && (due.isOverdue
                        ? <span className="ax-st late"><AlertTriangle className="w-3 h-3" />Eksekusi</span>
                        : due.isToday
                          ? <span className="ax-st late"><Clock className="w-3 h-3" />Hari ini</span>
                          : <span className="ax-st">{due.daysLeft} hari</span>)}
                    </b>
                  </div>
                </div>

                <div className="ax-ob-act" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                  <button type="button" className="brutal-btn brutal-btn-lavender" onClick={e => p.onExecute(rule, e)} title="Eksekusi transaksi otomatis ini sekarang">
                    <Play className="w-3.5 h-3.5" />Jalankan sekarang
                  </button>
                  <button type="button" className="ax-iconbtn" onClick={e => p.onEdit(rule, e)} title="Edit aturan" aria-label={`Edit aturan ${rule.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" className="ax-iconbtn del" onClick={e => p.onDelete(rule, e)} title="Hapus aturan" aria-label={`Hapus aturan ${rule.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
