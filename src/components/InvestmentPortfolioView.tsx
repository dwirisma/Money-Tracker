import { toLocalDateStr } from '../utils/dateUtils';
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
  Calculator
} from 'lucide-react';
import type { Account, Ledger, InvestmentAsset, InvestmentAssetType, InvestmentEntry, InvestmentEntryKind } from '../types';
import { 
  ASSET_TYPE_LABELS, 
  calculateInvestmentSummary, 
  createInvestmentAsset, 
  updateInvestmentAsset, 
  deleteInvestmentAsset,
  addInvestmentEntry,
  updateInvestmentEntry,
  deleteInvestmentEntry,
  calculateAssetReturn
} from '../services/investmentService';
import { evaluateMathExpression, formatRupiah } from '../utils/financeUtils';
import { ModalFrame } from './ui/BaseUI';
import { AssetDetailModal, AssetEntryModal, KIND_META, type EntryValues } from './InvestmentModals';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { calcNoteOf } from './ObligationForms';

interface Props {
  uid: string;
  currentLedger: Ledger;
  investments: InvestmentAsset[];
  investmentEntries: InvestmentEntry[];
  accounts: Account[];
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export function InvestmentPortfolioView({
  uid,
  currentLedger,
  investments,
  investmentEntries,
  accounts,
  showToast
}: Props) {
  // Filter type
  const [selectedType, setSelectedType] = useState<string>('all');

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<InvestmentAsset | null>(null);
  const [quickUpdateAsset, setQuickUpdateAsset] = useState<InvestmentAsset | null>(null);

  // Riwayat dana (tambah dana, hasil, tarik, tutup)
  const [detailId, setDetailId] = useState<string | null>(null);
  const [entryReq, setEntryReq] = useState<{ kind: InvestmentEntryKind; assetId: string; entry?: InvestmentEntry } | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<InvestmentEntry | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const entriesOf = (assetId: string) => investmentEntries.filter(e => e.assetId === assetId);

  async function handleEntrySubmit(v: EntryValues) {
    if (!entryReq) return;
    setEntryBusy(true);
    setEntryError(null);
    try {
      if (entryReq.entry) {
        await updateInvestmentEntry(uid, entryReq.entry.id, v);
        showToast('Catatan diperbarui.', 'success');
      } else {
        await addInvestmentEntry(uid, { assetId: entryReq.assetId, kind: entryReq.kind, ...v });
        showToast(entryReq.kind === 'close' ? 'Aset ditutup dan hasilnya dicatat.' : `${KIND_META[entryReq.kind].label} dicatat.`, 'success');
      }
      setEntryReq(null);
    } catch (err: any) {
      setEntryError(err?.message || 'Gagal menyimpan catatan.');
    } finally {
      setEntryBusy(false);
    }
  }

  async function confirmDeleteEntry() {
    if (!entryToDelete) return;
    try {
      await deleteInvestmentEntry(uid, entryToDelete.id);
      showToast('Catatan dihapus dan saldo akun dikembalikan.', 'info');
      setEntryToDelete(null);
    } catch (err: any) {
      showToast(err?.message || 'Gagal menghapus catatan.', 'error');
    }
  }
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
      await createInvestmentAsset(uid, {
        ledgerId: currentLedger.id,
        name: name.trim(),
        symbolOrTicker: ticker.trim().toUpperCase() || undefined,
        type,
        platform: platform.trim() || undefined,
        initialCapital: capVal,
        currentValue: curVal,
        units: isNaN(parsedUnits || NaN) ? undefined : parsedUnits,
        notes: notes.trim() || undefined,
        lastUpdated: toLocalDateStr(new Date())
      });

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
      await updateInvestmentAsset(uid, editingAsset.id, {
        name: name.trim(),
        symbolOrTicker: ticker.trim().toUpperCase() || undefined,
        type,
        platform: platform.trim() || undefined,
        initialCapital: capVal,
        currentValue: curVal,
        units: isNaN(parsedUnits || NaN) ? undefined : parsedUnits,
        notes: notes.trim() || undefined,
        lastUpdated: toLocalDateStr(new Date())
      });

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
      await updateInvestmentAsset(uid, quickUpdateAsset.id, {
        currentValue: newVal,
        lastUpdated: toLocalDateStr(new Date())
      });

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
      await deleteInvestmentAsset(uid, assetToDelete.id);
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
          {[...filteredAssets].sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed')).map(asset => {
            const gainLoss = asset.currentValue - asset.initialCapital;
            const gainLossPct = asset.initialCapital > 0 ? (gainLoss / asset.initialCapital) * 100 : 0;
            const meta = ASSET_TYPE_LABELS[asset.type] || ASSET_TYPE_LABELS.other;
            const up = gainLoss >= 0;
            const openQuick = () => { setQuickUpdateAsset(asset); setQuickValue(String(asset.currentValue)); };
            const closed = asset.status === 'closed';
            const ret = calculateAssetReturn(asset, entriesOf(asset.id));
            return (
              <article key={asset.id} className={`ax-ac ob static ${closed ? 'off' : ''}`} style={{ '--c': meta.color } as React.CSSProperties}>
                <div className="ax-ac-h">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
                    {asset.symbolOrTicker && <span className="ax-ticker">{asset.symbolOrTicker}</span>}
                    <span className="ax-tag" style={{ backgroundColor: meta.bg }}>{meta.label}</span>
                    {closed && <span className="ax-tag n">Selesai</span>}
                  </div>
                  <div className="ax-acts">
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

                {(ret.yieldTotal > 0 || ret.cashedOut > 0 || ret.topupTotal > 0) && (
                  <div className="ax-ob-list">
                    {ret.topupTotal > 0 && <div className="ax-ob-row2"><span>Dana tambahan</span><b>{formatRupiah(ret.topupTotal)}</b></div>}
                    {ret.yieldTotal > 0 && <div className="ax-ob-row2"><span>Hasil terkumpul</span><b style={{ color: 'var(--accent-sage-light)' }}>+{formatRupiah(ret.yieldTotal)}</b></div>}
                    {ret.cashedOut > 0 && <div className="ax-ob-row2"><span>Sudah dicairkan</span><b>{formatRupiah(ret.cashedOut)}</b></div>}
                    <div className="ax-ob-row2"><span>ROI total</span><b>{ret.roiTotal >= 0 ? '+' : ''}{ret.roiTotal.toFixed(1)}%</b></div>
                  </div>
                )}

                {asset.notes && <p className="ax-gnote">"{asset.notes}"</p>}

                <div className="ax-ob-act">
                  <button type="button" className="brutal-btn brutal-btn-lavender" onClick={() => setDetailId(asset.id)}>
                    <Layers className="w-3.5 h-3.5" />{closed ? 'Lihat riwayat' : 'Kelola dana & riwayat'}
                  </button>
                </div>

                <div className="ax-ac-f">
                  <span>Update: {asset.lastUpdated || 'Hari ini'}</span>
                  {!closed && <button type="button" className="ax-link" onClick={openQuick}>Ubah nilai →</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* =================================================================== */}
      {/* DETAIL ASET, RIWAYAT DANA, DAN FORM CATATAN                          */}
      {/* =================================================================== */}
      {(() => {
        const asset = detailId ? investments.find(a => a.id === detailId) : null;
        if (!asset) return null;
        const meta = ASSET_TYPE_LABELS[asset.type] || ASSET_TYPE_LABELS.other;
        const entries = entriesOf(asset.id);
        return (
          <AssetDetailModal
            asset={asset}
            entries={entries}
            accounts={accounts}
            ret={calculateAssetReturn(asset, entries)}
            typeLabel={meta.label}
            color={meta.color}
            onAction={(kind) => { setEntryError(null); setEntryReq({ kind, assetId: asset.id }); }}
            onEditEntry={(e) => { setEntryError(null); setEntryReq({ kind: e.kind, assetId: asset.id, entry: e }); }}
            onDeleteEntry={setEntryToDelete}
            onClose={() => setDetailId(null)}
          />
        );
      })()}

      {entryReq && (() => {
        const asset = investments.find(a => a.id === entryReq.assetId);
        if (!asset) return null;
        return (
          <AssetEntryModal
            key={entryReq.entry?.id ?? entryReq.kind}
            kind={entryReq.kind}
            asset={asset}
            accounts={accounts}
            initial={entryReq.entry}
            busy={entryBusy}
            error={entryError}
            onSubmit={handleEntrySubmit}
            onClose={() => setEntryReq(null)}
          />
        );
      })()}

      {entryToDelete && (
        <ConfirmDeleteModal
          title="Hapus Catatan Dana?"
          kind={KIND_META[entryToDelete.kind].label}
          name={`${entryToDelete.date} · ${formatRupiah(entryToDelete.amount)}`}
          notes={[{ tone: 'danger', text: 'Efeknya dibatalkan: modal atau nilai aset dikembalikan dan transaksi kasnya ikut dihapus, sehingga saldo akun kembali seperti sebelum catatan ini.' }]}
          confirmLabel="Ya, hapus catatan"
          onClose={() => setEntryToDelete(null)}
          onConfirm={confirmDeleteEntry}
        />
      )}

      {/* =================================================================== */}
      {/* MODAL TAMBAH / EDIT ASET INVESTASI                                 */}
      {/* =================================================================== */}
      {(isAddOpen || editingAsset) && (() => {
        const close = () => { setIsAddOpen(false); setEditingAsset(null); };
        const formId = editingAsset ? 'edit-asset-form' : 'add-asset-form';
        const capNote = calcNoteOf(capital);
        const valNote = calcNoteOf(currentValue);
        const capNum = evaluateMathExpression(capital);
        const valNum = evaluateMathExpression(currentValue);
        const gain = capNum.success && valNum.success ? valNum.result - capNum.result : null;
        return (
          <ModalFrame
            wide
            title={editingAsset ? 'Ubah Aset Investasi' : 'Tambah Aset Investasi'}
            subtitle={editingAsset ? editingAsset.name : `Buku kas: ${currentLedger.name}`}
            icon={editingAsset ? <Pencil className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
            tint="#e3a8f7"
            onClose={close}
            footer={
              <>
                <button type="button" className="brutal-btn brutal-btn-ghost" onClick={close}>Batal</button>
                <button type="submit" form={formId} className="brutal-btn brutal-btn-sand">
                  <Check className="w-4 h-4" />{editingAsset ? 'Simpan perubahan' : 'Tambah ke portofolio'}
                </button>
              </>
            }
          >
            <form id={formId} onSubmit={editingAsset ? handleSaveEditedAsset : handleCreateAsset} className="ax-form">
              <div className="ax-two">
                <div>
                  <label className="brutal-label" htmlFor={`${formId}-name`}>Nama instrumen / aset</label>
                  <input id={`${formId}-name`} type="text" className="brutal-input" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Bank BRI, Bitcoin, Antam 10g" required />
                </div>
                <div>
                  <label className="brutal-label" htmlFor={`${formId}-ticker`}>Kode / ticker (opsional)</label>
                  <input id={`${formId}-ticker`} type="text" className="brutal-input uppercase" value={ticker} onChange={(e) => setTicker(e.target.value)}
                    placeholder="BBRI, BTC, XAU" />
                </div>
              </div>

              <div>
                <div className="ax-fl"><span>Kategori aset</span></div>
                <div className="ax-chipset" role="radiogroup" aria-label="Kategori aset">
                  {Object.entries(ASSET_TYPE_LABELS).map(([k, meta]) => (
                    <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k as InvestmentAssetType)}>{meta.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="brutal-label" htmlFor={`${formId}-platform`}>Platform / sekuritas</label>
                <input id={`${formId}-platform`} type="text" className="brutal-input" value={platform} onChange={(e) => setPlatform(e.target.value)}
                  placeholder="Stockbit, Bibit, Pluang, BCA" />
              </div>

              <div className="ax-two">
                <div className="ax-amt" data-kind="transfer">
                  <label className="ax-fl" htmlFor={`${formId}-cap`}><span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Modal pembelian</span></label>
                  <div className="ax-amt-row">
                    <span>Rp</span>
                    <input id={`${formId}-cap`} type="text" inputMode="text" autoComplete="off" value={capital} onChange={(e) => setCapital(e.target.value)}
                      onBlur={handleCapitalBlur} placeholder="10000000" required />
                  </div>
                  {capNote && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{capNote}</div>}
                </div>
                <div className="ax-amt" data-kind="income">
                  <label className="ax-fl" htmlFor={`${formId}-val`}><span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Nilai pasar terkini</span></label>
                  <div className="ax-amt-row">
                    <span>Rp</span>
                    <input id={`${formId}-val`} type="text" inputMode="text" autoComplete="off" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)}
                      onBlur={handleCurrentValueBlur} placeholder="11450000" required />
                  </div>
                  {valNote && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{valNote}</div>}
                </div>
              </div>

              {calcNotice && (
                <div className="ax-warn"><Check className="w-4 h-4" /><span>{calcNotice}</span></div>
              )}

              {gain !== null && (
                <div className="ax-sum">
                  <div><small>Untung / rugi sementara</small><b style={{ color: gain >= 0 ? 'var(--accent-sage-light)' : 'var(--accent-terracotta-light)' }}>{gain >= 0 ? '+' : '-'}{formatRupiah(Math.abs(gain))}</b></div>
                  <div><small>ROI</small><b>{capNum.result > 0 ? `${((gain / capNum.result) * 100).toFixed(1)}%` : '-'}</b></div>
                </div>
              )}

              <div className="ax-two">
                <div>
                  <label className="brutal-label" htmlFor={`${formId}-units`}>Jumlah unit / lot / gram</label>
                  <input id={`${formId}-units`} type="text" className="brutal-input" value={units} onChange={(e) => setUnits(e.target.value)}
                    placeholder="2000 lembar, 10 gram" />
                </div>
                <div>
                  <label className="brutal-label" htmlFor={`${formId}-notes`}>Catatan strategi</label>
                  <input id={`${formId}-notes`} type="text" className="brutal-input" value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Untuk dana pensiun, DCA bulanan" />
                </div>
              </div>
            </form>
          </ModalFrame>
        );
      })()}

      {/* =================================================================== */}
      {/* MODAL QUICK UPDATE NILAI PASAR                                     */}
      {/* =================================================================== */}
      {quickUpdateAsset && (
        <ModalFrame
          title="Perbarui Nilai Pasar"
          subtitle={quickUpdateAsset.name}
          icon={<RefreshCw className="w-4 h-4" />}
          tint="var(--accent-sage)"
          onClose={() => setQuickUpdateAsset(null)}
          footer={
            <>
              <button type="button" className="brutal-btn brutal-btn-ghost" onClick={() => setQuickUpdateAsset(null)}>Batal</button>
              <button type="submit" form="quick-asset-form" className="brutal-btn brutal-btn-sage"><Check className="w-4 h-4" />Update nilai</button>
            </>
          }
        >
          <form id="quick-asset-form" onSubmit={handleSaveQuickUpdate} className="ax-form">
            <div className="ax-sum">
              <div><small>Modal beli</small><b>{formatRupiah(quickUpdateAsset.initialCapital)}</b></div>
              <div><small>Nilai saat ini</small><b>{formatRupiah(quickUpdateAsset.currentValue)}</b></div>
            </div>
            <div className="ax-amt" data-kind="income">
              <label className="ax-fl" htmlFor="quick-asset-val"><span><Calculator className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Nilai pasar baru</span></label>
              <div className="ax-amt-row">
                <span>Rp</span>
                <input id="quick-asset-val" type="text" inputMode="text" autoComplete="off" value={quickValue} onChange={(e) => setQuickValue(e.target.value)}
                  placeholder="Total nilai saat ini" autoFocus required />
              </div>
              {calcNoteOf(quickValue) && <div className="ax-calc"><Check className="w-3.5 h-3.5" />{calcNoteOf(quickValue)}</div>}
            </div>
          </form>
        </ModalFrame>
      )}

      {/* =================================================================== */}
      {/* MODAL KONFIRMASI HAPUS ASET                                        */}
      {/* =================================================================== */}
      {assetToDelete && (
        <ConfirmDeleteModal
          title="Hapus Aset Investasi?"
          kind="Aset investasi"
          name={assetToDelete.name}
          detailLabel="Nilai pasar"
          detail={formatRupiah(assetToDelete.currentValue)}
          notes={[{ tone: 'danger', text: 'Aset beserta riwayat dananya akan dihapus dari portofolio dan tidak dapat dipulihkan. Transaksi kas yang pernah dicatat tetap tersimpan di riwayat transaksi.' }]}
          confirmLabel="Ya, hapus aset"
          onClose={() => setAssetToDelete(null)}
          onConfirm={confirmDeleteAsset}
        />
      )}
    </div>
  );
}
