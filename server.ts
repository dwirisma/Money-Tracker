import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_PRIMARY_MODEL = 'gemini-4-hydrogen';
const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

const INSIGHT_CACHE_TTL_MS = 10 * 60 * 1000;
const INSIGHT_CACHE_MAX_SIZE = 50;
const insightCache = new Map<string, { data: { bullets: string[]; extraTip: string }; expiresAt: number }>();

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
]);

function getGeminiClient() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isQuotaExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();
  return lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota');
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
  models: string[]
) {
  let lastError: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      return await ai.models.generateContent({
        model,
        ...params,
      });
    } catch (err) {
      lastError = err;
      const hasNext = i < models.length - 1;
      if (hasNext && isQuotaExceededError(err)) {
        console.warn(`[Gemini] Quota exhausted on ${model}, falling back to ${models[i + 1]}`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function normalizeGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err || 'Unknown error');
  const lower = msg.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403') || lower.includes('401')) {
    return {
      status: 403,
      message: 'API key Gemini belum valid atau tidak memiliki izin. Periksa GEMINI_API_KEY di menu Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      message: 'Kuota harian gratis Gemini API sedang habis. Coba lagi nanti atau gunakan API key dengan billing aktif di Settings > Secrets.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      message: `Model AI (${GEMINI_PRIMARY_MODEL}) tidak ditemukan atau tidak tersedia.`,
    };
  }
  if (lower.includes('payload') || lower.includes('too large') || lower.includes('size')) {
    return {
      status: 413,
      message: 'Ukuran file struk/dokumen terlalu besar. Coba kompres atau gunakan foto yang lebih kecil.',
    };
  }
  return {
    status: 500,
    message: msg || 'Gagal memproses permintaan dengan Gemini AI.',
  };
}

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    });
  });

  // Scan struk / dokumen (gambar atau PDF/teks) via Gemini Vision/Multimodal
  app.post('/api/gemini/scan-receipt', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Kunci GEMINI_API_KEY belum dikonfigurasi di server (Settings > Secrets).',
      });
      return;
    }

    const { base64Data, mimeType, categories, todayDate } = req.body ?? {};
    if (typeof base64Data !== 'string' || !base64Data.trim()) {
      res.status(400).json({ error: 'Data file struk atau dokumen tidak boleh kosong.' });
      return;
    }

    let normalizedMime = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : 'image/jpeg';
    if (normalizedMime === 'image/jpg') normalizedMime = 'image/jpeg';

    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      res.status(400).json({
        error: `Format file (${normalizedMime}) belum didukung. Gunakan foto (JPG, PNG, WebP, HEIC) atau dokumen PDF.`,
      });
      return;
    }

    const categoryList: string[] = Array.isArray(categories)
      ? categories.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];

    const referenceDate =
      typeof todayDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayDate)
        ? todayDate
        : isoToday();

    const prompt = `Anda adalah sistem OCR & ekstraksi data keuangan cerdas khusus struk belanja, bukti transfer, e-receipt, dan faktur PDF di Indonesia.
Tanggal referensi hari ini adalah ${referenceDate}.

Daftar kategori pengeluaran yang tersedia:
[${categoryList.length > 0 ? categoryList.join(', ') : 'Makanan & Minuman, Belanja Harian, Transportasi, Tagihan & Utang, Kesehatan, Hiburan, Lainnya'}]

Instruksi Analisis Dokumen/Foto Struk:
1. Perhatikan foto yang mungkin miring, kurang cahaya, struk thermal kasir, screenshot QRIS/e-wallet/mobile banking, atau invoice dokumen PDF multi-halaman.
2. Temukan TOTAL AKHIR yang benar-benar dibayar konsumen (cari label "TOTAL", "GRAND TOTAL", "TOTAL BAYAR", "TOTAL TAGIHAN", "NOMINAL TRANSFER", "TUNAI", "DEBIT", atau "QRIS"). JANGAN mengambil subtotal sebelum diskon, total item sebelum PPN, ataupun nominal kembalian.
3. Ekstrak dalam Rupiah bulat (integer tanpa titik/koma, misal Rp 45.500 -> 45500). Jika dokumen tidak berisi nominal transaksi sama sekali, isi 0.
4. Temukan TANGGAL transaksi dan konversi ke format YYYY-MM-DD. Jika tahun tidak tercantum, gunakan tahun dari ${referenceDate}. Jika tidak ada tanggal, kosongkan string "".
5. Temukan NAMA TOKO / MERCHANT / PENERIMA (misal: "Indomaret", "Alfamart", "Superindo", "Pertamina", "GrabFood", "PLN", "BCA Transfer ke ...").
6. Pilih SATU kategori yang paling relevan dari daftar kategori di atas.
7. Buat ringkasan singkat untuk catatan transaksi (field "note") maksimal 60 karakter, misalnya nama merchant + item utama.
8. Jika rincian item belanja terlihat, daftarkan pada array "items" (nama item, qty, harga subtotal item tersebut dalam integer).`;

    try {
      const response = await generateContentWithFallback(
        ai,
        {
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: normalizedMime,
                  data: base64Data,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                amount: {
                  type: Type.INTEGER,
                  description: 'Total pembayaran akhir dalam Rupiah bulat tanpa tanda baca.',
                },
                date: {
                  type: Type.STRING,
                  description: 'Tanggal transaksi format YYYY-MM-DD, atau string kosong jika tidak terbaca.',
                },
                category: {
                  type: Type.STRING,
                  description: 'Satu kategori pengeluaran yang paling cocok dari daftar yang tersedia.',
                },
                merchantName: {
                  type: Type.STRING,
                  description: 'Nama toko, merchant, atau penerima pembayaran.',
                },
                note: {
                  type: Type.STRING,
                  description: 'Ringkasan singkat transaksi maksimal 60 karakter.',
                },
                paymentMethod: {
                  type: Type.STRING,
                  description: 'Metode pembayaran jika terlihat (misal QRIS, Tunai, Debit, Transfer), atau kosong.',
                },
                items: {
                  type: Type.ARRAY,
                  description: 'Daftar item belanja jika tertera di struk atau invoice.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      qty: { type: Type.NUMBER },
                      price: { type: Type.INTEGER },
                    },
                  },
                },
              },
              required: ['amount', 'date', 'category', 'merchantName', 'note'],
            },
          },
        },
        [GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL]
      );

      const rawText = (response.text || '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Gemini AI tidak mengembalikan hasil pembacaan struk.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err) {
      const norm = normalizeGeminiError(err);
      if (norm.status === 429) {
        console.warn('[/api/gemini/scan-receipt] Quota exhausted (429):', norm.message);
      } else {
        console.error('[/api/gemini/scan-receipt] Error:', err);
      }
      res.status(norm.status).json({ error: norm.message });
    }
  });

  // AI Financial Insight (Dashboard)
  app.post('/api/gemini/insight', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Kunci GEMINI_API_KEY belum dikonfigurasi di server.',
      });
      return;
    }

    const { ledgerName, totalInFormatted, totalOutFormatted, activeGoalNames, billsCount, debtsCount } = req.body ?? {};

    const cacheKey = JSON.stringify({
      ledgerName: ledgerName || 'Utama',
      totalInFormatted: totalInFormatted || 'Rp 0',
      totalOutFormatted: totalOutFormatted || 'Rp 0',
      activeGoalNames: activeGoalNames || 'Belum ada',
      billsCount: Number(billsCount) || 0,
      debtsCount: Number(debtsCount) || 0,
    });

    const cached = insightCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    const prompt = `Anda adalah penasihat keuangan pribadi cerdas di aplikasi "Artha".
Buku Kas: ${ledgerName || 'Utama'}
Pemasukan bulan ini: ${totalInFormatted || 'Rp 0'}
Pengeluaran bulan ini: ${totalOutFormatted || 'Rp 0'}
Daftar target tabungan aktif: ${activeGoalNames || 'Belum ada'}
Jumlah tagihan rutin: ${Number(billsCount) || 0}, Jumlah cicilan utang: ${Number(debtsCount) || 0}

TUGAS PENTING:
Berikan analisa keuangan yang luwes, santai, tajam, kontekstual, dan tidak kaku. Berikan 3 hingga 4 poin utama yang relevan dengan data di atas:
1. Analisis pola pengeluaran atau kesehatan arus kas (awalin dengan emoji 💡)
2. Progres tabungan atau motivasi pencapaian target (awalin dengan emoji 📈)
3. Mitigasi kewajiban / tagihan / utang (awalin dengan emoji ⚡)
4. Rekomendasi aksi taktis minggu ini (awalin dengan emoji 🎯)
Dan sertakan "extraTip" berupa satu kalimat tips cerdas hemat/investasi maksimal 15 kata.`;

    try {
      const response = await generateContentWithFallback(
        ai,
        {
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                bullets: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                extraTip: {
                  type: Type.STRING,
                },
              },
              required: ['bullets', 'extraTip'],
            },
          },
        },
        [GEMINI_FALLBACK_MODEL, GEMINI_PRIMARY_MODEL]
      );

      const rawText = (response.text || '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Gemini AI tidak mengembalikan respon insight.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed?.bullets) && parsed.bullets.length > 0) {
        if (insightCache.size >= INSIGHT_CACHE_MAX_SIZE) {
          const oldestKey = insightCache.keys().next().value;
          if (oldestKey !== undefined) insightCache.delete(oldestKey);
        }
        insightCache.set(cacheKey, {
          data: parsed,
          expiresAt: Date.now() + INSIGHT_CACHE_TTL_MS,
        });
      }
      res.json(parsed);
    } catch (err) {
      const norm = normalizeGeminiError(err);
      if (norm.status === 429) {
        console.warn('[/api/gemini/insight] Quota exhausted (429):', norm.message);
      } else {
        console.error('[/api/gemini/insight] Error:', err);
      }
      res.status(norm.status).json({ error: norm.message });
    }
  });

  // Mount Vite middleware in development, or serve static dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Artha server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
