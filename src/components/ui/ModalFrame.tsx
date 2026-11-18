import { useEffect, useId, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Warna header, mis. 'var(--accent-sand)'. */
  tint?: string;
  onClose: () => void;
  children: ReactNode;
  /** Baris tombol yang menempel di bawah jendela. */
  footer?: ReactNode;
  wide?: boolean;
  /** Tampil di atas jendela lain (mis. Ubah/Hapus Transaksi yang dibuka dari jendela detail). */
  top?: boolean;
}

/**
 * Kerangka jendela bersama (header berwarna, isi bisa digulir, footer menempel).
 * Di mobile tampil sebagai sheet dari bawah, di desktop di tengah (diatur oleh kelas .ax-modal).
 * Escape menutup jendela.
 */
export function ModalFrame({ title, subtitle, icon, tint, onClose, children, footer, wide, top }: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`ax-modal fixed inset-0 ${top ? 'z-[70]' : 'z-50'} bg-black/80 flex items-center justify-center p-3`}>
      <div className={`ax-mdl ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} style={tint ? ({ '--tint': tint } as CSSProperties) : undefined}>
        <header className="ax-mdl-h">
          {icon && <span className="ax-ic">{icon}</span>}
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="ax-iconbtn" onClick={onClose} aria-label="Tutup jendela"><X className="w-4 h-4" /></button>
        </header>
        <div className="ax-mdl-b">{children}</div>
        {footer && <footer className="ax-mdl-f">{footer}</footer>}
      </div>
    </div>
  );
}
