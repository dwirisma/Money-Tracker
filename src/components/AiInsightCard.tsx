import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import type { Account, Bill, Debt, Goal, Ledger, Transaction } from '../types';
import { formatRupiah } from '../utils/calculator';
import { getGeminiKey, getGeminiModel } from '../services/geminiSettings';
import { GoogleGenAI } from '@google/genai';

interface Props {
  currentLedger: Ledger;
  transactions: Transaction[];
  goals: Goal[];
  bills: Bill[];
  debts: Debt[];
  accounts: Account[];
}

interface InsightData {
  bullets: string[];
  extraTip?: string;
  source: 'ai' | 'local';
}

export function AiInsightCard({
  currentLedger,
  transactions,
  goals,
  bills,
  debts,
  accounts: _accounts
}: Props) {
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

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

  async function generateAiInsight() {
    setLoading(true);
    const local = computeLocalInsight();

    const apiKey = getGeminiKey();
    if (!apiKey) {
      setInsight(local);
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const thisMonthTxs = transactions.filter(t => (t.date || '').startsWith(ym));
      const totalIn = thisMonthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const totalOut = thisMonthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

      const activeGoalNames = goals
        .filter(g => !g.isCompleted)
        .map(g => `${g.name} (${Math.round((g.currentAmount / g.targetAmount) * 100)}%)`)
        .slice(0, 3)
        .join(', ');

      const prompt = `Anda adalah penasihat keuangan pribadi cerdas di aplikasi "Artha".
Buku Kas: ${currentLedger.name}
Pemasukan bulan ini: ${formatRupiah(totalIn)}
Pengeluaran bulan ini: ${formatRupiah(totalOut)}
Daftar target tabungan aktif: ${activeGoalNames || 'Belum ada'}
Jumlah tagihan rutin: ${bills.length}, Jumlah cicilan utang: ${debts.length}

TUGAS PENTING:
Berikan analisa keuangan yang luwes, santai, tajam, kontekstual, dan tidak kaku (jangan pakai template robotik berulang-ulang). Berikan 3 hingga 4 poin utama yang beragam dan relevan dengan data di atas:
1. Analisis pola pengeluaran atau kesehatan arus kas
2. Progres tabungan atau motivasi pencapaian target
3. Mitigasi kewajiban / tagihan / utang
4. Rekomendasi aksi taktis minggu ini

Kembalikan jawaban HANYA dalam format JSON valid:
{
  "bullets": [
    "💡 [Poin 1: Analisis pengeluaran / kebiasaan belanja]",
    "📈 [Poin 2: Analisis tabungan / motivasi target]",
    "⚡ [Poin 3: Analisis kewajiban / tagihan / mitigasi]",
    "🎯 [Poin 4: Saran langkah taktis]"
  ],
  "extraTip": "[Satu kalimat tips cerdas hemat/investasi maksimal 15 kata]"
}`;

      const ai = new GoogleGenAI({ apiKey });
      const modelName = getGeminiModel() || 'gemini-2.5-flash';
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text || '';
      const cleanJson = responseText.replace(/```(?:json)?/gi, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (Array.isArray(parsed.bullets) && parsed.bullets.length > 0) {
        setInsight({
          bullets: parsed.bullets,
          extraTip: parsed.extraTip || local.extraTip,
          source: 'ai'
        });
      } else {
        setInsight(local);
      }
    } catch (err) {
      console.warn('Gemini AI insight offline fallback:', err);
      setInsight(local);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    generateAiInsight();
  }, [transactions.length, goals.length, bills.length, debts.length, currentLedger.id]);

  const currentData = insight || computeLocalInsight();

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-3.5 shadow-[var(--shadow-md)] transition-colors">
      {/* Background subtle glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-400/10 dark:bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header Card */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <span className="text-xl">💡</span>
          <h3 className="font-heading font-black text-sm sm:text-lg tracking-wide text-[var(--text-primary)]">
            AI Insight
          </h3>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-400/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-400/30">
            <Sparkles className="w-2.5 h-2.5" />
            Gemini
          </span>
        </div>

        <button
          type="button"
          onClick={generateAiInsight}
          disabled={loading}
          title="Perbarui insight"
          className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-500' : ''}`} />
        </button>
      </div>

      {/* Bullets List Dinamis & Natural */}
      <div className="space-y-3 text-sm sm:text-sm leading-relaxed">
        {currentData.bullets.map((b, idx) => (
          <div key={idx} className="flex items-start gap-2.5">
            <p className="text-[var(--text-primary)] font-medium">
              {b}
            </p>
          </div>
        ))}

        {/* Optional smart tip */}
        {currentData.extraTip && (
          <div className="pt-2 mt-2 border-t border-[var(--border-subtle)] flex items-start gap-2 text-xs text-[var(--text-secondary)]">
            <span className="text-amber-500 font-bold shrink-0">✦</span>
            <p className="italic">{currentData.extraTip}</p>
          </div>
        )}
      </div>
    </div>
  );
}
