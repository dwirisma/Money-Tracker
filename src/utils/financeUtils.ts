import type { Account } from '../types';

/**
 * Utility Mini Kalkulator: Evaluasi ekspresi matematika sederhana (+, -, *, /) secara aman tanpa eval()
 */
export function evaluateMathExpression(input: string): { success: boolean; result: number; displayValue: string } {
  if (!input || typeof input !== 'string') {
    return { success: false, result: 0, displayValue: '0' };
  }

  // Bersihkan format titik ribuan (misal: "50.000" jadi "50000"), spasi, dan ganti koma desimal jadi titik
  const sanitized = input
    .replace(/\s+/g, '')
    .replace(/rp/gi, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // hapus separator ribuan
    .replace(/,/g, '.');

  // Validasi karakter yang diizinkan hanya angka, titik, dan operator dasar
  if (!/^[\d+\-*/.()]+$/.test(sanitized)) {
    // Jika hanya angka murni atau invalid
    const num = parseFloat(sanitized.replace(/[^\d.]/g, ''));
    const safeNum = isNaN(num) ? 0 : Math.round(num);
    return { success: false, result: safeNum, displayValue: safeNum.toString() };
  }

  try {
    // Parser aman menggunakan Function dengan sandbox terbatas (hanya mengembalikan hasil aritmatika)
    // Cegah akses variabel global
    const calculate = new Function(`
      "use strict";
      try {
        const res = (${sanitized});
        return (typeof res === 'number' && isFinite(res)) ? Math.round(res) : 0;
      } catch (e) {
        return 0;
      }
    `);

    const finalVal = calculate();
    return {
      success: true,
      result: finalVal,
      displayValue: finalVal.toString(),
    };
  } catch {
    const fallback = parseFloat(sanitized.replace(/[^\d.]/g, '')) || 0;
    return { success: false, result: Math.round(fallback), displayValue: Math.round(fallback).toString() };
  }
}

/**
 * Format angka ke format mata uang Rupiah
 */
let privacyMode = false;
export function setPrivacyMode(on: boolean) {
  privacyMode = on;
}
export function isPrivacyMode() {
  return privacyMode;
}
export const PRIVACY_MASK = 'Rp •••••••';

export function formatRupiah(amount: number): string {
  if (privacyMode) return PRIVACY_MASK;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Total dana yang sudah dialokasikan ke kantong pada sebuah akun. */
export function getPocketTotal(acc: Pick<Account, 'pockets'>): number {
  return (acc.pockets || []).reduce((sum, p) => sum + (p.balance || 0), 0);
}

export function hasPockets(acc: Pick<Account, 'pockets'>): boolean {
  return (acc.pockets?.length || 0) > 0;
}

/**
 * Saldo bebas = saldo total rekening dikurangi dana di kantong.
 * Dipakai untuk tampilan PER AKUN. Total kekayaan / total aset tetap memakai saldo total rekening.
 * Kartu kredit tidak punya kantong, jadi nilainya apa adanya.
 */
export function getFreeBalance(acc: Pick<Account, 'balance' | 'type' | 'pockets'>): number {
  if (acc.type === 'credit_card' || !hasPockets(acc)) return acc.balance;
  if (acc.balance < 0) return acc.balance;
  return Math.max(0, acc.balance - getPocketTotal(acc));
}

/** Teks siap tampil: "Rp 1.000.000", atau "Rp 1.000.000 bebas" bila akun punya kantong. */
export function freeBalanceText(acc: Pick<Account, 'balance' | 'type' | 'pockets'>): string {
  return `${formatRupiah(getFreeBalance(acc))}${acc.type !== 'credit_card' && hasPockets(acc) ? ' bebas' : ''}`;
}
