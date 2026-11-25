/**
 * Artha Receipt & Document Scan Service
 * Mendukung foto kamera, galeri gambar (JPG/PNG/WebP/HEIC), dan dokumen struk/invoice (PDF/TXT/CSV)
 * melalui endpoint server-side /api/gemini/scan-receipt.
 */
import { recordAiApiUsage } from './settingsService';

export interface ReceiptItem {
  name: string;
  qty: number;
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
export async function prepareReceiptPayload(
  file: File,
  options?: { compressImage?: boolean }
): Promise<PreparedReceiptPayload> {
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

  const shouldCompress = options?.compressImage !== false;

  if (!shouldCompress) {
    const rawBase64 = await readFileAsBase64(file);
    return {
      base64Data: rawBase64,
      mimeType: mime || 'image/jpeg',
      kind: 'image',
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

  const parseItemQty = (rawQty: unknown): number => {
    if (typeof rawQty === 'number' && Number.isFinite(rawQty) && rawQty > 0) {
      return Math.round(rawQty * 100) / 100;
    }
    if (typeof rawQty === 'string') {
      const cleaned = rawQty.replace(',', '.').replace(/[^0-9.]/g, '');
      const parsed = parseFloat(cleaned);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed * 100) / 100;
      }
    }
    return 1;
  };

  const parseItemPrice = (rawPrice: unknown): number => {
    if (typeof rawPrice === 'number' && Number.isFinite(rawPrice)) {
      return Math.max(0, Math.round(rawPrice));
    }
    if (typeof rawPrice === 'string') {
      const cleaned = rawPrice.replace(/[^0-9]/g, '');
      const parsed = parseInt(cleaned, 10);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }
    return 0;
  };

  const items: ReceiptItem[] | undefined = Array.isArray(data?.items)
    ? data.items
        .filter((it: any) => it && typeof it.name === 'string' && it.name.trim())
        .map((it: any): ReceiptItem => ({
          name: String(it.name).trim(),
          qty: parseItemQty(it.qty),
          price: parseItemPrice(it.price),
        }))
        .slice(0, 40)
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

const receiptIdrFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
});

/**
 * Menyusun teks terstruktur untuk kolom "Catatan (Opsional)" dari hasil scan struk:
 * - Jika ada daftar item:
 *   [Nama Merchant/Toko] ([Jumlah] item):
 *   • [Nama Item] ([qty]x) - Rp [Harga terformat titik]
 * - Jika tidak ada item (misal bukti transfer): gunakan ringkasan deskripsi singkat seperti sebelumnya.
 */
export function formatReceiptItemsNote(
  data: Pick<ReceiptData, 'merchantName' | 'note' | 'items'>
): string {
  const items = Array.isArray(data.items)
    ? data.items.filter((it) => it && it.name && it.name.trim().length > 0)
    : [];

  if (items.length === 0) {
    return (data.note || data.merchantName || '').trim();
  }

  const merchantLabel = data.merchantName?.trim() || 'Belanja Struk';
  const header = `${merchantLabel} (${items.length} item):`;
  const lines = items.map((item) => {
    const qty = Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 1;
    const price = Number.isFinite(item.price) && item.price > 0 ? Math.round(item.price) : 0;
    const formattedPrice = receiptIdrFormatter.format(price);
    return `• ${item.name.trim()} (${qty}x) - Rp ${formattedPrice}`;
  });

  return [header, ...lines].join('\n');
}

export interface ReceiptScanAiOptions {
  uid?: string | null;
  primaryModel?: 'gemini-3.1-flash-lite' | 'gemini-4-hydrogen';
  autoFallback?: boolean;
  compressReceiptImage?: boolean;
}

/**
 * Memindai foto atau dokumen struk melalui backend /api/gemini/scan-receipt
 */
export async function scanReceipt(
  file: File,
  categories: string[],
  aiOptions?: ReceiptScanAiOptions
): Promise<ReceiptData> {
  const payload = await prepareReceiptPayload(file, {
    compressImage: aiOptions?.compressReceiptImage ?? true,
  });

  const response = await fetch('/api/gemini/scan-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Data: payload.base64Data,
      mimeType: payload.mimeType,
      filename: payload.fileName,
      categories,
      todayDate: isoToday(),
      model: aiOptions?.primaryModel,
      autoFallback: aiOptions?.autoFallback,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429 && aiOptions?.uid) {
      const exhaustedModels =
        Array.isArray(body?.exhaustedModels) && body.exhaustedModels.length > 0
          ? body.exhaustedModels
          : [aiOptions.primaryModel || 'gemini-3.1-flash-lite'];
      void recordAiApiUsage(aiOptions.uid, {
        cached: true,
        exhaustedModels,
      });
    }
    throw new Error(
      typeof body?.error === 'string' && body.error
        ? body.error
        : `Gagal memindai struk (status ${response.status}).`
    );
  }

  if (aiOptions?.uid) {
    const meta = body?._meta;
    void recordAiApiUsage(aiOptions.uid, {
      modelUsed:
        typeof meta?.modelUsed === 'string'
          ? meta.modelUsed
          : aiOptions.primaryModel || 'gemini-3.1-flash-lite',
      cached: Boolean(meta?.cached),
      exhaustedModels: Array.isArray(meta?.exhaustedModels) ? meta.exhaustedModels : [],
    });
  }

  return parseReceiptData(body, categories);
}

// =============================================================================
// LOCAL REAL-TIME RECEIPT DETECTION & AUTO-CROP (CLIENT-SIDE ONLY, 0 API CALLS)
// =============================================================================

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ReceiptQuad = [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];

export type ReceiptDetectionStatus = 'no_document' | 'unstable_or_blurry' | 'ready';

export interface ReceiptFrameAnalysis {
  status: ReceiptDetectionStatus;
  detected: boolean;
  isSharp: boolean;
  isWellLit: boolean;
  isStable: boolean;
  sharpness: number;
  motion: number;
  brightness: number;
  bounds: NormalizedRect | null;
  quad: ReceiptQuad | null;
}

const GRID_COLS = 36;
const GRID_ROWS = 36;
const SHARPNESS_THRESHOLD = 42;
const MOTION_STABLE_THRESHOLD = 7.8;
const MIN_PAPER_BRIGHTNESS = 96;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Menganalisis frame video beresolusi ringan (misal lebar 320px) sepenuhnya di browser:
 * - Deteksi bidang kertas struk terang/berkontras di area bingkai tengah
 * - Estimasi 4 sudut poligon (TL, TR, BR, BL)
 * - Cek ketajaman tepi (Laplacian variance) & pencahayaan
 * - Cek kestabilan tangan (perbedaan intensitas antar-frame)
 */
export function analyzeReceiptFrame(
  imageData: ImageData,
  prevLuma: Uint8Array | null,
  visibleRegion?: NormalizedRect
): { analysis: ReceiptFrameAnalysis; luma: Uint8Array } {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  const luma = new Uint8Array(totalPixels);
  const chroma = new Uint8Array(totalPixels);

  // Tentukan area ROI yang terlihat pada preview kamera (mengakomodasi object-cover)
  const visX0 = Math.max(0, Math.floor((visibleRegion?.x ?? 0) * width));
  const visY0 = Math.max(0, Math.floor((visibleRegion?.y ?? 0) * height));
  const visX1 = Math.min(width, Math.ceil(((visibleRegion?.x ?? 0) + (visibleRegion?.width ?? 1)) * width));
  const visY1 = Math.min(height, Math.ceil(((visibleRegion?.y ?? 0) + (visibleRegion?.height ?? 1)) * height));
  const visW = Math.max(1, visX1 - visX0);
  const visH = Math.max(1, visY1 - visY0);

  // 1. Konversi RGBA ke luminance & chroma (saturasi rendah = kandidat kertas putih/termal)
  let motionSum = 0;
  let motionCount = 0;
  const hist = new Uint32Array(256);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = (r * 77 + g * 150 + b * 29) >> 8;
    luma[p] = y;
    const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
    const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
    chroma[p] = maxC - minC;
  }

  // Hitung histogram & skor gerakan pada area terlihat (sampling stride 2 untuk ringan di HP)
  let rimSum = 0;
  let rimCount = 0;
  const rimPadX = Math.max(2, Math.floor(visW * 0.1));
  const rimPadY = Math.max(2, Math.floor(visH * 0.1));
  let visibleSamples = 0;

  for (let y = visY0; y < visY1; y += 2) {
    const rowOffset = y * width;
    const isRimY = y < visY0 + rimPadY || y >= visY1 - rimPadY;
    for (let x = visX0; x < visX1; x += 2) {
      const idx = rowOffset + x;
      const val = luma[idx];
      hist[val]++;
      visibleSamples++;

      if (isRimY || x < visX0 + rimPadX || x >= visX1 - rimPadX) {
        rimSum += val;
        rimCount++;
      }

      if (prevLuma && prevLuma.length === totalPixels) {
        motionSum += Math.abs(val - prevLuma[idx]);
        motionCount++;
      }
    }
  }

  const motion = prevLuma && motionCount > 0 ? motionSum / motionCount : 99;
  const isStable = prevLuma !== null && motion <= MOTION_STABLE_THRESHOLD;
  const bgLuma = rimCount > 0 ? rimSum / rimCount : 90;

  // Hitung persentil ke-60 untuk ambang adaptif kertas
  let p60Luma = 128;
  if (visibleSamples > 0) {
    let acc = 0;
    const target60 = visibleSamples * 0.6;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target60) {
        p60Luma = v;
        break;
      }
    }
  }

  // 2. Agregasi blok grid (36 x 36) di dalam area terlihat
  const cellCount = GRID_COLS * GRID_ROWS;
  const cellLuma = new Float32Array(cellCount);
  const cellChroma = new Float32Array(cellCount);
  const cellEdge = new Float32Array(cellCount);
  const cellMask = new Uint8Array(cellCount);

  for (let gy = 0; gy < GRID_ROWS; gy++) {
    const py0 = visY0 + Math.floor((gy * visH) / GRID_ROWS);
    const py1 = Math.max(py0 + 1, visY0 + Math.floor(((gy + 1) * visH) / GRID_ROWS));
    for (let gx = 0; gx < GRID_COLS; gx++) {
      const px0 = visX0 + Math.floor((gx * visW) / GRID_COLS);
      const px1 = Math.max(px0 + 1, visX0 + Math.floor(((gx + 1) * visW) / GRID_COLS));

      let sumY = 0;
      let sumC = 0;
      let sumE = 0;
      let cnt = 0;

      for (let py = py0; py < py1; py += 2) {
        const row = py * width;
        const canGradY = py > 0 && py < height - 1;
        for (let px = px0; px < px1; px += 2) {
          const idx = row + px;
          const val = luma[idx];
          sumY += val;
          sumC += chroma[idx];
          if (canGradY && px > 0 && px < width - 1) {
            const gxVal = Math.abs(luma[idx + 1] - luma[idx - 1]);
            const gyVal = Math.abs(luma[idx + width] - luma[idx - width]);
            sumE += gxVal + gyVal;
          }
          cnt++;
        }
      }

      const cIdx = gy * GRID_COLS + gx;
      if (cnt > 0) {
        cellLuma[cIdx] = sumY / cnt;
        cellChroma[cIdx] = sumC / cnt;
        cellEdge[cIdx] = sumE / cnt;
      }
    }
  }

  // Klasifikasi sel kertas terang (kontras terhadap latar tepi, saturasi rendah seperti kertas)
  const paperLumaThreshold = Math.min(215, Math.max(102, Math.max(bgLuma + 16, p60Luma - 4)));
  let paperCellsTotal = 0;
  for (let i = 0; i < cellCount; i++) {
    const isBrightPaper = cellLuma[i] >= paperLumaThreshold && cellChroma[i] <= 58;
    if (isBrightPaper) {
      cellMask[i] = 1;
      paperCellsTotal++;
    }
  }

  // Fallback untuk struk di atas meja putih/sangat terang (jika > 86% sel terang, cari klaster teks padat)
  const brightRatio = paperCellsTotal / cellCount;
  if (brightRatio > 0.86 || brightRatio < 0.06) {
    cellMask.fill(0);
    // Hanya jalankan fallback klaster teks jika latar cukup terang
    if (brightRatio > 0.86) {
      for (let i = 0; i < cellCount; i++) {
        if (cellLuma[i] >= 115 && cellChroma[i] <= 65 && cellEdge[i] >= 18) {
          cellMask[i] = 1;
        }
      }
      // Dilasi 1 sel agar baris-baris teks struk menyatu menjadi satu bidang kertas
      const dilated = new Uint8Array(cellCount);
      for (let gy = 1; gy < GRID_ROWS - 1; gy++) {
        for (let gx = 1; gx < GRID_COLS - 1; gx++) {
          let found = 0;
          for (let dy = -1; dy <= 1 && !found; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (cellMask[(gy + dy) * GRID_COLS + (gx + dx)]) {
                found = 1;
                break;
              }
            }
          }
          dilated[gy * GRID_COLS + gx] = found;
        }
      }
      cellMask.set(dilated);
    }
  }

  // 3. Connected-Component Labeling (BFS) untuk menemukan bidang kertas utama di tengah bingkai
  const visited = new Uint8Array(cellCount);
  const queue = new Int32Array(cellCount);

  let bestScore = 0;
  let bestCells: number[] = [];

  for (let start = 0; start < cellCount; start++) {
    if (!cellMask[start] || visited[start]) continue;

    let qHead = 0;
    let qTail = 0;
    queue[qTail++] = start;
    visited[start] = 1;

    const comp: number[] = [];
    let minGx = GRID_COLS;
    let maxGx = 0;
    let minGy = GRID_ROWS;
    let maxGy = 0;
    let centerOverlap = 0;

    while (qHead < qTail) {
      const cur = queue[qHead++];
      comp.push(cur);
      const gx = cur % GRID_COLS;
      const gy = (cur / GRID_COLS) | 0;
      if (gx < minGx) minGx = gx;
      if (gx > maxGx) maxGx = gx;
      if (gy < minGy) minGy = gy;
      if (gy > maxGy) maxGy = gy;
      if (gx >= GRID_COLS * 0.25 && gx <= GRID_COLS * 0.75 && gy >= GRID_ROWS * 0.2 && gy <= GRID_ROWS * 0.8) {
        centerOverlap++;
      }

      if (gx > 0 && cellMask[cur - 1] && !visited[cur - 1]) {
        visited[cur - 1] = 1;
        queue[qTail++] = cur - 1;
      }
      if (gx < GRID_COLS - 1 && cellMask[cur + 1] && !visited[cur + 1]) {
        visited[cur + 1] = 1;
        queue[qTail++] = cur + 1;
      }
      if (gy > 0 && cellMask[cur - GRID_COLS] && !visited[cur - GRID_COLS]) {
        visited[cur - GRID_COLS] = 1;
        queue[qTail++] = cur - GRID_COLS;
      }
      if (gy < GRID_ROWS - 1 && cellMask[cur + GRID_COLS] && !visited[cur + GRID_COLS]) {
        visited[cur + GRID_COLS] = 1;
        queue[qTail++] = cur + GRID_COLS;
      }
    }

    const areaFrac = comp.length / cellCount;
    const boxWFrac = (maxGx - minGx + 1) / GRID_COLS;
    const boxHFrac = (maxGy - minGy + 1) / GRID_ROWS;
    const fillRatio = comp.length / Math.max(1, (maxGx - minGx + 1) * (maxGy - minGy + 1));

    // Filter kandidat kertas yang valid secara geometri & menyentuh area bingkai tengah
    if (
      areaFrac >= 0.08 &&
      areaFrac <= 0.92 &&
      boxWFrac >= 0.16 &&
      boxHFrac >= 0.18 &&
      fillRatio >= 0.42 &&
      centerOverlap >= 6
    ) {
      const score = comp.length * (0.6 + fillRatio * 0.4) + centerOverlap * 2;
      if (score > bestScore) {
        bestScore = score;
        bestCells = comp;
      }
    }
  }

  if (bestCells.length === 0) {
    return {
      analysis: {
        status: 'no_document',
        detected: false,
        isSharp: false,
        isWellLit: bgLuma >= 65,
        isStable,
        sharpness: 0,
        motion,
        brightness: bgLuma,
        bounds: null,
        quad: null,
      },
      luma,
    };
  }

  // 4. Hitung bounding box & 4 sudut poligon (TL, TR, BR, BL) dalam koordinat video ternormalisasi (0..1)
  let minGx = GRID_COLS;
  let maxGx = 0;
  let minGy = GRID_ROWS;
  let maxGy = 0;

  let tlSum = Infinity;
  let trDiff = -Infinity;
  let brSum = -Infinity;
  let blDiff = Infinity;

  let tlCell = bestCells[0];
  let trCell = bestCells[0];
  let brCell = bestCells[0];
  let blCell = bestCells[0];

  for (let i = 0; i < bestCells.length; i++) {
    const c = bestCells[i];
    const gx = c % GRID_COLS;
    const gy = (c / GRID_COLS) | 0;
    if (gx < minGx) minGx = gx;
    if (gx > maxGx) maxGx = gx;
    if (gy < minGy) minGy = gy;
    if (gy > maxGy) maxGy = gy;

    const sum = gx + gy;
    const diff = gx - gy;
    if (sum < tlSum) {
      tlSum = sum;
      tlCell = c;
    }
    if (diff > trDiff) {
      trDiff = diff;
      trCell = c;
    }
    if (sum > brSum) {
      brSum = sum;
      brCell = c;
    }
    if (diff < blDiff) {
      blDiff = diff;
      blCell = c;
    }
  }

  const gridToNormX = (gx: number) => clamp01((visX0 + (gx / GRID_COLS) * visW) / width);
  const gridToNormY = (gy: number) => clamp01((visY0 + (gy / GRID_ROWS) * visH) / height);

  const bx0 = gridToNormX(minGx);
  const by0 = gridToNormY(minGy);
  const bx1 = gridToNormX(maxGx + 1);
  const by1 = gridToNormY(maxGy + 1);

  const bounds: NormalizedRect = {
    x: bx0,
    y: by0,
    width: Math.max(0.05, bx1 - bx0),
    height: Math.max(0.05, by1 - by0),
  };

  // Padukan sudut ekstrim poligon dengan sudut bounding box agar rapi namun tetap responsif terhadap kemiringan kertas
  const blend = 0.55;
  const cornerOf = (cell: number, rectX: number, rectY: number): NormalizedPoint => {
    const cx = gridToNormX((cell % GRID_COLS) + 0.5);
    const cy = gridToNormY(((cell / GRID_COLS) | 0) + 0.5);
    return {
      x: clamp01(cx * blend + rectX * (1 - blend)),
      y: clamp01(cy * blend + rectY * (1 - blend)),
    };
  };

  const quad: ReceiptQuad = [
    cornerOf(tlCell, bx0, by0),
    cornerOf(trCell, bx1, by0),
    cornerOf(brCell, bx1, by1),
    cornerOf(blCell, bx0, by1),
  ];

  // 5. Hitung ketajaman (Laplacian Variance) & kecerahan di dalam area dokumen terdeteksi
  const docX0 = Math.max(1, Math.floor(bounds.x * width));
  const docY0 = Math.max(1, Math.floor(bounds.y * height));
  const docX1 = Math.min(width - 2, Math.ceil((bounds.x + bounds.width) * width));
  const docY1 = Math.min(height - 2, Math.ceil((bounds.y + bounds.height) * height));

  let lapSum = 0;
  let lapSqSum = 0;
  let docLumaSum = 0;
  let docSamples = 0;

  for (let y = docY0; y <= docY1; y += 2) {
    const row = y * width;
    for (let x = docX0; x <= docX1; x += 2) {
      const idx = row + x;
      const c = luma[idx];
      docLumaSum += c;
      const lap = -4 * c + luma[idx - 1] + luma[idx + 1] + luma[idx - width] + luma[idx + width];
      lapSum += lap;
      lapSqSum += lap * lap;
      docSamples++;
    }
  }

  const docBrightness = docSamples > 0 ? docLumaSum / docSamples : 0;
  const lapMean = docSamples > 0 ? lapSum / docSamples : 0;
  const sharpness = docSamples > 0 ? lapSqSum / docSamples - lapMean * lapMean : 0;

  const isSharp = sharpness >= SHARPNESS_THRESHOLD;
  const isWellLit = docBrightness >= MIN_PAPER_BRIGHTNESS;
  const status: ReceiptDetectionStatus = isSharp && isWellLit && isStable ? 'ready' : 'unstable_or_blurry';

  return {
    analysis: {
      status,
      detected: true,
      isSharp,
      isWellLit,
      isStable,
      sharpness,
      motion,
      brightness: docBrightness,
      bounds,
      quad,
    },
    luma,
  };
}

/**
 * Mengambil frame video beresolusi penuh, melakukan auto-crop sesuai area struk terdeteksi
 * (dengan margin aman), dan mengembalikannya sebagai File JPEG siap dikirim ke scanReceipt().
 */
export async function cropVideoFrameToReceiptFile(
  video: HTMLVideoElement,
  bounds: NormalizedRect | null,
  options?: {
    margin?: number;
    quality?: number;
    fileName?: string;
  }
): Promise<File> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error('Frame kamera belum siap.');
  }

  const margin = options?.margin ?? 0.045;
  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;

  if (bounds && bounds.width > 0.12 && bounds.height > 0.12) {
    const padX = Math.max(bounds.width * 0.08, margin);
    const padY = Math.max(bounds.height * 0.08, margin);
    const x0 = clamp01(bounds.x - padX);
    const y0 = clamp01(bounds.y - padY);
    const x1 = clamp01(bounds.x + bounds.width + padX);
    const y1 = clamp01(bounds.y + bounds.height + padY);

    sx = Math.round(x0 * vw);
    sy = Math.round(y0 * vh);
    sw = Math.max(64, Math.round((x1 - x0) * vw));
    sh = Math.max(64, Math.round((y1 - y0) * vh));

    if (sx + sw > vw) sw = vw - sx;
    if (sy + sh > vh) sh = vh - sy;
  }

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas tidak tersedia untuk mengambil foto struk.');
  }

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', options?.quality ?? 0.92)
  );
  if (!blob) {
    throw new Error('Gagal menghasilkan gambar dari kamera.');
  }

  return new File([blob], options?.fileName || `struk-autoscan-${Date.now()}.jpg`, {
    type: 'image/jpeg',
  });
}

