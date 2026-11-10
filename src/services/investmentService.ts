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
import { InvestmentAsset, InvestmentAssetType } from '../types';

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
      lastUpdated: new Date().toISOString().split('T')[0],
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
      lastUpdated: new Date().toISOString().split('T')[0],
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
      lastUpdated: new Date().toISOString().split('T')[0],
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
      lastUpdated: new Date().toISOString().split('T')[0],
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
    lastUpdated: data.lastUpdated || new Date().toISOString().split('T')[0]
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
    lastUpdated: updates.lastUpdated || new Date().toISOString().split('T')[0]
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
