import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Check, X } from 'lucide-react';
import { evaluateMathExpression, formatRupiah } from '../../utils/financeUtils';

// =============================================================================
// MODAL FRAME
// =============================================================================

interface ModalFrameProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Warna header, mis. 'var(--accent-sand)'. */
  tint?: string;
  /** Elemen aksi tambahan di sisi kanan header (mis. toggle Auto-Scan). */
  headerAction?: ReactNode;
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
export function ModalFrame({ title, subtitle, icon, tint, headerAction, onClose, children, footer, wide, top }: ModalFrameProps) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`ax-modal fixed inset-0 ${top ? 'z-[70]' : 'z-50'} flex items-center justify-center p-3`}>
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
          {headerAction && <span className="shrink-0 flex items-center">{headerAction}</span>}
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

// =============================================================================
// LIVE NOMINAL PREVIEW PILL (FORMAT RUPIAH INDONESIA)
// =============================================================================

const idNumberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

function parsePreviewAmount(amount: number | string): number {
  if (typeof amount === 'number') {
    return Number.isFinite(amount) ? amount : 0;
  }
  const trimmed = amount.trim();
  if (!trimmed) return 0;

  if (/[+\-*/().,]/.test(trimmed)) {
    if (/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
      const direct = Number(trimmed);
      return Number.isFinite(direct) ? direct : 0;
    }
    const evaluated = evaluateMathExpression(trimmed);
    return Number.isFinite(evaluated.result) ? evaluated.result : 0;
  }

  const direct = Number(trimmed);
  return Number.isFinite(direct) ? direct : 0;
}

export interface NominalPreviewProps {
  amount: number | string;
  prefix?: string;
  className?: string;
  /** Tampilkan pil redup `✓ = Rp 0` saat kosong/nol. Default: false. */
  showZero?: boolean;
}

/**
 * Pil live preview nominal berformat ribuan titik Indonesia (contoh: `✓ = Rp 1.500.000`).
 * Mendukung angka langsung maupun ekspresi kalkulator tanpa mengubah state atau tipe input.
 */
export function NominalPreview({
  amount,
  prefix = 'Rp',
  className,
  showZero = false,
}: NominalPreviewProps) {
  const numericValue = parsePreviewAmount(amount);
  const isZero = numericValue === 0;

  if (isZero && !showZero) return null;

  const isNegative = numericValue < 0;
  const formatted = idNumberFormatter.format(Math.abs(numericValue));
  const label = prefix ? `${prefix} ${formatted}` : formatted;

  return (
    <div
      className={cx(
        'mt-2 inline-flex max-w-full items-center gap-1.5 rounded-xl px-2.5 py-1 font-mono text-xs font-bold leading-snug',
        'bg-[#FFFDF7] text-[#171924] border-[1.5px] border-[#171924]',
        'dark:bg-[#1F2333] dark:text-[#E2B68E] dark:border dark:border-white/[0.10]',
        isZero && 'opacity-55',
        className
      )}
      aria-live="polite"
    >
      <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      <span className="min-w-0 break-all sm:break-words">
        = {isNegative ? '-' : ''}{label}
      </span>
    </div>
  );
}
