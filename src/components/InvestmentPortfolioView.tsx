import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  PieChart as PieIcon, 
  Coins, 
  Building2, 
  Layers, 
  Pencil, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  Check, 
  X,
  Calculator,
  AlertCircle
} from 'lucide-react';
import type { Ledger, InvestmentAsset, InvestmentAssetType } from '../types';
import { 
  ASSET_TYPE_LABELS, 
  calculateInvestmentSummary, 
  createInvestmentAsset, 
  updateInvestmentAsset, 
  deleteInvestmentAsset 
} from '../services/investmentService';
import { evaluateMathExpression, formatRupiah } from '../utils/calculator';

interface Props {
  currentLedger: Ledger;
  investments: InvestmentAsset[];
  onRefreshInvestments: () => Promise<void>;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export function InvestmentPortfolioView({
  currentLedger,
  investments,
  onRefreshInvestments,
  showToast
}: Props) {
  // Filter type
  const [selectedType, setSelectedType] = useState<string>('all');

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<InvestmentAsset | null>(null);
  const [quickUpdateAsset, setQuickUpdateAsset] = useState<InvestmentAsset | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<InvestmentAsset | null>(null);

  useEffect(() => {
    const handleOpen = () => openAddModal();
    window.addEventListener('open-add-asset-modal', handleOpen);
    return () => window.removeEventListener('open-add-asset-modal', handleOpen);
  }, []);

  // Form states for Add / Edit
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [type, setType] = useState<InvestmentAssetType>('stock');
  const [platform, setPlatform] = useState('');
  const [capital, setCapital] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [units, setUnits] = useState('');
  const [notes, setNotes] = useState('');
  const [calcNotice, setCalcNotice] = useState<string | null>(null);

  // Quick Update value state
  const [quickValue, setQuickValue] = useState('');

  // Portfolio Summary
  const summary = useMemo(() => {
    return calculateInvestmentSummary(investments);
  }, [investments]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    if (selectedType === 'all') return investments;
    return investments.filter(a => a.type === selectedType);
  }, [investments, selectedType]);

  // Handle Math on Blur
  function handleCapitalBlur() {
    if (!capital) return;
    const { success, result, displayValue } = evaluateMathExpression(capital);
    if (success && displayValue !== capital) {
      setCalcNotice(`Kalkulator: ${capital} = ${formatRupiah(result)}`);
      setCapital(displayValue);
      setTimeout(() => setCalcNotice(null), 4000);
    }
  }

  function handleCurrentValueBlur() {
    if (!currentValue) return;
    const { success, result, displayValue } = evaluateMathExpression(currentValue);
    if (success && displayValue !== currentValue) {
      setCalcNotice(`Kalkulator: ${currentValue} = ${formatRupiah(result)}`);
      setCurrentValue(displayValue);
      setTimeout(() => setCalcNotice(null), 4000);
    }
  }

  // Open Add Modal
  function openAddModal() {
    setName('');
    setTicker('');
    setType('stock');
    setPlatform('');
    setCapital('1000000');
    setCurrentValue('1000000');
    setUnits('');
    setNotes('');
    setCalcNotice(null);
    setIsAddOpen(true);
  }

  // Open Edit Modal
  function openEditModal(asset: InvestmentAsset) {
    setEditingAsset(asset);
    setName(asset.name);
    setTicker(asset.symbolOrTicker || '');
    setType(asset.type);
    setPlatform(asset.platform || '');
    setCapital(String(asset.initialCapital));
    setCurrentValue(String(asset.currentValue));
    setUnits(asset.units ? String(asset.units) : '');
    setNotes(asset.notes || '');
    setCalcNotice(null);
  }

  // Submit Add Asset
  async function handleCreateAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Nama aset investasi wajib diisi!', 'error');
      return;
    }
    const { result: capVal } = evaluateMathExpression(capital);
    const { result: curVal } = evaluateMathExpression(currentValue);
    const parsedUnits = units ? parseFloat(units.replace(',', '.')) : undefined;

    try {
      await createInvestmentAsset(undefined, {
        ledgerId: currentLedger.id,
        name: name.trim(),
        symbolOrTicker: ticker.trim().toUpperCase() || undefined,
        type,
        platform: platform.trim() || undefined,
        initialCapital: capVal,
        currentValue: curVal,
        units: isNaN(parsedUnits || NaN) ? undefined : parsedUnits,
        notes: notes.trim() || undefined,
        lastUpdated: new Date().toISOString().split('T')[0]
      });

      await onRefreshInvestments();
      setIsAddOpen(false);
      showToast(`Aset "${name.trim()}" berhasil ditambahkan ke portofolio!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan aset investasi.', 'error');
    }
  }

  // Submit Edit Asset
  async function handleSaveEditedAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAsset || !name.trim()) return;
    const { result: capVal } = evaluateMathExpression(capital);
    const { result: curVal } = evaluateMathExpression(currentValue);
    const parsedUnits = units ? parseFloat(units.replace(',', '.')) : undefined;

    try {
      await updateInvestmentAsset(undefined, editingAsset.id, {
        name: name.trim(),
        symbolOrTicker: ticker.trim().toUpperCase() || undefined,
        type,
        platform: platform.trim() || undefined,
        initialCapital: capVal,
        currentValue: curVal,
        units: isNaN(parsedUnits || NaN) ? undefined : parsedUnits,
        notes: notes.trim() || undefined,
        lastUpdated: new Date().toISOString().split('T')[0]
      });

      await onRefreshInvestments();
      setEditingAsset(null);
      showToast(`Aset "${name.trim()}" berhasil diperbarui!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan perubahan.', 'error');
    }
  }

  // Submit Quick Value Update
  async function handleSaveQuickUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!quickUpdateAsset) return;
    const { result: newVal } = evaluateMathExpression(quickValue);
    if (newVal < 0) {
      showToast('Nilai pasar tidak valid!', 'error');
      return;
    }

    try {
      await updateInvestmentAsset(undefined, quickUpdateAsset.id, {
        currentValue: newVal,
        lastUpdated: new Date().toISOString().split('T')[0]
      });

      await onRefreshInvestments();
      setQuickUpdateAsset(null);
      showToast(`Nilai pasar "${quickUpdateAsset.name}" berhasil diupdate!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengupdate nilai pasar.', 'error');
    }
  }

  // Submit Delete Asset
  async function confirmDeleteAsset() {
    if (!assetToDelete) return;
    try {
      await deleteInvestmentAsset(undefined, assetToDelete.id);
      await onRefreshInvestments();
      showToast(`Aset "${assetToDelete.name}" telah dihapus dari portofolio.`, 'info');
      setAssetToDelete(null);
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus aset.', 'error');
    }
  }

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[var(--accent-sand)]" />
            <h2 className="font-heading font-bold text-2xl text-[var(--text-primary)]">
              Portofolio Investasi
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Pantau pertumbuhan aset, nilai pasar, return, dan diversifikasi di <b>{currentLedger.name}</b>.
          </p>
        </div>
      </div>

      {/* SCORECARDS PORTOFOLIO UTAMA */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="brutal-card p-4 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-sand)] space-y-1">
          <span className="text-[10px] font-mono uppercase text-[var(--text-secondary)] font-bold">Total Nilai Pasar</span>
          <p className="font-mono font-bold text-lg sm:text-2xl text-[var(--text-primary)] tracking-tight">
            {formatRupiah(summary.totalCurrentValue)}
          </p>
          <span className="text-[10px] text-[var(--text-muted)] font-mono block">Valuasi portofolio terkini</span>
        </div>

        <div className="brutal-card p-4 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-blue)] space-y-1">
          <span className="text-[10px] font-mono uppercase text-[var(--text-secondary)] font-bold">Modal Pembelian</span>
          <p className="font-mono font-bold text-lg sm:text-2xl text-[var(--accent-blue-light)] tracking-tight">
            {formatRupiah(summary.totalCapital)}
          </p>
          <span className="text-[10px] text-[var(--text-muted)] font-mono block">Total modal disetor (cost)</span>
        </div>

        <div className="brutal-card p-4 bg-[var(--bg-surface)] border-l-8 space-y-1" style={{
          borderLeftColor: summary.netGainLoss >= 0 ? 'var(--accent-sage)' : 'var(--accent-terracotta)'
        }}>
          <span className="text-[10px] font-mono uppercase text-[var(--text-secondary)] font-bold">Keuntungan / Kerugian</span>
          <p className={`font-mono font-bold text-lg sm:text-2xl tracking-tight ${
            summary.netGainLoss >= 0 ? 'text-[var(--accent-sage-light)]' : 'text-[var(--accent-terracotta-light)]'
          }`}>
            {summary.netGainLoss >= 0 ? '+' : ''}{formatRupiah(summary.netGainLoss)}
          </p>
          <span className="text-[10px] font-mono font-bold block" style={{
            color: summary.netGainLoss >= 0 ? 'var(--accent-sage-light)' : 'var(--accent-terracotta-light)'
          }}>
            {summary.netGainLoss >= 0 ? '▲' : '▼'} {summary.netGainLossPercent.toFixed(2)}% ROI
          </span>
        </div>

        <div className="brutal-card p-4 bg-[var(--bg-surface)] border-l-8 border-l-[var(--accent-lavender)] space-y-1">
          <span className="text-[10px] font-mono uppercase text-[var(--text-secondary)] font-bold">Total Instrumen</span>
          <p className="font-mono font-bold text-lg sm:text-2xl text-[var(--text-primary)]">
            {summary.assetCount} <span className="text-xs font-normal text-[var(--text-muted)]">Aset</span>
          </p>
          <span className="text-[10px] text-[var(--text-muted)] font-mono block">
            {summary.breakdown.length} kelas aset berbeda
          </span>
        </div>
      </div>

      {/* DIVERSIFIKASI & ALOKASI ASET (STACKED BAR & LEGEND) */}
      <div className="brutal-card p-5 bg-[var(--bg-surface)] space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
          <div className="flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-[var(--accent-sand)]" />
            <h3 className="font-heading font-bold text-sm text-[var(--text-primary)]">
              Alokasi & Diversifikasi Aset
            </h3>
          </div>
          <span className="text-xs font-mono text-[var(--text-muted)]">
            Persentase dari total Rp {formatRupiah(summary.totalCurrentValue)}
          </span>
        </div>

        {summary.totalCurrentValue === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic">Belum ada aset investasi terdaftar.</p>
        ) : (
          <div className="space-y-3">
            {/* Visual Stacked Bar */}
            <div className="h-6 w-full rounded-[var(--radius-sm)] border-2 border-[var(--border-color)] overflow-hidden flex shadow-[var(--shadow-xs)]">
              {summary.breakdown.map((item, idx) => (
                <div
                  key={item.type}
                  style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                  className="h-full relative group transition-all"
                  title={`${item.label}: ${item.percentage.toFixed(1)}% (${formatRupiah(item.currentValue)})`}
                />
              ))}
            </div>

            {/* Chips Legend */}
            <div className="flex flex-wrap gap-2 pt-1">
              {summary.breakdown.map(item => (
                <div
                  key={item.type}
                  className="px-2.5 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center gap-2 text-xs"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="font-bold text-[var(--text-primary)]">{item.label}</span>
                  <span className="font-mono text-[var(--accent-sand-light)]">{item.percentage.toFixed(1)}%</span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">({formatRupiah(item.currentValue)})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FILTER INSTRUMEN (SEGMENTED TABS) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSelectedType('all')}
          className={`px-3 py-1.5 text-xs font-heading font-bold rounded-[var(--radius-sm)] border-2 transition-all whitespace-nowrap ${
            selectedType === 'all'
              ? 'bg-[var(--accent-sand)] text-[#111] border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
              : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
          }`}
        >
          Semua ({investments.length})
        </button>

        {Object.entries(ASSET_TYPE_LABELS).map(([k, meta]) => {
          const count = investments.filter(a => a.type === k).length;
          if (count === 0) return null;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelectedType(k)}
              className={`px-3 py-1.5 text-xs font-heading font-bold rounded-[var(--radius-sm)] border-2 transition-all whitespace-nowrap ${
                selectedType === k
                  ? 'bg-[var(--accent-sand)] text-[#111] border-[var(--border-color)] shadow-[2px_2px_0px_#000]'
                  : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* ASSET CARDS GRID */}
      {filteredAssets.length === 0 ? (
        <div className="brutal-card p-10 text-center space-y-3 bg-[var(--bg-surface)]">
          <p className="font-heading font-bold text-base text-[var(--text-secondary)]">
            Belum ada instrumen investasi di kategori ini
          </p>
          <p className="text-xs text-[var(--text-muted)] font-mono">
            Mulai bangun portofolio dengan mencatat saham, reksa dana, emas, atau aset lainnya.
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="brutal-btn brutal-btn-sand text-xs py-2 px-4 inline-flex items-center gap-1.5 font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>+ Catat Aset Investasi Pertama</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAssets.map(asset => {
            const gainLoss = asset.currentValue - asset.initialCapital;
            const gainLossPct = asset.initialCapital > 0 ? (gainLoss / asset.initialCapital) * 100 : 0;
            const meta = ASSET_TYPE_LABELS[asset.type] || ASSET_TYPE_LABELS.other;

            return (
              <div
                key={asset.id}
                className="brutal-card p-3 sm:p-4 bg-[var(--bg-surface)] space-y-3 flex flex-col justify-between group hover:border-[var(--accent-sand)] transition-all"
                style={{ borderTopWidth: '5px', borderTopColor: meta.color }}
              >
                {/* Header Kartu */}
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {asset.symbolOrTicker && (
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)]">
                            {asset.symbolOrTicker}
                          </span>
                        )}
                        <span className="brutal-badge text-[9px]" style={{ backgroundColor: meta.bg, color: '#111' }}>
                          {meta.label}
                        </span>
                        {asset.platform && (
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            via {asset.platform}
                          </span>
                        )}
                      </div>
                      <h4 className="font-heading font-bold text-base text-[var(--text-primary)] mt-1">
                        {asset.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickUpdateAsset(asset);
                          setQuickValue(String(asset.currentValue));
                        }}
                        className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded shadow-[1px_1px_0px_#000] text-[var(--accent-blue-light)] hover:text-[var(--text-primary)] transition-all"
                        title="Perbarui Nilai Pasar Terkini"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(asset)}
                        className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded shadow-[1px_1px_0px_#000] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                        title="Edit Detail Aset"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setAssetToDelete(asset)}
                        className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded shadow-[1px_1px_0px_#000] text-[var(--text-secondary)] hover:text-[var(--accent-terracotta-light)] transition-all"
                        title="Hapus Aset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {asset.units !== undefined && (
                    <p className="text-xs font-mono text-[var(--text-muted)]">
                      Kepemilikan: <b className="text-[var(--text-secondary)]">{asset.units} unit</b>
                    </p>
                  )}
                </div>

                {/* Values & Return */}
                <div className="pt-2 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Modal Beli</span>
                    <span className="font-mono font-bold text-sm text-[var(--text-secondary)]">
                      {formatRupiah(asset.initialCapital)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block">Nilai Saat Ini</span>
                    <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                      {formatRupiah(asset.currentValue)}
                    </span>
                  </div>
                </div>

                {/* Return Bar */}
                <div className="p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">Keuntungan:</span>
                  <div className="flex items-center gap-1.5 font-mono font-bold">
                    <span className={gainLoss >= 0 ? 'text-[var(--accent-sage-light)]' : 'text-[var(--accent-terracotta-light)]'}>
                      {gainLoss >= 0 ? '+' : ''}{formatRupiah(gainLoss)}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      gainLoss >= 0 ? 'bg-[var(--accent-sage)] text-[#111]' : 'bg-[var(--accent-terracotta)] text-white'
                    }`}>
                      {gainLoss >= 0 ? '▲' : '▼'} {gainLossPct.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {asset.notes && (
                  <p className="text-[11px] text-[var(--text-muted)] italic truncate">
                    "{asset.notes}"
                  </p>
                )}

                <div className="text-[10px] font-mono text-[var(--text-muted)] flex justify-between pt-1">
                  <span>Update terakhir: {asset.lastUpdated || 'Hari ini'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickUpdateAsset(asset);
                      setQuickValue(String(asset.currentValue));
                    }}
                    className="underline text-[var(--accent-sand)] hover:text-[var(--text-primary)]"
                  >
                    Ubah Nilai →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL TAMBAH / EDIT ASET INVESTASI                                 */}
      {/* =================================================================== */}
      {(isAddOpen || editingAsset) && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-[2px]"
          onClick={() => { setIsAddOpen(false); setEditingAsset(null); }}
        >
          <div 
            className="w-full max-w-lg bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-[var(--accent-sand)]" />
                <h3 className="font-heading font-bold text-lg text-[var(--text-primary)]">
                  {editingAsset ? 'Edit Aset Investasi' : 'Tambah Aset Investasi Baru'}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => { setIsAddOpen(false); setEditingAsset(null); }} 
                className="brutal-btn !p-1.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={editingAsset ? handleSaveEditedAsset : handleCreateAsset} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Nama Instrumen / Aset</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Bank BRI, Bitcoin, Antam 10g"
                    className="brutal-input text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="brutal-label">Kode / Ticker (Opsional)</label>
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    placeholder="Contoh: BBRI, BTC, XAU"
                    className="brutal-input text-xs uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Kategori Aset</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as InvestmentAssetType)}
                    className="brutal-select text-xs"
                  >
                    {Object.entries(ASSET_TYPE_LABELS).map(([k, meta]) => (
                      <option key={k} value={k}>{meta.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="brutal-label">Platform / Sekuritas</label>
                  <input
                    type="text"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    placeholder="Contoh: Stockbit, Bibit, Pluang, BCA"
                    className="brutal-input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label flex items-center justify-between">
                    <span>Modal Pembelian (Rp)</span>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">Bisa hitung</span>
                  </label>
                  <input
                    type="text"
                    value={capital}
                    onChange={(e) => setCapital(e.target.value)}
                    onBlur={handleCapitalBlur}
                    placeholder="10000000"
                    className="brutal-input text-xs font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="brutal-label flex items-center justify-between">
                    <span>Nilai Pasar Terkini (Rp)</span>
                    <span className="text-[10px] font-mono text-[var(--accent-sand)]">Bisa hitung</span>
                  </label>
                  <input
                    type="text"
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    onBlur={handleCurrentValueBlur}
                    placeholder="11450000"
                    className="brutal-input text-xs font-mono font-bold"
                    required
                  />
                </div>
              </div>

              {calcNotice && (
                <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--accent-sand)] rounded text-xs font-mono text-[var(--accent-sand-light)] flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {calcNotice}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="brutal-label">Jumlah Unit / Lot / Gram</label>
                  <input
                    type="text"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    placeholder="Misal: 2000 lembar, 10 gram"
                    className="brutal-input text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="brutal-label">Catatan Strategi</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Misal: Untuk dana pensiun, DCA bulanan"
                    className="brutal-input text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsAddOpen(false); setEditingAsset(null); }}
                  className="brutal-btn brutal-btn-ghost text-xs py-2 px-4"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="brutal-btn brutal-btn-sand text-xs py-2 px-5 font-bold shadow-[2px_2px_0px_#000]"
                >
                  {editingAsset ? 'Simpan Perubahan' : 'Tambah ke Portofolio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL QUICK UPDATE NILAI PASAR                                     */}
      {/* =================================================================== */}
      {quickUpdateAsset && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-[2px]"
          onClick={() => setQuickUpdateAsset(null)}
        >
          <div 
            className="w-full max-w-sm bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-2">
              <h3 className="font-heading font-bold text-base text-[var(--text-primary)]">
                Perbarui Nilai Pasar
              </h3>
              <button type="button" onClick={() => setQuickUpdateAsset(null)} className="brutal-btn !p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickUpdate} className="space-y-3">
              <div>
                <p className="font-heading font-bold text-sm text-[var(--text-primary)]">{quickUpdateAsset.name}</p>
                <p className="text-xs text-[var(--text-muted)] font-mono">Modal Beli: {formatRupiah(quickUpdateAsset.initialCapital)}</p>
              </div>

              <div>
                <label className="brutal-label">Nilai Pasar Baru (Rp)</label>
                <input
                  type="text"
                  value={quickValue}
                  onChange={(e) => setQuickValue(e.target.value)}
                  placeholder="Masukkan total nilai saat ini..."
                  className="brutal-input text-sm font-mono font-bold"
                  autoFocus
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickUpdateAsset(null)}
                  className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-3"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="brutal-btn brutal-btn-sage text-xs py-1.5 px-4 font-bold shadow-[2px_2px_0px_#000]"
                >
                  Update Nilai
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL KONFIRMASI HAPUS ASET                                        */}
      {/* =================================================================== */}
      {assetToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-[2px]"
          onClick={() => setAssetToDelete(null)}
        >
          <div 
            className="w-full max-w-sm bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[var(--accent-terracotta)]">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-heading font-bold text-base text-[var(--text-primary)]">
                Hapus Aset Investasi?
              </h3>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Apakah Anda yakin ingin menghapus <b>"{assetToDelete.name}"</b> dari portofolio? Data yang dihapus tidak dapat dipulihkan.
            </p>

            <div className="pt-2 flex justify-end gap-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setAssetToDelete(null)}
                className="brutal-btn brutal-btn-ghost text-xs py-1.5 px-3"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteAsset}
                className="brutal-btn brutal-btn-terracotta text-xs py-1.5 px-4 font-bold shadow-[2px_2px_0px_#000]"
              >
                Ya, Hapus Aset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
