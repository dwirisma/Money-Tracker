/**
 * Format tanggal LOKAL sebagai YYYY-MM-DD.
 * Jangan pakai `date.toISOString().split('T')[0]` untuk tanggal kalender: hasilnya dalam UTC,
 * sehingga di zona waktu seperti WIB (UTC+7) tanggal "hari ini" mundur satu hari antara 00:00-07:00
 * dan batas awal/akhir bulan pada laporan bergeser satu hari.
 */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
