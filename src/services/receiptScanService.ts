/**
 * Artha Receipt & Document Scan Service
 * Mendukung foto kamera, galeri gambar (JPG/PNG/WebP/HEIC), dan dokumen struk/invoice (PDF/TXT/CSV)
 * melalui endpoint server-side /api/gemini/scan-receipt.
 */

export interface ReceiptItem {
  name: string;
  qty?: number;
  price: number;
}

export interface ReceiptData {
  amount: number;
  date: string | null;
  category: string | null;
  note: string | null;
  merchantName?: string | null;
  paymentMethod?: string | null;
  items?: ReceiptItem[];
}

export interface PreparedReceiptPayload {
  base64Data: string;
  mimeType: string;
  kind: 'image' | 'document';
  fileName: string;
  sizeLabel: string;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inferMimeType(file: File): string {
  const type = (file.type || '').toLowerCase().trim();
  if (type === 'image/jpg') return 'image/jpeg';
  if (type) return type;

  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.heif')) return 'image/heif';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.csv')) return 'text/csv';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file dari perangkat.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : '';
      if (!base64) {
        reject(new Error('Isi file tidak valid atau kosong.'));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

function compressImageToJpegBase64(file: File, maxSide = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Browser tidak bisa mendekode pratinjau gambar.'));
      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          if (!width || !height) {
            reject(new Error('Dimensi gambar tidak valid.'));
            return;
          }
          const scale = Math.min(1, maxSide / Math.max(width, height));

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas tidak tersedia.'));
            return;
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          const base64 = dataUrl.split(',')[1];
          if (!base64) {
            reject(new Error('Gagal mengonversi foto ke JPEG.'));
            return;
          }
          resolve(base64);
        } catch (err) {
          reject(err);
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Menyiapkan file gambar atau dokumen (PDF/TXT/CSV) untuk dikirim ke Gemini API server.
 */
export async function prepareReceiptPayload(file: File): Promise<PreparedReceiptPayload> {
  if (!file || file.size === 0) {
    throw new Error('File kosong atau tidak terbaca.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Ukuran file terlalu besar (${formatFileSize(file.size)}). Maksimal 15 MB.`);
  }

  const mime = inferMimeType(file);
  const sizeLabel = formatFileSize(file.size);
  const fileName = file.name || 'struk';

  const isDocument = mime === 'application/pdf' || mime === 'text/plain' || mime === 'text/csv';
  const isImage = mime.startsWith('image/');

  if (!isDocument && !isImage) {
    throw new Error(
      'Format file tidak didukung. Gunakan foto struk (JPG, PNG, WebP, HEIC) atau dokumen (PDF, TXT, CSV).'
    );
  }

  if (isDocument) {
    const base64Data = await readFileAsBase64(file);
    return {
      base64Data,
      mimeType: mime,
      kind: 'document',
      fileName,
      sizeLabel,
    };
  }

  // Untuk gambar: coba kompres ke JPEG agar tajam namun ringan; jika format seperti HEIC gagal didekode browser,
  // kirim file mentah agar Gemini memproses langsung.
  try {
    const base64Data = await compressImageToJpegBase64(file);
    return {
      base64Data,
      mimeType: 'image/jpeg',
      kind: 'image',
      fileName,
      sizeLabel,
    };
  } catch {
    const rawBase64 = await readFileAsBase64(file);
    return {
      base64Data: rawBase64,
      mimeType: mime || 'image/jpeg',
      kind: 'image',
      fileName,
      sizeLabel,
    };
  }
}

/**
 * Validasi dan normalisasi hasil pembacaan struk/dokumen dari server AI.
 */
export function parseReceiptData(raw: any, categories: string[]): ReceiptData {
  let data = raw;
  if (typeof raw === 'string') {
    const clean = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    try {
      data = JSON.parse(clean);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error('Jawaban AI tidak bisa dibaca. Pastikan foto atau dokumen struk jelas.');
      }
      data = JSON.parse(match[0]);
    }
  }

  let amount = 0;
  if (typeof data?.amount === 'number') {
    amount = Math.round(data.amount);
  } else if (typeof data?.amount === 'string') {
    const cleaned = data.amount.replace(/[^0-9]/g, '');
    amount = parseInt(cleaned, 10) || 0;
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e11) {
    throw new Error(
      'Total pembayaran tidak ditemukan di foto/dokumen ini. Pastikan angka total terlihat jelas atau isi nominal secara manual.'
    );
  }

  let date: string | null = null;
  if (typeof data?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    const t = new Date(data.date + 'T00:00:00');
    if (!Number.isNaN(t.getTime()) && data.date <= isoToday()) {
      date = data.date;
    }
  }

  let category: string | null = null;
  if (typeof data?.category === 'string' && data.category.trim()) {
    const target = data.category.trim().toLowerCase();
    const exactMatch = categories.find((c) => c.toLowerCase() === target);
    const partialMatch =
      exactMatch ||
      categories.find(
        (c) => c.toLowerCase().includes(target) || target.includes(c.toLowerCase())
      );
    category = partialMatch || data.category.trim();
  }

  const merchant =
    typeof data?.merchantName === 'string' && data.merchantName.trim()
      ? data.merchantName.trim().slice(0, 50)
      : null;

  const rawNote =
    typeof data?.note === 'string' && data.note.trim()
      ? data.note.trim().slice(0, 60)
      : merchant;

  const paymentMethod =
    typeof data?.paymentMethod === 'string' && data.paymentMethod.trim()
      ? data.paymentMethod.trim().slice(0, 30)
      : null;

  const items: ReceiptItem[] | undefined = Array.isArray(data?.items)
    ? data.items
        .filter((it: any) => it && typeof it.name === 'string' && it.name.trim())
        .map((it: any) => ({
          name: String(it.name).trim(),
          qty: typeof it.qty === 'number' && it.qty > 0 ? it.qty : undefined,
          price: typeof it.price === 'number' ? Math.round(it.price) : 0,
        }))
        .slice(0, 20)
    : undefined;

  return {
    amount,
    date: date || isoToday(),
    category,
    note: rawNote,
    merchantName: merchant,
    paymentMethod,
    items: items && items.length > 0 ? items : undefined,
  };
}

/**
 * Memindai foto atau dokumen struk melalui backend /api/gemini/scan-receipt
 */
export async function scanReceipt(file: File, categories: string[]): Promise<ReceiptData> {
  const payload = await prepareReceiptPayload(file);

  const response = await fetch('/api/gemini/scan-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Data: payload.base64Data,
      mimeType: payload.mimeType,
      filename: payload.fileName,
      categories,
      todayDate: isoToday(),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body?.error === 'string' && body.error
        ? body.error
        : `Gagal memindai struk (status ${response.status}).`
    );
  }

  return parseReceiptData(body, categories);
}
