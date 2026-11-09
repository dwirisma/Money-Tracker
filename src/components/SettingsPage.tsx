import { useState } from 'react';
import { Camera, Check, Eye, EyeOff, Moon, Pencil, Plus, RotateCcw, Sun, Trash2, X } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { LOCKED_CATEGORY, type CategoriesApi, type CategoryKind } from '../hooks/useCategories';
import { NeoButton, NeoCard, NeoInput } from './ui/Neo';
import { DEFAULT_GEMINI_MODEL, clearGeminiKey, getGeminiKey, getGeminiModel, saveGeminiSettings } from '../services/geminiSettings';
import { testGemini } from '../services/receiptScanService';

const KIND_LABEL: Record<CategoryKind, string> = { expense: 'Pengeluaran', income: 'Pemasukan' };

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t-2 border-[var(--border-subtle)] first:border-t-0">
      <div className="min-w-0">
        <div className="font-bold text-sm text-[var(--text-primary)]">{title}</div>
        <div className="text-xs text-[var(--text-secondary)]">{hint}</div>
      </div>
      {children}
    </div>
  );
}

export function SettingsPage({ categories }: { categories: CategoriesApi }) {
  const { theme, privacy, toggleTheme, togglePrivacy } = useUI();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const list = categories.lists[kind];

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const err = categories.add(kind, draft);
    setError(err);
    if (!err) setDraft('');
  };
  const submitRename = (from: string) => {
    const err = categories.rename(kind, from, editDraft);
    setError(err);
    if (!err) setEditing(null);
  };
  const switchKind = (k: CategoryKind) => { setKind(k); setEditing(null); setError(null); };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-heading font-bold text-2xl text-[var(--text-primary)]">Pengaturan</h2>
        <p className="text-sm text-[var(--text-secondary)]">Tampilan aplikasi dan kategori transaksi. Pengaturan disimpan di perangkat ini.</p>
      </div>

      <NeoCard className="p-4">
        <h3 className="font-heading font-bold mb-1 text-[var(--text-primary)]">Tampilan</h3>
        <Row title="Tema" hint={theme === 'dark' ? 'Gelap (dark slate)' : 'Terang (krem pastel)'}>
          <NeoButton onClick={toggleTheme} className="flex items-center gap-2 text-xs">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}{theme === 'dark' ? 'Pakai terang' : 'Pakai gelap'}
          </NeoButton>
        </Row>
        <Row title="Mode privasi" hint="Menyensor semua nominal menjadi Rp •••••••">
          <NeoButton onClick={togglePrivacy} aria-pressed={privacy} className="flex items-center gap-2 text-xs">
            {privacy ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}{privacy ? 'Tampilkan' : 'Sembunyikan'}
          </NeoButton>
        </Row>
      </NeoCard>

      <NeoCard className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-heading font-bold text-[var(--text-primary)]">Kategori transaksi</h3>
          <div className="flex gap-1">
            {(['expense', 'income'] as CategoryKind[]).map(k => (
              <button key={k} type="button" onClick={() => switchKind(k)} className="brutal-badge" style={kind === k ? { background: 'var(--accent-sand)', color: '#111' } : undefined}>{KIND_LABEL[k]}</button>
            ))}
          </div>
        </div>

        <form onSubmit={submitAdd} className="flex gap-2">
          <NeoInput value={draft} onChange={e => { setDraft(e.target.value); setError(null); }} placeholder={`Kategori ${KIND_LABEL[kind].toLowerCase()} baru`} maxLength={30} aria-label="Nama kategori baru" />
          <NeoButton type="submit" accent="sage" className="flex items-center gap-1 shrink-0"><Plus className="w-4 h-4" />Tambah</NeoButton>
        </form>
        {error && <p role="alert" className="text-xs font-bold text-[#c2334d]">{error}</p>}

        <ul className="space-y-2">
          {list.map(name => (
            <li key={name} className="flex items-center justify-between gap-2 border-2 border-[var(--border-color)] rounded-md px-3 py-2 bg-[var(--bg-elevated)]">
              {editing === name ? (
                <>
                  <NeoInput autoFocus value={editDraft} onChange={e => { setEditDraft(e.target.value); setError(null); }} onKeyDown={e => { if (e.key === 'Enter') submitRename(name); if (e.key === 'Escape') setEditing(null); }} maxLength={30} aria-label={`Ubah nama ${name}`} />
                  <div className="flex gap-1 shrink-0">
                    <NeoButton onClick={() => submitRename(name)} aria-label="Simpan" className="!p-2"><Check className="w-4 h-4" /></NeoButton>
                    <NeoButton onClick={() => { setEditing(null); setError(null); }} aria-label="Batal" className="!p-2"><X className="w-4 h-4" /></NeoButton>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm font-bold text-[var(--text-primary)] truncate">{name}{name === LOCKED_CATEGORY && <span className="ml-2 text-[10px] font-mono text-[var(--text-muted)]">BAWAAN • TERKUNCI</span>}</span>
                  {name !== LOCKED_CATEGORY && (
                    <div className="flex gap-1 shrink-0">
                      <NeoButton onClick={() => { setEditing(name); setEditDraft(name); setError(null); }} aria-label={`Ubah ${name}`} className="!p-2"><Pencil className="w-4 h-4" /></NeoButton>
                      <NeoButton onClick={() => { if (window.confirm(`Hapus kategori "${name}"? Transaksi lama tetap memakai nama ini.`)) categories.remove(kind, name); }} aria-label={`Hapus ${name}`} className="!p-2"><Trash2 className="w-4 h-4" /></NeoButton>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-[var(--text-secondary)]">Mengubah atau menghapus kategori hanya memengaruhi pilihan di form baru. Transaksi yang sudah tercatat tidak diubah.</p>
          <NeoButton ghost onClick={() => { if (window.confirm('Kembalikan semua kategori ke daftar bawaan?')) categories.reset(); }} className="flex items-center gap-1 text-xs shrink-0"><RotateCcw className="w-3.5 h-3.5" />Reset</NeoButton>
        </div>
      </NeoCard>
      <GeminiSection />
    </div>
  );
}

function GeminiSection() {
  const [key, setKey] = useState(getGeminiKey);
  const [model, setModel] = useState(getGeminiModel);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = () => { saveGeminiSettings(key, model); setStatus({ ok: true, text: key.trim() ? 'Tersimpan di perangkat ini.' : 'Kunci kosong, fitur Scan Struk nonaktif.' }); };
  const test = async () => {
    setBusy(true); setStatus(null);
    try { await testGemini({ apiKey: key.trim(), model: model.trim() || DEFAULT_GEMINI_MODEL }); saveGeminiSettings(key, model); setStatus({ ok: true, text: 'Koneksi berhasil. Pengaturan disimpan.' }); }
    catch (e) { setStatus({ ok: false, text: e instanceof Error ? e.message : 'Gagal menguji koneksi.' }); }
    finally { setBusy(false); }
  };

  return (
    <NeoCard className="p-4 space-y-3">
      <h3 className="font-heading font-bold flex items-center gap-2 text-[var(--text-primary)]"><Camera className="w-4 h-4" />Scan Struk (AI)</h3>
      <p className="text-xs text-[var(--text-secondary)]">Pakai kunci API Gemini milikmu sendiri (gratis dari Google AI Studio). Foto struk dikirim langsung dari browser ke Google, tidak lewat server Artha. Kunci hanya disimpan di perangkat ini, jadi jangan isi di komputer bersama.</p>
      <div>
        <label className="brutal-label">Kunci API Gemini</label>
        <div className="flex gap-2">
          <NeoInput type={show ? 'text' : 'password'} value={key} onChange={e => { setKey(e.target.value); setStatus(null); }} placeholder="AIza…" autoComplete="off" spellCheck={false} aria-label="Kunci API Gemini" />
          <NeoButton onClick={() => setShow(v => !v)} aria-label={show ? 'Sembunyikan kunci' : 'Tampilkan kunci'} className="!p-2 shrink-0">{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</NeoButton>
        </div>
      </div>
      <div>
        <label className="brutal-label">Nama model</label>
        <NeoInput value={model} onChange={e => { setModel(e.target.value); setStatus(null); }} placeholder={DEFAULT_GEMINI_MODEL} spellCheck={false} aria-label="Nama model Gemini" />
        <p className="text-[11px] text-[var(--text-muted)] mt-1">Nama model Google sering berganti. Jika muncul error "model tidak ditemukan", ganti di sini lalu uji koneksi.</p>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <NeoButton accent="sage" onClick={test} disabled={busy || !key.trim()}>{busy ? 'Menguji…' : 'Uji koneksi'}</NeoButton>
        <NeoButton onClick={save}>Simpan</NeoButton>
        <NeoButton ghost onClick={() => { clearGeminiKey(); setKey(''); setStatus({ ok: true, text: 'Kunci dihapus dari perangkat ini.' }); }} disabled={!key}>Hapus kunci</NeoButton>
      </div>
      {status && <p role={status.ok ? 'status' : 'alert'} className={`text-xs font-bold ${status.ok ? 'text-[var(--accent-sage-light)]' : 'text-[#c2334d]'}`}>{status.text}</p>}
    </NeoCard>
  );
}
