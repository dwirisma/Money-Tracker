# 🚀 Artha UI — "Paper Cut" (Neo-Retro)

> **Asisten Keuangan Pribadi Bertenaga AI.** 
> Dibangun khusus untuk mengambil alih kerumitan manajemen arus kas, merencanakan alokasi gaji otomatis, dan memaksimalkan pertumbuhan portofolio investasi pribadi.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Firebase](https://img.shields.io/badge/firebase-ffca28?style=for-the-badge&logo=firebase&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

## ✨ Fitur Unggulan

Aplikasi ini tidak sekadar mencatat pengeluaran, tetapi bertindak sebagai manajer kekayaan (*wealth manager*) pribadi:

*   🤖 **AI Financial Insights:** Integrasi cerdas dengan Google Gemini yang menganalisis kebiasaan belanja dan memberikan wawasan, peringatan kebocoran dana, serta evaluasi portofolio.
*   ✈️ **Autopilot & Automations:** 
    *   **Automations:** Jalankan aturan statis untuk tagihan bulanan atau transfer rutin (*sinking funds*) secara otomatis.
    *   **Autopilot:** Sistem adaptif yang secara dinamis menyebarkan surplus kas ke instrumen investasi atau tabungan berdasarkan matriks prioritas.
*   💸 **Salary Shift (Modul 6):** *Engine* alokasi gaji cerdas. Begitu hari gajian tiba, sistem akan memecah dan mendistribusikan dana ke pos pengeluaran, tabungan, dan kewajiban secara terstruktur.
*   🧾 **Smart Receipt Scanner:** Ekstrak data dari struk belanja fisik Anda dengan pemindai AI. Hilangkan entri data manual yang membosankan.
*   💼 **Investment Portfolio:** Lacak pertumbuhan aset, investasi proyek (termasuk modal pemeliharaan), dan pergerakan *sinking funds* dalam satu dasbor visual.
*   🎯 **Goals & Obligations Tracker:** Pantau target keuangan masa depan dan kelola utang atau tagihan rutin agar tidak pernah terlewat.

## 🔄 Alur Kerja Aplikasi (Workflow)

Money-Tracker dirancang untuk meminimalkan beban kognitif dalam mengatur uang. Berikut adalah cara aplikasi ini mengelola siklus finansial:

1. **Fase Penerimaan (Gajian):** Saat dana masuk, modul **Salary Shift** langsung mendistribusikan uang ke amplop-amplop virtual (Kewajiban, Kebutuhan Sehari-hari, Tabungan).
2. **Fase Berjalan (Harian):** Pengeluaran harian dicatat dengan cepat menggunakan **Smart Receipt Scanner**. 
3. **Fase Evaluasi (Mingguan/Bulanan):** **AI Insights** membaca tren pengeluaran dan memperingatkan jika ada kategori yang melebihi batas (misalnya, terlalu banyak makan di luar).
4. **Fase Optimalisasi (Akhir Bulan):** Jika terdapat sisa uang di akhir bulan, mode **Autopilot** akan secara otomatis merekomendasikan dan memindahkan surplus tersebut ke portofolio investasi agar uang tidak menganggur.

## 🔒 Privasi & Keamanan Data

Karena aplikasi ini dibangun untuk penggunaan **pribadi (personal use)**, arsitektur data dirancang dengan privasi sebagai prioritas utama:
*   **Zero-Third-Party Tracking:** Tidak ada analitik pihak ketiga. Semua data transaksi, aset, dan riwayat investasi sepenuhnya menjadi milik pribadi.
*   **Private Database:** Seluruh basis data (Firebase Firestore) dan file dienkripsi dan di-host secara mandiri dalam *environment* yang tertutup.
*   **AI Data Handling:** Prompts yang dikirim ke Google Gemini dianonimkan untuk mencegah kebocoran informasi sensitif.

## 🛠️ Arsitektur & Teknologi

*   **Frontend:** React, TypeScript, Vite
*   **Styling & UI:** Tailwind CSS dengan antarmuka *Dark Mode* Neumorphism/Neobrutalism.
*   **Data Visualization:** Recharts untuk metrik kinerja dan linimasa.
*   **Backend / BaaS:** Firebase (Autentikasi & Database)
*   **AI Integration:** Google Gemini API (via `geminiSettings.ts`)

## 🗺️ Rencana Pengembangan (Roadmap)

- [x] Integrasi Google Gemini untuk *AI Insights*
- [x] Kalkulator *Salary Shift*
- [x] Pemindai Struk Otomatis (Receipt Scanner)
- [ ] Pengingat tagihan via Push Notification
- [ ] Mode "Dry-Run" untuk simulasi keputusan investasi (What-If Analysis)
- [ ] Ekspor Laporan Keuangan 6-Bulanan ke format PDF

## 📂 Struktur Direktori Utama

```text
📦 src
 ┣ 📂 components        # Komponen UI (Dashboard, Autopilot, SalaryShift, dll)
 ┣ 📂 config            # Konfigurasi eksternal (Firebase)
 ┣ 📂 context           # React Context (UI & State Management)
 ┣ 📂 hooks             # Custom React Hooks
 ┣ 📂 services          # Logika bisnis (Autopilot, AI, Budget, Receipts)
 ┣ 📂 types             # Definisi antarmuka TypeScript
 ┗ 📂 utils             # Fungsi utilitas (Kalkulator gaji, pemroses data)