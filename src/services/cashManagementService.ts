/**
 * Layanan Firestore untuk Modul 1: Manajemen Kas & Multi-Buku Kas (Ledgers)
 * Mendukung isolasi data per Buku Kas dengan Cloud Firestore & IndexedDB/LocalStorage fallback
 */
import { 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  writeBatch, 
  runTransaction,
  query, 
  where,
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Ledger, Account, AccountPocket, Transaction, Goal, Bill, Debt, BillCycle, CustomIntervalUnit, AutomationRule, AutomationType, AutomationCycle, SalaryHistoryRecord, ShiftDayLog, PTKPStatus } from '../types';

export const DEFAULT_USER_ID = 'demo_user_artha';

const STORAGE_KEY_LEDGERS = 'artha_offline_ledgers';
const STORAGE_KEY_ACTIVE_LEDGER = 'artha_active_ledger_id';
const STORAGE_KEY_ACCOUNTS = 'artha_offline_accounts';
const STORAGE_KEY_TRANSACTIONS = 'artha_offline_transactions';
const STORAGE_KEY_GOALS = 'artha_offline_goals';
const STORAGE_KEY_BILLS = 'artha_offline_bills';
const STORAGE_KEY_DEBTS = 'artha_offline_debts';
const STORAGE_KEY_AUTOMATIONS = 'artha_offline_automations';

// =========================================================================
// 1. MANAJEMEN BUKU KAS (LEDGERS)
// =========================================================================

export function getLocalLedgers(): Ledger[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEDGERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca ledgers lokal:', e);
  }

  const initialLedgers: Ledger[] = [
    {
      id: 'ledger_personal_default',
      name: 'Keuangan Pribadi',
      description: 'Arus kas harian, gaji, tabungan dan kebutuhan rumah',
      icon: 'BookOpen',
      colorAccent: '#2dd4a7', // sage green
      isDefault: true,
      createdAt: Date.now() - 86400000 * 30
    },
    {
      id: 'ledger_business_default',
      name: 'Bisnis & Proyek',
      description: 'Kas usaha sampingan, invoice klien dan operasional',
      icon: 'Briefcase',
      colorAccent: '#6c97ff', // dusty blue
      isDefault: false,
      createdAt: Date.now() - 86400000 * 15
    }
  ];

  localStorage.setItem(STORAGE_KEY_LEDGERS, JSON.stringify(initialLedgers));
  return initialLedgers;
}

export function saveLocalLedgers(ledgers: Ledger[]) {
  try {
    localStorage.setItem(STORAGE_KEY_LEDGERS, JSON.stringify(ledgers));
  } catch (e) {
    console.error('Gagal menyimpan ledgers lokal:', e);
  }
}

export function getActiveLedgerId(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_LEDGER);
    if (saved) return saved;
  } catch {}
  return 'ledger_personal_default';
}

export function setActiveLedgerId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_LEDGER, id);
  } catch {}
}

export async function fetchLedgers(userId: string = DEFAULT_USER_ID): Promise<Ledger[]> {
  try {
    const ref = collection(db, 'users', userId, 'ledgers');
    const q = query(ref, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const list: Ledger[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Ledger));
      saveLocalLedgers(list);
      return list;
    }
  } catch (err) {
    console.warn('Fallback ledgers offline:', err);
  }
  return getLocalLedgers();
}

export async function createLedger(
  userId: string = DEFAULT_USER_ID,
  data: { name: string; description?: string; colorAccent?: string; icon?: string }
): Promise<Ledger> {
  const newId = `ledger_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newLedger: Ledger = {
    id: newId,
    name: data.name.trim(),
    description: data.description?.trim() || '',
    colorAccent: data.colorAccent || '#2dd4a7',
    icon: data.icon || 'BookOpen',
    isDefault: false,
    createdAt: Date.now()
  };

  const list = getLocalLedgers();
  list.push(newLedger);
  saveLocalLedgers(list);

  try {
    const docRef = doc(db, 'users', userId, 'ledgers', newId);
    const cleanData = JSON.parse(JSON.stringify(newLedger));
    await setDoc(docRef, { ...cleanData, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore createLedger offline:', err);
  }

  return newLedger;
}

export async function updateLedger(
  userId: string = DEFAULT_USER_ID,
  ledgerId: string,
  data: Partial<Omit<Ledger, 'id' | 'createdAt'>>
): Promise<Ledger> {
  const list = getLocalLedgers();
  const idx = list.findIndex(l => l.id === ledgerId);
  if (idx === -1) throw new Error('Buku kas tidak ditemukan');

  const updated: Ledger = { ...list[idx], ...data };
  list[idx] = updated;
  saveLocalLedgers(list);

  try {
    const docRef = doc(db, 'users', userId, 'ledgers', ledgerId);
    const cleanData = JSON.parse(JSON.stringify(updated));
    await updateDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore updateLedger offline:', err);
  }

  return updated;
}

export async function deleteLedger(
  userId: string = DEFAULT_USER_ID, 
  ledgerId: string
): Promise<void> {
  const list = getLocalLedgers().filter(l => l.id !== ledgerId);
  saveLocalLedgers(list);

  // Bersihkan akun & transaksi terkait ledger ini dari penyimpanan lokal
  const allAccounts = getLocalAccounts().filter(a => a.ledgerId !== ledgerId);
  saveLocalAccounts(allAccounts);

  const allTxs = getLocalTransactions().filter(t => t.ledgerId !== ledgerId);
  saveLocalTransactions(allTxs);

  const allGoals = getLocalGoals().filter(g => g.ledgerId !== ledgerId);
  saveLocalGoals(allGoals);

  try {
    const batch = writeBatch(db);
    const docRef = doc(db, 'users', userId, 'ledgers', ledgerId);
    batch.delete(docRef);

    // Hapus juga akun-akun, transaksi, dan target yang berelasi dengan ledger ini di Firestore
    const accQuery = query(collection(db, 'users', userId, 'accounts'), where('ledgerId', '==', ledgerId));
    const accSnap = await getDocs(accQuery);
    accSnap.forEach(d => batch.delete(d.ref));

    const txQuery = query(collection(db, 'users', userId, 'transactions'), where('ledgerId', '==', ledgerId));
    const txSnap = await getDocs(txQuery);
    txSnap.forEach(d => batch.delete(d.ref));

    const goalQuery = query(collection(db, 'users', userId, 'goals'), where('ledgerId', '==', ledgerId));
    const goalSnap = await getDocs(goalQuery);
    goalSnap.forEach(d => batch.delete(d.ref));

    await batch.commit();
  } catch (err) {
    console.warn('Firestore deleteLedger offline:', err);
  }
}

// =========================================================================
// 2. MANAJEMEN AKUN TERIKAT PADA LEDGER (ACCOUNTS BY LEDGER)
// =========================================================================

export function getLocalAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca akun lokal:', e);
  }
  const initialAccounts: Account[] = [
    // Akun untuk Buku Kas Pribadi
    {
      id: 'acc_bca_default',
      ledgerId: 'ledger_personal_default',
      name: 'BCA Tabungan Utama',
      type: 'bank',
      balance: 14350000,
      colorAccent: '#6c97ff',
      createdAt: Date.now() - 86400000 * 20
    },
    {
      id: 'acc_cash_default',
      ledgerId: 'ledger_personal_default',
      name: 'Dompet Tunai',
      type: 'cash',
      balance: 1850000,
      colorAccent: '#2dd4a7',
      createdAt: Date.now() - 86400000 * 20
    },
    {
      id: 'acc_gopay_default',
      ledgerId: 'ledger_personal_default',
      name: 'GoPay & E-Wallet',
      type: 'ewallet',
      balance: 510000,
      colorAccent: '#ffc933',
      createdAt: Date.now() - 86400000 * 20
    },
    // Akun untuk Buku Kas Bisnis
    {
      id: 'acc_biz_mandiri',
      ledgerId: 'ledger_business_default',
      name: 'Mandiri Giro Bisnis',
      type: 'bank',
      balance: 42500000,
      colorAccent: '#6c97ff',
      createdAt: Date.now() - 86400000 * 10
    },
    {
      id: 'acc_biz_cash',
      ledgerId: 'ledger_business_default',
      name: 'Kas Operasional Usaha',
      type: 'cash',
      balance: 3500000,
      colorAccent: '#2dd4a7',
      createdAt: Date.now() - 86400000 * 10
    }
  ];
  localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(initialAccounts));
  return initialAccounts;
}

export function saveLocalAccounts(accounts: Account[]) {
  try {
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.error('Gagal menyimpan akun lokal:', e);
  }
}

/**
 * Ambil daftar akun HANYA untuk Buku Kas yang sedang aktif
 */
export async function fetchAccountsByLedger(
  userId: string = DEFAULT_USER_ID, 
  ledgerId: string
): Promise<Account[]> {
  try {
    const accountsRef = collection(db, 'users', userId, 'accounts');
    const q = query(accountsRef, where('ledgerId', '==', ledgerId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const accounts: Account[] = [];
      snapshot.forEach((d) => {
        accounts.push({ id: d.id, ...d.data() } as Account);
      });
      // Sinkronkan ke cache lokal
      const all = getLocalAccounts().filter(a => a.ledgerId !== ledgerId).concat(accounts);
      saveLocalAccounts(all);
      return accounts;
    }
  } catch (err) {
    console.warn('Fallback akun offline untuk ledger:', ledgerId, err);
  }
  return getLocalAccounts().filter(a => a.ledgerId === ledgerId);
}

export async function createAccount(
  userId: string = DEFAULT_USER_ID, 
  accountData: Omit<Account, 'id' | 'createdAt'>
): Promise<Account> {
  const newId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newAccount: Account = {
    ...accountData,
    id: newId,
    createdAt: Date.now()
  };

  const localList = getLocalAccounts();
  localList.push(newAccount);
  saveLocalAccounts(localList);

  try {
    const docRef = doc(db, 'users', userId, 'accounts', newId);
    const cleanData = JSON.parse(JSON.stringify(newAccount));
    await setDoc(docRef, { ...cleanData, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore offline createAccount:', err);
  }

  return newAccount;
}

export async function updateAccountData(
  userId: string = DEFAULT_USER_ID,
  accountId: string,
  updatedData: Partial<Omit<Account, 'id' | 'createdAt'>>
): Promise<Account> {
  const localList = getLocalAccounts();
  const idx = localList.findIndex(a => a.id === accountId);
  if (idx === -1) throw new Error('Akun tidak ditemukan');

  const updatedAccount: Account = {
    ...localList[idx],
    ...updatedData
  };
  localList[idx] = updatedAccount;
  saveLocalAccounts(localList);

  try {
    const docRef = doc(db, 'users', userId, 'accounts', accountId);
    const cleanData = JSON.parse(JSON.stringify(updatedAccount));
    await updateDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore updateDoc offline fallback:', err);
  }

  return updatedAccount;
}

export async function deleteAccount(userId: string = DEFAULT_USER_ID, accountId: string): Promise<void> {
  const localList = getLocalAccounts().filter(a => a.id !== accountId);
  saveLocalAccounts(localList);

  try {
    const docRef = doc(db, 'users', userId, 'accounts', accountId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore deleteDoc offline fallback:', err);
  }
}

/**
 * Sub-Kantong Alokasi Akun (Konsep Kantong Bank Jago)
 */
export async function addPocketToAccount(
  userId: string = DEFAULT_USER_ID,
  accountId: string,
  pocketData: Omit<AccountPocket, 'id' | 'createdAt'>
): Promise<Account> {
  const localList = getLocalAccounts();
  const idx = localList.findIndex(a => a.id === accountId);
  if (idx === -1) throw new Error('Akun induk tidak ditemukan.');

  const newPocket: AccountPocket = {
    id: `pocket_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ...pocketData,
    balance: Math.max(0, pocketData.balance || 0),
    createdAt: Date.now()
  };

  const account = { ...localList[idx] };
  const pockets = [...(account.pockets || []), newPocket];
  account.pockets = pockets;
  localList[idx] = account;
  saveLocalAccounts(localList);

  try {
    const docRef = doc(db, 'users', userId, 'accounts', accountId);
    await updateDoc(docRef, { pockets, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore addPocket offline fallback:', err);
  }

  return account;
}

export async function updatePocketInAccount(
  userId: string = DEFAULT_USER_ID,
  accountId: string,
  pocketId: string,
  updates: Partial<Omit<AccountPocket, 'id' | 'createdAt'>>
): Promise<Account> {
  const localList = getLocalAccounts();
  const idx = localList.findIndex(a => a.id === accountId);
  if (idx === -1) throw new Error('Akun induk tidak ditemukan.');

  const account = { ...localList[idx] };
  const pockets = [...(account.pockets || [])];
  const pIdx = pockets.findIndex(p => p.id === pocketId);
  if (pIdx === -1) throw new Error('Kantong tidak ditemukan.');

  pockets[pIdx] = { ...pockets[pIdx], ...updates };
  account.pockets = pockets;
  localList[idx] = account;
  saveLocalAccounts(localList);

  try {
    const docRef = doc(db, 'users', userId, 'accounts', accountId);
    await updateDoc(docRef, { pockets, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore updatePocket offline fallback:', err);
  }

  return account;
}

export async function deletePocketFromAccount(
  userId: string = DEFAULT_USER_ID,
  accountId: string,
  pocketId: string
): Promise<Account> {
  const localList = getLocalAccounts();
  const idx = localList.findIndex(a => a.id === accountId);
  if (idx === -1) throw new Error('Akun induk tidak ditemukan.');

  const account = { ...localList[idx] };
  account.pockets = (account.pockets || []).filter(p => p.id !== pocketId);
  localList[idx] = account;
  saveLocalAccounts(localList);

  try {
    const docRef = doc(db, 'users', userId, 'accounts', accountId);
    await updateDoc(docRef, { pockets: account.pockets, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore deletePocket offline fallback:', err);
  }

  return account;
}

export function calculateNetWorthAccounts(accounts: Account[]): {
  totalAssets: number;
  totalCreditDebt: number;
  netBalance: number;
} {
  let totalAssets = 0;
  let totalCreditDebt = 0;

  accounts.forEach((acc) => {
    if (acc.type === 'credit_card') {
      totalCreditDebt += Math.max(0, acc.balance);
    } else {
      totalAssets += acc.balance;
    }
  });

  return {
    totalAssets,
    totalCreditDebt,
    netBalance: totalAssets - totalCreditDebt
  };
}

// =========================================================================
// 3. TRANSAKSI TERIKAT PADA LEDGER (TRANSACTIONS BY LEDGER)
// =========================================================================

export function getLocalTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca transaksi lokal:', e);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prevMonthDate = new Date(year, now.getMonth() - 1, 15);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');

  const initialTx: Transaction[] = [
    // --- TRANSAKSI BULAN INI (NOVEMBER 2026) ---
    {
      id: 'tx_init_1',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_bca_default',
      type: 'income',
      amount: 18000000,
      category: 'Gaji Bulanan',
      date: `${year}-${month}-01`,
      note: 'Gaji rutin perusahaan PT Artha Kreasi',
      createdAt: Date.now() - 86400000 * 7
    },
    {
      id: 'tx_init_side_1',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_jago_default',
      type: 'income',
      amount: 4500000,
      category: 'Freelance & Side Project',
      date: `${year}-${month}-04`,
      note: 'Pembayaran termin 1 UI/UX design web',
      createdAt: Date.now() - 86400000 * 4
    },
    {
      id: 'tx_init_2',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_bca_default',
      type: 'expense',
      amount: 2550000,
      category: 'Tagihan & Utilitas',
      date: `${year}-${month}-02`,
      note: 'Listrik PLN, Air PAM & Wifi Rumah',
      createdAt: Date.now() - 86400000 * 6
    },
    {
      id: 'tx_init_food_1',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_gopay_default',
      type: 'expense',
      amount: 1250000,
      category: 'Makanan & Minuman',
      date: `${year}-${month}-03`,
      note: 'Belanja bahan dapur & makan siang mingguan',
      createdAt: Date.now() - 86400000 * 5
    },
    {
      id: 'tx_init_transport_1',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_gopay_default',
      type: 'expense',
      amount: 450000,
      category: 'Transportasi',
      date: `${year}-${month}-05`,
      note: 'Bensin Pertamax & Top-up Tol E-Money',
      createdAt: Date.now() - 86400000 * 3
    },
    {
      id: 'tx_init_health_1',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_bca_default',
      type: 'expense',
      amount: 650000,
      category: 'Kesehatan',
      date: `${year}-${month}-06`,
      note: 'Vitamin rutin & medical check up berkala',
      createdAt: Date.now() - 86400000 * 2
    },
    {
      id: 'tx_init_alloc_2',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_bca_default',
      goalId: 'goal_emergency_fund',
      type: 'expense',
      amount: 2000000,
      category: 'Sinking Fund: Dana Darurat (3 Bulan)',
      date: `${year}-${month}-02`,
      note: 'Sisihan gaji bulanan untuk cadangan medis',
      createdAt: Date.now() - 86400000 * 6
    },
    // --- TRANSAKSI BULAN LALU (OKTOBER 2026) ---
    {
      id: 'tx_init_prev_inc_1',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_bca_default',
      type: 'income',
      amount: 18000000,
      category: 'Gaji Bulanan',
      date: `${prevYear}-${prevMonth}-01`,
      note: 'Gaji rutin perusahaan bulan lalu',
      createdAt: Date.now() - 86400000 * 38
    },
    {
      id: 'tx_init_prev_food',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_gopay_default',
      type: 'expense',
      amount: 3200000,
      category: 'Makanan & Minuman',
      date: `${prevYear}-${prevMonth}-15`,
      note: 'Total makan & resto bulan lalu',
      createdAt: Date.now() - 86400000 * 24
    },
    {
      id: 'tx_init_alloc_1',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_bca_default',
      goalId: 'goal_emergency_fund',
      type: 'expense',
      amount: 4000000,
      category: 'Sinking Fund: Dana Darurat (3 Bulan)',
      date: `${prevYear}-${prevMonth}-10`,
      note: 'Alokasi awal dana darurat dari bonus',
      createdAt: Date.now() - 86400000 * 29
    },
    {
      id: 'tx_init_alloc_3',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_bca_default',
      goalId: 'goal_macbook',
      type: 'expense',
      amount: 5000000,
      category: 'Wishlist: Beli Laptop Kerja Baru',
      date: `${prevYear}-${prevMonth}-20`,
      note: 'Tabungan pertama untuk laptop kerja baru',
      createdAt: Date.now() - 86400000 * 19
    },
    {
      id: 'tx_init_prev_bill',
      ledgerId: 'ledger_personal_default',
      accountId: 'acc_bca_default',
      type: 'expense',
      amount: 2400000,
      category: 'Tagihan & Utilitas',
      date: `${prevYear}-${prevMonth}-05`,
      note: 'Tagihan utilitas & air bulan lalu',
      createdAt: Date.now() - 86400000 * 34
    },
    // --- TRANSAKSI BUKU KAS BISNIS ---
    {
      id: 'tx_biz_1',
      ledgerId: 'ledger_business_default',
      accountId: 'acc_biz_mandiri',
      type: 'income',
      amount: 25000000,
      category: 'Pembayaran Invoice Klien',
      date: `${year}-${month}-03`,
      note: 'Proyek Web Desain Q4',
      createdAt: Date.now() - 86400000 * 5
    },
    {
      id: 'tx_biz_2',
      ledgerId: 'ledger_business_default',
      accountId: 'acc_biz_mandiri',
      type: 'expense',
      amount: 4200000,
      category: 'Operasional & Server Cloud',
      date: `${year}-${month}-04`,
      note: 'Hosting AWS & SaaS subscription',
      createdAt: Date.now() - 86400000 * 4
    }
  ];
  localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(initialTx));
  return initialTx;
}

export function saveLocalTransactions(txs: Transaction[]) {
  try {
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(txs));
  } catch (e) {
    console.error('Gagal menyimpan transaksi lokal:', e);
  }
}

/**
 * Ambil daftar transaksi HANYA untuk Buku Kas aktif
 */
export async function fetchTransactionsByLedger(
  userId: string = DEFAULT_USER_ID, 
  ledgerId: string
): Promise<Transaction[]> {
  try {
    const txRef = collection(db, 'users', userId, 'transactions');
    const q = query(txRef, where('ledgerId', '==', ledgerId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const list: Transaction[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Transaction));
      list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      // Sinkronkan ke cache lokal agar tidak pernah hilang saat operasi hapus/edit
      const otherTxs = getLocalTransactions().filter(t => t.ledgerId !== ledgerId);
      saveLocalTransactions([...otherTxs, ...list]);
      return list;
    }
  } catch (err) {
    console.warn('Menggunakan fallback transaksi lokal per ledger:', err);
  }
  return getLocalTransactions()
    .filter(t => t.ledgerId === ledgerId)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

/**
 * Ambil daftar transaksi dengan filter rentang tanggal untuk Buku Kas aktif
 */
export async function fetchTransactionsByDateRange(
  userId: string = DEFAULT_USER_ID,
  ledgerId: string,
  startDate?: string,
  endDate?: string
): Promise<Transaction[]> {
  try {
    const txRef = collection(db, 'users', userId, 'transactions');
    let q = query(txRef, where('ledgerId', '==', ledgerId));
    if (startDate) {
      q = query(q, where('date', '>=', startDate));
    }
    if (endDate) {
      q = query(q, where('date', '<=', endDate));
    }
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const list: Transaction[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Transaction));
      list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      return list;
    }
  } catch (err) {
    console.warn('Fallback transaksi lokal per rentang tanggal:', err);
  }

  let list = getLocalTransactions().filter(t => t.ledgerId === ledgerId);
  if (startDate) {
    list = list.filter(t => t.date >= startDate);
  }
  if (endDate) {
    list = list.filter(t => t.date <= endDate);
  }
  return list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export async function createTransaction(
  userId: string = DEFAULT_USER_ID,
  txData: {
    ledgerId: string;
    accountId: string;
    type: 'income' | 'expense';
    amount: number;
    category: string;
    note?: string;
    date: string;
  }
): Promise<Transaction> {
  const newTxId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newTx: Transaction = {
    id: newTxId,
    ledgerId: txData.ledgerId,
    accountId: txData.accountId,
    type: txData.type,
    amount: txData.amount,
    category: txData.category,
    note: txData.note || '',
    date: txData.date,
    createdAt: Date.now()
  };

  const currentAccounts = getLocalAccounts();
  const accIndex = currentAccounts.findIndex(a => a.id === txData.accountId);
  if (accIndex !== -1) {
    if (txData.type === 'income') {
      currentAccounts[accIndex].balance += txData.amount;
    } else {
      currentAccounts[accIndex].balance -= txData.amount;
    }
    saveLocalAccounts(currentAccounts);
  }

  const currentTxs = getLocalTransactions();
  currentTxs.unshift(newTx);
  saveLocalTransactions(currentTxs);

  try {
    const accountRef = doc(db, 'users', userId, 'accounts', txData.accountId);
    const txRef = doc(db, 'users', userId, 'transactions', newTxId);
    const cleanData = JSON.parse(JSON.stringify(newTx));
    await runTransaction(db, async (firestoreTx) => {
      const accountSnap = await firestoreTx.get(accountRef);
      if (accountSnap.exists()) {
        const currentBal = accountSnap.data().balance || 0;
        const newBal = txData.type === 'income' 
          ? currentBal + txData.amount 
          : currentBal - txData.amount;

        firestoreTx.update(accountRef, { balance: newBal, updatedAt: serverTimestamp() });
      }
      firestoreTx.set(txRef, { ...newTx, createdAt: serverTimestamp() });
    });
  } catch (err) {
    console.warn('Firestore transaction offline fallback:', err);
  }

  return newTx;
}

export async function updateTransactionWithBalanceSync(
  userId: string = DEFAULT_USER_ID,
  oldTx: Transaction,
  newTxData: {
    ledgerId: string;
    accountId: string;
    toAccountId?: string | null;
    goalId?: string;
    type: 'income' | 'expense' | 'transfer';
    amount: number;
    category: string;
    note?: string;
    date: string;
  }
): Promise<Transaction> {
  const currentAccounts = getLocalAccounts();

  // 1. Rollback efek transaksi lama pada saldo akun
  if (oldTx.type === 'income') {
    const acc = currentAccounts.find(a => a.id === oldTx.accountId);
    if (acc) acc.balance -= oldTx.amount;
  } else if (oldTx.type === 'expense') {
    const acc = currentAccounts.find(a => a.id === oldTx.accountId);
    if (acc) acc.balance += oldTx.amount;
  } else if (oldTx.type === 'transfer' && oldTx.toAccountId) {
    const src = currentAccounts.find(a => a.id === oldTx.accountId);
    const dst = currentAccounts.find(a => a.id === oldTx.toAccountId);
    if (src) src.balance += oldTx.amount;
    if (dst) dst.balance -= oldTx.amount;
  }

  // 2. Terapkan efek transaksi baru pada saldo akun
  if (newTxData.type === 'income') {
    const acc = currentAccounts.find(a => a.id === newTxData.accountId);
    if (acc) acc.balance += newTxData.amount;
  } else if (newTxData.type === 'expense') {
    const acc = currentAccounts.find(a => a.id === newTxData.accountId);
    if (acc) acc.balance -= newTxData.amount;
  } else if (newTxData.type === 'transfer' && newTxData.toAccountId) {
    const src = currentAccounts.find(a => a.id === newTxData.accountId);
    const dst = currentAccounts.find(a => a.id === newTxData.toAccountId);
    if (src) src.balance -= newTxData.amount;
    if (dst) dst.balance += newTxData.amount;
  }

  saveLocalAccounts(currentAccounts);

  // 3. SINKRONISASI RELASIONAL GOALS (DANA TERKUMPUL)
  const currentGoals = getLocalGoals();
  const effectiveOldGoalId = oldTx.goalId;
  const effectiveNewGoalId = newTxData.goalId !== undefined ? newTxData.goalId : oldTx.goalId;

  if (effectiveOldGoalId && effectiveOldGoalId === effectiveNewGoalId) {
    // Goal sama: hitung selisih nominal (selisih = baru - lama)
    const diff = newTxData.amount - oldTx.amount;
    const goalIdx = currentGoals.findIndex(g => g.id === effectiveOldGoalId);
    if (goalIdx !== -1) {
      const g = currentGoals[goalIdx];
      g.currentAmount = Math.max(0, (g.currentAmount || 0) + diff);
      g.isCompleted = g.currentAmount >= g.targetAmount;
      currentGoals[goalIdx] = g;
      saveLocalGoals(currentGoals);
    }
  } else {
    // Jika goal berubah atau goal baru ditautkan/dilepas
    if (effectiveOldGoalId) {
      const oldGoalIdx = currentGoals.findIndex(g => g.id === effectiveOldGoalId);
      if (oldGoalIdx !== -1) {
        const og = currentGoals[oldGoalIdx];
        og.currentAmount = Math.max(0, (og.currentAmount || 0) - oldTx.amount);
        og.isCompleted = og.currentAmount >= og.targetAmount;
        currentGoals[oldGoalIdx] = og;
      }
    }
    if (effectiveNewGoalId) {
      const newGoalIdx = currentGoals.findIndex(g => g.id === effectiveNewGoalId);
      if (newGoalIdx !== -1) {
        const ng = currentGoals[newGoalIdx];
        ng.currentAmount = (ng.currentAmount || 0) + newTxData.amount;
        ng.isCompleted = ng.currentAmount >= ng.targetAmount;
        currentGoals[newGoalIdx] = ng;
      }
    }
    saveLocalGoals(currentGoals);
  }

  const updatedTx: Transaction = {
    ...oldTx,
    ...newTxData,
    goalId: effectiveNewGoalId
  };

  const currentTxs = getLocalTransactions();
  const txIdx = currentTxs.findIndex(t => t.id === oldTx.id);
  if (txIdx !== -1) {
    currentTxs[txIdx] = updatedTx;
    saveLocalTransactions(currentTxs);
  }

  try {
    const batch = writeBatch(db);
    const txRef = doc(db, 'users', userId, 'transactions', oldTx.id);
    batch.update(txRef, { 
      ...newTxData, 
      goalId: effectiveNewGoalId || null,
      updatedAt: serverTimestamp() 
    });

    const affectedAccountIds = Array.from(new Set([
      oldTx.accountId,
      oldTx.toAccountId,
      newTxData.accountId,
      newTxData.toAccountId
    ].filter(Boolean) as string[]));

    affectedAccountIds.forEach(accId => {
      const accObj = currentAccounts.find(a => a.id === accId);
      if (accObj) {
        const accRef = doc(db, 'users', userId, 'accounts', accId);
        batch.update(accRef, { balance: accObj.balance, updatedAt: serverTimestamp() });
      }
    });

    // Update dokumen goal di Firestore secara atomik
    const affectedGoalIds = Array.from(new Set([effectiveOldGoalId, effectiveNewGoalId].filter(Boolean) as string[]));
    affectedGoalIds.forEach(gId => {
      const gObj = currentGoals.find(g => g.id === gId);
      if (gObj) {
        const gRef = doc(db, 'users', userId, 'goals', gId);
        batch.update(gRef, {
          currentAmount: gObj.currentAmount,
          isCompleted: gObj.isCompleted,
          updatedAt: serverTimestamp()
        });
      }
    });

    await batch.commit();
  } catch (err) {
    console.warn('Firestore batch write offline fallback:', err);
  }

  return updatedTx;
}

export async function executeAccountTransfer(
  userId: string = DEFAULT_USER_ID,
  payload: {
    ledgerId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;
    note?: string;
    date: string;
  }
): Promise<Transaction> {
  if (payload.sourceAccountId === payload.destinationAccountId) {
    throw new Error('Akun asal dan akun tujuan tidak boleh sama.');
  }
  if (payload.amount <= 0) {
    throw new Error('Nominal transfer harus lebih besar dari 0.');
  }

  const newTxId = `trf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const transferTx: Transaction = {
    id: newTxId,
    ledgerId: payload.ledgerId,
    accountId: payload.sourceAccountId,
    toAccountId: payload.destinationAccountId,
    type: 'transfer',
    amount: payload.amount,
    category: 'Transfer Saldo',
    note: payload.note || 'Transfer saldo antar akun',
    date: payload.date,
    createdAt: Date.now()
  };

  const currentAccounts = getLocalAccounts();
  const sourceAcc = currentAccounts.find(a => a.id === payload.sourceAccountId);
  const destAcc = currentAccounts.find(a => a.id === payload.destinationAccountId);

  if (sourceAcc && destAcc) {
    sourceAcc.balance -= payload.amount;
    destAcc.balance += payload.amount;
    saveLocalAccounts(currentAccounts);
  }

  const currentTxs = getLocalTransactions();
  currentTxs.unshift(transferTx);
  saveLocalTransactions(currentTxs);

  try {
    const batch = writeBatch(db);
    const sourceRef = doc(db, 'users', userId, 'accounts', payload.sourceAccountId);
    const destRef = doc(db, 'users', userId, 'accounts', payload.destinationAccountId);
    const txDocRef = doc(db, 'users', userId, 'transactions', newTxId);

    if (sourceAcc && destAcc) {
      batch.update(sourceRef, { balance: sourceAcc.balance, updatedAt: serverTimestamp() });
      batch.update(destRef, { balance: destAcc.balance, updatedAt: serverTimestamp() });
    }

    batch.set(txDocRef, { ...transferTx, createdAt: serverTimestamp() });
    await batch.commit();
  } catch (err) {
    console.warn('Firestore batch write offline fallback:', err);
  }

  return transferTx;
}

export async function deleteTransaction(userId: string = DEFAULT_USER_ID, txId: string): Promise<void> {
  const currentTxs = getLocalTransactions();
  let targetTx = currentTxs.find(t => t.id === txId);

  // Jika tidak ditemukan di cache lokal, coba ambil dari Firestore untuk mendapatkan metadata rollback
  if (!targetTx) {
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'transactions', txId));
      if (snap.exists()) {
        targetTx = { id: snap.id, ...snap.data() } as Transaction;
      }
    } catch (e) {
      console.warn('Gagal membaca transaksi dari Firestore untuk dihapus:', e);
    }
  }

  // Jika tetap tidak ditemukan sama sekali, pastikan tetap hapus dari Firestore & cache
  if (!targetTx) {
    saveLocalTransactions(currentTxs.filter(t => t.id !== txId));
    try {
      await deleteDoc(doc(db, 'users', userId, 'transactions', txId));
    } catch (e) {
      console.warn('Fallback deleteDoc:', e);
    }
    return;
  }

  // 1. Pengecekan Relasi & Rollback Saldo Akun (Kas / Bank / Dompet)
  const currentAccounts = getLocalAccounts();
  if (targetTx.type === 'income') {
    const acc = currentAccounts.find(a => a.id === targetTx.accountId);
    if (acc) acc.balance -= targetTx.amount;
  } else if (targetTx.type === 'expense') {
    const acc = currentAccounts.find(a => a.id === targetTx.accountId);
    if (acc) acc.balance += targetTx.amount;
  } else if (targetTx.type === 'transfer' && targetTx.toAccountId) {
    const src = currentAccounts.find(a => a.id === targetTx.accountId);
    const dst = currentAccounts.find(a => a.id === targetTx.toAccountId);
    if (src) src.balance += targetTx.amount;
    if (dst) dst.balance -= targetTx.amount;
  }
  saveLocalAccounts(currentAccounts);

  // 2. Eksekusi Relasional: Kurangi dana_terkumpul di koleksi goals jika transaksi adalah alokasi
  let updatedGoalForBatch: Goal | null = null;
  const currentGoals = getLocalGoals();
  if (targetTx.goalId) {
    const goalIdx = currentGoals.findIndex(g => g.id === targetTx.goalId);
    if (goalIdx !== -1) {
      const g = currentGoals[goalIdx];
      g.currentAmount = Math.max(0, (g.currentAmount || 0) - targetTx.amount);
      g.isCompleted = g.currentAmount >= g.targetAmount;
      currentGoals[goalIdx] = g;
      saveLocalGoals(currentGoals);
      updatedGoalForBatch = g;
    }
  }

  // 2b. Eksekusi Relasional: Kurangi totalPaid pada bills jika transaksi adalah pembayaran tagihan
  let updatedBillForBatch: Bill | null = null;
  if (targetTx.billId) {
    const currentBills = getLocalBills();
    const billIdx = currentBills.findIndex(b => b.id === targetTx.billId);
    if (billIdx !== -1) {
      const b = currentBills[billIdx];
      // Cari riwayat transaksi untuk tagihan ini (diurutkan paling baru ke paling lama)
      const billTxs = currentTxs
        .filter(t => t.billId === targetTx.billId)
        .sort((x, y) => Number(y.createdAt) - Number(x.createdAt));
      
      const isLatest = billTxs.length > 0 && billTxs[0].id === targetTx.id;

      // a. Kurangi totalPaid sebesar nominal transaksi yang dihapus
      b.totalPaid = Math.max(0, (b.totalPaid || 0) - targetTx.amount);

      // b. Jika transaksi yang dihapus adalah transaksi TERBARU, lakukan ROLLBACK tanggal jatuh tempo
      if (isLatest) {
        b.nextPaymentDate = stepBackPaymentDate(
          b.nextPaymentDate, 
          b.cycle, 
          b.customIntervalCount, 
          b.customIntervalUnit
        );

        // Jika tagihan fluktuatif, kembalikan lastNominal ke transaksi sebelumnya (jika ada)
        if (b.pricingType === 'variable') {
          const prevTx = billTxs[1]; // Transaksi kedua terbaru
          b.lastNominal = prevTx ? prevTx.amount : (b.lastNominal || 0);
        }
      }

      currentBills[billIdx] = b;
      saveLocalBills(currentBills);
      updatedBillForBatch = b;
    }
  }

  // 2c. Eksekusi Relasional: Kembalikan sisa utang pada debts jika transaksi adalah cicilan utang
  let updatedDebtForBatch: Debt | null = null;
  if (targetTx.debtId) {
    const currentDebts = getLocalDebts();
    const debtIdx = currentDebts.findIndex(d => d.id === targetTx.debtId);
    if (debtIdx !== -1) {
      const d = currentDebts[debtIdx];
      // Cari riwayat transaksi untuk utang ini (diurutkan paling baru ke paling lama)
      const debtTxs = currentTxs
        .filter(t => t.debtId === targetTx.debtId)
        .sort((x, y) => Number(y.createdAt) - Number(x.createdAt));
      
      const isLatest = debtTxs.length > 0 && debtTxs[0].id === targetTx.id;

      // a. Kembalikan sisa pokok utang
      d.remainingDebt = (d.remainingDebt || 0) + targetTx.amount;
      d.isPaidOff = d.remainingDebt <= 0;

      // b. Jika transaksi yang dihapus adalah transaksi TERBARU, lakukan ROLLBACK tanggal jatuh tempo cicilan
      if (isLatest && d.nextPaymentDate) {
        d.nextPaymentDate = stepBackPaymentDate(
          d.nextPaymentDate, 
          d.cycle || 'monthly', 
          d.customIntervalCount, 
          d.customIntervalUnit
        );
      }

      currentDebts[debtIdx] = d;
      saveLocalDebts(currentDebts);
      updatedDebtForBatch = d;
    }
  }

  // Hapus dari riwayat transaksi lokal
  saveLocalTransactions(currentTxs.filter(t => t.id !== txId));

  // 3. Eksekusi Atomik Multi-Dokumen via Firestore Batch Write
  try {
    const batch = writeBatch(db);
    const txRef = doc(db, 'users', userId, 'transactions', txId);
    batch.delete(txRef);

    // Update saldo akun di Firestore
    if (targetTx.type === 'transfer' && targetTx.toAccountId) {
      const srcAcc = currentAccounts.find(a => a.id === targetTx.accountId);
      const dstAcc = currentAccounts.find(a => a.id === targetTx.toAccountId);
      if (srcAcc) batch.update(doc(db, 'users', userId, 'accounts', targetTx.accountId), { balance: srcAcc.balance, updatedAt: serverTimestamp() });
      if (dstAcc) batch.update(doc(db, 'users', userId, 'accounts', targetTx.toAccountId), { balance: dstAcc.balance, updatedAt: serverTimestamp() });
    } else if (targetTx.accountId && targetTx.accountId !== 'manual') {
      const acc = currentAccounts.find(a => a.id === targetTx.accountId);
      if (acc) batch.update(doc(db, 'users', userId, 'accounts', targetTx.accountId), { balance: acc.balance, updatedAt: serverTimestamp() });
    }

    // Jika transaksi adalah alokasi: Kurangi dana_terkumpul pada koleksi goals di Firestore
    if (targetTx.goalId) {
      const goalRef = doc(db, 'users', userId, 'goals', targetTx.goalId);
      if (updatedGoalForBatch) {
        batch.update(goalRef, {
          currentAmount: updatedGoalForBatch.currentAmount,
          isCompleted: updatedGoalForBatch.isCompleted,
          updatedAt: serverTimestamp()
        });
      } else {
        try {
          const goalSnap = await getDoc(goalRef);
          if (goalSnap.exists()) {
            const gData = goalSnap.data();
            const targetAmt = gData.targetAmount || 0;
            const newCur = Math.max(0, (gData.currentAmount || 0) - targetTx.amount);
            batch.update(goalRef, {
              currentAmount: newCur,
              isCompleted: newCur >= targetAmt,
              updatedAt: serverTimestamp()
            });
          }
        } catch (fetchErr) {
          console.warn('Gagal membaca goal snapshot saat hapus alokasi:', fetchErr);
        }
      }
    }

    // Jika transaksi adalah pembayaran tagihan: Update totalPaid, nextPaymentDate & lastNominal di Firestore
    if (targetTx.billId && updatedBillForBatch) {
      const billRef = doc(db, 'users', userId, 'bills', targetTx.billId);
      batch.update(billRef, {
        totalPaid: updatedBillForBatch.totalPaid,
        nextPaymentDate: updatedBillForBatch.nextPaymentDate,
        lastNominal: updatedBillForBatch.lastNominal !== undefined ? updatedBillForBatch.lastNominal : null,
        updatedAt: serverTimestamp()
      });
    }

    // Jika transaksi adalah cicilan utang: Update remainingDebt, isPaidOff, nextPaymentDate di Firestore
    if (targetTx.debtId && updatedDebtForBatch) {
      const debtRef = doc(db, 'users', userId, 'debts', targetTx.debtId);
      batch.update(debtRef, {
        remainingDebt: updatedDebtForBatch.remainingDebt,
        isPaidOff: updatedDebtForBatch.isPaidOff,
        nextPaymentDate: updatedDebtForBatch.nextPaymentDate || null,
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
  } catch (e) {
    console.warn('Firestore delete tx offline fallback:', e);
  }
}

// =========================================================================
// 4. MODUL 2: GOALS & MASA DEPAN (WISHLIST & SINKING FUNDS)
// =========================================================================

export function getLocalGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GOALS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca goals lokal:', e);
  }

  const initialGoals: Goal[] = [
    {
      id: 'goal_emergency_fund',
      ledgerId: 'ledger_personal_default',
      name: 'Dana Darurat (3 Bulan)',
      type: 'sinking_fund',
      targetAmount: 15000000,
      currentAmount: 6000000,
      deadline: '2026-12-31',
      sourceAccountId: 'acc_bca_default',
      colorAccent: '#2dd4a7', // sage
      note: 'Simpanan darurat bila ada kebutuhan medis/perbaikan mendadak',
      isCompleted: false,
      createdAt: Date.now() - 86400000 * 20
    },
    {
      id: 'goal_macbook',
      ledgerId: 'ledger_personal_default',
      name: 'Beli Laptop Kerja Baru',
      type: 'wishlist',
      targetAmount: 12500000,
      currentAmount: 5000000,
      deadline: '2027-03-31',
      colorAccent: '#6c97ff', // dusty blue
      note: 'Upgrade laptop untuk produktivitas kerja',
      isCompleted: false,
      createdAt: Date.now() - 86400000 * 15
    },
    {
      id: 'goal_vehicle_tax',
      ledgerId: 'ledger_personal_default',
      name: 'Pajak & Servis Kendaraan',
      type: 'sinking_fund',
      targetAmount: 1800000,
      currentAmount: 1800000,
      deadline: '2026-11-30',
      sourceAccountId: 'acc_bca_default',
      colorAccent: '#ffc933', // sand
      note: 'Pajak tahunan motor & ganti oli',
      isCompleted: true,
      createdAt: Date.now() - 86400000 * 10
    },
    {
      id: 'goal_studio_gear',
      ledgerId: 'ledger_business_default',
      name: 'Pengadaan Kamera & Lensa',
      type: 'sinking_fund',
      targetAmount: 25000000,
      currentAmount: 10000000,
      deadline: '2027-02-28',
      sourceAccountId: 'acc_business_bank',
      colorAccent: '#6c97ff',
      note: 'Aset penunjang proyek video klien',
      isCompleted: false,
      createdAt: Date.now() - 86400000 * 5
    }
  ];

  localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(initialGoals));
  return initialGoals;
}

export function saveLocalGoals(goals: Goal[]) {
  try {
    localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
  } catch (e) {
    console.error('Gagal menyimpan goals lokal:', e);
  }
}

/**
 * Fetch Goals yang HANYA berelasi dengan ledgerId aktif
 */
export async function fetchGoalsByLedger(
  userId: string = DEFAULT_USER_ID,
  ledgerId: string
): Promise<Goal[]> {
  try {
    const goalsRef = collection(db, 'users', userId, 'goals');
    const q = query(goalsRef, where('ledgerId', '==', ledgerId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const list: Goal[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Goal));

      // Gabungkan dengan cache lokal
      const allGoals = getLocalGoals().filter(g => g.ledgerId !== ledgerId);
      saveLocalGoals([...allGoals, ...list]);
      return list;
    }
  } catch (err) {
    console.warn('Fallback goals offline:', err);
  }

  return getLocalGoals().filter(g => g.ledgerId === ledgerId);
}

/**
 * Buat Goal Baru (Wishlist / Sinking Fund)
 */
export async function createGoal(
  userId: string = DEFAULT_USER_ID,
  payload: {
    ledgerId: string;
    name: string;
    type: 'wishlist' | 'sinking_fund';
    targetAmount: number;
    initialAmount?: number;
    deadline?: string;
    sourceAccountId?: string;
    colorAccent?: string;
    note?: string;
  }
): Promise<Goal> {
  const newId = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const currentAmount = Math.max(0, payload.initialAmount || 0);

  const newGoal: Goal = {
    id: newId,
    ledgerId: payload.ledgerId,
    name: payload.name.trim(),
    type: payload.type,
    targetAmount: Math.max(1, payload.targetAmount),
    currentAmount,
    deadline: payload.deadline || '',
    sourceAccountId: payload.sourceAccountId || '',
    colorAccent: payload.colorAccent || (payload.type === 'sinking_fund' ? '#ffc933' : '#6c97ff'),
    note: payload.note?.trim() || '',
    isCompleted: currentAmount >= payload.targetAmount,
    createdAt: Date.now()
  };

  const list = getLocalGoals();
  list.unshift(newGoal);
  saveLocalGoals(list);

  try {
    const docRef = doc(db, 'users', userId, 'goals', newId);
    const cleanData = JSON.parse(JSON.stringify(newGoal));
    await setDoc(docRef, { ...cleanData, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore createGoal offline fallback:', err);
  }

  return newGoal;
}

/**
 * Update Data Goal
 */
export async function updateGoalData(
  userId: string = DEFAULT_USER_ID,
  goalId: string,
  payload: Partial<Omit<Goal, 'id' | 'createdAt'>>
): Promise<Goal> {
  const list = getLocalGoals();
  const idx = list.findIndex(g => g.id === goalId);
  if (idx === -1) throw new Error('Target (Goal) tidak ditemukan');

  const updated: Goal = {
    ...list[idx],
    ...payload,
    isCompleted: (payload.currentAmount ?? list[idx].currentAmount) >= (payload.targetAmount ?? list[idx].targetAmount)
  };
  list[idx] = updated;
  saveLocalGoals(list);

  try {
    const docRef = doc(db, 'users', userId, 'goals', goalId);
    const cleanData = JSON.parse(JSON.stringify(updated));
    await updateDoc(docRef, { ...cleanData, isCompleted: updated.isCompleted, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore updateGoalData offline fallback:', err);
  }

  return updated;
}

/**
 * Hapus Goal
 */
export async function deleteGoal(
  userId: string = DEFAULT_USER_ID,
  goalId: string
): Promise<void> {
  const list = getLocalGoals().filter(g => g.id !== goalId);
  saveLocalGoals(list);

  try {
    const docRef = doc(db, 'users', userId, 'goals', goalId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore deleteGoal offline fallback:', err);
  }
}

/**
 * ATURAN SINKRONISASI: Alokasikan Dana ke Sinking Fund atau Wishlist
 * Jika memiliki sourceAccountId, otomatis memotong saldo akun sumber & mencatat transaksi pengeluaran.
 */
export async function allocateFundsToGoal(
  userId: string = DEFAULT_USER_ID,
  payload: {
    goalId: string;
    amount: number;
    sourceAccountId?: string;
    date?: string;
    note?: string;
  }
): Promise<{ goal: Goal; transaction?: Transaction; updatedAccount?: Account }> {
  const currentGoals = getLocalGoals();
  const goalIdx = currentGoals.findIndex(g => g.id === payload.goalId);
  if (goalIdx === -1) throw new Error('Target (Goal) tidak ditemukan');

  const goal = { ...currentGoals[goalIdx] };
  const numAmount = Math.max(0, payload.amount);
  if (numAmount <= 0) throw new Error('Nominal alokasi harus lebih dari 0');

  let transaction: Transaction | undefined;
  let updatedAccount: Account | undefined;

  // 1. Jika sumber dana ditentukan (wajib untuk Sinking Fund):
  if (payload.sourceAccountId) {
    const currentAccounts = getLocalAccounts();
    const accIdx = currentAccounts.findIndex(a => a.id === payload.sourceAccountId);
    if (accIdx === -1) throw new Error('Akun sumber dana tidak ditemukan');

    const sourceAcc = currentAccounts[accIdx];
    sourceAcc.balance -= numAmount; // Potong saldo akun secara riil
    saveLocalAccounts(currentAccounts);
    updatedAccount = sourceAcc;

    // Catat transaksi pengeluaran alokasi dana
    const newTxId = `tx_goal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const txCategory = goal.type === 'sinking_fund' 
      ? `Sinking Fund: ${goal.name}` 
      : `Wishlist: ${goal.name}`;

    transaction = {
      id: newTxId,
      ledgerId: goal.ledgerId,
      accountId: sourceAcc.id,
      goalId: goal.id, // Explicit goalId untuk query riwayat target
      type: 'expense',
      amount: numAmount,
      category: txCategory,
      note: payload.note || `Alokasi tabungan untuk target "${goal.name}"`,
      date: payload.date || new Date().toISOString().split('T')[0],
      createdAt: Date.now()
    };

    const currentTxs = getLocalTransactions();
    currentTxs.unshift(transaction);
    saveLocalTransactions(currentTxs);
  } else {
    // Alokasi tanpa akun sumber (pencatatan manual progres wishlist)
    const newTxId = `tx_goal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    transaction = {
      id: newTxId,
      ledgerId: goal.ledgerId,
      accountId: 'manual',
      goalId: goal.id,
      type: 'expense',
      amount: numAmount,
      category: `Alokasi: ${goal.name}`,
      note: payload.note || `Alokasi tabungan untuk target "${goal.name}"`,
      date: payload.date || new Date().toISOString().split('T')[0],
      createdAt: Date.now()
    };

    const currentTxs = getLocalTransactions();
    currentTxs.unshift(transaction);
    saveLocalTransactions(currentTxs);
  }

  // 2. Tambah progres target
  goal.currentAmount = (goal.currentAmount || 0) + numAmount;
  if (goal.currentAmount >= goal.targetAmount) {
    goal.isCompleted = true;
  }
  currentGoals[goalIdx] = goal;
  saveLocalGoals(currentGoals);

  // 3. Atomik Batch Write Firestore
  try {
    const batch = writeBatch(db);
    const goalRef = doc(db, 'users', userId, 'goals', goal.id);
    batch.update(goalRef, {
      currentAmount: goal.currentAmount,
      isCompleted: goal.isCompleted || false,
      updatedAt: serverTimestamp()
    });

    if (payload.sourceAccountId && updatedAccount && transaction) {
      const accRef = doc(db, 'users', userId, 'accounts', updatedAccount.id);
      batch.update(accRef, { balance: updatedAccount.balance, updatedAt: serverTimestamp() });

      const txRef = doc(db, 'users', userId, 'transactions', transaction.id);
      batch.set(txRef, { ...transaction, createdAt: serverTimestamp() });
    } else if (transaction) {
      const txRef = doc(db, 'users', userId, 'transactions', transaction.id);
      batch.set(txRef, { ...transaction, createdAt: serverTimestamp() });
    }

    await batch.commit();
  } catch (err) {
    console.warn('Firestore allocateFundsToGoal offline fallback:', err);
  }

  return { goal, transaction, updatedAccount };
}

/**
 * Fetch Riwayat Transaksi Alokasi khusus untuk sebuah Target (Goal)
 * Query transaksi di Firestore yang memiliki goalId == goalId, diurutkan teranyar
 */
export async function fetchGoalAllocationHistory(
  userId: string = DEFAULT_USER_ID,
  goalId: string
): Promise<Transaction[]> {
  try {
    const txRef = collection(db, 'users', userId, 'transactions');
    const q = query(
      txRef,
      where('goalId', '==', goalId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const list: Transaction[] = [];
      snapshot.forEach(d => {
        list.push({ id: d.id, ...d.data() } as Transaction);
      });
      return list;
    }
  } catch (err) {
    console.warn('Firestore fetchGoalAllocationHistory offline fallback:', err);
  }

  // Fallback cache lokal
  const allTxs = getLocalTransactions();
  return allTxs
    .filter(t => t.goalId === goalId)
    .sort((a, b) => {
      const timeA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.date).getTime();
      const timeB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.date).getTime();
      return timeB - timeA;
    });
}

// =========================================================================
// 5. MODUL 3: UTANG & TAGIHAN RUTIN (DEBT & SUBSCRIPTIONS)
// =========================================================================

function formatYMD(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Memajukan tanggal jatuh tempo sesuai siklus pembayaran (Harian/Mingguan/Bulanan/Tahunan/Kustom)
 */
export function advancePaymentDate(
  currentDateStr: string,
  cycle: BillCycle = 'monthly',
  customCount: number = 1,
  customUnit: CustomIntervalUnit = 'months'
): string {
  if (!currentDateStr) {
    currentDateStr = new Date().toISOString().split('T')[0];
  }
  const parts = currentDateStr.split('-');
  let year = parseInt(parts[0], 10) || new Date().getFullYear();
  let month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
  const day = parseInt(parts[2], 10) || 1;

  if (cycle === 'daily') {
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  } else if (cycle === 'weekly') {
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + 7);
    return formatDate(d);
  } else if (cycle === 'yearly') {
    year += 1;
    const maxDays = new Date(year, month, 0).getDate();
    return formatYMD(year, month, Math.min(day, maxDays));
  } else if (cycle === 'custom') {
    const count = Math.max(1, customCount || 1);
    if (customUnit === 'days') {
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() + count);
      return formatDate(d);
    } else if (customUnit === 'weeks') {
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() + count * 7);
      return formatDate(d);
    } else if (customUnit === 'years') {
      year += count;
      const maxDays = new Date(year, month, 0).getDate();
      return formatYMD(year, month, Math.min(day, maxDays));
    } else {
      // months
      month += count;
      while (month > 12) {
        month -= 12;
        year += 1;
      }
      const maxDays = new Date(year, month, 0).getDate();
      return formatYMD(year, month, Math.min(day, maxDays));
    }
  } else {
    // monthly default
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const maxDays = new Date(year, month, 0).getDate();
    return formatYMD(year, month, Math.min(day, maxDays));
  }
}

/**
 * Memundurkan tanggal jatuh tempo ke siklus sebelumnya (Rollback saat hapus transaksi terbaru)
 */
export function stepBackPaymentDate(
  currentDateStr: string,
  cycle: BillCycle = 'monthly',
  customCount: number = 1,
  customUnit: CustomIntervalUnit = 'months'
): string {
  if (!currentDateStr) {
    currentDateStr = new Date().toISOString().split('T')[0];
  }
  const parts = currentDateStr.split('-');
  let year = parseInt(parts[0], 10) || new Date().getFullYear();
  let month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
  const day = parseInt(parts[2], 10) || 1;

  if (cycle === 'daily') {
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  } else if (cycle === 'weekly') {
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() - 7);
    return formatDate(d);
  } else if (cycle === 'yearly') {
    year -= 1;
    const maxDays = new Date(year, month, 0).getDate();
    return formatYMD(year, month, Math.min(day, maxDays));
  } else if (cycle === 'custom') {
    const count = Math.max(1, customCount || 1);
    if (customUnit === 'days') {
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() - count);
      return formatDate(d);
    } else if (customUnit === 'weeks') {
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() - count * 7);
      return formatDate(d);
    } else if (customUnit === 'years') {
      year -= count;
      const maxDays = new Date(year, month, 0).getDate();
      return formatYMD(year, month, Math.min(day, maxDays));
    } else {
      // months
      month -= count;
      while (month < 1) {
        month += 12;
        year -= 1;
      }
      const maxDays = new Date(year, month, 0).getDate();
      return formatYMD(year, month, Math.min(day, maxDays));
    }
  } else {
    // monthly default
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const maxDays = new Date(year, month, 0).getDate();
    return formatYMD(year, month, Math.min(day, maxDays));
  }
}

/**
 * Format label human-readable untuk siklus pembayaran
 */
export function getCycleLabel(
  cycle: BillCycle = 'monthly',
  customCount?: number,
  customUnit?: CustomIntervalUnit
): string {
  switch (cycle) {
    case 'daily':
      return 'Harian';
    case 'weekly':
      return 'Mingguan';
    case 'monthly':
      return 'Bulanan';
    case 'yearly':
      return 'Tahunan';
    case 'custom': {
      const c = customCount || 1;
      const unitMap: Record<CustomIntervalUnit, string> = {
        days: 'Hari',
        weeks: 'Minggu',
        months: 'Bulan',
        years: 'Tahun'
      };
      const u = customUnit ? unitMap[customUnit] : 'Bulan';
      return `Tiap ${c} ${u}`;
    }
    default:
      return 'Bulanan';
  }
}

export function getBillDueStatus(nextPaymentDate?: string): {
  daysLeft: number;
  label: string;
  badgeClass: string;
  isOverdue: boolean;
  isToday: boolean;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!nextPaymentDate) {
    return {
      daysLeft: 999,
      label: 'Tanpa Jadwal',
      badgeClass: 'bg-[#21252d] text-[#a3acba] border-[var(--border-subtle)]',
      isOverdue: false,
      isToday: false
    };
  }

  const [y, m, d] = nextPaymentDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      daysLeft: diffDays,
      label: `TERLAMBAT ${Math.abs(diffDays)} HARI`,
      badgeClass: 'bg-[#ff7a4d] text-[#121316] font-bold border-black',
      isOverdue: true,
      isToday: false
    };
  } else if (diffDays === 0) {
    return {
      daysLeft: 0,
      label: 'HARI INI!',
      badgeClass: 'bg-[#ff7a4d] text-white font-bold animate-pulse border-black',
      isOverdue: false,
      isToday: true
    };
  } else if (diffDays <= 3) {
    return {
      daysLeft: diffDays,
      label: `Sisa ${diffDays} Hari`,
      badgeClass: 'bg-[#ffc933] text-[#121316] font-bold border-black',
      isOverdue: false,
      isToday: false
    };
  } else {
    return {
      daysLeft: diffDays,
      label: `Sisa ${diffDays} Hari`,
      badgeClass: 'bg-[#21252d] text-[#2dd4a7] border-[#2dd4a7]',
      isOverdue: false,
      isToday: false
    };
  }
}

// -------------------------------------------------------------------------
// Bills (Tagihan Rutin & Langganan)
// -------------------------------------------------------------------------

export function getLocalBills(): Bill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BILLS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca tagihan lokal:', e);
  }

  const today = new Date();
  const in3Days = new Date(today);
  in3Days.setDate(today.getDate() + 3);
  const inTomorrow = new Date(today);
  inTomorrow.setDate(today.getDate() + 1);
  const in12Days = new Date(today);
  in12Days.setDate(today.getDate() + 12);

  const initialBills: Bill[] = [
    {
      id: 'bill_wifi_home',
      ledgerId: 'ledger_personal_default',
      name: 'Internet & Wifi Indihome',
      cycle: 'monthly',
      pricingType: 'fixed',
      fixedAmount: 385000,
      nextPaymentDate: in3Days.toISOString().split('T')[0],
      category: 'Tagihan & Utilitas',
      sourceAccountId: 'acc_bca_default',
      totalPaid: 1155000,
      colorAccent: '#6c97ff',
      note: 'Paket 50 Mbps rumah',
      createdAt: Date.now() - 86400000 * 30
    },
    {
      id: 'bill_electricity_pln',
      ledgerId: 'ledger_personal_default',
      name: 'Listrik PLN Pascabayar',
      cycle: 'monthly',
      pricingType: 'variable',
      lastNominal: 450000,
      nextPaymentDate: inTomorrow.toISOString().split('T')[0],
      category: 'Tagihan & Utilitas',
      sourceAccountId: 'acc_bca_default',
      totalPaid: 1650000,
      colorAccent: '#ffc933',
      note: 'Nominal bervariasi sesuai pemakaian bulanan',
      createdAt: Date.now() - 86400000 * 30
    },
    {
      id: 'bill_netflix',
      ledgerId: 'ledger_personal_default',
      name: 'Netflix Premium 4K',
      cycle: 'monthly',
      pricingType: 'fixed',
      fixedAmount: 186000,
      nextPaymentDate: in12Days.toISOString().split('T')[0],
      category: 'Hiburan & Hobi',
      sourceAccountId: 'acc_gopay_default',
      totalPaid: 558000,
      colorAccent: '#ff7a4d',
      note: 'Langganan tontonan keluarga',
      createdAt: Date.now() - 86400000 * 25
    }
  ];

  localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(initialBills));
  return initialBills;
}

export function saveLocalBills(bills: Bill[]) {
  try {
    localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(bills));
  } catch (e) {
    console.error('Gagal menyimpan tagihan lokal:', e);
  }
}

export async function fetchBillsByLedger(
  userId: string = DEFAULT_USER_ID,
  ledgerId: string
): Promise<Bill[]> {
  try {
    const billsRef = collection(db, 'users', userId, 'bills');
    const q = query(billsRef, where('ledgerId', '==', ledgerId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const list: Bill[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Bill));
      const allBills = getLocalBills().filter(b => b.ledgerId !== ledgerId);
      saveLocalBills([...allBills, ...list]);
      return list;
    }
  } catch (err) {
    console.warn('Fallback bills offline:', err);
  }
  return getLocalBills().filter(b => b.ledgerId === ledgerId);
}

export async function createBill(
  userId: string = DEFAULT_USER_ID,
  payload: {
    ledgerId: string;
    name: string;
    cycle: BillCycle;
    customIntervalCount?: number;
    customIntervalUnit?: CustomIntervalUnit;
    pricingType: 'fixed' | 'variable';
    fixedAmount?: number;
    lastNominal?: number;
    nextPaymentDate: string;
    category?: string;
    sourceAccountId?: string;
    colorAccent?: string;
    note?: string;
  }
): Promise<Bill> {
  const newId = `bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newBill: Bill = {
    id: newId,
    ledgerId: payload.ledgerId,
    name: payload.name.trim(),
    cycle: payload.cycle,
    customIntervalCount: payload.cycle === 'custom' ? (payload.customIntervalCount || 1) : undefined,
    customIntervalUnit: payload.cycle === 'custom' ? (payload.customIntervalUnit || 'days') : undefined,
    pricingType: payload.pricingType,
    fixedAmount: payload.pricingType === 'fixed' ? Math.max(0, payload.fixedAmount || 0) : undefined,
    lastNominal: payload.pricingType === 'variable' ? Math.max(0, payload.lastNominal || 0) : undefined,
    nextPaymentDate: payload.nextPaymentDate,
    category: payload.category || 'Tagihan & Utilitas',
    sourceAccountId: payload.sourceAccountId || '',
    totalPaid: 0,
    colorAccent: payload.colorAccent || (payload.pricingType === 'fixed' ? '#6c97ff' : '#ffc933'),
    note: payload.note?.trim() || '',
    createdAt: Date.now()
  };

  const list = getLocalBills();
  list.unshift(newBill);
  saveLocalBills(list);

  try {
    const docRef = doc(db, 'users', userId, 'bills', newId);
    const cleanData = JSON.parse(JSON.stringify(newBill));
    await setDoc(docRef, { ...cleanData, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore createBill offline:', err);
  }

  return newBill;
}

export async function updateBill(
  userId: string = DEFAULT_USER_ID,
  billId: string,
  payload: Partial<Omit<Bill, 'id' | 'createdAt'>>
): Promise<Bill> {
  const list = getLocalBills();
  const idx = list.findIndex(b => b.id === billId);
  if (idx === -1) throw new Error('Tagihan tidak ditemukan');

  const updated: Bill = {
    ...list[idx],
    ...payload
  };
  list[idx] = updated;
  saveLocalBills(list);

  try {
    const docRef = doc(db, 'users', userId, 'bills', billId);
    const cleanData = JSON.parse(JSON.stringify(updated)); // Sesuaikan dengan nama variabel objekmu (updated/updatedBill)
    await updateDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore updateBill offline:', err);
  }

  return updated;
}

export async function deleteBill(
  userId: string = DEFAULT_USER_ID,
  billId: string
): Promise<void> {
  const list = getLocalBills().filter(b => b.id !== billId);
  saveLocalBills(list);

  try {
    const docRef = doc(db, 'users', userId, 'bills', billId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore deleteBill offline:', err);
  }
}

/**
 * EKSEKUSI PEMBAYARAN TAGIHAN (AUTO-RENEWAL TANGGAL)
 * Memotong saldo akun, mencatat transaksi pengeluaran, menambah totalPaid,
 * memperbarui lastNominal (jika fluktuatif), dan memajukan tanggal nextPaymentDate secara otomatis!
 */
export async function payBill(
  userId: string = DEFAULT_USER_ID,
  payload: {
    billId: string;
    amount: number;
    sourceAccountId: string;
    date?: string;
    note?: string;
  }
): Promise<{ bill: Bill; transaction: Transaction; updatedAccount: Account }> {
  const currentBills = getLocalBills();
  const billIdx = currentBills.findIndex(b => b.id === payload.billId);
  if (billIdx === -1) throw new Error('Data tagihan tidak ditemukan');

  const bill = { ...currentBills[billIdx] };
  const payAmount = Math.max(1, payload.amount);

  const currentAccounts = getLocalAccounts();
  const accIdx = currentAccounts.findIndex(a => a.id === payload.sourceAccountId);
  if (accIdx === -1) throw new Error('Akun sumber dana tidak ditemukan');

  const sourceAcc = currentAccounts[accIdx];
  sourceAcc.balance -= payAmount;
  saveLocalAccounts(currentAccounts);

  // 1. Catat transaksi pengeluaran pembayaran tagihan
  const newTxId = `tx_bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const cycleText = getCycleLabel(bill.cycle, bill.customIntervalCount, bill.customIntervalUnit);
  const transaction: Transaction = {
    id: newTxId,
    ledgerId: bill.ledgerId,
    accountId: sourceAcc.id,
    billId: bill.id,
    type: 'expense',
    amount: payAmount,
    category: `Tagihan: ${bill.name}`,
    note: payload.note || `Pembayaran tagihan ${bill.name} (${cycleText})`,
    date: payload.date || new Date().toISOString().split('T')[0],
    createdAt: Date.now()
  };

  const currentTxs = getLocalTransactions();
  currentTxs.unshift(transaction);
  saveLocalTransactions(currentTxs);

  // 2. Update Bill: akumulasi totalPaid, update lastNominal (jika variable), & AUTO-RENEWAL nextPaymentDate
  bill.totalPaid = (bill.totalPaid || 0) + payAmount;
  if (bill.pricingType === 'variable') {
    bill.lastNominal = payAmount; // Perbarui estimasi dengan pembayaran teraktual
  }
  const nextDate = advancePaymentDate(
    bill.nextPaymentDate, 
    bill.cycle, 
    bill.customIntervalCount, 
    bill.customIntervalUnit
  );
  bill.nextPaymentDate = nextDate;

  currentBills[billIdx] = bill;
  saveLocalBills(currentBills);

  // 3. Atomik Batch Write di Firestore
  try {
    const batch = writeBatch(db);
    const billRef = doc(db, 'users', userId, 'bills', bill.id);
    batch.update(billRef, {
      totalPaid: bill.totalPaid,
      nextPaymentDate: bill.nextPaymentDate,
      lastNominal: bill.lastNominal !== undefined ? bill.lastNominal : null,
      updatedAt: serverTimestamp()
    });

    const accRef = doc(db, 'users', userId, 'accounts', sourceAcc.id);
    batch.update(accRef, { balance: sourceAcc.balance, updatedAt: serverTimestamp() });

    const txRef = doc(db, 'users', userId, 'transactions', transaction.id);
    batch.set(txRef, { ...transaction, createdAt: serverTimestamp() });

    await batch.commit();
  } catch (err) {
    console.warn('Firestore payBill offline fallback:', err);
  }

  return { bill, transaction, updatedAccount: sourceAcc };
}

// -------------------------------------------------------------------------
// Debts (Utang & Cicilan)
// -------------------------------------------------------------------------

export function getLocalDebts(): Debt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEBTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca utang lokal:', e);
  }

  const today = new Date();
  const in3Days = new Date(today);
  in3Days.setDate(today.getDate() + 3);
  const inTomorrow = new Date(today);
  inTomorrow.setDate(today.getDate() + 1);

  const initialDebts: Debt[] = [
    {
      id: 'debt_motor_beat',
      ledgerId: 'ledger_personal_default',
      name: 'Cicilan Motor Honda Beat',
      lender: 'FIF Group',
      totalDebt: 18500000,
      remainingDebt: 4200000,
      nextPaymentDate: in3Days.toISOString().split('T')[0],
      cycle: 'monthly',
      dueDate: '2027-05-15',
      colorAccent: '#ffc933',
      note: 'Cicilan per bulan ~Rp 850.000',
      isPaidOff: false,
      createdAt: Date.now() - 86400000 * 45
    },
    {
      id: 'debt_laptop_loan',
      ledgerId: 'ledger_personal_default',
      name: 'Pinjaman Koperasi Kantor',
      lender: 'Koperasi Karyawan',
      totalDebt: 5000000,
      remainingDebt: 1500000,
      nextPaymentDate: inTomorrow.toISOString().split('T')[0],
      cycle: 'monthly',
      dueDate: '2026-12-31',
      colorAccent: '#6c97ff',
      note: 'Potong gaji berkala tanpa bunga tinggi',
      isPaidOff: false,
      createdAt: Date.now() - 86400000 * 30
    }
  ];

  localStorage.setItem(STORAGE_KEY_DEBTS, JSON.stringify(initialDebts));
  return initialDebts;
}

export function saveLocalDebts(debts: Debt[]) {
  try {
    localStorage.setItem(STORAGE_KEY_DEBTS, JSON.stringify(debts));
  } catch (e) {
    console.error('Gagal menyimpan utang lokal:', e);
  }
}

export async function fetchDebtsByLedger(
  userId: string = DEFAULT_USER_ID,
  ledgerId: string
): Promise<Debt[]> {
  try {
    const debtsRef = collection(db, 'users', userId, 'debts');
    const q = query(debtsRef, where('ledgerId', '==', ledgerId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const list: Debt[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Debt));
      const allDebts = getLocalDebts().filter(d => d.ledgerId !== ledgerId);
      saveLocalDebts([...allDebts, ...list]);
      return list;
    }
  } catch (err) {
    console.warn('Fallback debts offline:', err);
  }
  return getLocalDebts().filter(d => d.ledgerId === ledgerId);
}

export async function createDebt(
  userId: string = DEFAULT_USER_ID,
  payload: {
    ledgerId: string;
    name: string;
    lender?: string;
    totalDebt: number;
    remainingDebt?: number;
    nextPaymentDate?: string;
    cycle?: BillCycle;
    customIntervalCount?: number;
    customIntervalUnit?: CustomIntervalUnit;
    dueDate?: string;
    colorAccent?: string;
    note?: string;
  }
): Promise<Debt> {
  const newId = `debt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const total = Math.max(1, payload.totalDebt);
  const remaining = payload.remainingDebt !== undefined ? Math.max(0, payload.remainingDebt) : total;

  const newDebt: Debt = {
    id: newId,
    ledgerId: payload.ledgerId,
    name: payload.name.trim(),
    lender: payload.lender?.trim() || '',
    totalDebt: total,
    remainingDebt: remaining,
    nextPaymentDate: payload.nextPaymentDate || '',
    cycle: payload.cycle || 'monthly',
    customIntervalCount: payload.cycle === 'custom' ? (payload.customIntervalCount || 1) : undefined,
    customIntervalUnit: payload.cycle === 'custom' ? (payload.customIntervalUnit || 'days') : undefined,
    dueDate: payload.dueDate || '',
    colorAccent: payload.colorAccent || '#ffc933',
    note: payload.note?.trim() || '',
    isPaidOff: remaining <= 0,
    createdAt: Date.now()
  };

  const list = getLocalDebts();
  list.unshift(newDebt);
  saveLocalDebts(list);

  try {
    const docRef = doc(db, 'users', userId, 'debts', newId);
    // Trik membersihkan nilai 'undefined' secara otomatis
    const cleanData = JSON.parse(JSON.stringify(newDebt)); 
    await setDoc(docRef, { ...cleanData, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore createDebt offline:', err);
  }

  return newDebt;
}

export async function updateDebt(
  userId: string = DEFAULT_USER_ID,
  debtId: string,
  payload: Partial<Omit<Debt, 'id' | 'createdAt'>>
): Promise<Debt> {
  const list = getLocalDebts();
  const idx = list.findIndex(d => d.id === debtId);
  if (idx === -1) throw new Error('Data utang tidak ditemukan');

  const remaining = payload.remainingDebt !== undefined ? payload.remainingDebt : list[idx].remainingDebt;
  const updated: Debt = {
    ...list[idx],
    ...payload,
    isPaidOff: remaining <= 0
  };
  list[idx] = updated;
  saveLocalDebts(list);

  try {
    const docRef = doc(db, 'users', userId, 'debts', debtId);
    const cleanData = JSON.parse(JSON.stringify(updated)); // Sesuaikan nama variabel objeknya (misal: updated atau updatedDebt)
    await updateDoc(docRef, { ...cleanData, isPaidOff: updated.isPaidOff, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore updateDebt offline:', err);
  }

  return updated;
}

export async function deleteDebt(
  userId: string = DEFAULT_USER_ID,
  debtId: string
): Promise<void> {
  const list = getLocalDebts().filter(d => d.id !== debtId);
  saveLocalDebts(list);

  try {
    const docRef = doc(db, 'users', userId, 'debts', debtId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore deleteDebt offline:', err);
  }
}

/**
 * BAYAR CICILAN UTANG (DEBT INSTALLMENT)
 * Memotong saldo akun kas, mencatat transaksi pengeluaran, mengurangi sisa utang,
 * dan memajukan Tanggal Jatuh Tempo Berikutnya ke siklus selanjutnya hingga lunas!
 */
export async function payDebtInstallment(
  userId: string = DEFAULT_USER_ID,
  payload: {
    debtId: string;
    amount: number;
    sourceAccountId: string;
    date?: string;
    note?: string;
  }
): Promise<{ debt: Debt; transaction: Transaction; updatedAccount: Account }> {
  const currentDebts = getLocalDebts();
  const debtIdx = currentDebts.findIndex(d => d.id === payload.debtId);
  if (debtIdx === -1) throw new Error('Data utang tidak ditemukan');

  const debt = { ...currentDebts[debtIdx] };
  const payAmount = Math.max(1, payload.amount);

  const currentAccounts = getLocalAccounts();
  const accIdx = currentAccounts.findIndex(a => a.id === payload.sourceAccountId);
  if (accIdx === -1) throw new Error('Akun sumber dana tidak ditemukan');

  const sourceAcc = currentAccounts[accIdx];
  sourceAcc.balance -= payAmount;
  saveLocalAccounts(currentAccounts);

  // 1. Catat transaksi pengeluaran cicilan
  const newTxId = `tx_debt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const cycleText = getCycleLabel(debt.cycle, debt.customIntervalCount, debt.customIntervalUnit);
  const transaction: Transaction = {
    id: newTxId,
    ledgerId: debt.ledgerId,
    accountId: sourceAcc.id,
    debtId: debt.id,
    type: 'expense',
    amount: payAmount,
    category: `Cicilan: ${debt.name}`,
    note: payload.note || `Pembayaran cicilan untuk "${debt.name}" (${cycleText})`,
    date: payload.date || new Date().toISOString().split('T')[0],
    createdAt: Date.now()
  };

  const currentTxs = getLocalTransactions();
  currentTxs.unshift(transaction);
  saveLocalTransactions(currentTxs);

  // 2. Kurangi sisa utang & majukan nextPaymentDate jika belum lunas
  debt.remainingDebt = Math.max(0, (debt.remainingDebt || 0) - payAmount);
  debt.isPaidOff = debt.remainingDebt <= 0;

  if (!debt.isPaidOff && debt.nextPaymentDate) {
    debt.nextPaymentDate = advancePaymentDate(
      debt.nextPaymentDate,
      debt.cycle || 'monthly',
      debt.customIntervalCount,
      debt.customIntervalUnit
    );
  }

  currentDebts[debtIdx] = debt;
  saveLocalDebts(currentDebts);

  // 3. Atomik Batch Write di Firestore
  try {
    const batch = writeBatch(db);
    const debtRef = doc(db, 'users', userId, 'debts', debt.id);
    batch.update(debtRef, {
      remainingDebt: debt.remainingDebt,
      isPaidOff: debt.isPaidOff,
      nextPaymentDate: debt.nextPaymentDate || null,
      updatedAt: serverTimestamp()
    });

    const accRef = doc(db, 'users', userId, 'accounts', sourceAcc.id);
    batch.update(accRef, { balance: sourceAcc.balance, updatedAt: serverTimestamp() });

    const txRef = doc(db, 'users', userId, 'transactions', transaction.id);
    batch.set(txRef, { ...transaction, createdAt: serverTimestamp() });

    await batch.commit();
  } catch (err) {
    console.warn('Firestore payDebtInstallment offline fallback:', err);
  }

  return { debt, transaction, updatedAccount: sourceAcc };
}

// =========================================================================
// 5. MANAJEMEN OTOMATISASI TRANSAKSI (MODUL 4)
// =========================================================================

export function getLocalAutomations(): AutomationRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTOMATIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca automations lokal:', e);
  }

  // Initial Demo Automations untuk Keuangan Pribadi jika kosong
  const initial: AutomationRule[] = [
    {
      id: 'auto_payroll_default',
      ledgerId: 'ledger_personal_default',
      name: 'Gaji Pokok Bulanan',
      type: 'income',
      amount: 8500000,
      category: 'Gaji & Pendapatan',
      sourceAccountId: 'acc_bni_default',
      cycle: 'monthly',
      monthlyDay: 25,
      nextRunDate: '2026-11-25',
      lastRunDate: '2026-10-25',
      executionCount: 1,
      isActive: true,
      colorAccent: '#2dd4a7', // sage
      note: 'Transfer gaji otomatis dari kantor setiap tanggal 25',
      createdAt: Date.now() - 86400000 * 20
    },
    {
      id: 'auto_transfer_savings',
      ledgerId: 'ledger_personal_default',
      name: 'Auto-Transfer Nabung Jago',
      type: 'transfer',
      amount: 1500000,
      category: 'Transfer Tabungan',
      sourceAccountId: 'acc_bni_default',
      toAccountId: 'acc_jago_default',
      cycle: 'monthly',
      monthlyDay: 26,
      nextRunDate: '2026-11-26',
      lastRunDate: '2026-10-26',
      executionCount: 1,
      isActive: true,
      colorAccent: '#6c97ff', // blue
      note: 'Sisihkan dana dingin ke rekening simpanan Jago setelah gajian',
      createdAt: Date.now() - 86400000 * 18
    },
    {
      id: 'auto_admin_fee',
      ledgerId: 'ledger_personal_default',
      name: 'Potongan Biaya Admin Bank',
      type: 'expense',
      amount: 15000,
      category: 'Biaya Layanan & Admin',
      sourceAccountId: 'acc_bni_default',
      cycle: 'monthly',
      monthlyDay: 28,
      nextRunDate: '2026-11-28',
      lastRunDate: '2026-10-28',
      executionCount: 1,
      isActive: true,
      colorAccent: '#ff7a4d', // terracotta
      note: 'Biaya administrasi bulanan kartu debit BNI',
      createdAt: Date.now() - 86400000 * 15
    }
  ];

  localStorage.setItem(STORAGE_KEY_AUTOMATIONS, JSON.stringify(initial));
  return initial;
}

export function saveLocalAutomations(rules: AutomationRule[]) {
  try {
    localStorage.setItem(STORAGE_KEY_AUTOMATIONS, JSON.stringify(rules));
  } catch (e) {
    console.error('Gagal menyimpan automations lokal:', e);
  }
}

export async function fetchAutomations(
  userId: string = DEFAULT_USER_ID,
  ledgerId?: string
): Promise<AutomationRule[]> {
  try {
    const ref = collection(db, 'users', userId, 'automations');
    const q = ledgerId 
      ? query(ref, where('ledgerId', '==', ledgerId), orderBy('createdAt', 'desc'))
      : query(ref, orderBy('createdAt', 'desc'));
    
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const list: AutomationRule[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as AutomationRule));
      if (ledgerId) {
        const other = getLocalAutomations().filter(a => a.ledgerId !== ledgerId);
        saveLocalAutomations([...other, ...list]);
      } else {
        saveLocalAutomations(list);
      }
      return list;
    }
  } catch (err) {
    console.warn('Fallback automations offline:', err);
  }

  const all = getLocalAutomations();
  return ledgerId ? all.filter(a => a.ledgerId === ledgerId) : all;
}

export async function createAutomation(
  userId: string = DEFAULT_USER_ID,
  payload: {
    ledgerId: string;
    name: string;
    type: AutomationType;
    amount: number;
    category?: string;
    sourceAccountId: string;
    toAccountId?: string | null;
    cycle: AutomationCycle;
    monthlyDay?: number;
    customIntervalCount?: number;
    customIntervalUnit?: CustomIntervalUnit;
    nextRunDate: string;
    isActive?: boolean;
    colorAccent?: string;
    note?: string;
  }
): Promise<AutomationRule> {
  const newId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newRule: AutomationRule = {
    id: newId,
    ledgerId: payload.ledgerId,
    name: payload.name.trim(),
    type: payload.type,
    amount: Math.max(1, payload.amount),
    category: payload.category || (payload.type === 'income' ? 'Pemasukan Otomatis' : payload.type === 'expense' ? 'Pengeluaran Otomatis' : 'Transfer Otomatis'),
    sourceAccountId: payload.sourceAccountId,
    toAccountId: payload.type === 'transfer' ? (payload.toAccountId || null) : null,
    cycle: payload.cycle,
    monthlyDay: payload.monthlyDay,
    customIntervalCount: payload.cycle === 'custom' ? (payload.customIntervalCount || 1) : undefined,
    customIntervalUnit: payload.cycle === 'custom' ? (payload.customIntervalUnit || 'days') : undefined,
    nextRunDate: payload.nextRunDate,
    lastRunDate: null,
    executionCount: 0,
    isActive: payload.isActive !== undefined ? payload.isActive : true,
    colorAccent: payload.colorAccent || (payload.type === 'income' ? '#2dd4a7' : payload.type === 'expense' ? '#ff7a4d' : '#6c97ff'),
    note: payload.note?.trim() || '',
    createdAt: Date.now()
  };

  const list = getLocalAutomations();
  list.unshift(newRule);
  saveLocalAutomations(list);

  try {
    const docRef = doc(db, 'users', userId, 'automations', newId);
    const cleanData = JSON.parse(JSON.stringify(newRule));
    await setDoc(docRef, { ...cleanData, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore createAutomation offline:', err);
  }

  return newRule;
}

export async function updateAutomation(
  userId: string = DEFAULT_USER_ID,
  ruleId: string,
  payload: Partial<Omit<AutomationRule, 'id' | 'createdAt'>>
): Promise<AutomationRule> {
  const list = getLocalAutomations();
  const idx = list.findIndex(r => r.id === ruleId);
  if (idx === -1) throw new Error('Aturan otomatisasi tidak ditemukan');

  const updated: AutomationRule = {
    ...list[idx],
    ...payload
  };
  list[idx] = updated;
  saveLocalAutomations(list);

  try {
    const docRef = doc(db, 'users', userId, 'automations', ruleId);
    const cleanData = JSON.parse(JSON.stringify(updated));
    await updateDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore updateAutomation offline:', err);
  }

  return updated;
}

export async function toggleAutomationActive(
  userId: string = DEFAULT_USER_ID,
  ruleId: string
): Promise<AutomationRule> {
  const list = getLocalAutomations();
  const idx = list.findIndex(r => r.id === ruleId);
  if (idx === -1) throw new Error('Aturan otomatisasi tidak ditemukan');

  const nextState = !list[idx].isActive;
  list[idx].isActive = nextState;
  saveLocalAutomations(list);

  try {
    const docRef = doc(db, 'users', userId, 'automations', ruleId);
    await updateDoc(docRef, { isActive: nextState, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore toggleAutomationActive offline:', err);
  }

  return list[idx];
}

export async function deleteAutomation(
  userId: string = DEFAULT_USER_ID,
  ruleId: string
): Promise<void> {
  const list = getLocalAutomations().filter(r => r.id !== ruleId);
  saveLocalAutomations(list);

  try {
    const docRef = doc(db, 'users', userId, 'automations', ruleId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore deleteAutomation offline:', err);
  }
}

/**
 * EKSEKUSI MANUAL TUNGGAL (TRIGGER LANGSUNG DARI KARTU ATURAN)
 */
export async function executeSingleAutomation(
  userId: string = DEFAULT_USER_ID,
  ruleId: string
): Promise<{ rule: AutomationRule; transaction: Transaction; updatedAccounts: Account[] }> {
  const automations = getLocalAutomations();
  const ruleIdx = automations.findIndex(r => r.id === ruleId);
  if (ruleIdx === -1) throw new Error('Aturan otomatis tidak ditemukan');

  const rule = { ...automations[ruleIdx] };
  const accounts = getLocalAccounts();
  const sourceAcc = accounts.find(a => a.id === rule.sourceAccountId);
  if (!sourceAcc) throw new Error('Akun sumber tidak ditemukan');

  let destAcc: Account | undefined;
  if (rule.type === 'transfer') {
    if (!rule.toAccountId) throw new Error('Akun tujuan transfer belum ditentukan');
    destAcc = accounts.find(a => a.id === rule.toAccountId);
    if (!destAcc) throw new Error('Akun tujuan transfer tidak ditemukan');
  }

  // Update saldo akun
  const todayStr = new Date().toISOString().split('T')[0];
  if (rule.type === 'income') {
    sourceAcc.balance += rule.amount;
  } else if (rule.type === 'expense') {
    sourceAcc.balance -= rule.amount;
  } else if (rule.type === 'transfer' && destAcc) {
    sourceAcc.balance -= rule.amount;
    destAcc.balance += rule.amount;
  }
  saveLocalAccounts(accounts);

  // Buat transaksi
  const txId = `tx_auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const transaction: Transaction = {
    id: txId,
    ledgerId: rule.ledgerId,
    accountId: sourceAcc.id,
    toAccountId: destAcc?.id || null,
    automationId: rule.id,
    type: rule.type,
    amount: rule.amount,
    category: rule.category || (rule.type === 'income' ? 'Pemasukan Otomatis' : rule.type === 'expense' ? 'Pengeluaran Otomatis' : 'Transfer Otomatis'),
    note: rule.note ? `[Otomatis] ${rule.name} • ${rule.note}` : `[Otomatis] ${rule.name}`,
    date: todayStr,
    createdAt: Date.now()
  };

  const txs = getLocalTransactions();
  txs.unshift(transaction);
  saveLocalTransactions(txs);

  // Majukan tanggal eksekusi berikutnya & perbarui lastRunDate
  rule.lastRunDate = todayStr;
  rule.executionCount = (rule.executionCount || 0) + 1;
  rule.nextRunDate = advancePaymentDate(
    rule.nextRunDate,
    rule.cycle,
    rule.customIntervalCount,
    rule.customIntervalUnit
  );
  automations[ruleIdx] = rule;
  saveLocalAutomations(automations);

  // Batch Write Firestore
  try {
    const batch = writeBatch(db);
    const ruleRef = doc(db, 'users', userId, 'automations', rule.id);
    batch.update(ruleRef, {
      lastRunDate: rule.lastRunDate,
      executionCount: rule.executionCount,
      nextRunDate: rule.nextRunDate,
      updatedAt: serverTimestamp()
    });

    const srcRef = doc(db, 'users', userId, 'accounts', sourceAcc.id);
    batch.update(srcRef, { balance: sourceAcc.balance, updatedAt: serverTimestamp() });

    if (destAcc) {
      const dstRef = doc(db, 'users', userId, 'accounts', destAcc.id);
      batch.update(dstRef, { balance: destAcc.balance, updatedAt: serverTimestamp() });
    }

    const txRef = doc(db, 'users', userId, 'transactions', transaction.id);
    batch.set(txRef, { ...transaction, createdAt: serverTimestamp() });

    await batch.commit();
  } catch (err) {
    console.warn('Firestore executeSingleAutomation offline fallback:', err);
  }

  const updatedAccounts = destAcc ? [sourceAcc, destAcc] : [sourceAcc];
  return { rule, transaction, updatedAccounts };
}

/**
 * CLIENT-SIDE CRON JOB ENGINE: checkAndRunAutomations()
 * Dipanggil saat app init setelah data di-fetch.
 * Memeriksa semua aturan otomatis aktif (isActive: true).
 * Jika nextRunDate <= hari ini:
 * - Melakukan eksekusi transaksi (tambah/kurang saldo accounts, buat dokumen transactions)
 * - Memajukan nextRunDate ke siklus berikutnya
 * - Mengembalikan ringkasan eksekusi untuk toast notifikasi
 */
export async function checkAndRunAutomations(
  userId: string = DEFAULT_USER_ID,
  ledgerId?: string
): Promise<{
  executedCount: number;
  executedRules: AutomationRule[];
  newTransactions: Transaction[];
  updatedAccounts: Account[];
  message: string;
}> {
  const automations = getLocalAutomations();
  const accounts = getLocalAccounts();
  const txs = getLocalTransactions();

  // Tanggal hari ini YYYY-MM-DD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  // Filter aturan aktif yang tanggal eksekusinya <= hari ini
  const rulesToRun = automations.filter(rule => {
    if (!rule.isActive) return false;
    if (ledgerId && rule.ledgerId !== ledgerId) return false;
    if (!rule.nextRunDate) return false;
    return rule.nextRunDate <= todayStr;
  });

  if (rulesToRun.length === 0) {
    return {
      executedCount: 0,
      executedRules: [],
      newTransactions: [],
      updatedAccounts: [],
      message: 'Semua aturan otomatisasi telah mutakhir.'
    };
  }

  const executedRules: AutomationRule[] = [];
  const newTransactions: Transaction[] = [];
  const affectedAccountIds = new Set<string>();

  // Firestore batch setup
  let batch: any = null;
  try {
    batch = writeBatch(db);
  } catch (err) {
    console.warn('Batch init error:', err);
  }

  for (const rule of rulesToRun) {
    const srcAcc = accounts.find(a => a.id === rule.sourceAccountId);
    if (!srcAcc) {
      console.warn(`Akun sumber ${rule.sourceAccountId} untuk aturan "${rule.name}" tidak ditemukan. Dilewati.`);
      continue;
    }

    let dstAcc: Account | undefined;
    if (rule.type === 'transfer') {
      if (!rule.toAccountId) {
        console.warn(`Akun tujuan untuk transfer "${rule.name}" kosong. Dilewati.`);
        continue;
      }
      dstAcc = accounts.find(a => a.id === rule.toAccountId);
      if (!dstAcc) {
        console.warn(`Akun tujuan transfer "${rule.name}" tidak ditemukan. Dilewati.`);
        continue;
      }
    }

    // Eksekusi saldo
    if (rule.type === 'income') {
      srcAcc.balance += rule.amount;
    } else if (rule.type === 'expense') {
      srcAcc.balance -= rule.amount;
    } else if (rule.type === 'transfer' && dstAcc) {
      srcAcc.balance -= rule.amount;
      dstAcc.balance += rule.amount;
      affectedAccountIds.add(dstAcc.id);
    }
    affectedAccountIds.add(srcAcc.id);

    // Buat transaksi
    const newTxId = `tx_auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const tx: Transaction = {
      id: newTxId,
      ledgerId: rule.ledgerId,
      accountId: srcAcc.id,
      toAccountId: dstAcc?.id || null,
      automationId: rule.id,
      type: rule.type,
      amount: rule.amount,
      category: rule.category || (rule.type === 'income' ? 'Pemasukan Otomatis' : rule.type === 'expense' ? 'Pengeluaran Otomatis' : 'Transfer Otomatis'),
      note: rule.note ? `[Otomatis] ${rule.name} • ${rule.note}` : `[Otomatis] ${rule.name}`,
      date: rule.nextRunDate <= todayStr ? rule.nextRunDate : todayStr,
      createdAt: Date.now()
    };
    newTransactions.push(tx);
    txs.unshift(tx);

    // Majukan nextRunDate ke siklus berikutnya
    const ruleIdx = automations.findIndex(r => r.id === rule.id);
    if (ruleIdx !== -1) {
      const advancedDate = advancePaymentDate(
        rule.nextRunDate,
        rule.cycle,
        rule.customIntervalCount,
        rule.customIntervalUnit
      );
      automations[ruleIdx] = {
        ...automations[ruleIdx],
        lastRunDate: todayStr,
        executionCount: (automations[ruleIdx].executionCount || 0) + 1,
        nextRunDate: advancedDate
      };
      executedRules.push(automations[ruleIdx]);
    }

    // Tambahkan ke Firestore batch
    if (batch) {
      try {
        const ruleDoc = doc(db, 'users', userId, 'automations', rule.id);
        batch.update(ruleDoc, {
          lastRunDate: todayStr,
          executionCount: (rule.executionCount || 0) + 1,
          nextRunDate: advancePaymentDate(rule.nextRunDate, rule.cycle, rule.customIntervalCount, rule.customIntervalUnit),
          updatedAt: serverTimestamp()
        });

        const srcDoc = doc(db, 'users', userId, 'accounts', srcAcc.id);
        batch.update(srcDoc, { balance: srcAcc.balance, updatedAt: serverTimestamp() });

        if (dstAcc) {
          const dstDoc = doc(db, 'users', userId, 'accounts', dstAcc.id);
          batch.update(dstDoc, { balance: dstAcc.balance, updatedAt: serverTimestamp() });
        }

        const txDoc = doc(db, 'users', userId, 'transactions', tx.id);
        batch.set(txDoc, { ...tx, createdAt: serverTimestamp() });
      } catch (e) {
        console.warn('Batch add error:', e);
      }
    }
  }

  // Simpan data lokal
  saveLocalAccounts(accounts);
  saveLocalTransactions(txs);
  saveLocalAutomations(automations);

  // Commit batch ke Firestore jika ada
  if (batch && executedRules.length > 0) {
    try {
      await batch.commit();
    } catch (err) {
      console.warn('Batch commit error, data aman tersimpan secara lokal:', err);
    }
  }

  const updatedAccounts = accounts.filter(a => affectedAccountIds.has(a.id));
  const message = `${executedRules.length} Transaksi Otomatis Berhasil Dieksekusi`;

  return {
    executedCount: executedRules.length,
    executedRules,
    newTransactions,
    updatedAccounts,
    message
  };
}

// =========================================================================
// 8. ARSIP RIWAYAT GAJI BULANAN & BATCH WRITE (MODUL 6)
// =========================================================================

const STORAGE_KEY_SALARY_HISTORY = 'artha_offline_salary_history';

export function getLocalSalaryHistories(): SalaryHistoryRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SALARY_HISTORY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca salary history lokal:', e);
  }
  return [];
}

export function saveLocalSalaryHistories(records: SalaryHistoryRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SALARY_HISTORY, JSON.stringify(records));
  } catch (e) {
    console.error('Gagal menyimpan salary history lokal:', e);
  }
}

export async function fetchSalaryHistories(
  userId: string = DEFAULT_USER_ID,
  ledgerId?: string
): Promise<SalaryHistoryRecord[]> {
  try {
    const ref = collection(db, 'salary_history');
    const q = ledgerId
      ? query(ref, where('ledgerId', '==', ledgerId), orderBy('createdAt', 'desc'))
      : query(ref, orderBy('createdAt', 'desc'));

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const list: SalaryHistoryRecord[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        let createdTime: number = Date.now();
        if (data.createdAt && typeof data.createdAt.toMillis === 'function') {
          createdTime = data.createdAt.toMillis();
        } else if (typeof data.createdAt === 'number') {
          createdTime = data.createdAt;
        } else if (typeof data.createdAt === 'string') {
          createdTime = new Date(data.createdAt).getTime() || Date.now();
        }
        list.push({
          id: d.id,
          ledgerId: data.ledgerId,
          period: data.period,
          totalOtHours: Number(data.totalOtHours) || 0,
          totalMeals: Number(data.totalMeals) || 0,
          netSalary: Number(data.netSalary) || 0,
          grossSalary: Number(data.grossSalary) || 0,
          createdAt: createdTime
        });
      });

      if (ledgerId) {
        const other = getLocalSalaryHistories().filter(r => r.ledgerId !== ledgerId);
        saveLocalSalaryHistories([...list, ...other]);
      } else {
        saveLocalSalaryHistories(list);
      }
      return list;
    }
  } catch (err) {
    console.warn('Fallback salary_history offline:', err);
  }

  const all = getLocalSalaryHistories();
  return ledgerId ? all.filter(r => r.ledgerId === ledgerId) : all;
}

export async function deleteSalaryHistoryDoc(
  historyId: string,
  userId: string = DEFAULT_USER_ID
): Promise<void> {
  const list = getLocalSalaryHistories().filter(r => r.id !== historyId);
  saveLocalSalaryHistories(list);

  try {
    const docRef = doc(db, 'salary_history', historyId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Gagal menghapus salary history di Firestore:', err);
  }
}

export interface BatchSaveSalaryParams {
  userId?: string;
  ledgerId: string;
  period: string; // "YYYY-MM"
  totalOtHours: number;
  totalMeals: number;
  totalAddOns?: number;
  netSalary: number;
  grossSalary: number;
  targetAccountId: string;
  paydayDate: string;
  paydayNumber: number;
  noteDesc: string;
  existingRuleId?: string;
}

export async function batchSaveSalaryAndAutomation(
  params: BatchSaveSalaryParams
): Promise<{ historyRecord: SalaryHistoryRecord; automationRule: AutomationRule }> {
  const userId = params.userId || DEFAULT_USER_ID;
  const historyId = `salhist_${params.ledgerId}_${params.period.replace('-', '_')}_${Date.now()}`;

  const historyRecord: SalaryHistoryRecord = {
    id: historyId,
    ledgerId: params.ledgerId,
    period: params.period,
    totalOtHours: params.totalOtHours,
    totalMeals: params.totalMeals,
    totalAddOns: params.totalAddOns || 0,
    netSalary: params.netSalary,
    grossSalary: params.grossSalary,
    createdAt: Date.now()
  };

  const ruleId = params.existingRuleId || `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const automationRule: AutomationRule = {
    id: ruleId,
    ledgerId: params.ledgerId,
    name: 'Payroll Gaji Shift Group C',
    type: 'income',
    amount: params.netSalary,
    category: 'Gaji Bulanan',
    sourceAccountId: params.targetAccountId,
    toAccountId: null,
    cycle: 'monthly',
    monthlyDay: params.paydayNumber,
    nextRunDate: params.paydayDate,
    lastRunDate: null,
    executionCount: 0,
    isActive: true,
    colorAccent: '#2dd4a7',
    note: params.noteDesc,
    createdAt: Date.now()
  };

  // 1. Simpan Lokal Offline-First
  const localHistories = getLocalSalaryHistories();
  const filteredHistories = localHistories.filter(h => !(h.ledgerId === params.ledgerId && h.period === params.period));
  filteredHistories.unshift(historyRecord);
  saveLocalSalaryHistories(filteredHistories);

  const localAutomations = getLocalAutomations();
  const existingAutoIndex = localAutomations.findIndex(a => a.id === ruleId);
  if (existingAutoIndex >= 0) {
    localAutomations[existingAutoIndex] = {
      ...localAutomations[existingAutoIndex],
      amount: params.netSalary,
      sourceAccountId: params.targetAccountId,
      nextRunDate: params.paydayDate,
      monthlyDay: params.paydayNumber,
      note: params.noteDesc,
      isActive: true
    };
  } else {
    localAutomations.unshift(automationRule);
  }
  saveLocalAutomations(localAutomations);

  // 2. Eksekusi Firestore Batch Write
  // 2. Eksekusi Firestore Batch Write
  try {
    const batch = writeBatch(db);

    // a. Update/set koleksi automations
    const autoDocRef = doc(db, 'users', userId, 'automations', ruleId);
    
    // 1) Siapkan dan bersihkan data automations
   const rawAutoData = {
      id: ruleId,
      ledgerId: params.ledgerId,
      name: 'Payroll Gaji Shift Group C',
      type: 'income',
      amount: params.netSalary,
      category: 'Gaji Bulanan',
      sourceAccountId: params.targetAccountId,
      cycle: 'monthly',
      monthlyDay: params.paydayNumber,
      nextRunDate: params.paydayDate,
      executionCount: 0,
      isActive: true,
      colorAccent: '#2dd4a7',
      note: params.noteDesc
    };
    const cleanAutoData = JSON.parse(JSON.stringify(rawAutoData));
    
    // 2) Masukkan ke batch.set (gabungkan dengan serverTimestamp di luar JSON)
    batch.set(autoDocRef, {...cleanAutoData, createdAt: serverTimestamp(), updatedAt: serverTimestamp()}, { merge: true });

    // b. Menambah dokumen baru ke koleksi salary_history
    const historyDocRef = doc(db, 'users', userId, 'salary_history', historyId); // Pastikan path-nya benar: users -> userId -> salary_history
    
    // 3) Siapkan dan bersihkan data salary_history
    const rawHistoryData = {
      id: historyId,
      ledgerId: params.ledgerId,
      period: params.period,
      totalOtHours: params.totalOtHours,
      totalMeals: params.totalMeals,
      totalAddOns: params.totalAddOns,
      netSalary: params.netSalary,
      grossSalary: params.grossSalary
    };
    const cleanHistoryData = JSON.parse(JSON.stringify(rawHistoryData));

    // 4) Masukkan ke batch.set (gabungkan dengan serverTimestamp di luar JSON)
    batch.set(historyDocRef, { ...cleanHistoryData, createdAt: serverTimestamp() });
    
    // Eksekusi pengiriman data
    await batch.commit();
  } catch (err) {
    console.warn('Batch write Firestore offline/fallback, data berhasil disimpan lokal:', err);
  }

  return { historyRecord, automationRule };
}

export interface CustomSalarySettings {
  ptkpStatus: PTKPStatus;
  mealRate: number;
  basicSalary: number;
  housingAllowance: number;
  shiftAllowance: number;
  housingDeduction: number;
  medicalAllowanceBik?: number;
  isMedicalBikActive?: boolean;
}

export const STORAGE_KEY_SHIFT_LOGS = 'artha_shift_calendar_logs_';
export const STORAGE_KEY_SALARY_SETTINGS = 'artha_custom_salary_settings_';

export async function saveShiftScheduleToFirestore(
  userId: string = DEFAULT_USER_ID,
  ledgerId: string,
  periodKey: string,
  days: ShiftDayLog[]
): Promise<void> {
  // 1. Simpan ke local storage
  try {
    localStorage.setItem(`${STORAGE_KEY_SHIFT_LOGS}${ledgerId}_${periodKey}`, JSON.stringify(days));
  } catch (e) {
    console.error('Gagal simpan shift logs lokal:', e);
  }

  // 2. Simpan ke Firestore
  try {
    const docId = `shift_${ledgerId}_${periodKey.replace('-', '_')}`;
    const scheduleRef = doc(db, 'users', userId, 'shift_schedules', docId);
    await setDoc(scheduleRef, {
      ledgerId,
      periodKey,
      days: JSON.parse(JSON.stringify(days)),
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore saveShiftSchedule offline fallback:', err);
  }
}

export async function fetchShiftScheduleFromFirestore(
  userId: string = DEFAULT_USER_ID,
  ledgerId: string,
  periodKey: string
): Promise<ShiftDayLog[] | null> {
  try {
    const docId = `shift_${ledgerId}_${periodKey.replace('-', '_')}`;
    const scheduleRef = doc(db, 'users', userId, 'shift_schedules', docId);
    const snap = await getDoc(scheduleRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.days) && data.days.length > 0) {
        localStorage.setItem(`${STORAGE_KEY_SHIFT_LOGS}${ledgerId}_${periodKey}`, JSON.stringify(data.days));
        return data.days as ShiftDayLog[];
      }
    }
  } catch (err) {
    console.warn('Firestore fetchShiftSchedule offline fallback:', err);
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_SHIFT_LOGS}${ledgerId}_${periodKey}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca shift logs lokal:', e);
  }
  return null;
}

export async function saveSalarySettingsToFirestore(
  userId: string = DEFAULT_USER_ID,
  ledgerId: string,
  settings: CustomSalarySettings
): Promise<void> {
  try {
    localStorage.setItem(`${STORAGE_KEY_SALARY_SETTINGS}${ledgerId}`, JSON.stringify(settings));
  } catch (e) {
    console.error('Gagal simpan salary settings lokal:', e);
  }

  try {
    const settingsRef = doc(db, 'users', userId, 'salary_settings', ledgerId);
    await setDoc(settingsRef, {
      ...settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore saveSalarySettings offline fallback:', err);
  }
}

export async function fetchSalarySettingsFromFirestore(
  userId: string = DEFAULT_USER_ID,
  ledgerId: string
): Promise<CustomSalarySettings | null> {
  try {
    const settingsRef = doc(db, 'users', userId, 'salary_settings', ledgerId);
    const snap = await getDoc(settingsRef);
    if (snap.exists()) {
      const data = snap.data() as CustomSalarySettings;
      localStorage.setItem(`${STORAGE_KEY_SALARY_SETTINGS}${ledgerId}`, JSON.stringify(data));
      return data;
    }
  } catch (err) {
    console.warn('Firestore fetchSalarySettings offline fallback:', err);
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_SALARY_SETTINGS}${ledgerId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca salary settings lokal:', e);
  }
  return null;
}



