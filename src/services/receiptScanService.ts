/**
 * Artha Receipt Scan Service
 * Menggunakan @google/genai dan model Vision gemini-2.5-flash untuk membaca struk belanja Indonesia
 */
import { GoogleGenAI } from '@google/genai';
import { getGeminiKey, getGeminiModel } from './geminiSettings';

export interface ReceiptData {
  amount: number;
  date: string | null;
  category: string | null;
  note: string | null;
  merchantName?: string | null;
  items?: Array<{ name: string; price: number }>;
}

export interface GeminiOpts {
  apiKey?: string;
  model?: string;
}

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Validasi dan normalisasi jawaban model AI
 */
export function parseReceiptJson(text: string, categories: string[]): ReceiptData {
  let raw: any;
  try {
    const clean = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    raw = JSON.parse(clean);
  } catch {
    // Coba regex cari object JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        raw = JSON.parse(match[0]);
      } catch {
        throw new Error('Jawaban AI tidak bisa dibaca. Pastikan foto struk cukup terang dan jelas.');
      }
    } else {
      throw new Error('Tidak menemukan data struk yang valid. Coba ambil foto lebih dekat dan tegak lurus.');
    }
  }

  // Bersihkan angka total nominal
  let amount = 0;
  if (typeof raw?.amount === 'number') {
    amount = Math.round(raw.amount);
  } else if (typeof raw?.amount === 'string') {
    const cleaned = raw.amount.replace(/[^0-9]/g, '');
    amount = parseInt(cleaned, 10) || 0;
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e11) {
    throw new Error('Total pembayaran di struk tidak terbaca atau 0. Silakan masukkan nominal manual.');
  }

  // Tanggal transaksi
  let date: string | null = null;
  if (typeof raw?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    const t = new Date(raw.date + 'T00:00:00');
    const valid = !Number.isNaN(t.getTime());
    if (valid && raw.date <= isoToday()) {
      date = raw.date;
    }
  }

  // Kategori yang cocok
  let category: string | null = null;
  if (typeof raw?.category === 'string' && raw.category.trim()) {
    const userCat = categories.find(
      c => c.toLowerCase() === raw.category.trim().toLowerCase()
    );
    category = userCat || raw.category.trim();
  }

  // Nama merchant / keterangan
  let note: string | null = null;
  const merchant = raw?.merchantName || raw?.note;
  if (typeof merchant === 'string' && merchant.trim()) {
    note = merchant.trim().slice(0, 60);
  }

  return {
    amount,
    date: date || isoToday(),
    category,
    note,
    merchantName: note,
    items: Array.isArray(raw?.items) ? raw.items : undefined
  };
}

/**
 * Kompresi dan convert file gambar ke Base64 JPEG dengan aman di semua browser mobile
 */
export async function fileToJpegBase64(file: File, maxSide = 1280): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File yang diunggah harus berupa gambar (JPG, PNG, WebP, HEIC).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung atau foto rusak.'));
      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          const scale = Math.min(1, maxSide / Math.max(width, height));
          
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas konteks tidak tersedia.'));
            return;
          }

          // Background putih untuk transparansi
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const base64 = dataUrl.split(',')[1];
          if (!base64) {
            reject(new Error('Gagal mengonversi gambar ke base64.'));
            return;
          }
          resolve(base64);
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Pindai struk belanja dengan Gemini AI Vision
 */
export async function requestReceipt(
  base64Jpeg: string,
  categories: string[],
  opts?: GeminiOpts
): Promise<ReceiptData> {
  const apiKey = (opts?.apiKey || getGeminiKey() || '').trim();
  if (!apiKey) {
    throw new Error('Kunci Gemini API belum diatur. Masukkan API key di menu Pengaturan.');
  }

  const modelName = opts?.model || getGeminiModel() || 'gemini-2.5-flash';

  const prompt = `Anda adalah sistem OCR cerdas khusus struk kasir dan faktur belanja di Indonesia.
Hari ini adalah tanggal ${isoToday()}.

Kategori pengeluaran pengguna yang tersedia:
[${categories.join(', ')}]

Instruksi Analisis Struk:
1. Temukan TOTAL AKHIR yang benar-benar harus dibayar konsumen (biasanya berlabel "TOTAL", "GRAND TOTAL", "TOTAL TAGIHAN", "TUNAI", "DEBIT", atau "QRIS"), bukan subtotal sebelum diskon atau kembalian.
2. Temukan TANGGAL transaksi struk (format: YYYY-MM-DD). Jika tidak ada tahun, gunakan tahun sekarang.
3. Temukan NAMA TOKO/MERCHANT (misal: "Indomaret", "Alfamart", "Superindo", "SPBU Pertamina", "Starbucks", dll).
4. Pilih SATU kategori yang paling cocok dari daftar kategori di atas.

Kembalikan jawaban HANYA dalam format JSON valid tanpa format markdown tambahan:
{
  "amount": (angka total belanja berupa integer tanpa titik/koma rupiah),
  "date": "YYYY-MM-DD",
  "category": "Kategori Terpilih",
  "note": "Nama Toko / Keterangan Belanja",
  "merchantName": "Nama Toko"
}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Jpeg
              }
            }
          ]
        }
      ]
    });

    const responseText = response.text || '';
    if (!responseText) {
      throw new Error('Gemini tidak memberikan respon teks.');
    }

    return parseReceiptJson(responseText, categories);
  } catch (err: any) {
    console.error('Scan receipt error:', err);
    const msg = err?.message || '';
    if (msg.includes('API_KEY_INVALID') || msg.includes('403')) {
      throw new Error('Kunci API Gemini tidak valid atau kuota habis. Silakan periksa kunci di Pengaturan.');
    }
    if (msg.includes('429')) {
      throw new Error('Batas kuota Gemini tercapai. Silakan coba lagi beberapa saat.');
    }
    throw new Error(msg || 'Gagal memproses struk dengan Gemini AI.');
  }
}

export async function scanReceipt(
  file: File,
  categories: string[],
  opts?: GeminiOpts
): Promise<ReceiptData> {
  const base64 = await fileToJpegBase64(file);
  return requestReceipt(base64, categories, opts);
}

/**
 * Uji konektivitas kunci Gemini
 */
export async function testGemini(opts: GeminiOpts): Promise<void> {
  const apiKey = (opts?.apiKey || getGeminiKey() || '').trim();
  if (!apiKey) throw new Error('API Key belum diisi');

  const ai = new GoogleGenAI({ apiKey });
  const modelName = opts?.model || getGeminiModel() || 'gemini-2.5-flash';
  const res = await ai.models.generateContent({
    model: modelName,
    contents: 'Balas hanya satu kata: OK'
  });

  if (!res.text) throw new Error('Tidak ada respon dari model');
}
