import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Lightbulb, TrendingUp, AlertTriangle } from 'lucide-react';
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
  bulletCategory: string;
  bulletGoal: string;
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

  // Fungsi kalkulasi statistik deterministik
  function computeLocalInsight(): InsightData {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1. Hitung total pengeluaran dan kategori terbesar bulan ini
    const catMap: Record<string, number> = {};
    let totalExpenseThisMonth = 0;

    transactions.forEach(t => {
      if (t.type === 'expense' && (t.date || '').startsWith(ym)) {
        totalExpenseThisMonth += t.amount;
        const c = t.category || 'Lainnya';
        catMap[c] = (catMap[c] || 0) + t.amount;
      }
    });

    let topCategory = 'Pengeluaran Umum';
    let topCatAmount = 0;
    Object.entries(catMap).forEach(([cat, amt]) => {
      if (amt > topCatAmount) {
        topCatAmount = amt;
        topCategory = cat;
      }
    });

    const topCatPct = totalExpenseThisMonth > 0 
      ? ((topCatAmount / totalExpenseThisMonth) * 100).toFixed(1)
      : '0.0';

    const bulletCat = totalExpenseThisMonth > 0
      ? `Kategori ${topCategory} adalah pengeluaran terbesar (${topCatPct}%).`
      : 'Belum ada pengeluaran tercatat di bulan ini.';

    // 2. Cari target tabungan (goal) paling prioritas / mendekati deadline
    const activeGoals = goals.filter(g => !g.isCompleted && g.targetAmount > 0);
    let bulletGoalStr = 'Semua target tabungan bulan ini tercapai dengan baik!';

    if (activeGoals.length > 0) {
      // Prioritaskan goal yang ada deadline terdekat atau progres terbesar
      const targetGoal = [...activeGoals].sort((a, b) => {
        const dA = a.deadline || '9999-99-99';
        const dB = b.deadline || '9999-99-99';
        return dA.localeCompare(dB);
      })[0];

      const pct = Math.round((targetGoal.currentAmount / targetGoal.targetAmount) * 100);
      bulletGoalStr = `Fokus tabungan bulan ini: ${targetGoal.name} (${pct}%). You can do it!`;
    }

    // 3. Tambahan cek tagihan / cicilan
    let tip: string | undefined;
    const pendingBills = bills.filter(b => b.nextPaymentDate && b.nextPaymentDate.startsWith(ym));
    if (pendingBills.length > 0) {
      tip = `Ada ${pendingBills.length} tagihan rutin jatuh tempo bulan ini. Pastikan saldo kas mencukupi.`;
    }

    return {
      bulletCategory: bulletCat,
      bulletGoal: bulletGoalStr,
      extraTip: tip,
      source: 'local'
    };
  }

  async function generateAiInsight() {
    setLoading(true);
    const local = computeLocalInsight();

    const apiKey = getGeminiKey();
    if (!apiKey) {
      // Fallback mulus tanpa error jika key belum dimasukkan
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

      const prompt = `Anda adalah asisten keuangan pribadi cerdas di aplikasi "Artha".
Buku Kas: ${currentLedger.name}
Pemasukan bulan ini: ${formatRupiah(totalIn)}
Pengeluaran bulan ini: ${formatRupiah(totalOut)}
Info Analisis Lokal:
- Pengeluaran terbesar: ${local.bulletCategory}
- Target tabungan: ${local.bulletGoal}
- Daftar target aktif: ${activeGoalNames || 'Tidak ada'}
- Jumlah tagihan: ${bills.length}, Jumlah cicilan utang: ${debts.length}

Tugas: Berikan insight keuangan yang RINGKAS, TAJAM, dan MEMOTIVASI dalam format JSON persis berikut:
{
  "bulletCategory": "Kategori [Nama] adalah pengeluaran terbesar (XX.X%).",
  "bulletGoal": "Fokus tabungan bulan ini: [Nama Target]. You can do it!",
  "extraTip": "[Satu kalimat tips cerdas hemat/investasi maksimal 15 kata]"
}
PENTING: Kalimat harus ramah, santai, gunakan bahasa Indonesia yang natural, dan jangan bertele-tele. Balas HANYA JSON.`;

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

      setInsight({
        bulletCategory: parsed.bulletCategory || local.bulletCategory,
        bulletGoal: parsed.bulletGoal || local.bulletGoal,
        extraTip: parsed.extraTip || local.extraTip,
        source: 'ai'
      });
    } catch (err) {
      console.warn('Gemini AI insight offline fallback:', err);
      // Fallback ke analisis lokal
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
    <div className="relative overflow-hidden rounded-2xl border-2 border-black dark:border-slate-700/80 bg-[#121826] text-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
      {/* Background subtle glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header Card */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">💡</span>
          <h3 className="font-heading font-black text-base sm:text-lg tracking-wide text-white">
            AI Insight
          </h3>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
            <Sparkles className="w-2.5 h-2.5" />
            Gemini
          </span>
        </div>

        <button
          type="button"
          onClick={generateAiInsight}
          disabled={loading}
          title="Perbarui insight"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
        </button>
      </div>

      {/* Bullets List persis seperti mockup gambar */}
      <div className="space-y-3.5 text-sm sm:text-base leading-relaxed">
        {/* Bullet 1: Pengeluaran terbesar */}
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0 mt-0.5">💡</span>
          <p className="text-slate-200 font-medium">
            {currentData.bulletCategory}
          </p>
        </div>

        {/* Bullet 2: Target tabungan bulan ini */}
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0 mt-0.5">📈</span>
          <p className="text-slate-200 font-medium">
            {currentData.bulletGoal}
          </p>
        </div>

        {/* Bullet 3: Optional smart tip */}
        {currentData.extraTip && (
          <div className="pt-2 mt-2 border-t border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-400">
            <span className="text-amber-400 font-bold shrink-0">✦</span>
            <p className="italic">{currentData.extraTip}</p>
          </div>
        )}
      </div>
    </div>
  );
}
