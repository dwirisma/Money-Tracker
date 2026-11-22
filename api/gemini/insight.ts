import { GoogleGenAI, Type } from '@google/genai';

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

const GEMINI_LITE_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_DEEP_MODEL = 'gemini-4-hydrogen';

const ALLOWED_GEMINI_MODELS = new Set<string>([GEMINI_LITE_MODEL, GEMINI_DEEP_MODEL]);
const ALLOWED_CACHE_MINUTES = new Set<number>([10, 30, 60, 360]);
const DEFAULT_CACHE_MINUTES = 10;
const INSIGHT_CACHE_MAX_SIZE = 50;

const insightCache = new Map<
  string,
  { data: { bullets: string[]; extraTip: string }; createdAt: number }
>();

function parseRequestBody(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function resolveModelOrder(requestedModel: unknown, autoFallback: unknown): string[] {
  const primary =
    typeof requestedModel === 'string' && ALLOWED_GEMINI_MODELS.has(requestedModel)
      ? requestedModel
      : GEMINI_LITE_MODEL;
  const fallbackEnabled = autoFallback !== false;
  if (!fallbackEnabled) return [primary];
  const secondary = primary === GEMINI_LITE_MODEL ? GEMINI_DEEP_MODEL : GEMINI_LITE_MODEL;
  return [primary, secondary];
}

function resolveCacheMinutes(raw: unknown): number {
  const n = Number(raw);
  return ALLOWED_CACHE_MINUTES.has(n) ? n : DEFAULT_CACHE_MINUTES;
}

function resolveFocusStyle(raw: unknown): 'ringkas' | 'hemat' | 'tabungan' {
  if (raw === 'hemat' || raw === 'tabungan' || raw === 'ringkas') return raw;
  return 'ringkas';
}

function getFocusStyleInstruction(style: 'ringkas' | 'hemat' | 'tabungan'): string {
  switch (style) {
    case 'hemat':
      return 'Gaya Fokus: KETAT & AUDIT KEBOCORAN. Bersikap tajam dan kritis mengaudit potensi pemborosan, kebocoran anggaran kecil yang menumpuk, beban tagihan/utang, dan langkah pemangkasan biaya paling berdampak.';
    case 'tabungan':
      return 'Gaya Fokus: FOKUS TARGET & ARUS KAS. Prioritaskan strategi memaksimalkan surplus kas, meningkatkan rasio tabungan, mempercepat progres target Sinking Fund, dan menjaga momentum menabung.';
    case 'ringkas':
    default:
      return 'Gaya Fokus: RINGKAS & PRAKTIS. Gunakan bahasa luwes, padat (maksimal 1-2 kalimat per poin), langsung pada wawasan utama dan aksi praktis minggu ini.';
  }
}

function getGeminiClient(): GoogleGenAI | null {
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

function isModelNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();
  return lower.includes('not_found') || lower.includes('404');
}

function isTransientUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('504')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function attachExhaustedModels(err: unknown, exhaustedModels: string[]): Error {
  const base = err instanceof Error ? err : new Error(String(err || 'Unknown Gemini error'));
  (base as Error & { exhaustedModels?: string[] }).exhaustedModels = exhaustedModels;
  return base;
}

function getExhaustedModelsFromError(err: unknown): string[] {
  const list = (err as { exhaustedModels?: unknown })?.exhaustedModels;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

function extractReadableMessage(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const inner = parsed?.error?.message || parsed?.message;
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
    } catch {
      // ignore non-JSON
    }
  }
  return trimmed;
}

function normalizeGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err || 'Unknown error');
  const lower = msg.toLowerCase();

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('403') ||
    lower.includes('401')
  ) {
    return {
      status: 403,
      message: 'API key Gemini belum valid atau tidak memiliki izin. Periksa GEMINI_API_KEY di server.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      message: 'Kuota harian gratis Gemini API sedang habis. Coba lagi nanti atau gunakan API key dengan billing aktif.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      message: 'Model Gemini AI yang dipilih tidak ditemukan atau tidak tersedia.',
    };
  }
  if (isTransientUnavailableError(err)) {
    return {
      status: 503,
      message: 'Server Gemini AI sedang mengalami lonjakan trafik sementara (503). Silakan klik muat ulang beberapa saat lagi.',
    };
  }
  return {
    status: 500,
    message: extractReadableMessage(msg) || 'Gagal memproses permintaan dengan Gemini AI.',
  };
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
  models: string[]
) {
  let lastError: unknown;
  const exhaustedModels: string[] = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const maxAttempts = 2; // 1x retry cepat untuk lonjakan sementara 503 UNAVAILABLE
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          ...params,
        });
        return { response, modelUsed: model, exhaustedModels };
      } catch (err) {
        lastError = err;
        const quotaErr = isQuotaExceededError(err);
        const notFoundErr = isModelNotFoundError(err);
        const unavailableErr = isTransientUnavailableError(err);

        if (unavailableErr && attempt < maxAttempts) {
          console.warn(`[Gemini] Model ${model} busy (503), retrying attempt ${attempt + 1}...`);
          await sleep(800 * attempt);
          continue;
        }

        if (quotaErr) {
          exhaustedModels.push(model);
        }

        if ((quotaErr || notFoundErr || unavailableErr) && i < models.length - 1) {
          const reason = quotaErr ? '429' : notFoundErr ? '404' : '503';
          console.warn(`[Gemini] Model ${model} failed (${reason}), falling back to ${models[i + 1]}`);
          break;
        }

        throw attachExhaustedModels(err, exhaustedModels);
      }
    }
  }

  throw attachExhaustedModels(lastError, exhaustedModels);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    res.status(405).json({ error: 'Metode tidak diizinkan. Gunakan POST.' });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'Kunci GEMINI_API_KEY belum dikonfigurasi di server.',
    });
    return;
  }

  const body = parseRequestBody(req.body);
  const {
    ledgerName,
    totalInFormatted,
    totalOutFormatted,
    activeGoalNames,
    billsCount,
    debtsCount,
    model,
    autoFallback,
    cacheDurationMinutes,
    focusStyle,
  } = body;

  const insightModels = resolveModelOrder(model, autoFallback);
  const primaryModel = insightModels[0];
  const validCacheMinutes = resolveCacheMinutes(cacheDurationMinutes);
  const cacheTtlMs = validCacheMinutes * 60 * 1000;
  const validFocusStyle = resolveFocusStyle(focusStyle);

  const cacheKey = JSON.stringify({
    ledgerName: ledgerName || 'Utama',
    totalInFormatted: totalInFormatted || 'Rp 0',
    totalOutFormatted: totalOutFormatted || 'Rp 0',
    activeGoalNames: activeGoalNames || 'Belum ada',
    billsCount: Number(billsCount) || 0,
    debtsCount: Number(debtsCount) || 0,
    primaryModel,
    focusStyle: validFocusStyle,
  });

  const cached = insightCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < cacheTtlMs) {
    res.status(200).json({
      ...cached.data,
      _meta: {
        cached: true,
        modelUsed: primaryModel,
        exhaustedModels: [],
      },
    });
    return;
  }

  const prompt = `Anda adalah penasihat keuangan pribadi cerdas di aplikasi "Artha".
Buku Kas: ${ledgerName || 'Utama'}
Pemasukan bulan ini: ${totalInFormatted || 'Rp 0'}
Pengeluaran bulan ini: ${totalOutFormatted || 'Rp 0'}
Daftar target tabungan aktif: ${activeGoalNames || 'Belum ada'}
Jumlah tagihan rutin: ${Number(billsCount) || 0}, Jumlah cicilan utang: ${Number(debtsCount) || 0}

${getFocusStyleInstruction(validFocusStyle)}

TUGAS PENTING:
Berikan analisa keuangan yang kontekstual dan tidak kaku sesuai gaya fokus di atas. Berikan 3 hingga 4 poin utama yang relevan dengan data di atas:
1. Analisis pola pengeluaran atau kesehatan arus kas (awalin dengan emoji 💡)
2. Progres tabungan atau motivasi pencapaian target (awalin dengan emoji 📈)
3. Mitigasi kewajiban / tagihan / utang (awalin dengan emoji ⚡)
4. Rekomendasi aksi taktis minggu ini (awalin dengan emoji 🎯)
Dan sertakan "extraTip" berupa satu kalimat tips cerdas hemat/investasi maksimal 15 kata.`;

  try {
    const { response, modelUsed, exhaustedModels } = await generateContentWithFallback(
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
      insightModels
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
        createdAt: Date.now(),
      });
    }

    res.status(200).json({
      ...parsed,
      _meta: {
        cached: false,
        modelUsed,
        exhaustedModels,
      },
    });
  } catch (err) {
    const norm = normalizeGeminiError(err);
    const exhaustedModels = getExhaustedModelsFromError(err);
    if (norm.status === 429) {
      console.warn('[/api/gemini/insight] Quota exhausted (429):', norm.message);
    } else {
      console.error('[/api/gemini/insight] Error:', err);
    }
    res.status(norm.status).json({ error: norm.message, exhaustedModels });
  }
}
