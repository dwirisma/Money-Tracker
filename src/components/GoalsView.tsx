import type { CSSProperties } from 'react';
import { ArrowUpRight, Award, Calendar, CheckCircle2, Coins, Compass, Lock, Pencil, Plus, Target, Trash2, Wallet, Zap } from 'lucide-react';
import type { Account, Goal } from '../types';
import { formatRupiah } from '../utils/financeUtils';
import { getGoalStatus } from '../services/cashManagementService';

export type GoalFilter = 'active' | 'sinking_fund' | 'wishlist' | 'archived';

interface Props {
  ledgerName: string;
  goals: Goal[];
  filteredGoals: Goal[];
  accounts: Account[];
  goalFilter: GoalFilter;
  isLoading: boolean;
  metrics: { totalGoalsTarget: number; totalGoalsSaved: number; goalsOverallProgress: number };
  onFilter: (f: GoalFilter) => void;
  onAddGoal: () => void;
  onOpenGoal: (g: Goal) => void;
  onEditGoal: (g: Goal) => void;
  onDeleteGoal: (g: Goal) => void;
  onAllocate: (g: Goal) => void;
  onWithdraw?: (g: Goal) => void;
  /** Autopilot: apakah target sudah punya aturan top-up, dan buka jendela buat/ubah aturan. */
  autoOn?: (id: string) => boolean;
  onAutopilot?: (id: string) => void;
}

const R = 26;
const C = 2 * Math.PI * R;

/** Sisa hari ke tenggat (negatif = lewat). null jika tidak ada tenggat valid. */
function daysUntil(deadline?: string): number | null {
  if (!deadline) return null;
  const d = new Date(`${deadline}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 864e5);
}

export function GoalsView(p: Props) {
  const { metrics: m } = p;
  const activeGoals = p.goals.filter(g => getGoalStatus(g) === 'active');
  const achievedCount = p.goals.filter(g => getGoalStatus(g) === 'achieved').length;
  const archivedCount = p.goals.filter(g => {
    const st = getGoalStatus(g);
    return st === 'achieved' || st === 'closed';
  }).length;

  const tabs: { id: GoalFilter; label: string; count: number }[] = [
    { id: 'active', label: 'Aktif', count: activeGoals.length },
    { id: 'sinking_fund', label: 'Sinking Funds', count: activeGoals.filter(g => g.type === 'sinking_fund').length },
    { id: 'wishlist', label: 'Wishlist', count: activeGoals.filter(g => g.type === 'wishlist').length },
    { id: 'archived', label: 'Tercapai / Ditutup', count: archivedCount },
  ];

  return (
    <div className="ax-add">
      {/* RINGKASAN */}
      <section className="ax-dash">
        <div className="ax-b s6 ax-panel ax-hero blue">
          <div className="ax-hero-head">
            <div className="ax-eyebrow" style={{ marginTop: 0 }}><Coins className="w-3.5 h-3.5" />Total dana terkumpul</div>
            <span className="ax-badge-s">{p.ledgerName}</span>
          </div>
          <div className="ax-big" id="total-goals-saved-display" style={{ marginBottom: 8 }}>{formatRupiah(m.totalGoalsSaved)}</div>
          <div className="ax-prog" aria-hidden="true"><i style={{ width: `${m.goalsOverallProgress}%`, background: 'var(--accent-sand)' }} /></div>
          <p className="ax-note-h">{m.goalsOverallProgress}% dari target aktif · rata-rata pencapaian tujuan finansial</p>
        </div>
        <div className="ax-b m6 s3 ax-sc y">
          <span><Target className="w-3 h-3" />Total target dana</span>
          <b id="total-goals-target-display">{formatRupiah(m.totalGoalsTarget)}</b>
          <small>Dari {activeGoals.length} target aktif</small>
        </div>
        <div className="ax-b m6 s3 ax-sc s">
          <span><CheckCircle2 className="w-3 h-3" />Target tercapai</span>
          <b>{achievedCount} <small>dari {p.goals.length}</small></b>
          <small>Telah 100% tercapai</small>
        </div>
      </section>

      {/* FILTER + TAMBAH */}
      <div className="ax-secthead">
        <div>
          <h3><span className="ax-ic" style={{ '--c': 'var(--accent-sand)', background: 'var(--accent-sand)' } as CSSProperties}><Target className="w-3.5 h-3.5" /></span>Wishlist & Sinking Funds</h3>
          <p className="ax-sec-sub">Sisihkan dana bertahap agar pengeluaran besar tidak datang mendadak.</p>
        </div>
        <button type="button" className="brutal-btn brutal-btn-sand" onClick={p.onAddGoal}><Plus className="w-4 h-4" />Tambah target</button>
      </div>
      <div className="ax-chipset scroll" role="radiogroup" aria-label="Filter target">
        {tabs.map(t => (
          <button key={t.id} type="button" role="radio" aria-checked={p.goalFilter === t.id} onClick={() => p.onFilter(t.id)}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {p.isLoading ? (
        <div className="ax-panel ax-emptyc"><p className="animate-pulse">Memuat target untuk {p.ledgerName}...</p></div>
      ) : p.filteredGoals.length === 0 ? (
        <div className="ax-panel ax-emptyc">
          <p>
            {p.goals.length === 0
              ? `Belum ada target atau dana bertahap di buku kas "${p.ledgerName}"`
              : p.goalFilter === 'archived'
                ? 'Belum ada target yang tercapai atau ditutup'
                : 'Tidak ada target aktif pada filter ini'}
          </p>
          <small>
            {p.goalFilter === 'archived'
              ? 'Target yang mencapai 100% atau Anda tutup secara manual akan muncul di tab ini lengkap dengan riwayatnya.'
              : 'Buat Sinking Fund untuk kebutuhan terencana (pajak kendaraan, servis, liburan) atau Wishlist untuk barang impian.'}
          </small>
          {p.goalFilter !== 'archived' && (
            <button type="button" className="brutal-btn brutal-btn-sand" onClick={p.onAddGoal}><Compass className="w-4 h-4" />Buat target baru</button>
          )}
        </div>
      ) : (
        <div className="ax-acc-grid">
          {p.filteredGoals.map(g => {
            const status = getGoalStatus(g);
            const isAchieved = status === 'achieved';
            const isClosed = status === 'closed';
            const rawProgress = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
            const displayProgress = isAchieved ? 100 : rawProgress;
            const remaining = Math.max(0, g.targetAmount - g.currentAmount);
            const totalWithdrawn = (g.withdrawals || []).reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
            const src = p.accounts.find(a => a.id === g.sourceAccountId);
            const days = daysUntil(g.deadline);
            const color = isAchieved
              ? 'var(--accent-sage)'
              : isClosed
                ? 'var(--text-muted)'
                : (g.colorAccent || 'var(--accent-sand)');
            const perMonth = status === 'active' && days !== null && days > 0 ? Math.ceil(remaining / Math.max(1, days / 30.44)) : 0;

            return (
              <article
                key={g.id}
                className="ax-ac ob"
                style={{ '--c': isAchieved ? 'var(--accent-sage)' : (g.colorAccent || 'var(--accent-sand)') } as CSSProperties}
                role="button"
                tabIndex={0}
                aria-label={`Buka detail target ${g.name}`}
                onClick={() => p.onOpenGoal(g)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onOpenGoal(g); } }}
              >
                <div className="ax-ac-h">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className={`ax-tag ${g.type === 'sinking_fund' ? 'y' : 'b'}`}>
                      {g.type === 'sinking_fund' ? 'Sinking Fund' : 'Wishlist'}
                    </span>
                    {isAchieved && (
                      <span className="ax-tag s inline-flex items-center gap-1 dark:!text-[#34D399] dark:!border-[#34D399]/50">
                        <Award className="w-3 h-3" /> Target Tercapai
                      </span>
                    )}
                    {isClosed && (
                      <span className="ax-tag n inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Ditutup
                      </span>
                    )}
                  </div>
                  <div className="ax-acts" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                    <button type="button" className="ax-iconbtn" onClick={() => p.onEditGoal(g)} title="Edit target" aria-label={`Edit target ${g.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" className="ax-iconbtn del" onClick={() => p.onDeleteGoal(g)} title="Hapus target" aria-label={`Hapus target ${g.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div>
                  <span className="ax-ob-name" style={{ display: 'block', fontSize: 16 }} title={g.name}>{g.name}</span>
                  {g.note && <p className="ax-gnote">{g.note}</p>}
                </div>

                <div className="ax-gbody">
                  <div className="ax-gring">
                    <svg width="76" height="76" viewBox="0 0 64 64" aria-hidden="true">
                      <circle cx="32" cy="32" r={R} fill="none" stroke="var(--bg-muted)" strokeWidth="9" />
                      <circle cx="32" cy="32" r={R} fill="none" stroke={color} strokeWidth="9" strokeDasharray={C} strokeDashoffset={C * (1 - displayProgress / 100)} strokeLinecap="round" />
                    </svg>
                    <span className="ax-gring-n">{displayProgress}%</span>
                  </div>
                  <div className="ax-gnums">
                    <small>{isAchieved && g.currentAmount === 0 ? 'Sisa dana' : 'Terkumpul'}</small>
                    <b>{formatRupiah(g.currentAmount)}</b>
                    <span>dari {formatRupiah(g.targetAmount)}</span>
                    <span>
                      {isAchieved
                        ? (g.currentAmount === 0 ? 'Dana telah dicairkan 🎉' : 'Target tercapai 🎉')
                        : isClosed
                          ? 'Target ditutup'
                          : `Sisa ${formatRupiah(remaining)}`}
                    </span>
                    {totalWithdrawn > 0 && (
                      <span className="text-rose-600 dark:text-[#FB7185] font-semibold">
                        Ditarik -{formatRupiah(totalWithdrawn)}
                      </span>
                    )}
                  </div>
                </div>

                {(g.deadline || (g.type === 'sinking_fund' && src)) && (
                  <div className="ax-gmeta">
                    {g.deadline && (
                      <div>
                        <Calendar className="w-3.5 h-3.5" />Jatuh tempo: <b>{g.deadline}</b>
                        {days !== null && status === 'active'
                          ? ` · ${days < 0 ? `lewat ${Math.abs(days)} hari` : days === 0 ? 'hari ini' : `${days} hari lagi`}`
                          : ''}
                      </div>
                    )}
                    {g.type === 'sinking_fund' && src && (
                      <div><Wallet className="w-3.5 h-3.5" />Akun sumber: <b>{src.name}</b></div>
                    )}
                  </div>
                )}

                {perMonth > 0 && <div className="ax-need">Perlu menyisihkan ± <b>{formatRupiah(perMonth)}</b> / bulan</div>}
                {status === 'active' && days !== null && days <= 0 && <div className="ax-need late">Tenggat telah lewat, sisa dana <b>{formatRupiah(remaining)}</b></div>}

                <div className="ax-ob-act" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                  {status === 'active' ? (
                    <>
                      <button type="button" className="brutal-btn brutal-btn-sand" onClick={() => p.onAllocate(g)}>
                        <Coins className="w-3.5 h-3.5" />Alokasikan dana
                      </button>
                      {p.onWithdraw && g.currentAmount > 0 && (
                        <button
                          type="button"
                          className="ax-iconbtn"
                          onClick={() => p.onWithdraw!(g)}
                          title="Tarik dana dari target ini"
                          aria-label={`Tarik dana target ${g.name}`}
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {p.onAutopilot && (
                        <button
                          type="button"
                          className={`ax-iconbtn ${p.autoOn?.(g.id) ? 'on' : ''}`}
                          onClick={() => p.onAutopilot!(g.id)}
                          aria-pressed={!!p.autoOn?.(g.id)}
                          title={p.autoOn?.(g.id) ? 'Autopilot aktif: ketuk untuk mengubah' : 'Otomatiskan setoran ke target ini'}
                          aria-label={`Autopilot target ${g.name}`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  ) : isAchieved ? (
                    g.currentAmount > 0 && p.onWithdraw ? (
                      <button type="button" className="brutal-btn brutal-btn-terracotta" onClick={() => p.onWithdraw!(g)}>
                        <ArrowUpRight className="w-3.5 h-3.5" />Tarik Dana ({formatRupiah(g.currentAmount)})
                      </button>
                    ) : (
                      <button type="button" className="brutal-btn brutal-btn-sand" disabled>
                        <Award className="w-3.5 h-3.5" />Target tercapai & dicairkan 🎉
                      </button>
                    )
                  ) : g.currentAmount > 0 && p.onWithdraw ? (
                    <button type="button" className="brutal-btn brutal-btn-terracotta" onClick={() => p.onWithdraw!(g)}>
                      <ArrowUpRight className="w-3.5 h-3.5" />Tarik Sisa Dana
                    </button>
                  ) : (
                    <button type="button" className="brutal-btn brutal-btn-ghost" disabled>
                      <Lock className="w-3.5 h-3.5" />Target ditutup
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
