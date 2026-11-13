import { useEffect, useState, type CSSProperties } from 'react';
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
    <section className="ax-ai" aria-live="polite">
      <div className="ax-ph">
        <h3>
          <span className="ax-ic" style={{ background: 'var(--accent-sand)' }}><Sparkles className="w-3.5 h-3.5" /></span>
          AI Insight
          <span className="ax-badge-s">{currentData.source === 'ai' ? 'Gemini' : 'Analisis lokal'}</span>
        </h3>
        <button type="button" className="ax-iconbtn" onClick={generateAiInsight} disabled={loading} title="Perbarui insight" aria-label="Perbarui insight">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

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
