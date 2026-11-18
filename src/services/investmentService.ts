import { toLocalDateStr } from '../utils/localDate';
/**
 * Layanan Portofolio Investasi Artha
 * Offline-first dengan LocalStorage + sinkronisasi Cloud Firestore
 */
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { InvestmentAsset, InvestmentAssetType, InvestmentEntry, InvestmentEntryKind } from '../types';
import { createTransaction, deleteTransaction } from './cashManagementService';
import { ensureCategory } from '../hooks/useCategories';

const STORAGE_KEY_INVESTMENTS = 'artha_offline_investments';

export const ASSET_TYPE_LABELS: Record<InvestmentAssetType, { label: string; color: string; bg: string }> = {
  stock: { label: 'Saham (IDX)', color: '#6c97ff', bg: 'var(--accent-blue-light)' },
  mutual_fund: { label: 'Reksa Dana', color: '#2dd4a7', bg: 'var(--accent-sage-light)' },
  crypto: { label: 'Kripto', color: '#ff7a4d', bg: 'var(--accent-terracotta-light)' },
  gold: { label: 'Emas (Gold)', color: '#ffc933', bg: 'var(--accent-sand-light)' },
  bond: { label: 'Obligasi / SBN', color: '#e3a8f7', bg: 'var(--accent-lavender-light)' },
  deposit: { label: 'Deposito', color: '#8ec5ba', bg: '#d4ece8' },
  p2p: { label: 'P2P Lending', color: '#e5a882', bg: '#fde5d9' },
  other: { label: 'Aset Lainnya', color: '#8e96a6', bg: '#e5e7eb' },
};

export function getLocalInvestments(): InvestmentAsset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INVESTMENTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca data investasi lokal:', e);
  }

  // Initial demo portfolio untuk memberi pengalaman langsung
  const initialInvestments: InvestmentAsset[] = [
    {
      id: 'inv_bbri_default',
      ledgerId: 'ledger_personal_default',
      name: 'Bank Rakyat Indonesia',
      symbolOrTicker: 'BBRI',
      type: 'stock',
      platform: 'Stockbit',
      initialCapital: 10000000,
      currentValue: 11450000,
      units: 2000,
      buyPricePerUnit: 5000,
      currentPricePerUnit: 5725,
      colorAccent: '#6c97ff',
      notes: 'Investasi dividen jangka panjang',
      lastUpdated: toLocalDateStr(new Date()),
      createdAt: Date.now() - 86400000 * 60
    },
    {
      id: 'inv_bibit_sucor_default',
      ledgerId: 'ledger_personal_default',
      name: 'Sucorinvest Sharia Equity Fund',
      symbolOrTicker: 'SUCOR-EQ',
      type: 'mutual_fund',
      platform: 'Bibit',
      initialCapital: 5000000,
      currentValue: 5350000,
      units: 2140,
      colorAccent: '#2dd4a7',
      notes: 'DCA rutin tanggal 25',
      lastUpdated: toLocalDateStr(new Date()),
      createdAt: Date.now() - 86400000 * 45
    },
    {
      id: 'inv_gold_antam_default',
      ledgerId: 'ledger_personal_default',
      name: 'Emas Logam Mulia Antam (10 gr)',
      symbolOrTicker: 'XAU-IDR',
      type: 'gold',
      platform: 'Pluang / Brankas',
      initialCapital: 12500000,
      currentValue: 14200000,
      units: 10,
      buyPricePerUnit: 1250000,
      currentPricePerUnit: 1420000,
      colorAccent: '#ffc933',
      notes: 'Safe haven cadangan keluarga',
      lastUpdated: toLocalDateStr(new Date()),
      createdAt: Date.now() - 86400000 * 90
    },
    {
      id: 'inv_btc_default',
      ledgerId: 'ledger_personal_default',
      name: 'Bitcoin',
      symbolOrTicker: 'BTC',
      type: 'crypto',
      platform: 'Tokocrypto',
      initialCapital: 4000000,
      currentValue: 4680000,
      units: 0.0032,
      colorAccent: '#ff7a4d',
      notes: 'High risk high return',
      lastUpdated: toLocalDateStr(new Date()),
      createdAt: Date.now() - 86400000 * 20
    }
  ];

  localStorage.setItem(STORAGE_KEY_INVESTMENTS, JSON.stringify(initialInvestments));
  return initialInvestments;
}

export function saveLocalInvestments(items: InvestmentAsset[]) {
  try {
    localStorage.setItem(STORAGE_KEY_INVESTMENTS, JSON.stringify(items));
  } catch (e) {
    console.error('Gagal menyimpan investasi ke lokal:', e);
  }
}

export async function fetchInvestmentsByLedger(userId: string = 'demo_user_artha', ledgerId: string): Promise<InvestmentAsset[]> {
  try {
    if (db) {
      const q = query(
        collection(db, 'users', userId, 'investments'),
        where('ledgerId', '==', ledgerId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const firestoreList: InvestmentAsset[] = [];
        snap.forEach(docSnap => {
          firestoreList.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        // Sync local
        const allLocal = getLocalInvestments().filter(i => i.ledgerId !== ledgerId);
        saveLocalInvestments([...allLocal, ...firestoreList]);
        return firestoreList;
      }
    }
  } catch (e) {
    console.warn('Gagal memuat investasi dari Firestore, memakai local storage:', e);
  }

  const all = getLocalInvestments();
  return all.filter(i => i.ledgerId === ledgerId);
}

export async function createInvestmentAsset(
  userId: string = 'demo_user_artha',
  data: Omit<InvestmentAsset, 'id' | 'createdAt'>
): Promise<InvestmentAsset> {
  const newId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  const asset: InvestmentAsset = {
    ...data,
    id: newId,
    createdAt: now,
    lastUpdated: data.lastUpdated || toLocalDateStr(new Date())
  };

  // Local write
  const all = getLocalInvestments();
  all.unshift(asset);
  saveLocalInvestments(all);

  // Firestore sync
  try {
    if (db) {
      await setDoc(doc(db, 'users', userId, 'investments', newId), JSON.parse(JSON.stringify(asset)));
    }
  } catch (e) {
    console.warn('Gagal sinkron investasi ke Firestore:', e);
  }

  return asset;
}

export async function updateInvestmentAsset(
  userId: string = 'demo_user_artha',
  assetId: string,
  updates: Partial<Omit<InvestmentAsset, 'id' | 'ledgerId' | 'createdAt'>>
): Promise<InvestmentAsset> {
  const all = getLocalInvestments();
  const index = all.findIndex(i => i.id === assetId);
  if (index === -1) throw new Error('Aset investasi tidak ditemukan!');

  const updated: InvestmentAsset = {
    ...all[index],
    ...updates,
    lastUpdated: updates.lastUpdated || toLocalDateStr(new Date())
  };

  all[index] = updated;
  saveLocalInvestments(all);

  try {
    if (db) {
      await setDoc(doc(db, 'users', userId, 'investments', assetId), JSON.parse(JSON.stringify(updated)), { merge: true });
    }
  } catch (e) {
    console.warn('Gagal sinkron pembaruan investasi ke Firestore:', e);
  }

  return updated;
}

export async function deleteInvestmentAsset(
  userId: string = 'demo_user_artha',
  assetId: string
): Promise<void> {
  const all = getLocalInvestments().filter(i => i.id !== assetId);
  saveLocalInvestments(all);
  try { localStorage.setItem('artha_offline_investment_entries', JSON.stringify(getInvestmentEntries().filter(e => e.assetId !== assetId))); } catch { /* abaikan */ }

  try {
    if (db) {
      await deleteDoc(doc(db, 'users', userId, 'investments', assetId));
    }
  } catch (e) {
    console.warn('Gagal hapus investasi di Firestore:', e);
  }
}

export interface InvestmentSummary {
  totalCapital: number;
  totalCurrentValue: number;
  netGainLoss: number;
  netGainLossPercent: number;
  assetCount: number;
  breakdown: Array<{
    type: InvestmentAssetType;
    label: string;
    capital: number;
    currentValue: number;
    percentage: number;
    color: string;
  }>;
}

export function calculateInvestmentSummary(assets: InvestmentAsset[]): InvestmentSummary {
  let totalCapital = 0;
  let totalCurrentValue = 0;
  const byType: Record<string, { capital: number; currentValue: number }> = {};

  assets = assets.filter(a => a.status !== 'closed');
  assets.forEach(a => {
    totalCapital += Number(a.initialCapital) || 0;
    totalCurrentValue += Number(a.currentValue) || 0;
    if (!byType[a.type]) {
      byType[a.type] = { capital: 0, currentValue: 0 };
    }
    byType[a.type].capital += Number(a.initialCapital) || 0;
    byType[a.type].currentValue += Number(a.currentValue) || 0;
  });

  const netGainLoss = totalCurrentValue - totalCapital;
  const netGainLossPercent = totalCapital > 0 ? (netGainLoss / totalCapital) * 100 : 0;

  const breakdown = Object.entries(byType).map(([typeKey, vals]) => {
    const t = typeKey as InvestmentAssetType;
    const meta = ASSET_TYPE_LABELS[t] || ASSET_TYPE_LABELS.other;
    const pct = totalCurrentValue > 0 ? (vals.currentValue / totalCurrentValue) * 100 : 0;
    return {
      type: t,
      label: meta.label,
      capital: vals.capital,
      currentValue: vals.currentValue,
      percentage: pct,
      color: meta.color
    };
  }).sort((a, b) => b.currentValue - a.currentValue);

  return {
    totalCapital,
    totalCurrentValue,
    netGainLoss,
    netGainLossPercent,
    assetCount: assets.length,
    breakdown
  };
}


/* ======================================================================
 * RIWAYAT DANA ASET: Tambah dana, Hasil (panen/dividen), Tarik, Tutup aset
 * Setiap catatan membuat transaksi kas (saldo akun ikut berubah) dan mengubah modal/nilai aset.
 * ====================================================================== */
const STORAGE_KEY_ENTRIES = 'artha_offline_investment_entries';

/** Kategori transaksi kas yang dipakai fitur ini. */
export const INV_CATEGORY = { topup: 'Investasi', yield: 'Hasil Investasi', cashout: 'Pencairan Investasi' } as const;

export function getInvestmentEntries(assetId?: string): InvestmentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
    const parsed = raw ? JSON.parse(raw) : [];
    const list: InvestmentEntry[] = Array.isArray(parsed) ? parsed : [];
    return assetId ? list.filter(e => e.assetId === assetId) : list;
  } catch {
    return [];
  }
}

function saveInvestmentEntries(list: InvestmentEntry[]) {
  try { localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(list)); } catch (e) { console.warn('Gagal menyimpan riwayat investasi:', e); }
}

export interface InvestmentEntryInput {
  assetId: string;
  kind: InvestmentEntryKind;
  date: string;
  amount: number;
  accountId: string;
  note?: string;
  /** Khusus 'withdraw': modal yang dikurangi. Kosong = proporsional. */
  capitalReduced?: number;
}

/** Modal yang berkurang bila sebagian nilai aset ditarik (proporsional terhadap nilai pasar). */
export function suggestCapitalReduced(asset: Pick<InvestmentAsset, 'initialCapital' | 'currentValue'>, amount: number): number {
  if (!(asset.currentValue > 0)) return asset.initialCapital;
  return Math.round(asset.initialCapital * Math.min(1, Math.max(0, amount) / asset.currentValue));
}

async function applyEntry(userId: string, input: InvestmentEntryInput): Promise<InvestmentEntry> {
  const asset = getLocalInvestments().find(a => a.id === input.assetId);
  if (!asset) throw new Error('Aset investasi tidak ditemukan!');
  if (asset.status === 'closed') throw new Error('Aset sudah ditutup. Hapus catatan "Tutup aset" untuk membukanya kembali.');
  const amount = Math.round(Number(input.amount) || 0);
  if (!(amount > 0)) throw new Error('Nominal harus lebih dari 0.');
  if (!input.accountId) throw new Error('Pilih akun terlebih dahulu.');
  if (!input.date) throw new Error('Tanggal wajib diisi.');

  let capitalDelta = 0;
  let valueDelta = 0;
  let capitalReduced: number | undefined;
  let realized: number | undefined;
  let closedAsset = false;
  let txType: 'income' | 'expense' = 'income';
  let category: string = INV_CATEGORY.yield;
  let defaultNote = '';
  const patch: Partial<Omit<InvestmentAsset, 'id' | 'ledgerId' | 'createdAt'>> = { lastUpdated: asset.lastUpdated };

  if (input.kind === 'topup') {
    txType = 'expense';
    category = INV_CATEGORY.topup;
    defaultNote = `Tambah dana: ${asset.name}`;
    capitalDelta = amount;
    patch.initialCapital = asset.initialCapital + amount;
  } else if (input.kind === 'yield') {
    category = INV_CATEGORY.yield;
    defaultNote = `Hasil: ${asset.name}`;
  } else if (input.kind === 'withdraw') {
    category = INV_CATEGORY.cashout;
    defaultNote = `Penarikan: ${asset.name}`;
    if (amount > asset.currentValue) throw new Error('Penarikan melebihi nilai pasar aset. Gunakan "Tutup aset" bila ingin mencairkan seluruhnya.');
    capitalReduced = Math.min(asset.initialCapital, Math.max(0, Math.round(input.capitalReduced ?? suggestCapitalReduced(asset, amount))));
    realized = amount - capitalReduced;
    capitalDelta = -capitalReduced;
    valueDelta = -amount;
    patch.initialCapital = asset.initialCapital - capitalReduced;
    patch.currentValue = asset.currentValue - amount;
    if (patch.currentValue <= 0) { closedAsset = true; patch.status = 'closed'; patch.closedAt = input.date; }
  } else {
    category = INV_CATEGORY.cashout;
    defaultNote = `Tutup aset: ${asset.name}`;
    realized = amount - asset.initialCapital;
    closedAsset = true;
    patch.status = 'closed';
    patch.closedAt = input.date;
  }

  const tx = await createTransaction(userId, {
    ledgerId: asset.ledgerId,
    accountId: input.accountId,
    type: txType,
    amount,
    category,
    note: input.note?.trim() || defaultNote,
    date: input.date
  });
  ensureCategory(txType, category);

  // Penyimpanan lokal terjadi seketika; sinkron Firestore berjalan di latar belakang agar tidak membuat layar menunggu.
  updateInvestmentAsset(userId, asset.id, patch).catch(err => console.warn('Sinkron aset ke Firestore tertunda:', err));

  const entry: InvestmentEntry = {
    id: `invent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    assetId: asset.id,
    ledgerId: asset.ledgerId,
    kind: input.kind,
    date: input.date,
    amount,
    accountId: input.accountId,
    transactionId: tx.id,
    capitalDelta,
    valueDelta,
    capitalReduced,
    realized,
    closedAsset: closedAsset || undefined,
    note: input.note?.trim() || undefined,
    createdAt: Date.now()
  };
  saveInvestmentEntries([entry, ...getInvestmentEntries()]);
  return entry;
}

async function reverseEntry(userId: string, entry: InvestmentEntry): Promise<void> {
  const asset = getLocalInvestments().find(a => a.id === entry.assetId);
  if (asset) {
    const patch: Partial<Omit<InvestmentAsset, 'id' | 'ledgerId' | 'createdAt'>> = { lastUpdated: asset.lastUpdated };
    if (entry.capitalDelta) patch.initialCapital = Math.max(0, asset.initialCapital - entry.capitalDelta);
    if (entry.valueDelta) patch.currentValue = Math.max(0, asset.currentValue - entry.valueDelta);
    if (entry.closedAsset) { patch.status = 'active'; patch.closedAt = ''; }
    updateInvestmentAsset(userId, asset.id, patch).catch(err => console.warn('Sinkron aset ke Firestore tertunda:', err));
  }
  if (entry.transactionId) await deleteTransaction(userId, entry.transactionId);
  saveInvestmentEntries(getInvestmentEntries().filter(e => e.id !== entry.id));
}

export function addInvestmentEntry(input: InvestmentEntryInput, userId: string = 'demo_user_artha') {
  return applyEntry(userId, input);
}

export async function deleteInvestmentEntry(entryId: string, userId: string = 'demo_user_artha'): Promise<void> {
  const entry = getInvestmentEntries().find(e => e.id === entryId);
  if (!entry) throw new Error('Catatan tidak ditemukan.');
  await reverseEntry(userId, entry);
}

/** Ubah catatan: batalkan efek lama lalu terapkan nilai baru (dengan pemulihan bila gagal). */
export async function updateInvestmentEntry(
  entryId: string,
  next: Pick<InvestmentEntryInput, 'date' | 'amount' | 'accountId' | 'note' | 'capitalReduced'>,
  userId: string = 'demo_user_artha'
): Promise<InvestmentEntry> {
  const old = getInvestmentEntries().find(e => e.id === entryId);
  if (!old) throw new Error('Catatan tidak ditemukan.');
  const oldInput: InvestmentEntryInput = {
    assetId: old.assetId, kind: old.kind, date: old.date, amount: old.amount, accountId: old.accountId, note: old.note, capitalReduced: old.capitalReduced
  };
  await reverseEntry(userId, old);
  try {
    return await applyEntry(userId, { ...oldInput, ...next });
  } catch (err) {
    await applyEntry(userId, oldInput);
    throw err;
  }
}

export interface AssetReturn {
  invested: number;      // modal sisa + modal yang sudah ditarik
  valueNow: number;      // nilai pasar saat ini (0 bila aset sudah ditutup)
  unrealized: number;    // untung/rugi belum terealisasi
  yieldTotal: number;    // total hasil (panen/dividen)
  cashedOut: number;     // total uang dari penarikan + penutupan
  realizedTotal: number; // untung/rugi terealisasi dari penarikan + penutupan
  topupTotal: number;    // total dana tambahan
  roiTotal: number;      // ROI total dalam persen, memperhitungkan semua arus dana
}

export function calculateAssetReturn(asset: InvestmentAsset, entries: InvestmentEntry[]): AssetReturn {
  const closed = asset.status === 'closed';
  const sum = (fn: (e: InvestmentEntry) => number) => entries.reduce((s, e) => s + fn(e), 0);
  const capWithdrawn = sum(e => (e.kind === 'withdraw' ? e.capitalReduced || 0 : 0));
  const yieldTotal = sum(e => (e.kind === 'yield' ? e.amount : 0));
  const cashedOut = sum(e => (e.kind === 'withdraw' || e.kind === 'close' ? e.amount : 0));
  const realizedTotal = sum(e => (e.kind === 'withdraw' || e.kind === 'close' ? e.realized || 0 : 0));
  const topupTotal = sum(e => (e.kind === 'topup' ? e.amount : 0));
  const valueNow = closed ? 0 : asset.currentValue;
  const invested = asset.initialCapital + capWithdrawn;
  const roiTotal = invested > 0 ? ((valueNow + yieldTotal + cashedOut - invested) / invested) * 100 : 0;
  return { invested, valueNow, unrealized: closed ? 0 : asset.currentValue - asset.initialCapital, yieldTotal, cashedOut, realizedTotal, topupTotal, roiTotal };
}
