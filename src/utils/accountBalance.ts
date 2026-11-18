import type { Account } from '../types';
import { formatRupiah } from './calculator';

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
