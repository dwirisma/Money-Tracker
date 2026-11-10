/**
 * ARTHA - PWA Personal Finance (Vanilla JavaScript & Firestore Implementation)
 * Modul 1: Manajemen Kas & Multi-Buku Kas (Ledgers)
 * Fitur:
 * 1. Active Ledger Switcher (Multi-Buku Kas Terisolasi)
 * 2. CRUD Akun terikat ke ledgerId
 * 3. Input Transaksi Manual (Income/Expense) dengan kalkulator otomatis
 * 4. Transfer Antar Akun Atomik (Firestore Batch Write)
 * 5. Update & Delete dengan Rollback Saldo Atomik
 * 6. Toggle Eksklusif UI Form Transaksi vs Transfer
 */

import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  writeBatch, 
  query, 
  where, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const db = getFirestore();
const CURRENT_USER_ID = "demo_user_artha";

// In-Memory State untuk Buku Kas Aktif
export let ledgers = [];
export let activeLedgerId = "ledger_personal_default";
export let accounts = [];
export let transactions = [];

// =========================================================================
// 1. MANAJEMEN BUKU KAS (LEDGERS CRUD & ISOLASI DATA)
// =========================================================================

/**
 * Fetch daftar seluruh buku kas milik user
 */
export async function fetchLedgers() {
  try {
    const ledgersRef = collection(db, "users", CURRENT_USER_ID, "ledgers");
    const q = query(ledgersRef, orderBy("createdAt", "asc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      // Seed default buku kas jika baru pertama kali dijalankan
      const defaultLedger = {
        id: "ledger_personal_default",
        name: "Keuangan Pribadi",
        description: "Arus kas harian & tabungan pribadi",
        colorAccent: "#8fa892",
        isDefault: true,
        createdAt: Date.now()
      };
      await setDoc(doc(db, "users", CURRENT_USER_ID, "ledgers", defaultLedger.id), defaultLedger);
      ledgers = [defaultLedger];
    } else {
      ledgers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  } catch (err) {
    console.warn("Offline fallback memuat buku kas:", err);
    if (ledgers.length === 0) {
      ledgers = [
        { id: "ledger_personal_default", name: "Keuangan Pribadi", description: "Arus kas harian", colorAccent: "#8fa892" },
        { id: "ledger_business_default", name: "Bisnis & Proyek", description: "Operasional usaha", colorAccent: "#7a9eb3" }
      ];
    }
  }

  renderLedgerDropdownUI();
  return ledgers;
}

/**
 * Buat buku kas baru
 */
export async function createLedger({ name, description = "", colorAccent = "#8fa892" }) {
  const ledgerId = `ledger_${Date.now()}`;
  const newLedger = {
    id: ledgerId,
    name: name.trim(),
    description: description.trim(),
    colorAccent,
    isDefault: false,
    createdAt: Date.now()
  };

  ledgers.push(newLedger);

  try {
    const ref = doc(db, "users", CURRENT_USER_ID, "ledgers", ledgerId);
    await setDoc(ref, { ...newLedger, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn("Offline create ledger fallback:", err);
  }

  renderLedgerDropdownUI();
  return newLedger;
}

/**
 * Edit data buku kas (nama, deskripsi, warna identitas)
 */
export async function updateLedger(ledgerId, updatedData) {
  const ledger = ledgers.find(l => l.id === ledgerId);
  if (!ledger) return;

  Object.assign(ledger, updatedData);
  renderLedgerDropdownUI();

  try {
    const docRef = doc(db, "users", CURRENT_USER_ID, "ledgers", ledgerId);
    await updateDoc(docRef, { ...updatedData, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn("Offline update ledger fallback:", err);
  }
}

/**
 * Hapus buku kas beserta cascading delete akun & transaksi
 */
export async function deleteLedger(ledgerId) {
  if (ledgers.length <= 1) {
    throw new Error("Tidak dapat menghapus buku kas terakhir! Minimal harus ada 1 buku kas aktif.");
  }

  ledgers = ledgers.filter(l => l.id !== ledgerId);
  accounts = accounts.filter(a => a.ledgerId !== ledgerId);
  transactions = transactions.filter(t => t.ledgerId !== ledgerId);

  // Jika yang dihapus buku kas aktif, beralih ke buku kas pertama yang tersisa
  if (activeLedgerId === ledgerId) {
    await switchLedger(ledgers[0].id);
  } else {
    renderLedgerDropdownUI();
  }

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "users", CURRENT_USER_ID, "ledgers", ledgerId));

    const accSnap = await getDocs(query(collection(db, "users", CURRENT_USER_ID, "accounts"), where("ledgerId", "==", ledgerId)));
    accSnap.forEach(d => batch.delete(d.ref));

    const txSnap = await getDocs(query(collection(db, "users", CURRENT_USER_ID, "transactions"), where("ledgerId", "==", ledgerId)));
    txSnap.forEach(d => batch.delete(d.ref));

    await batch.commit();
  } catch (err) {
    console.warn("Offline delete ledger fallback:", err);
  }
}

/**
 * Ganti Buku Kas Aktif (Active Ledger Switcher)
 * Mengosongkan data layar sementara, lalu memuat data yang HANYA berelasi dengan buku kas ini
 */
export async function switchLedger(targetLedgerId) {
  if (targetLedgerId === activeLedgerId) return;

  activeLedgerId = targetLedgerId;
  localStorage.setItem("artha_active_ledger_id", targetLedgerId);

  // 1. Kosongkan tampilan layar sementara (indikator loading)
  showLedgerLoadingState();

  // 2. Fetch data akun & transaksi yang hanya berelasi dengan ledgerId ini
  await Promise.all([
    fetchAccountsByLedger(activeLedgerId),
    fetchTransactionsByLedger(activeLedgerId)
  ]);

  // 3. Render ulang UI total saldo, daftar akun, dan riwayat transaksi
  updateAccountsUI();
  renderTransactionsUI();
  renderLedgerDropdownUI();
}

/**
 * Fetch akun khusus buku kas aktif
 */
export async function fetchAccountsByLedger(targetLedgerId) {
  try {
    const accountsRef = collection(db, "users", CURRENT_USER_ID, "accounts");
    const q = query(accountsRef, where("ledgerId", "==", targetLedgerId));
    const snapshot = await getDocs(q);

    accounts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Offline fetch accounts fallback:", err);
    accounts = accounts.filter(a => a.ledgerId === targetLedgerId);
  }
  return accounts;
}

/**
 * Fetch transaksi khusus buku kas aktif
 */
export async function fetchTransactionsByLedger(targetLedgerId) {
  try {
    const txRef = collection(db, "users", CURRENT_USER_ID, "transactions");
    const q = query(txRef, where("ledgerId", "==", targetLedgerId), orderBy("date", "desc"));
    const snapshot = await getDocs(q);

    transactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Offline fetch transactions fallback:", err);
    transactions = transactions.filter(t => t.ledgerId === targetLedgerId);
  }
  return transactions;
}

// =========================================================================
// 2. UI STATE MANAGEMENT: TOGGLE EKSKLUSIF CONTAINER TRANSAKSI vs TRANSFER
// =========================================================================

export function setFormMode(mode) {
  const containerTx = document.getElementById("container-transaksi");
  const containerTransfer = document.getElementById("container-transfer");

  if (mode === "transfer") {
    if (containerTx) {
      containerTx.style.display = "none";
      containerTx.classList.add("hidden");
    }
    if (containerTransfer) {
      containerTransfer.style.display = "block";
      containerTransfer.classList.remove("hidden");
    }
  } else {
    // Mode Transaksi Default
    if (containerTx) {
      containerTx.style.display = "block";
      containerTx.classList.remove("hidden");
    }
    if (containerTransfer) {
      containerTransfer.style.display = "none";
      containerTransfer.classList.add("hidden");
    }
  }
}

// =========================================================================
// 3. FITUR KALKULATOR MINI PADA INPUT NOMINAL
// =========================================================================

export function setupMiniCalculator(inputElement, onEvaluated) {
  if (!inputElement) return;

  function evaluateInput() {
    let rawVal = inputElement.value.trim();
    if (!rawVal) return;

    let sanitized = rawVal
      .replace(/\s+/g, '')
      .replace(/rp/gi, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(/,/g, '.');

    if (/[+\-*/]/.test(sanitized)) {
      try {
        const calculate = new Function(`
          "use strict";
          try {
            const res = (${sanitized});
            return (typeof res === 'number' && isFinite(res)) ? Math.round(res) : null;
          } catch(e) { return null; }
        `);
        const result = calculate();
        if (result !== null && !isNaN(result)) {
          inputElement.value = result;
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          if (onEvaluated) onEvaluated(result, rawVal);
        }
      } catch (err) {
        console.warn("Ekspresi kalkulator tidak valid:", err);
      }
    }
  }

  inputElement.addEventListener("blur", evaluateInput);
  inputElement.addEventListener("keydown", (e) => {
    if (e.key === "Enter") evaluateInput();
  });
}

// =========================================================================
// 4. CRUD AKUN TERIKAT KE BUKU KAS AKTIF
// =========================================================================

export async function addAccount(accountData) {
  const accountId = `acc_${Date.now()}`;
  const newAccount = {
    id: accountId,
    ledgerId: activeLedgerId, // Wajib terikat ke buku kas aktif
    name: accountData.name.trim(),
    type: accountData.type,
    balance: Number(accountData.balance) || 0,
    colorAccent: accountData.colorAccent || '#7a9eb3',
    createdAt: Date.now()
  };

  accounts.push(newAccount);
  updateAccountsUI();

  try {
    const docRef = doc(db, "users", CURRENT_USER_ID, "accounts", accountId);
    await setDoc(docRef, { ...newAccount, createdAt: serverTimestamp() });
  } catch (e) {
    console.warn("Offline fallback add account:", e);
  }
}

export async function editAccount(accountId, updatedData) {
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) return;

  Object.assign(acc, updatedData);
  updateAccountsUI();

  try {
    const docRef = doc(db, "users", CURRENT_USER_ID, "accounts", accountId);
    await updateDoc(docRef, { ...updatedData, updatedAt: serverTimestamp() });
  } catch (e) {
    console.warn("Offline update account fallback:", e);
  }
}

export async function deleteAccount(accountId) {
  accounts = accounts.filter(a => a.id !== accountId);
  updateAccountsUI();

  try {
    const docRef = doc(db, "users", CURRENT_USER_ID, "accounts", accountId);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn("Offline delete account fallback:", e);
  }
}

// =========================================================================
// 5. TRANSAKSI (INPUT, EDIT, HAPUS DENGAN SYNC SALDO ATOMIK)
// =========================================================================

export async function addTransaction(txData) {
  const txId = `tx_${Date.now()}`;
  const amount = Number(txData.amount);

  const newTx = {
    id: txId,
    ledgerId: activeLedgerId, // Terikat ke buku kas aktif
    accountId: txData.accountId,
    type: txData.type, // 'income' | 'expense'
    amount,
    category: txData.category,
    note: txData.note || '',
    date: txData.date || new Date().toISOString().split('T')[0],
    createdAt: Date.now()
  };

  // Update saldo akun secara lokal
  const acc = accounts.find(a => a.id === txData.accountId);
  if (acc) {
    if (txData.type === 'income') acc.balance += amount;
    else if (txData.type === 'expense') acc.balance -= amount;
  }

  transactions.unshift(newTx);
  updateAccountsUI();
  renderTransactionsUI();

  // Commit batch Firestore
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "users", CURRENT_USER_ID, "transactions", txId), { ...newTx, createdAt: serverTimestamp() });
    if (acc) {
      batch.update(doc(db, "users", CURRENT_USER_ID, "accounts", acc.id), { balance: acc.balance });
    }
    await batch.commit();
  } catch (err) {
    console.warn("Firestore batch add transaction fallback:", err);
  }
}

export async function executeTransfer({ sourceAccountId, destinationAccountId, amount, note = "", date }) {
  if (sourceAccountId === destinationAccountId) throw new Error("Akun asal dan tujuan tidak boleh sama!");
  const numAmount = Number(amount);
  if (numAmount <= 0) throw new Error("Nominal transfer harus lebih dari 0!");

  const src = accounts.find(a => a.id === sourceAccountId);
  const dst = accounts.find(a => a.id === destinationAccountId);
  if (!src || !dst) throw new Error("Akun tidak ditemukan!");

  // Potong sumber & tambah tujuan
  src.balance -= numAmount;
  dst.balance += numAmount;

  const txId = `tx_${Date.now()}`;
  const transferTx = {
    id: txId,
    ledgerId: activeLedgerId,
    accountId: sourceAccountId,
    toAccountId: destinationAccountId,
    type: 'transfer',
    amount: numAmount,
    category: 'Transfer Saldo',
    note: note || `Transfer ${src.name} ke ${dst.name}`,
    date: date || new Date().toISOString().split('T')[0],
    createdAt: Date.now()
  };

  transactions.unshift(transferTx);
  updateAccountsUI();
  renderTransactionsUI();
  setFormMode('transaction');

  // Batch Write Atomik Firestore
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "users", CURRENT_USER_ID, "transactions", txId), { ...transferTx, createdAt: serverTimestamp() });
    batch.update(doc(db, "users", CURRENT_USER_ID, "accounts", src.id), { balance: src.balance });
    batch.update(doc(db, "users", CURRENT_USER_ID, "accounts", dst.id), { balance: dst.balance });
    await batch.commit();
  } catch (err) {
    console.warn("Firestore batch transfer fallback:", err);
  }
}

export async function editTransaction(oldTxId, newTxData) {
  const txIndex = transactions.findIndex(t => t.id === oldTxId);
  if (txIndex === -1) return;

  const oldTx = transactions[txIndex];
  const newAmount = Number(newTxData.amount);

  // 1. Revert transaksi lama dari saldo
  if (oldTx.type === 'income') {
    const oldAcc = accounts.find(a => a.id === oldTx.accountId);
    if (oldAcc) oldAcc.balance -= oldTx.amount;
  } else if (oldTx.type === 'expense') {
    const oldAcc = accounts.find(a => a.id === oldTx.accountId);
    if (oldAcc) oldAcc.balance += oldTx.amount;
  } else if (oldTx.type === 'transfer' && oldTx.toAccountId) {
    const src = accounts.find(a => a.id === oldTx.accountId);
    const dst = accounts.find(a => a.id === oldTx.toAccountId);
    if (src) src.balance += oldTx.amount;
    if (dst) dst.balance -= oldTx.amount;
  }

  // 2. Terapkan transaksi baru ke saldo
  if (newTxData.type === 'income') {
    const newAcc = accounts.find(a => a.id === newTxData.accountId);
    if (newAcc) newAcc.balance += newAmount;
  } else if (newTxData.type === 'expense') {
    const newAcc = accounts.find(a => a.id === newTxData.accountId);
    if (newAcc) newAcc.balance -= newAmount;
  } else if (newTxData.type === 'transfer' && newTxData.toAccountId) {
    const src = accounts.find(a => a.id === newTxData.accountId);
    const dst = accounts.find(a => a.id === newTxData.toAccountId);
    if (src) src.balance -= newAmount;
    if (dst) dst.balance += newAmount;
  }

  const updatedTx = {
    ...oldTx,
    ...newTxData,
    amount: newAmount
  };
  transactions[txIndex] = updatedTx;

  updateAccountsUI();
  renderTransactionsUI();

  // 3. Batch commit ke Firestore
  try {
    const batch = writeBatch(db);
    const txRef = doc(db, "users", CURRENT_USER_ID, "transactions", oldTxId);
    batch.update(txRef, { ...newTxData, amount: newAmount, updatedAt: serverTimestamp() });

    const affectedAccountIds = Array.from(new Set([
      oldTx.accountId,
      oldTx.toAccountId,
      newTxData.accountId,
      newTxData.toAccountId
    ].filter(Boolean)));

    affectedAccountIds.forEach(accId => {
      const acc = accounts.find(a => a.id === accId);
      if (acc) {
        batch.update(doc(db, "users", CURRENT_USER_ID, "accounts", acc.id), { balance: acc.balance });
      }
    });

    await batch.commit();
  } catch (err) {
    console.warn("Firestore batch update error:", err);
  }
}

export async function deleteTransaction(txId) {
  const targetTx = transactions.find(t => t.id === txId);
  if (!targetTx) return;

  // 1. Rollback saldo akun otomatis
  if (targetTx.type === 'income') {
    const acc = accounts.find(a => a.id === targetTx.accountId);
    if (acc) acc.balance -= targetTx.amount;
  } else if (targetTx.type === 'expense') {
    const acc = accounts.find(a => a.id === targetTx.accountId);
    if (acc) acc.balance += targetTx.amount;
  } else if (targetTx.type === 'transfer' && targetTx.toAccountId) {
    const src = accounts.find(a => a.id === targetTx.accountId);
    const dst = accounts.find(a => a.id === targetTx.toAccountId);
    if (src) src.balance += targetTx.amount;
    if (dst) dst.balance -= targetTx.amount;
  }

  // 2. Rollback dana_terkumpul pada target (goals) jika transaksi adalah alokasi
  let updatedGoal = null;
  if (targetTx.goalId) {
    const g = goals.find(goal => goal.id === targetTx.goalId);
    if (g) {
      g.currentAmount = Math.max(0, (g.currentAmount || 0) - targetTx.amount);
      g.isCompleted = g.currentAmount >= g.targetAmount;
      updatedGoal = g;
    }
  }

  transactions = transactions.filter(t => t.id !== txId);
  updateAccountsUI();
  renderTransactionsUI();

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "users", CURRENT_USER_ID, "transactions", txId));

    if (targetTx.type === 'transfer' && targetTx.toAccountId) {
      const src = accounts.find(a => a.id === targetTx.accountId);
      const dst = accounts.find(a => a.id === targetTx.toAccountId);
      if (src) batch.update(doc(db, "users", CURRENT_USER_ID, "accounts", src.id), { balance: src.balance, updatedAt: serverTimestamp() });
      if (dst) batch.update(doc(db, "users", CURRENT_USER_ID, "accounts", dst.id), { balance: dst.balance, updatedAt: serverTimestamp() });
    } else if (targetTx.accountId && targetTx.accountId !== 'manual') {
      const acc = accounts.find(a => a.id === targetTx.accountId);
      if (acc) batch.update(doc(db, "users", CURRENT_USER_ID, "accounts", acc.id), { balance: acc.balance, updatedAt: serverTimestamp() });
    }

    // Kurangi dana_terkumpul pada koleksi goals di Firestore
    if (targetTx.goalId && updatedGoal) {
      batch.update(doc(db, "users", CURRENT_USER_ID, "goals", targetTx.goalId), {
        currentAmount: updatedGoal.currentAmount,
        isCompleted: updatedGoal.isCompleted,
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
  } catch (e) {
    console.warn("Firestore delete batch fallback:", e);
  }
}

// =========================================================================
// 6. UI RENDERING UTILITIES
// =========================================================================

export function calculateTotalBalance() {
  let totalAssets = 0;
  let totalCreditDebt = 0;

  accounts.forEach(acc => {
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

export function updateAccountsUI() {
  const { totalAssets, totalCreditDebt, netBalance } = calculateTotalBalance();

  const totalEl = document.getElementById("total-balance-display");
  if (totalEl) totalEl.textContent = formatIDR(netBalance);

  const assetsEl = document.getElementById("total-assets-display");
  if (assetsEl) assetsEl.textContent = formatIDR(totalAssets);

  const debtEl = document.getElementById("total-debt-display");
  if (debtEl) debtEl.textContent = formatIDR(totalCreditDebt);

  const selectElements = document.querySelectorAll(".account-select-dropdown");
  selectElements.forEach(select => {
    select.innerHTML = accounts.map(acc => 
      `<option value="${acc.id}">${acc.name} (${formatIDR(acc.balance)})</option>`
    ).join("");
  });
}

function showLedgerLoadingState() {
  const totalEl = document.getElementById("total-balance-display");
  if (totalEl) totalEl.textContent = "Memuat...";

  const accountsContainer = document.getElementById("accounts-list-container");
  if (accountsContainer) {
    accountsContainer.innerHTML = `<div class="p-4 text-xs font-mono text-gray-400">Sinkronisasi data buku kas...</div>`;
  }
}

function renderLedgerDropdownUI() {
  const current = ledgers.find(l => l.id === activeLedgerId) || ledgers[0];
  const nameEl = document.getElementById("active-ledger-name");
  if (nameEl && current) nameEl.textContent = current.name;

  const listEl = document.getElementById("ledger-dropdown-list");
  if (listEl) {
    listEl.innerHTML = ledgers.map(l => `
      <div class="w-full p-2 rounded flex items-center justify-between text-xs hover:bg-[#20242b] ${l.id === activeLedgerId ? 'font-bold text-white bg-[#20242b]' : 'text-gray-400'}">
        <button 
          type="button" 
          onclick="window.switchLedger('${l.id}')"
          class="flex-1 text-left flex items-center gap-2"
        >
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${l.colorAccent || '#8fa892'}"></span>
          <span class="truncate">${l.name}</span>
          ${l.id === activeLedgerId ? '<span class="text-[#8fa892] ml-1">✓</span>' : ''}
        </button>
        <div class="flex items-center gap-1 shrink-0 ml-2">
          <button 
            type="button"
            onclick="window.openEditLedgerModal('${l.id}')"
            class="p-1 text-gray-400 hover:text-white"
            title="Edit Buku Kas"
          >
            ✏️
          </button>
          ${ledgers.length > 1 ? `
            <button 
              type="button"
              onclick="window.promptDeleteLedger('${l.id}')"
              class="p-1 text-gray-400 hover:text-red-400"
              title="Hapus Buku Kas"
            >
              🗑️
            </button>
          ` : ''}
        </div>
      </div>
    `).join("");
  }
}

function renderTransactionsUI() {
  const container = document.getElementById("transactions-list-container");
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = `<p class="text-xs font-mono text-gray-400 p-4 text-center">Belum ada riwayat transaksi di buku kas ini.</p>`;
    return;
  }

  container.innerHTML = transactions.map(t => `
    <div class="p-3 bg-[#181b20] border-2 border-[rgba(240,240,245,0.78)] rounded mb-2 flex items-center justify-between">
      <div>
        <p class="font-bold text-xs text-white">${t.category || (t.type === 'transfer' ? 'Transfer' : 'Transaksi')}</p>
        <p class="text-[10px] font-mono text-gray-400">${t.date} • ${t.note || ''}</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="font-mono font-bold text-sm ${t.type === 'income' ? 'text-[#8fa892]' : t.type === 'expense' ? 'text-[#c88265]' : 'text-[#7a9eb3]'}">
          ${t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}${formatIDR(t.amount)}
        </span>
        <button onclick="window.deleteTxPrompt('${t.id}')" class="text-xs text-red-400 hover:text-red-300">Hapus</button>
      </div>
    </div>
  `).join("");
}

export function formatIDR(val) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(val || 0);
}

// =========================================================================
// 7. SPA NAVIGATION: MODUL 1 (KAS) vs MODUL 2 (GOALS)
// =========================================================================

export let activeModule = 'module1';
export let goals = [];

export function setSPAActiveModule(moduleName) {
  activeModule = moduleName;
  const mod1Container = document.getElementById("container-modul-1");
  const mod2Container = document.getElementById("container-modul-2");
  const tab1 = document.getElementById("tab-btn-module-1");
  const tab2 = document.getElementById("tab-btn-module-2");

  if (moduleName === 'module2') {
    if (mod1Container) mod1Container.classList.add("hidden");
    if (mod2Container) mod2Container.classList.remove("hidden");
    if (tab1) {
      tab1.className = "px-3 py-1.5 text-xs font-heading font-bold rounded border-2 bg-[#21252d] text-[#a3acba] border-transparent";
    }
    if (tab2) {
      tab2.className = "px-3 py-1.5 text-xs font-heading font-bold rounded border-2 bg-[#d4bc82] text-[#121316] border-white shadow-[2px_2px_0px_#000]";
    }
  } else {
    if (mod1Container) mod1Container.classList.remove("hidden");
    if (mod2Container) mod2Container.classList.add("hidden");
    if (tab1) {
      tab1.className = "px-3 py-1.5 text-xs font-heading font-bold rounded border-2 bg-[#8fa892] text-[#121316] border-white shadow-[2px_2px_0px_#000]";
    }
    if (tab2) {
      tab2.className = "px-3 py-1.5 text-xs font-heading font-bold rounded border-2 bg-[#21252d] text-[#a3acba] border-transparent";
    }
  }
}

export async function fetchGoalsByLedger(targetLedgerId) {
  try {
    const goalsRef = collection(db, "users", CURRENT_USER_ID, "goals");
    const q = query(goalsRef, where("ledgerId", "==", targetLedgerId));
    const snapshot = await getDocs(q);
    goals = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Offline fetch goals fallback:", err);
    goals = goals.filter(g => g.ledgerId === targetLedgerId);
  }
  return goals;
}

export async function allocateFundsToGoal({ goalId, amount, sourceAccountId, date, note }) {
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  const numAmount = Number(amount);

  if (sourceAccountId) {
    const acc = accounts.find(a => a.id === sourceAccountId);
    if (acc) {
      acc.balance -= numAmount; // Potong kas riil
    }
    // Catat transaksi pengeluaran
    const txId = `tx_goal_${Date.now()}`;
    const tx = {
      id: txId,
      ledgerId: goal.ledgerId,
      accountId: sourceAccountId,
      goalId: goal.id,
      type: 'expense',
      amount: numAmount,
      category: goal.type === 'sinking_fund' ? `Sinking Fund: ${goal.name}` : `Wishlist: ${goal.name}`,
      note: note || `Alokasi tabungan untuk ${goal.name}`,
      date: date || new Date().toISOString().split('T')[0],
      createdAt: Date.now()
    };
    transactions.unshift(tx);
  }

  goal.currentAmount = (goal.currentAmount || 0) + numAmount;
  if (goal.currentAmount >= goal.targetAmount) {
    goal.isCompleted = true;
  }

  updateAccountsUI();
  renderTransactionsUI();
}

export async function fetchGoalAllocationHistory(goalId) {
  try {
    const txRef = collection(db, "users", CURRENT_USER_ID, "transactions");
    const q = query(txRef, where("goalId", "==", goalId), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    console.warn("Offline fetch goal history:", err);
  }
  return transactions.filter(t => t.goalId === goalId);
}

