# 🚀 GRAND BLUEPRINT (V3 - MEGA OVERHAUL): Artha - Ultimate Wealth OS

Dokumen ini adalah cetak biru eksekusi rombak total (*Mega Overhaul*) aplikasi Artha. Menggabungkan fitur kelas *Enterprise* dengan balutan antarmuka **Neo-Brutalisme Kalem yang mendukung Tema Terang & Gelap**. 
**Aturan Emas:** *Logic data inti (Offline-First Firestore, dan Kalkulator Gaji Group C) TIDAK BOLEH RUSAK. Rombakan berfokus pada layer UI/UX, penambahan fitur cerdas, dan perluasan sistem otomatisasi.*

---

## 🎨 I. VISUAL & UI AESTHETIC (NEO-BRUTALISM KALEM)
Gaya desain akan tetap menggunakan garis tegas dan bayangan solid, namun disesuaikan agar nyaman di mata (*eye-pleasing*) dalam dua mode.

1.  **Dinamika Tema (Dark/Light Mode):**
    *   **Light Mode:** Latar belakang *off-white* (kertas/krem pucat). Aksen warna pastel kalem (Mint Green, Soft Lavender, Peach, Muted Yellow).
    *   **Dark Mode:** Latar belakang *dark slate* atau abu-abu arang (bukan hitam pekat/hitam murni agar tetap kalem). Aksen warna akan diredupkan (*desaturated*) agar tidak menyilaukan mata, namun tetap kontras.
2.  **Borders & Shadows (Kunci Utama):**
    *   Setiap elemen (Kartu, Input, Tombol) wajib memiliki `border-2` atau `border-4`. Di Light mode border berwarna hitam pekat, di Dark mode border berwarna abu-abu terang atau senada dengan aksen.
    *   Gunakan bayangan solid / *Hard Shadow* (Bukan *blur*): `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]` di Light mode, dan warna bayangan yang disesuaikan di Dark mode.
3.  **Fitur Privasi Visual (Sensor Saldo):**
    *   Mode Privasi (Mata tertutup/terbuka) yang akan mengubah teks angka saldo menjadi `Rp •••••••` di seluruh aplikasi saat diaktifkan.

---

## 📱 II. ARSITEKTUR NAVIGASI & RESPONSIVITAS (UX)

### Desktop (PC)
*   **Sidebar Kiri Utama:** Dibagi menjadi 3 area:
    1.  *Navigasi Utama:* Dashboard, Buku Besar, Daftar Akun.
    2.  *Modul:* Sinking Funds (Goals), Tagihan & Utang, Otomatisasi, Laporan & Analitik, Portofolio.
    3.  *Pengaturan & Bantuan:* Pengaturan (Settings), FlowAI Config.
*   **Header Top:** *Search bar* (opsional), Jam/Tanggal *Real-time*, tombol *Toggle* Tema (Matahari/Bulan), tombol Privasi (Mata), dan profil *User*.

### Mobile (Smartphone)
*   **Bottom Navigation Bar (Wajib):** Nempel di bawah layar dengan *border-t* tebal. Berisi: Beranda, Laporan, Tombol (+) Tambah Transaksi besar di tengah (warna cerah), Otomatisasi, dan Menu.
*   **Drawer "Menu Lainnya":** Saat ikon "Menu" diklik, muncul modal *neo-brutalist* dari bawah (*bottom sheet*) untuk mengakses Sinking Funds, Tagihan, Pengaturan, dll.

---

## 🛠️ III. BREAKDOWN FITUR & PERBEDAAN MODUL

### 1. Dashboard vs Laporan & Analitik (Pembeda Jelas)
*   **DASHBOARD (The "Snapshot"):** Halaman *real-time pulse*. Tujuannya agar dalam 3 detik pengguna tahu kondisi hari ini.
    *   *Isi:* 6 Top Metrik (Total Saldo, Pemasukan/Pengeluaran Bulan Ini, *Health Score*), Widget "Tagihan Jatuh Tempo dalam X Hari", Progress Tabungan yang paling dekat, dan 5 Transaksi Terakhir. Fokus pada "Apa yang terjadi hari ini/minggu ini".
*   **LAPORAN & ANALITIK (The "Deep Dive"):** Halaman evaluasi historis kelas berat. 
    *   *Isi:* Grafik Arus Kas 6 bulan ke belakang, Donat Rincian Pengeluaran, Tabel komparasi surplus/defisit antar bulan, Ekspor CSV/PDF. Fokus pada "Bagaimana performa uang saya sepanjang waktu".

### 2. Sinking Funds & Tagihan (Tetap Terpisah!)
Keduanya berdiri sendiri namun terhubung erat ke sistem Otomatisasi:
*   **Modul Sinking Funds & Wishlist (Target Tabungan):** Melacak uang yang disisihkan untuk tujuan tertentu (Dana Darurat, Liburan).
*   **Modul Tagihan & Utang (Kewajiban):** Melacak tagihan rutin (Listrik, Cicilan) atau utang pribadi. Memiliki kalkulator "Jatuh tempo dalam X hari" yang mengubah warna teks menjadi merah jika lewat tenggat.

### 3. Ekosistem Otomatisasi Super (*The Super Engine*)
Modul Otomatisasi ditingkatkan dari sekadar Pemasukan/Pengeluaran menjadi *Financial Autopilot*:
*   Bisa membuat aturan (Cron job/Trigger) untuk:
    *   Gaji/Pemasukan Otomatis.
    *   Top-up Sinking Fund otomatis dari saldo dompet.
    *   Bayar Tagihan otomatis saat tanggal jatuh tempo.
    *   Cicil Utang otomatis.

### 4. Fitur "Scan Struk" Berbasis AI
*   Tombol berikon kamera di form "Tambah Transaksi". Menggunakan Google Gemini API untuk mengekstrak Base64 gambar struk menjadi JSON (`nominal`, `tanggal`, `kategori`, `catatan`) yang otomatis mengisi form input.

### 5. Modul Pengaturan (Settings)
*   *Global Settings:* Toggle Light/Dark Mode (disimpan ke `localStorage`), Toggle Privacy Mode.
*   *Category Manager:* Tambah/Edit/Hapus kategori kustom untuk transaksi.

---

## 🚀 IV. ROADMAP MEGA-OVERHAUL (EKSEKUSI SERENTAK)
Karena eksekusi akan dilakukan secara *Overhaul* besar-besaran, struktur pengerjaan akan dibagi menjadi implementasi teknis paralel, bukan fase bertahap:

*   **LANGKAH 1: Global State & Foundation (The Skeleton)**
    *   Mengatur Context/Zustand untuk *Theme* (Dark/Light) dan *Privacy Mode* (Sensor nominal).
    *   Membuat *Base Components* Neo-Brutalisme (Button, Card, Input) yang dinamis merespons tema gelap/terang.
*   **LANGKAH 2: Navigasi Universal (The Routes)**
    *   Membangun ulang struktur *Sidebar* Desktop dan *Bottom Navigation* Mobile secara serentak.
    *   Membangun struktur *Router* untuk modul-modul yang terpisah.
*   **LANGKAH 3: Mass UI Injection (The Body)**
    *   Merapikan Form Gaji Group C dan Ledger menggunakan *Base Components* baru.
    *   Merombak UI Dashboard (6 Metrik) dan Laporan & Analitik (Integrasi Chart).
    *   Merombak antarmuka Sinking Fund, Tagihan, dan Otomatisasi (menyuntikkan fungsi *super-engine*).
*   **LANGKAH 4: AI & Ekstraksi (The Brain)**
    *   Membuat integrasi fungsi Gemini API untuk Scan Struk di halaman Tambah Transaksi.
    *   Membangun fungsi Ekspor PDF/CSV untuk Modul Laporan.