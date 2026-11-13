import React, { useState, useMemo, useEffect } from 'react';
import {
  PieChart as PieIcon,
  TrendingUp,
  TrendingDown,
  Plus,
  Coins,
  Building2,
  Layers,
  Pencil,
  Trash2,
  RefreshCw,
  Check,
  X,
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
    <div className="space-y-3 w-full">
      <div className="ax-pagehead">
        <div>
          <h2>Portofolio Investasi</h2>
          <p>Pantau nilai pasar, return, dan diversifikasi aset di <b>{currentLedger.name}</b></p>
        </div>
        <button type="button" onClick={openAddModal} className="brutal-btn brutal-btn-lavender">
          <Plus className="w-4 h-4" />Catat aset
        </button>
      </div>

      {/* RINGKASAN + ALOKASI */}
      <section className="ax-dash">
        <div className="ax-b s8 ax-panel ax-hero lav">
          <div className="ax-hero-head">
            <div className="ax-eyebrow" style={{ marginTop: 0 }}><Coins className="w-3.5 h-3.5" />Total nilai pasar</div>
            <span className="ax-badge-s">{summary.netGainLoss >= 0 ? '▲' : '▼'} {summary.netGainLossPercent.toFixed(2)}% ROI</span>
          </div>
          <div className="ax-big" style={{ marginBottom: 10 }}>{formatRupiah(summary.totalCurrentValue)}</div>
          <div className="ax-stats">
            <div className="ax-stat" title="Total modal disetor (cost)">
              <span><Layers className="w-3 h-3" />Modal pembelian</span>
              <b>{formatRupiah(summary.totalCapital)}</b>
            </div>
            <div className="ax-stat">
              <span>{summary.netGainLoss >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}Untung / rugi</span>
              <b className={summary.netGainLoss >= 0 ? 'ok' : 'bad'}>{summary.netGainLoss >= 0 ? '+' : ''}{formatRupiah(summary.netGainLoss)}</b>
            </div>
            <div className="ax-stat">
              <span><Building2 className="w-3 h-3" />Total instrumen</span>
              <b>{summary.assetCount} aset <small style={{ fontSize: 10, fontWeight: 700 }}>· {summary.breakdown.length} kelas</small></b>
            </div>
          </div>
        </div>

        <div className="ax-b s4 ax-panel ax-alloc">
          <div className="ax-ph" style={{ margin: 0 }}>
            <h3><span className="ax-ic" style={{ background: 'var(--accent-sand)' }}><PieIcon className="w-3.5 h-3.5" /></span>Alokasi aset</h3>
          </div>
          {summary.totalCurrentValue === 0 ? (
            <p className="ax-empty">Belum ada aset investasi terdaftar.</p>
          ) : (
            <>
              <div className="ax-alloc-bar" role="img" aria-label="Komposisi alokasi aset">
                {summary.breakdown.map(item => (
                  <i key={item.type} style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                    title={`${item.label}: ${item.percentage.toFixed(1)}% (${formatRupiah(item.currentValue)})`} />
                ))}
              </div>
              <div className="ax-list">
                {summary.breakdown.map(item => (
                  <div key={item.type} className="ax-alloc-row">
                    <i style={{ backgroundColor: item.color }} />
                    <b>{item.label}</b>
                    <span>{item.percentage.toFixed(1)}% · {formatRupiah(item.currentValue)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* FILTER INSTRUMEN */}
      <div className="ax-chipset scroll" role="radiogroup" aria-label="Filter instrumen">
        <button type="button" role="radio" aria-checked={selectedType === 'all'} onClick={() => setSelectedType('all')}>Semua ({investments.length})</button>
        {Object.entries(ASSET_TYPE_LABELS).map(([k, meta]) => {
          const count = investments.filter(a => a.type === k).length;
          if (count === 0) return null;
          return (
            <button key={k} type="button" role="radio" aria-checked={selectedType === k} onClick={() => setSelectedType(k)}>{meta.label} ({count})</button>
          );
        })}
      </div>

      {/* KARTU ASET */}
      {filteredAssets.length === 0 ? (
        <div className="ax-panel ax-emptyc">
          <p>Belum ada instrumen investasi di kategori ini</p>
          <small>Mulai bangun portofolio dengan mencatat saham, reksa dana, emas, atau aset lainnya.</small>
          <button type="button" onClick={openAddModal} className="brutal-btn brutal-btn-lavender"><Plus className="w-4 h-4" />Catat aset investasi pertama</button>
        </div>
      ) : (
        <div className="ax-acc-grid">
          {filteredAssets.map(asset => {
            const gainLoss = asset.currentValue - asset.initialCapital;
            const gainLossPct = asset.initialCapital > 0 ? (gainLoss / asset.initialCapital) * 100 : 0;
            const meta = ASSET_TYPE_LABELS[asset.type] || ASSET_TYPE_LABELS.other;
            const up = gainLoss >= 0;
            const openQuick = () => { setQuickUpdateAsset(asset); setQuickValue(String(asset.currentValue)); };
            return (
              <article key={asset.id} className="ax-ac ob static" style={{ '--c': meta.color } as React.CSSProperties}>
                <div className="ax-ac-h">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
                    {asset.symbolOrTicker && <span className="ax-ticker">{asset.symbolOrTicker}</span>}
                    <span className="ax-tag" style={{ backgroundColor: meta.bg }}>{meta.label}</span>
                  </div>
                  <div className="ax-acts">
                    <button type="button" className="ax-iconbtn" onClick={openQuick} title="Perbarui nilai pasar terkini" aria-label={`Perbarui nilai ${asset.name}`}><RefreshCw className="w-3.5 h-3.5" /></button>
                    <button type="button" className="ax-iconbtn" onClick={() => openEditModal(asset)} title="Edit detail aset" aria-label={`Edit ${asset.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" className="ax-iconbtn del" onClick={() => setAssetToDelete(asset)} title="Hapus aset" aria-label={`Hapus ${asset.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div>
                  <span className="ax-ob-name" style={{ display: 'block', fontSize: 15.5 }} title={asset.name}>{asset.name}</span>
                  <p className="ax-gnote" style={{ margin: '2px 0 0' }}>
                    {asset.units !== undefined ? `${asset.units} unit` : ''}{asset.units !== undefined && asset.platform ? ' · ' : ''}{asset.platform ? `via ${asset.platform}` : ''}
                  </p>
                </div>

                <div className="ax-ob-box">
                  <div><small>Modal beli</small><b>{formatRupiah(asset.initialCapital)}</b></div>
                  <div><small>Nilai saat ini</small><b className="blu">{formatRupiah(asset.currentValue)}</b></div>
                </div>

                <div className="ax-ret">
                  <span>Keuntungan</span>
                  <span>
                    <span className={up ? 'pos' : 'neg'}>{up ? '+' : ''}{formatRupiah(gainLoss)}</span>
                    <span className={`ax-chg ${up ? 'ok' : 'bad'}`}>{up ? '▲' : '▼'} {gainLossPct.toFixed(2)}%</span>
                  </span>
                </div>

                {asset.notes && <p className="ax-gnote">"{asset.notes}"</p>}

                <div className="ax-ac-f">
                  <span>Update: {asset.lastUpdated || 'Hari ini'}</span>
                  <button type="button" className="ax-link" onClick={openQuick}>Ubah nilai →</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL TAMBAH / EDIT ASET INVESTASI                                 */}
      {/* =================================================================== */}
      {(isAddOpen || editingAsset) && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-[2px]"
          onClick={() => { setIsAddOpen(false); setEditingAsset(null); }}
        >
          <div 
            className="w-full max-w-lg bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-3.5 space-y-3 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                  className="brutal-btn brutal-btn-ghost text-xs py-2 px-3"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-[2px]"
          onClick={() => setQuickUpdateAsset(null)}
        >
          <div 
            className="w-full max-w-sm bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-3.5 space-y-3 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-[var(--border-subtle)] pb-2">
              <h3 className="font-heading font-bold text-sm text-[var(--text-primary)]">
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
                  className="brutal-btn brutal-btn-sage text-xs py-1.5 px-3 font-bold shadow-[2px_2px_0px_#000]"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-[2px]"
          onClick={() => setAssetToDelete(null)}
        >
          <div 
            className="w-full max-w-sm bg-[var(--bg-surface)] border-2 border-[var(--border-color)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] p-3.5 space-y-3 animate-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[var(--accent-terracotta)]">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-heading font-bold text-sm text-[var(--text-primary)]">
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
                className="brutal-btn brutal-btn-terracotta text-xs py-1.5 px-3 font-bold shadow-[2px_2px_0px_#000]"
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
