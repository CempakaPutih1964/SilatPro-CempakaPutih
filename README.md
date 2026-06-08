# SilatPro - Pencak Silat Cempaka Putih PENGDA Kaltim
Sistem Manajemen Turnamen Online

---

## CARA DEPLOY KE RENDER.COM (GRATIS)

### Langkah 1 - Siapkan GitHub
1. Buka https://github.com dan daftar/login
2. Klik **New Repository**
3. Nama repo: `silatpro-cempaka`
4. Pilih **Public** → klik **Create Repository**
5. Upload semua file ini ke repo tersebut

### Langkah 2 - Deploy ke Render
1. Buka https://render.com dan daftar/login (bisa pakai GitHub)
2. Klik **New** → **Web Service**
3. Pilih repo GitHub `silatpro-cempaka`
4. Isi pengaturan:
   - **Name**: silatpro-cempaka
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Klik **Create Web Service**
6. Tunggu ~2 menit sampai deploy selesai
7. Dapat URL seperti: `https://silatpro-cempaka.onrender.com`

### Langkah 3 - Pakai!
- Bagikan URL ke semua Juri/Dewan/Ketua
- Buka di HP masing-masing pakai browser Chrome
- Login sesuai peran

---

## PASSWORD LOGIN
| Peran | Password |
|-------|---------|
| Admin | 1234 |
| Ketua / Wasit | 3456 |
| Juri | 5678 |
| Dewan | 9012 |

---

## ALUR PENGGUNAAN

1. **Admin** login → buat turnamen → daftar peserta → buat laga
2. Admin klik **Ganti Peran** → masuk sebagai Ketua
3. Ketua buka URL yang sama di HP → login sebagai Ketua
4. Juri 1, 2, 3 buka URL yang sama → login sebagai Juri
5. Dewan 1, 2 buka URL yang sama → login sebagai Dewan
6. Ketua klik **START** → pertandingan dimulai
7. Juri input poin → Dewan sahkan jatuhan → semua real-time!

---

## CATATAN PENTING
- Data tersimpan di memori server (hilang jika server restart)
- Server Render gratis "tidur" setelah 15 menit tidak ada yang buka
- Buka URL 1 menit sebelum turnamen untuk "bangunkan" server
- Semua perangkat harus terhubung internet (paket data/WiFi)

---

## STRUKTUR FILE
```
silatpro-online/
├── server.js          # Server Node.js + Socket.IO
├── package.json       # Dependencies
├── render.yaml        # Konfigurasi Render.com
├── README.md          # Panduan ini
└── public/
    └── index.html     # Aplikasi frontend
```
