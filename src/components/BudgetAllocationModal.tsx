import React, { useEffect, useMemo, useState } from 'react';
import { Info, RotateCcw, Save, SlidersHorizontal, Loader2, AlertCircle } from 'lucide-react';
import { ModalFrame } from './ui/BaseUI';
import {
  buildDefaultBudgetAllocationMap,
  resolveBudgetAllocationBucket,
  type BudgetAllocationBucket,
  type BudgetAllocationMap,
} from '../services/settingsService';

interface BudgetAllocationModalProps {
  /** Daftar seluruh kategori pengeluaran (resmi + kategori unik dari riwayat transaksi). */
  categories: string[];
  /** Daftar kategori resmi milik pengguna agar bisa menandai kategori tambahan dari riwayat transaksi. */
  officialCategories: string[];
  /** Peta pemetaan aktif yang tersimpan di Firestore. */
  currentMap: BudgetAllocationMap;
  onClose: () => void;
  onSave: (nextMap: BudgetAllocationMap) => Promise<void>;
}

const BUCKET_OPTIONS: {
  id: BudgetAllocationBucket;
  label: string;
  shortLabel: string;
  lightActiveClass: string;
}[] = [
  {
    id: 'needs',
    label: 'Pokok (50%)',
    shortLabel: 'Pokok',
    lightActiveClass:
      'bg-[var(--accent-blue)] text-[#14141a] border-[var(--border-color)] shadow-[2px_2px_0px_var(--border-color)]',
  },
  {
    id: 'wants',
    label: 'Gaya Hidup (30%)',
    shortLabel: 'Gaya Hidup',
    lightActiveClass:
      'bg-[var(--accent-terracotta)] text-[#14141a] border-[var(--border-color)] shadow-[2px_2px_0px_var(--border-color)]',
  },
  {
    id: 'savings',
    label: 'Tabungan (20%)',
    shortLabel: 'Tabungan',
    lightActiveClass:
      'bg-[var(--accent-sage)] text-[#14141a] border-[var(--border-color)] shadow-[2px_2px_0px_var(--border-color)]',
  },
];

export const BudgetAllocationModal: React.FC<BudgetAllocationModalProps> = ({
  categories,
  officialCategories,
  currentMap,
  onClose,
  onSave,
}) => {
  const [draftMap, setDraftMap] = useState<BudgetAllocationMap>(() => {
    const initial: BudgetAllocationMap = {};
    categories.forEach((cat) => {
      initial[cat] = resolveBudgetAllocationBucket(cat, currentMap);
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const synced: BudgetAllocationMap = {};
    categories.forEach((cat) => {
      synced[cat] = resolveBudgetAllocationBucket(cat, currentMap);
    });
    setDraftMap(synced);
  }, [categories, currentMap]);

  const officialSet = useMemo(
    () => new Set(officialCategories.map((c) => c.trim().toLowerCase())),
    [officialCategories]
  );

  const counts = useMemo(() => {
    let needs = 0;
    let wants = 0;
    let savings = 0;
    categories.forEach((cat) => {
      const bucket = draftMap[cat] ?? resolveBudgetAllocationBucket(cat, currentMap);
      if (bucket === 'needs') needs += 1;
      else if (bucket === 'savings') savings += 1;
      else wants += 1;
    });
    return { needs, wants, savings };
  }, [categories, draftMap, currentMap]);

  const handleSelectBucket = (category: string, bucket: BudgetAllocationBucket) => {
    setDraftMap((prev) => ({
      ...prev,
      [category]: bucket,
    }));
  };

  const handleResetDefault = () => {
    setDraftMap(buildDefaultBudgetAllocationMap(categories));
    setErrorMsg(null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload: BudgetAllocationMap = {};
      categories.forEach((cat) => {
        payload[cat] = draftMap[cat] ?? resolveBudgetAllocationBucket(cat, currentMap);
      });
      await onSave(payload);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan pemetaan kategori.';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame
      title="Atur Kategori Alokasi 50 / 30 / 20"
      subtitle="Kelompokkan kategori pengeluaran ke keranjang Kebutuhan Pokok, Gaya Hidup, atau Tabungan & Investasi"
      icon={<SlidersHorizontal className="w-4 h-4" />}
      tint="var(--accent-sand)"
      wide
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <button
            type="button"
            onClick={handleResetDefault}
            disabled={saving}
            className="brutal-btn brutal-btn-ghost !flex-none text-xs dark:bg-[#1F2333] dark:border dark:border-white/[0.10] dark:text-[#CBD5E1] dark:hover:bg-[#262B3D] dark:shadow-none"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Default
          </button>

          <div className="flex items-center gap-2 ml-auto flex-1 sm:flex-none justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="brutal-btn brutal-btn-ghost !flex-none text-xs"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="brutal-btn brutal-btn-sand !flex-none text-xs dark:bg-[#E2B68E] dark:text-[#171924] dark:border-[#E2B68E] dark:hover:bg-[#E8C3A0] dark:shadow-none"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Simpan Pengaturan
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Ringkasan jumlah kategori per keranjang */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl p-2.5 border-2 border-[var(--border-color)] bg-[var(--bg-elevated)] dark:bg-[#1F2333] dark:border dark:border-white/[0.08]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[#8B9A9F]">
              Pokok (50%)
            </p>
            <p className="font-mono text-base font-extrabold text-[var(--text-primary)] dark:text-[#F1F5F9] mt-0.5">
              {counts.needs} <span className="text-[11px] font-semibold opacity-75">kategori</span>
            </p>
          </div>

          <div className="rounded-xl p-2.5 border-2 border-[var(--border-color)] bg-[var(--bg-elevated)] dark:bg-[#1F2333] dark:border dark:border-white/[0.08]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[#8B9A9F]">
              Gaya Hidup (30%)
            </p>
            <p className="font-mono text-base font-extrabold text-[var(--text-primary)] dark:text-[#F1F5F9] mt-0.5">
              {counts.wants} <span className="text-[11px] font-semibold opacity-75">kategori</span>
            </p>
          </div>

          <div className="rounded-xl p-2.5 border-2 border-[var(--border-color)] bg-[var(--bg-elevated)] dark:bg-[#1F2333] dark:border dark:border-white/[0.08]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[#8B9A9F]">
              Tabungan (20%)
            </p>
            <p className="font-mono text-base font-extrabold text-[var(--text-primary)] dark:text-[#F1F5F9] mt-0.5">
              {counts.savings} <span className="text-[11px] font-semibold opacity-75">kategori</span>
            </p>
          </div>
        </div>

        {/* Catatan penjelas Sisa Kas Bersih */}
        <div className="flex items-start gap-2.5 rounded-xl p-3 border-2 border-[var(--border-color)] bg-[#FFF8E1] text-[var(--text-primary)] dark:bg-[#1F2333] dark:border dark:border-[#E2B68E]/25 dark:text-[#CBD5E1] text-xs leading-relaxed">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#9A6700] dark:text-[#E2B68E]" />
          <p>
            <b className="text-[var(--text-primary)] dark:text-[#F1F5F9]">Sisa Kas Bersih</b>{' '}
            (Total Pemasukan − Total Pengeluaran) otomatis ikut ditambahkan ke keranjang{' '}
            <b className="text-[var(--text-primary)] dark:text-[#E2B68E]">Tabungan &amp; Investasi (20%)</b>{' '}
            bersama seluruh transaksi dari kategori yang Anda pilih masuk ke <b>Tabungan (20%)</b>.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border-2 border-[var(--border-color)] bg-[var(--accent-terracotta-dark)] dark:border dark:border-[#FB7185]/35 dark:bg-[rgba(244,63,94,0.14)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] dark:text-[#FDA4AF]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Daftar pemetaan kategori */}
        {categories.length === 0 ? (
          <div className="rounded-xl p-6 text-center border-2 border-dashed border-[var(--border-subtle)] dark:border-white/[0.10] text-xs text-[var(--text-secondary)]">
            Belum ada kategori pengeluaran yang tersedia untuk dipetakan.
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((category) => {
              const selected = draftMap[category] ?? resolveBudgetAllocationBucket(category, currentMap);
              const isFromHistory = !officialSet.has(category.trim().toLowerCase());

              return (
                <div
                  key={category}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 rounded-xl p-3 border-2 border-[var(--border-color)] bg-[var(--bg-elevated)] dark:bg-[#1F2333] dark:border dark:border-white/[0.08]"
                >
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-[var(--text-primary)] dark:text-[#F1F5F9] break-words">
                      {category}
                    </span>
                    {isFromHistory && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:bg-[#171924] dark:border-white/[0.08] dark:text-[#8B9A9F]">
                        Riwayat
                      </span>
                    )}
                  </div>

                  {/* Segmented Pill 3 Opsi */}
                  <div
                    role="radiogroup"
                    aria-label={`Alokasi untuk kategori ${category}`}
                    className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:shrink-0"
                  >
                    {BUCKET_OPTIONS.map((opt) => {
                      const active = selected === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => handleSelectBucket(category, opt.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap text-center border-2 dark:border ${
                            active
                              ? `${opt.lightActiveClass} dark:bg-[#E2B68E] dark:text-[#171924] dark:border-[#E2B68E] dark:shadow-none`
                              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-color)] hover:text-[var(--text-primary)] dark:bg-[#171924] dark:text-[#8B9A9F] dark:border-white/[0.08] dark:hover:bg-[#262B3D] dark:hover:text-[#F1F5F9]'
                          }`}
                        >
                          <span className="hidden sm:inline">{opt.label}</span>
                          <span className="sm:hidden">{opt.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalFrame>
  );
};
