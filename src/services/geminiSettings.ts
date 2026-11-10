/** Kunci & model Gemini milik pengguna. Disimpan HANYA di perangkat ini (localStorage), tidak ikut sinkronisasi. */
const KEY = 'artha_gemini_key';
const MODEL = 'artha_gemini_model';
/** Alias "latest" mengikuti Flash terbaru; ID model Google sering berganti, jadi bisa diubah di Pengaturan. */
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage tidak tersedia */ } };

export const getGeminiKey = () => (read(KEY) ?? '').trim();
export const getGeminiModel = () => (read(MODEL) ?? '').trim() || DEFAULT_GEMINI_MODEL;
export const saveGeminiSettings = (key: string, model: string) => { write(KEY, key.trim() || null); write(MODEL, model.trim() || null); };
export const clearGeminiKey = () => write(KEY, null);
