# Artha UI v5 — "Paper Cut" (Neo-Retro)

Rombakan tampilan **tanpa mengubah satu pun fitur**. Tidak ada service, tipe data,
state, atau logika transaksi yang disentuh — hanya lapisan visual.

## Cara pasang (5 file, timpa langsung)

Salin dari folder `src/` di paket ini ke `src/` proyek:

| file di paket | tujuannya di proyek |
|---|---|
| `src/style.css` | `src/style.css` |
| `src/styles-ax.css` | `src/styles-ax.css` |
| `src/components/DashboardPage.tsx` | `src/components/DashboardPage.tsx` |
| `src/components/layout/AppNav.tsx` | `src/components/layout/AppNav.tsx` |
| `src/components/layout/HeaderTools.tsx` | `src/components/layout/HeaderTools.tsx` |

Lalu `npm run dev`. Tidak perlu install paket apa pun.

> `src/index.css` tidak perlu diubah — ia sudah mengimpor `style.css` dan
> `styles-ax.css` secara berurutan.

## Kenapa ini aman untuk fitur

Seluruh modul lain (Tambah Transaksi, Riwayat, Akun & Saldo, Sinking Funds,
Tagihan & Utang, Otomatisasi, Portofolio, Laporan, Gaji & Shift, Pengaturan,
semua modal, toast, AI Insight, Notification Center) memakai **kelas token yang
sama** — `brutal-card`, `brutal-btn`, `brutal-input`, `brutal-badge`,
`brutal-progress-*`, `ax-panel`, `ax-row`, dst. Kelas itu hanya diubah *nilainya*
(warna, radius, bayangan), bukan namanya, jadi setiap layar otomatis ikut berubah
tanpa menyentuh JSX-nya.

## Yang berubah secara visual

- **Kanvas** rose pucat `#fbedf2` dengan tiga blob gradien (mint / peach / biru).
- **Kartu** putih bersih, garis tinta 2px, bayangan keras tanpa blur, radius 18–30px.
- **Tombol** jadi pil penuh (radius 999px) — persis gaya referensi.
- **Sidebar** mint lembut, item aktif berupa pil tinta penuh.
- **Top bar** jadi satu bar melayang berbingkai, bukan garis penuh lebar.
- **Hero dashboard** blok kuning besar dengan angka kekayaan bersih raksasa,
  segel "KEKAYAAN" miring, dan tiga kartu statistik di dalamnya.
- **Panel warna** untuk Arus Kas (kuning), Sinking Funds (mint), supaya dashboard
  terasa seperti poster, bukan tabel.
- **Skor finansial** ring lebih besar (132px) dengan angka 38px.
- **Tema gelap** tetap berfungsi penuh lewat `[data-theme="dark"]`.

## Palet

| token | terang |
|---|---|
| canvas | `#fbedf2` |
| kartu | `#ffffff` |
| tinta | `#12100f` |
| sand | `#ffc733` |
| terracotta | `#f4512c` |
| mint | `#17c4a0` |
| blue | `#3b5bf6` |
| lavender | `#c9a5f7` |
