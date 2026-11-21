import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Sparkles, RefreshCw, AlertCircle, X } from 'lucide-react';
import type { Account, Bill, Debt, Goal, Ledger, Transaction } from '../types';
import { formatRupiah } from '../utils/financeUtils';
import { useUI } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';
import { recordAiApiUsage } from '../services/settingsService';

interface Props {
  currentLedger: Ledger;
  transactions: Transaction[];
  goals: Goal[];
  bills: Bill[];
  debts: Debt[];
  accounts: Account[];
}

const TAGS = [
  { label: 'Pengeluaran', color: 'var(--accent-terracotta)' },
  { label: 'Tabungan', color: 'var(--accent-sand)' },
  { label: 'Kewajiban', color: 'var(--accent-blue)' },
  { label: 'Aksi', color: 'var(--accent-sage)' }
];

function splitEmoji(b: string): { icon: string; text: string } {
  const m = b.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*([\s\S]*)$/u);
  return m ? { icon: m[1], text: m[2] } : { icon: '✦', text: b };
}

interface InsightData {
  bullets: string[];
  extraTip?: string;
  source: 'ai' | 'local';
}

// Client-side cooldown cache agar mode 'auto' tidak berulang kali memanggil API saat berpindah tab/halaman
const clientInsightCache = new Map<string, { data: InsightData; fetchedAt: number }>();

export function AiInsightCard({
  currentLedger,
  transactions,
  goals,
  bills,
  debts,
  accounts: _accounts
}: Props) {
  const { aiSettings, theme } = useUI();
  const { uid } = useAuth();
  const [aiInsight, setAiInsight] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  // Simpan referensi data terbaru untuk pemanggilan auto yang ter-debounce agar tidak memicu loop per perubahan snapshot
  const latestDataRef = useRef({ currentLedger, transactions, goals, bills, debts, aiSettings, uid });
  latestDataRef.current = { currentLedger, transactions, goals, bills, debts, aiSettings, uid };

  // Fungsi kalkulasi statistik analitik lokal dinamis & tidak kaku
  function computeLocalInsight(): InsightData {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1. Hitung total pengeluaran dan kategori terbesar bulan ini
    const catMap: Record<string, number> = {};
    let totalExpenseThisMonth = 0;
    let totalIncomeThisMonth = 0;

    transactions.forEach(t => {
      if ((t.date || '').startsWith(ym)) {
        if (t.type === 'expense') {
          totalExpenseThisMonth += t.amount;
          const c = t.category || 'Lainnya';
          catMap[c] = (catMap[c] || 0) + t.amount;
        } else if (t.type === 'income') {
          totalIncomeThisMonth += t.amount;
        }
      }
    });

    const bullets: string[] = [];

    // Bullet 1: Analisa Pengeluaran / Arus Kas
    if (totalExpenseThisMonth > 0) {
      let topCategory = 'Pengeluaran Umum';
      let topCatAmount = 0;
      Object.entries(catMap).forEach(([cat, amt]) => {
        if (amt > topCatAmount) {
          topCatAmount = amt;
          topCategory = cat;
        }
      });
      const topCatPct = ((topCatAmount / totalExpenseThisMonth) * 100).toFixed(1);
      bullets.push(`💡 Kategori ${topCategory} mendominasi ${topCatPct}% dari total belanja bulan ini (${formatRupiah(topCatAmount)}).`);
    } else {
      bullets.push('💡 Arus kas bulan ini masih sangat bersih tanpa pengeluaran. Waktu ideal untuk mengunci tabungan awal bulan!');
    }

    // Bullet 2: Analisa Tabungan / Target Finansial
    const activeGoals = goals.filter(g => !g.isCompleted && g.targetAmount > 0);
    if (activeGoals.length > 0) {
      const topGoal = [...activeGoals].sort((a, b) => {
        const dA = a.deadline || '9999-99-99';
        const dB = b.deadline || '9999-99-99';
        return dA.localeCompare(dB);
      })[0];
      const pct = Math.round((topGoal.currentAmount / topGoal.targetAmount) * 100);
      bullets.push(`📈 Fokus tabungan aktif: ${topGoal.name} sudah terkumpul ${pct}%. Konsistensi kecil akan membawamu ke garis finish!`);
    } else if (totalIncomeThisMonth > totalExpenseThisMonth && totalIncomeThisMonth > 0) {
      const surplus = totalIncomeThisMonth - totalExpenseThisMonth;
      bullets.push(`📈 Arus kas surplus ${formatRupiah(surplus)}. Pertimbangkan menyisihkan dana ke Sinking Fund atau investasi.`);
    } else {
      bullets.push('📈 Siapkan alokasi target finansial baru di Modul Goals agar cash flow bulanan lebih terarah.');
    }

    // Bullet 3: Kewajiban & Tagihan
    const pendingBills = bills.filter(b => b.nextPaymentDate && b.nextPaymentDate.startsWith(ym));
    const pendingDebts = debts.filter(d => !d.isPaidOff);
    if (pendingBills.length > 0) {
      const totalBillsAmt = pendingBills.reduce((s, b) => s + (b.fixedAmount || b.lastNominal || 0), 0);
      bullets.push(`⚡ Ada ${pendingBills.length} tagihan rutin jatuh tempo bulan ini (~${formatRupiah(totalBillsAmt)}). Pastikan saldo di akun sumber tetap aman.`);
    } else if (pendingDebts.length > 0) {
      const totalDebtLeft = pendingDebts.reduce((s, d) => s + (d.remainingDebt || 0), 0);
      bullets.push(`⚡ Pantau ${pendingDebts.length} kewajiban cicilan (${formatRupiah(totalDebtLeft)}). Percepat pelunasan untuk meringankan beban bunga bulanan.`);
    } else {
      bullets.push('⚡ Beban kewajiban utang dan tagihan nol atau terkendali penuh. Posisi likuiditas kas sangat sehat!');
    }

    // Bullet 4: Rekomendasi Finansial Taktis
    if (totalIncomeThisMonth > 0) {
      const savingsRate = Math.round(((totalIncomeThisMonth - totalExpenseThisMonth) / totalIncomeThisMonth) * 100);
      if (savingsRate >= 20) {
        bullets.push(`🎯 Rasio tabunganmu mencapai ${savingsRate}%, melampaui target standar emas 20%. Pertahankan disiplin ini!`);
      } else if (savingsRate > 0) {
        bullets.push(`🎯 Rasio tabungan saat ini ${savingsRate}%. Coba alokasikan 5-10% tambahan ke pos dana darurat sebelum akhir bulan.`);
      } else {
        bullets.push(`🎯 Pengeluaran melampaui pemasukan bulan ini. Tinjau kembali pos pengeluaran fleksibel di Laporan Analitik.`);
      }
    } else {
      bullets.push('🎯 Catat pemasukan rutin begitu diterima agar evaluasi rasio tabungan otomatis terhitung.');
    }

    // Extra tip
    const tip = pendingBills.length > 0
      ? 'Jadwalkan auto-debit atau otomatisasi pengeluaran agar tidak terkena denda keterlambatan.'
      : 'Sisihkan minimal 10% pendapatan ke instrumen pasar uang untuk memperkuat dana darurat.';

    return {
      bullets,
      extraTip: tip,
      source: 'local'
    };
  }

  const generateAiInsight = useCallback(async (opts?: { respectClientCache?: boolean }) => {
    const snap = latestDataRef.current;
    if (snap.aiSettings.insightMode === 'off') return;
    if (inFlightRef.current) return;

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthTxs = snap.transactions.filter(t => (t.date || '').startsWith(ym));
    const totalIn = thisMonthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalOut = thisMonthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const activeGoalNames = snap.goals
      .filter(g => !g.isCompleted && g.targetAmount > 0)
      .map(g => `${g.name} (${Math.round((g.currentAmount / g.targetAmount) * 100)}%)`)
      .slice(0, 3)
      .join(', ');

    const clientCacheKey = JSON.stringify({
      ledgerId: snap.currentLedger.id,
      model: snap.aiSettings.primaryModel,
      focusStyle: snap.aiSettings.focusStyle,
    });
    const ttlMs = snap.aiSettings.cacheDurationMinutes * 60 * 1000;

    if (opts?.respectClientCache) {
      const cached = clientInsightCache.get(clientCacheKey);
      if (cached && Date.now() - cached.fetchedAt < ttlMs) {
        setAiInsight(cached.data);
        setErrorMsg(null);
        return;
      }
    }

    inFlightRef.current = true;
    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/gemini/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledgerName: snap.currentLedger.name,
          totalInFormatted: formatRupiah(totalIn),
          totalOutFormatted: formatRupiah(totalOut),
          activeGoalNames,
          billsCount: snap.bills.length,
          debtsCount: snap.debts.length,
          model: snap.aiSettings.primaryModel,
          autoFallback: snap.aiSettings.autoFallback,
          cacheDurationMinutes: snap.aiSettings.cacheDurationMinutes,
          focusStyle: snap.aiSettings.focusStyle,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 429 && snap.uid) {
          const exhaustedModels =
            Array.isArray(payload?.exhaustedModels) && payload.exhaustedModels.length > 0
              ? payload.exhaustedModels
              : [snap.aiSettings.primaryModel];
          void recordAiApiUsage(snap.uid, {
            cached: true,
            exhaustedModels,
          });
        }
        setErrorMsg(payload?.error || `Gagal memuat analisis Gemini AI (HTTP ${response.status}).`);
        return;
      }

      if (Array.isArray(payload?.bullets) && payload.bullets.length > 0) {
        if (snap.uid) {
          const meta = payload?._meta;
          void recordAiApiUsage(snap.uid, {
            modelUsed:
              typeof meta?.modelUsed === 'string'
                ? meta.modelUsed
                : snap.aiSettings.primaryModel,
            cached: Boolean(meta?.cached),
            exhaustedModels: Array.isArray(meta?.exhaustedModels) ? meta.exhaustedModels : [],
          });
        }
        const nextData: InsightData = {
          bullets: payload.bullets,
          extraTip: payload.extraTip || undefined,
          source: 'ai',
        };
        clientInsightCache.set(clientCacheKey, { data: nextData, fetchedAt: Date.now() });
        setAiInsight(nextData);
      } else {
        setErrorMsg('Gemini AI tidak mengembalikan poin analisis yang valid.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal terhubung ke server Gemini AI.';
      setErrorMsg(message);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  // Reset AI insight saat ganti buku kas, model, gaya fokus, atau ketika mode diset ke 'off'
  useEffect(() => {
    setAiInsight(null);
    setErrorMsg(null);
  }, [currentLedger.id, aiSettings.primaryModel, aiSettings.focusStyle, aiSettings.insightMode]);

  // Mode 'auto': jalankan otomatis saat Dashboard dimuat dengan debounce & menghormati durasi cache
  useEffect(() => {
    if (aiSettings.insightMode !== 'auto') return;

    const clientCacheKey = JSON.stringify({
      ledgerId: currentLedger.id,
      model: aiSettings.primaryModel,
      focusStyle: aiSettings.focusStyle,
    });
    const ttlMs = aiSettings.cacheDurationMinutes * 60 * 1000;
    const cached = clientInsightCache.get(clientCacheKey);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) {
      setAiInsight(cached.data);
      return;
    }

    const timer = window.setTimeout(() => {
      void generateAiInsight({ respectClientCache: true });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    aiSettings.insightMode,
    aiSettings.primaryModel,
    aiSettings.focusStyle,
    aiSettings.cacheDurationMinutes,
    currentLedger.id,
    generateAiInsight,
  ]);

  const localData = computeLocalInsight();
  const currentData =
    aiSettings.insightMode === 'off'
      ? localData
      : aiInsight
        ? { ...aiInsight, extraTip: aiInsight.extraTip || localData.extraTip }
        : localData;

  return (
    <section className="ax-ai" aria-live="polite">
      <div className="ax-ph">
        <h3>
          <span className="ax-ic" style={{ '--c': 'var(--accent-sand)', background: 'var(--accent-sand)' } as CSSProperties}><Sparkles className="w-3.5 h-3.5" /></span>
          AI Insight
          <span className="ax-badge-s">{currentData.source === 'ai' ? 'Gemini' : 'Analisis lokal'}</span>
        </h3>
        {aiSettings.insightMode !== 'off' && (
          <button
            type="button"
            className={`w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-60 cursor-pointer transition-all ${
              theme === 'dark'
                ? 'bg-[#1F2333] border border-white/[0.12] text-[#E2E8F0] hover:bg-[#262B3D] hover:border-white/[0.20] active:translate-x-0 active:translate-y-0'
                : 'bg-[#FFFDF7] border-2 border-[var(--border-color)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
            }`}
            onClick={() => void generateAiInsight({ respectClientCache: false })}
            disabled={loading}
            title="Analisis Gemini"
            aria-label="Analisis Gemini"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {errorMsg && aiSettings.insightMode !== 'off' && (
        <div
          role="alert"
          className="mb-3 flex items-start justify-between gap-2 rounded-xl border-2 border-[var(--border-color)] bg-[var(--accent-terracotta-dark)] dark:border dark:border-[#FB7185]/35 dark:bg-[rgba(244,63,94,0.14)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-terracotta)]" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            aria-label="Tutup pesan error"
            className="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="ax-ai-grid" data-loading={loading}>
        {currentData.bullets.map((b, idx) => {
          const { icon, text } = splitEmoji(b);
          const tag = TAGS[idx % TAGS.length];
          return (
            <article key={idx} className="ax-ai-tile" style={{ '--tag': tag.color } as CSSProperties}>
              <div className="ax-ai-top"><span className="ax-ai-ic" aria-hidden="true">{icon}</span><em>{tag.label}</em></div>
              <p>{text}</p>
            </article>
          );
        })}
      </div>

      {currentData.extraTip && (
        <p className="ax-ai-tip"><span aria-hidden="true">✦</span>{currentData.extraTip}</p>
      )}
    </section>
  );
}
