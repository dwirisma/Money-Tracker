import type { ReactNode } from 'react';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import { ModalFrame } from './ui/ModalFrame';

export interface DeleteNote {
  text: ReactNode;
  /** 'info' (kuning, default) atau 'danger' (merah). */
  tone?: 'info' | 'danger';
}

interface Props {
  /** Judul jendela, mis. "Hapus Tagihan?". */
  title: string;
  /** Nama item yang dihapus (ditampilkan di ringkasan). */
  name: string;
  /** Label kecil di atas nama, mis. "Tagihan". */
  kind: string;
  /** Detail di sisi kanan ringkasan, mis. sisa utang atau saldo. */
  detailLabel?: string;
  detail?: ReactNode;
  /** Penjelasan dampak penghapusan. */
  notes: DeleteNote[];
  /** Teks tombol konfirmasi, mis. "Ya, hapus". */
  confirmLabel?: string;
  /** Pakai ikon peringatan (untuk hapus berdampak besar) alih-alih tempat sampah. */
  severe?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Konfirmasi hapus generik: dipakai buku kas, akun, target, tagihan, utang, dan aturan otomatisasi.
 * Hanya tampilan; aksi hapus tetap ditangani handler `onConfirm` milik pemanggil.
 */
export function ConfirmDeleteModal(p: Props) {
  return (
    <ModalFrame
      title={p.title}
      subtitle="Tindakan ini tidak dapat dibatalkan"
      icon={p.severe ? <AlertTriangle className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
      tint="var(--accent-terracotta)"
      onClose={p.onClose}
      footer={
        <>
          <button type="button" className="brutal-btn brutal-btn-ghost" onClick={p.onClose}>Batal</button>
          <button type="button" className="brutal-btn brutal-btn-terracotta" onClick={p.onConfirm}>
            <Trash2 className="w-4 h-4" />{p.confirmLabel ?? 'Ya, hapus'}
          </button>
        </>
      }
    >
      <div className="ax-sum">
        <div style={{ minWidth: 0 }}>
          <small>{p.kind}</small>
          <b>{p.name}</b>
        </div>
        {p.detail !== undefined && (
          <div>
            <small>{p.detailLabel}</small>
            <b>{p.detail}</b>
          </div>
        )}
      </div>

      {p.notes.map((n, i) => (
        <div key={i} className={`ax-warn ${n.tone === 'danger' ? 't' : ''}`} style={{ marginTop: 10 }}>
          <Info className="w-4 h-4" />
          <span>{n.text}</span>
        </div>
      ))}
    </ModalFrame>
  );
}
