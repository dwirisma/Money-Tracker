/**
 * Layanan Portofolio Investasi Artha (100% Cloud Firestore Real-Time)
 * Semua data investasi dan riwayat arus dana tersimpan & tersinkronisasi real-time via Firestore.
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  OperationType,
  handleFirestoreError,
  logFirestoreListenerError,
} from '../config/firebase';
import {
  Account,
  InvestmentAsset,
  InvestmentAssetType,
  InvestmentEntry,
  InvestmentEntryKind,
  Transaction,
} from '../types';
import { toLocalDateStr } from '../utils/dateUtils';
import { stripUndefined } from './cashManagementService';
import { ensureCategory } from '../hooks/useCategories';

export const ASSET_TYPE_LABELS: Record<
  InvestmentAssetType,
  { label: string; color: string; bg: string }
> = {
  stock: { label: 'Saham (IDX)', color: '#6c97ff', bg: 'var(--accent-blue-light)' },
  mutual_fund: { label: 'Reksa Dana', color: '#2dd4a7', bg: 'var(--accent-sage-light)' },
  crypto: { label: 'Kripto', color: '#ff7a4d', bg: 'var(--accent-terracotta-light)' },
  gold: { label: 'Emas (Gold)', color: '#ffc933', bg: 'var(--accent-sand-light)' },
  bond: { label: 'Obligasi / SBN', color: '#e3a8f7', bg: 'var(--accent-lavender-light)' },
  deposit: { label: 'Deposito', color: '#8ec5ba', bg: '#d4ece8' },
  p2p: { label: 'P2P Lending', color: '#e5a882', bg: '#fde5d9' },
  other: { label: 'Aset Lainnya', color: '#8e96a6', bg: '#e5e7eb' },
};

export const INV_CATEGORY = {
  topup: 'Investasi',
  yield: 'Hasil Investasi',
  cashout: 'Pencairan Investasi',
} as const;

export function subscribeInvestmentsByLedger(
  uid: string,
  ledgerId: string,
  onData: (assets: InvestmentAsset[]) => void
): () => void {
  if (!uid || !ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/investments`;
  const q = query(collection(db, 'users', uid, 'investments'), where('ledgerId', '==', ledgerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: InvestmentAsset[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<InvestmentAsset, 'id'>) }))
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export function subscribeInvestmentEntriesByLedger(
  uid: string,
  ledgerId: string,
  onData: (entries: InvestmentEntry[]) => void
): () => void {
  if (!uid || !ledgerId) {
    onData([]);
    return () => {};
  }
  const path = `users/${uid}/investmentEntries`;
  const q = query(
    collection(db, 'users', uid, 'investmentEntries'),
    where('ledgerId', '==', ledgerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: InvestmentEntry[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<InvestmentEntry, 'id'>) }))
        .sort((a, b) => {
          const cmp = (b.date || '').localeCompare(a.date || '');
          if (cmp !== 0) return cmp;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
      onData(list);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, path)
  );
}

export async function createInvestmentAsset(
  uid: string,
  data: Omit<InvestmentAsset, 'id' | 'createdAt'>
): Promise<InvestmentAsset> {
  const newId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/investments/${newId}`;
  try {
    const now = Date.now();
    const payload = stripUndefined({
      ...data,
      initialCapital: Number(data.initialCapital) || 0,
      currentValue: Number(data.currentValue) || 0,
      lastUpdated: data.lastUpdated || toLocalDateStr(new Date()),
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(doc(db, 'users', uid, 'investments', newId), payload);
    return { id: newId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateInvestmentAsset(
  uid: string,
  assetId: string,
  updates: Partial<Omit<InvestmentAsset, 'id' | 'ledgerId' | 'createdAt'>>
): Promise<void> {
  const path = `users/${uid}/investments/${assetId}`;
  try {
    const payload = stripUndefined({
      ...updates,
      lastUpdated: updates.lastUpdated || toLocalDateStr(new Date()),
      updatedAt: Date.now(),
    });
    await setDoc(doc(db, 'users', uid, 'investments', assetId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteInvestmentAsset(uid: string, assetId: string): Promise<void> {
  const path = `users/${uid}/investments/${assetId}`;
  try {
    const entriesSnap = await getDocs(
      query(collection(db, 'users', uid, 'investmentEntries'), where('assetId', '==', assetId))
    );
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', uid, 'investments', assetId));
    entriesSnap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
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

  const activeAssets = assets.filter((a) => a.status !== 'closed');
  activeAssets.forEach((a) => {
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

  const breakdown = Object.entries(byType)
    .map(([typeKey, vals]) => {
      const t = typeKey as InvestmentAssetType;
      const meta = ASSET_TYPE_LABELS[t] || ASSET_TYPE_LABELS.other;
      const pct = totalCurrentValue > 0 ? (vals.currentValue / totalCurrentValue) * 100 : 0;
      return {
        type: t,
        label: meta.label,
        capital: vals.capital,
        currentValue: vals.currentValue,
        percentage: pct,
        color: meta.color,
      };
    })
    .sort((a, b) => b.currentValue - a.currentValue);

  return {
    totalCapital,
    totalCurrentValue,
    netGainLoss,
    netGainLossPercent,
    assetCount: activeAssets.length,
    breakdown,
  };
}

export interface InvestmentEntryInput {
  assetId: string;
  kind: InvestmentEntryKind;
  date: string;
  amount: number;
  accountId: string;
  note?: string;
  capitalReduced?: number;
}

export function suggestCapitalReduced(
  asset: Pick<InvestmentAsset, 'initialCapital' | 'currentValue'>,
  amount: number
): number {
  if (!(asset.currentValue > 0)) return asset.initialCapital;
  return Math.round(asset.initialCapital * Math.min(1, Math.max(0, amount) / asset.currentValue));
}

async function applyEntryAtomic(
  uid: string,
  input: InvestmentEntryInput
): Promise<InvestmentEntry> {
  const path = `users/${uid}/investmentEntries`;
  try {
    const amount = Math.round(Number(input.amount) || 0);
    if (!(amount > 0)) throw new Error('Nominal harus lebih dari 0.');
    if (!input.accountId) throw new Error('Pilih akun terlebih dahulu.');
    if (!input.date) throw new Error('Tanggal wajib diisi.');

    const now = Date.now();
    const txId = `tx_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const entryId = `invent_${now}_${Math.random().toString(36).slice(2, 6)}`;

    let txTypeForCategory: 'income' | 'expense' = 'income';
    let categoryForEnsure: string = INV_CATEGORY.yield;

    const entry = await runTransaction(db, async (tx) => {
      const assetRef = doc(db, 'users', uid, 'investments', input.assetId);
      const accRef = doc(db, 'users', uid, 'accounts', input.accountId);

      const [assetSnap, accSnap] = await Promise.all([tx.get(assetRef), tx.get(accRef)]);
      if (!assetSnap.exists()) throw new Error('Aset investasi tidak ditemukan!');
      if (!accSnap.exists()) throw new Error('Akun kas tidak ditemukan!');

      const asset = { id: assetSnap.id, ...(assetSnap.data() as Omit<InvestmentAsset, 'id'>) };
      if (asset.status === 'closed') {
        throw new Error('Aset sudah ditutup. Hapus catatan "Tutup aset" untuk membukanya kembali.');
      }

      const acc = accSnap.data() as Account;

      let capitalDelta = 0;
      let valueDelta = 0;
      let capitalReduced: number | undefined;
      let realized: number | undefined;
      let closedAsset = false;
      let txType: 'income' | 'expense' = 'income';
      let category: string = INV_CATEGORY.yield;
      let defaultNote = '';
      const assetPatch: Record<string, unknown> = { updatedAt: now };

      if (input.kind === 'topup') {
        txType = 'expense';
        category = INV_CATEGORY.topup;
        defaultNote = `Tambah dana: ${asset.name}`;
        capitalDelta = amount;
        assetPatch.initialCapital = (Number(asset.initialCapital) || 0) + amount;
      } else if (input.kind === 'yield') {
        category = INV_CATEGORY.yield;
        defaultNote = `Hasil: ${asset.name}`;
      } else if (input.kind === 'withdraw') {
        category = INV_CATEGORY.cashout;
        defaultNote = `Penarikan: ${asset.name}`;
        if (amount > asset.currentValue) {
          throw new Error(
            'Penarikan melebihi nilai pasar aset. Gunakan "Tutup aset" bila ingin mencairkan seluruhnya.'
          );
        }
        capitalReduced = Math.min(
          asset.initialCapital,
          Math.max(0, Math.round(input.capitalReduced ?? suggestCapitalReduced(asset, amount)))
        );
        realized = amount - capitalReduced;
        capitalDelta = -capitalReduced;
        valueDelta = -amount;
        assetPatch.initialCapital = asset.initialCapital - capitalReduced;
        assetPatch.currentValue = asset.currentValue - amount;
        if ((assetPatch.currentValue as number) <= 0) {
          closedAsset = true;
          assetPatch.status = 'closed';
          assetPatch.closedAt = input.date;
        }
      } else {
        category = INV_CATEGORY.cashout;
        defaultNote = `Tutup aset: ${asset.name}`;
        realized = amount - asset.initialCapital;
        closedAsset = true;
        assetPatch.status = 'closed';
        assetPatch.closedAt = input.date;
      }

      txTypeForCategory = txType;
      categoryForEnsure = category;

      const curBal = Number(acc.balance) || 0;
      const nextBal = txType === 'income' ? curBal + amount : curBal - amount;

      const newTx: Omit<Transaction, 'id'> & { updatedAt: number } = stripUndefined({
        ledgerId: asset.ledgerId,
        accountId: input.accountId,
        type: txType,
        amount,
        category,
        note: input.note?.trim() || defaultNote,
        date: input.date,
        createdAt: now,
        updatedAt: now,
      });

      const newEntry: InvestmentEntry = stripUndefined({
        id: entryId,
        assetId: asset.id,
        ledgerId: asset.ledgerId,
        kind: input.kind,
        date: input.date,
        amount,
        accountId: input.accountId,
        transactionId: txId,
        capitalDelta,
        valueDelta,
        capitalReduced,
        realized,
        closedAsset: closedAsset || undefined,
        note: input.note?.trim() || undefined,
        createdAt: now,
      });

      tx.update(accRef, { balance: nextBal, updatedAt: now });
      tx.update(assetRef, stripUndefined(assetPatch));
      tx.set(doc(db, 'users', uid, 'transactions', txId), newTx);

      const { id: _ignoreId, ...entryBody } = newEntry;
      tx.set(doc(db, 'users', uid, 'investmentEntries', entryId), stripUndefined(entryBody));

      return newEntry;
    });

    void ensureCategory(uid, txTypeForCategory, categoryForEnsure);
    return entry;
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Firestore')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function reverseEntryAtomic(uid: string, entryId: string): Promise<InvestmentEntry> {
  const path = `users/${uid}/investmentEntries/${entryId}`;
  try {
    const now = Date.now();
    return await runTransaction(db, async (tx) => {
      const entryRef = doc(db, 'users', uid, 'investmentEntries', entryId);
      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists()) throw new Error('Catatan tidak ditemukan.');

      const entry = { id: entrySnap.id, ...(entrySnap.data() as Omit<InvestmentEntry, 'id'>) };

      const assetRef = doc(db, 'users', uid, 'investments', entry.assetId);
      const txRef = entry.transactionId
        ? doc(db, 'users', uid, 'transactions', entry.transactionId)
        : null;

      const [assetSnap, linkedTxSnap] = await Promise.all([
        tx.get(assetRef),
        txRef ? tx.get(txRef) : Promise.resolve(null),
      ]);

      const accRef =
        linkedTxSnap && linkedTxSnap.exists()
          ? doc(db, 'users', uid, 'accounts', (linkedTxSnap.data() as Transaction).accountId)
          : null;
      const accSnap = accRef ? await tx.get(accRef) : null;

      if (assetSnap.exists()) {
        const asset = assetSnap.data() as InvestmentAsset;
        const patch: Record<string, unknown> = { updatedAt: now };
        if (entry.capitalDelta) {
          patch.initialCapital = Math.max(0, (Number(asset.initialCapital) || 0) - entry.capitalDelta);
        }
        if (entry.valueDelta) {
          patch.currentValue = Math.max(0, (Number(asset.currentValue) || 0) - entry.valueDelta);
        }
        if (entry.closedAsset) {
          patch.status = 'active';
          patch.closedAt = '';
        }
        tx.update(assetRef, patch);
      }

      if (linkedTxSnap && linkedTxSnap.exists() && txRef) {
        const linkedTx = linkedTxSnap.data() as Transaction;
        const txAmt = Number(linkedTx.amount) || 0;
        if (accRef && accSnap && accSnap.exists()) {
          const curBal = Number((accSnap.data() as Account).balance) || 0;
          const revertedBal = linkedTx.type === 'income' ? curBal - txAmt : curBal + txAmt;
          tx.update(accRef, { balance: revertedBal, updatedAt: now });
        }
        tx.delete(txRef);
      }

      tx.delete(entryRef);
      return entry;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function addInvestmentEntry(
  uid: string,
  input: InvestmentEntryInput
): Promise<InvestmentEntry> {
  return applyEntryAtomic(uid, input);
}

export async function deleteInvestmentEntry(uid: string, entryId: string): Promise<void> {
  await reverseEntryAtomic(uid, entryId);
}

export async function updateInvestmentEntry(
  uid: string,
  entryId: string,
  next: Pick<InvestmentEntryInput, 'date' | 'amount' | 'accountId' | 'note' | 'capitalReduced'>
): Promise<InvestmentEntry> {
  const old = await reverseEntryAtomic(uid, entryId);
  const oldInput: InvestmentEntryInput = {
    assetId: old.assetId,
    kind: old.kind,
    date: old.date,
    amount: old.amount,
    accountId: old.accountId,
    note: old.note,
    capitalReduced: old.capitalReduced,
  };
  try {
    return await applyEntryAtomic(uid, { ...oldInput, ...next });
  } catch (err) {
    await applyEntryAtomic(uid, oldInput);
    throw err;
  }
}

export interface AssetReturn {
  invested: number;
  valueNow: number;
  unrealized: number;
  yieldTotal: number;
  cashedOut: number;
  realizedTotal: number;
  topupTotal: number;
  roiTotal: number;
}

export function calculateAssetReturn(
  asset: InvestmentAsset,
  entries: InvestmentEntry[]
): AssetReturn {
  const closed = asset.status === 'closed';
  const sum = (fn: (e: InvestmentEntry) => number) => entries.reduce((s, e) => s + fn(e), 0);
  const capWithdrawn = sum((e) => (e.kind === 'withdraw' ? e.capitalReduced || 0 : 0));
  const yieldTotal = sum((e) => (e.kind === 'yield' ? e.amount : 0));
  const cashedOut = sum((e) => (e.kind === 'withdraw' || e.kind === 'close' ? e.amount : 0));
  const realizedTotal = sum((e) =>
    e.kind === 'withdraw' || e.kind === 'close' ? e.realized || 0 : 0
  );
  const topupTotal = sum((e) => (e.kind === 'topup' ? e.amount : 0));
  const valueNow = closed ? 0 : asset.currentValue;
  const invested = asset.initialCapital + capWithdrawn;
  const roiTotal =
    invested > 0 ? ((valueNow + yieldTotal + cashedOut - invested) / invested) * 100 : 0;
  return {
    invested,
    valueNow,
    unrealized: closed ? 0 : asset.currentValue - asset.initialCapital,
    yieldTotal,
    cashedOut,
    realizedTotal,
    topupTotal,
    roiTotal,
  };
}
