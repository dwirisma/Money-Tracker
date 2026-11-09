/** Scan struk lewat Gemini (REST langsung dari browser dengan kunci milik pengguna). Hasil selalu diperiksa sebelum dipakai. */
export interface ReceiptData { amount: number; date: string | null; category: string | null; note: string | null }
export interface GeminiOpts { apiKey: string; model: string }

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Validasi & normalisasi jawaban model. Melempar Error jika total belanja tidak masuk akal. */
export function parseReceiptJson(text: string, categories: string[]): ReceiptData {
  let raw: any;
  try { raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); }
  catch { throw new Error('Jawaban AI tidak bisa dibaca. Coba foto yang lebih jelas.'); }

  const amount = Math.round(Number(raw?.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e10) throw new Error('Total belanja tidak terbaca di struk ini.');

  let date: string | null = null;
  if (typeof raw?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    const t = new Date(raw.date + 'T00:00:00');
    const valid = !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === raw.date;
    if (valid && raw.date <= isoToday()) date = raw.date; // tanggal di masa depan dianggap salah baca
  }
  const category = typeof raw?.category === 'string' ? categories.find(c => c.toLowerCase() === raw.category.trim().toLowerCase()) ?? null : null;
  const note = typeof raw?.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 60) : null;
  return { amount, date, category, note };
}

function endpoint(model: string) { return `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`; }

async function call(body: unknown, { apiKey, model }: GeminiOpts): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res: Response;
  try {
    res = await fetch(endpoint(model), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    throw new Error(e instanceof DOMException && e.name === 'AbortError' ? 'Permintaan ke Gemini terlalu lama (timeout).' : 'Tidak bisa terhubung ke Gemini. Periksa koneksi internet.');
  } finally { clearTimeout(timer); }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Gemini menolak permintaan (${res.status}): ${data?.error?.message ?? 'tanpa keterangan'}`);
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new Error(data?.promptFeedback?.blockReason ? `Gemini memblokir gambar (${data.promptFeedback.blockReason}).` : 'Gemini tidak memberi jawaban.');
  return text;
}

export async function requestReceipt(base64Jpeg: string, categories: string[], opts: GeminiOpts): Promise<ReceiptData> {
  const prompt = `Ini foto struk belanja berbahasa Indonesia. Tanggal hari ini ${isoToday()}.
Balas HANYA JSON dengan field:
- amount: TOTAL AKHIR yang dibayar (setelah pajak/diskon) sebagai bilangan bulat Rupiah, tanpa titik/koma.
- date: tanggal transaksi format YYYY-MM-DD, atau null jika tidak terbaca.
- category: pilih TEPAT satu dari [${categories.join(', ')}], atau null jika ragu.
- note: nama toko/merchant singkat (maks 40 karakter), atau null.
Jika gambar bukan struk, isi amount dengan 0.`;
  const text = await call({
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { amount: { type: 'INTEGER' }, date: { type: 'STRING', nullable: true }, category: { type: 'STRING', nullable: true }, note: { type: 'STRING', nullable: true } }, required: ['amount'] } },
  }, opts);
  return parseReceiptJson(text, categories);
}

/** Perkecil foto (maks 1280px) agar unggahan ringan, lalu ubah ke base64 JPEG. */
export async function fileToJpegBase64(file: File, maxSide = 1280): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('File harus berupa gambar.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
}

export async function scanReceipt(file: File, categories: string[], opts: GeminiOpts): Promise<ReceiptData> {
  return requestReceipt(await fileToJpegBase64(file), categories, opts);
}

/** Uji kunci + nama model dengan permintaan teks singkat. */
export async function testGemini(opts: GeminiOpts): Promise<void> {
  await call({ contents: [{ parts: [{ text: 'Balas satu kata: OK' }] }], generationConfig: { temperature: 0, maxOutputTokens: 16 } }, opts);
}
