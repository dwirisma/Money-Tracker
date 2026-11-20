import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { formatRupiah } from '../../utils/financeUtils';

// =============================================================================
// MODAL FRAME
// =============================================================================

interface ModalFrameProps {
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
export function ModalFrame({ title, subtitle, icon, tint, onClose, children, footer, wide, top }: ModalFrameProps) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`ax-modal fixed inset-0 ${top ? 'z-[70]' : 'z-50'} bg-black/80 flex items-center justify-center p-3`}>
      <div
        className={`ax-mdl ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={tint ? ({ '--tint': tint } as CSSProperties) : undefined}
      >
        <header className="ax-mdl-h">
          {icon && <span className="ax-ic">{icon}</span>}
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="ax-iconbtn" onClick={onClose} aria-label="Tutup jendela">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="ax-mdl-b">{children}</div>
        {footer && <footer className="ax-mdl-f">{footer}</footer>}
      </div>
    </div>
  );
}

// =============================================================================
// NEO-BRUTALIST PRIMITIVES
// =============================================================================

type Accent = 'sage' | 'blue' | 'terracotta' | 'sand' | 'lavender' | 'dark' | 'pink';
type CardTone = 'yellow' | 'pink' | 'mint' | 'coral' | 'blue' | 'white';
const cx = (...p: Array<string | false | undefined>) => p.filter(Boolean).join(' ');

export function NeoCard({
  interactive,
  elevated,
  tone,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  elevated?: boolean;
  tone?: CardTone;
}) {
  const toneClass = tone ? `brutal-card-${tone}` : elevated ? 'brutal-card-elevated' : 'brutal-card';
  return <div {...rest} className={cx(toneClass, interactive && 'brutal-card-interactive', className)} />;
}

export function NeoButton({
  accent,
  ghost,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { accent?: Accent; ghost?: boolean }) {
  return <button {...rest} type={type} className={cx('brutal-btn', accent && `brutal-btn-${accent}`, ghost && 'brutal-btn-ghost', className)} />;
}

export function NeoInput({
  numeric,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { numeric?: boolean }) {
  return <input {...rest} className={cx('brutal-input', numeric && 'brutal-input-num', className)} />;
}

/** Nominal yang otomatis tersensor saat Mode Privasi aktif (lewat formatRupiah) */
export function Money({ value, tone, className }: { value: number; tone?: 'income' | 'expense' | 'auto'; className?: string }) {
  const t = tone === 'auto' ? (value < 0 ? 'expense' : 'income') : tone;
  const color = t === 'income' ? 'text-[var(--accent-sage-light)]' : t === 'expense' ? 'text-[var(--accent-terracotta-light)]' : '';
  return <span className={cx('font-num', color, className)}>{formatRupiah(value)}</span>;
}

export function NeoLabel({ children }: { children: ReactNode }) {
  return <span className="brutal-label">{children}</span>;
}
