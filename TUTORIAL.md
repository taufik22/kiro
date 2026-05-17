# 📖 Tutorial Lengkap: Menjalankan Payment Gateway ChatGPT Plus via GoPay/Midtrans

Tutorial ini dibuat untuk **pemula** yang belum pernah coding sebelumnya. Ikuti langkah demi langkah.

---

## 📌 Apa yang Akan Kita Buat?

Sebuah website pembayaran yang memungkinkan customer bayar langganan ChatGPT Plus/Pro menggunakan:
- **GoPay** (redirect ke halaman pembayaran)
- **QRIS** (scan QR code)
- **Transfer Bank, Kartu Kredit, dll** (via popup Midtrans)

---

## 🧰 Persiapan (Install Dulu)

### 1. Install Node.js

Node.js adalah "mesin" untuk menjalankan program JavaScript di komputer kamu.

**Windows:**
1. Buka https://nodejs.org
2. Download versi **LTS** (yang ada tulisan "Recommended")
3. Double-click file yang ter-download
4. Klik **Next** terus sampai selesai
5. Restart komputer

**Mac:**
1. Buka https://nodejs.org
2. Download versi **LTS**
3. Install seperti biasa

**Cara cek sudah terinstall:**
Buka Terminal (Mac) atau Command Prompt (Windows), ketik:
```bash
node --version
npm --version
```
Jika keluar nomor versi (misal `v20.x.x`), berarti sudah berhasil.

---

### 2. Install Git (Opsional, untuk Download Project)

**Windows:** Download dari https://git-scm.com/download/win  
**Mac:** Ketik `git --version` di Terminal, nanti akan otomatis diminta install.

---

### 3. Download Text Editor

Disarankan pakai **Visual Studio Code** (gratis):
- Download di https://code.visualstudio.com

---

## 📥 Langkah 1: Download Project

### Cara A: Pakai Git (Recommended)
```bash
git clone https://github.com/taufik22/kiro.git
cd kiro
git checkout fix/chatgpt-gopay-midtrans-payment
```

### Cara B: Download ZIP
1. Buka https://github.com/taufik22/kiro
2. Klik tombol hijau **"Code"**
3. Klik **"Download ZIP"**
4. Extract ZIP ke folder yang kamu mau
5. Buka folder tersebut

---

## 🔑 Langkah 2: Daftar Akun Midtrans (GRATIS)

Midtrans adalah payment gateway resmi Indonesia. Kita perlu "kunci" dari Midtrans untuk bisa menerima pembayaran.

### Daftar Sandbox (Mode Testing - GRATIS, Uang Tidak Real)

1. Buka https://dashboard.sandbox.midtrans.com/register
2. Isi data:
   - Email
   - Nama
   - Password
3. Verifikasi email
4. Login ke https://dashboard.sandbox.midtrans.com

### Ambil API Keys

1. Setelah login, klik menu **Settings** (ikon gear ⚙️) di sidebar kiri
2. Pilih **Access Keys**
3. Kamu akan melihat 2 kunci:
   - **Server Key** → contoh: `SB-Mid-server-abc123def456`
   - **Client Key** → contoh: `SB-Mid-client-xyz789`
4. **CATAT KEDUA KEY INI** (copy ke notepad dulu)

> ⚠️ **PENTING:** Jangan share Server Key ke siapapun! Ini rahasia.

---

## ⚙️ Langkah 3: Konfigurasi Project

### 3.1 Buka folder project di terminal/CMD

**Windows:**
1. Buka File Explorer
2. Pergi ke folder project (`kiro`)
3. Klik di address bar, ketik `cmd`, tekan Enter

**Mac:**
1. Buka Terminal
2. Ketik `cd ` (pakai spasi setelah cd)
3. Drag folder project ke Terminal
4. Tekan Enter

### 3.2 Buat file `.env`

File ini berisi konfigurasi rahasia. **WAJIB dibuat.**

**Windows (CMD):**
```bash
copy .env.example .env
```

**Mac/Linux (Terminal):**
```bash
cp .env.example .env
```

### 3.3 Edit file `.env`

Buka file `.env` dengan text editor (VS Code, Notepad, dll).

Ubah isinya menjadi:

```env
# Mode testing (ubah ke true nanti kalau sudah production)
MIDTRANS_IS_PRODUCTION=false

# Ganti dengan key dari dashboard Midtrans sandbox kamu
MIDTRANS_SERVER_KEY=SB-Mid-server-XXXXXXXXXXXXXXXXX
MIDTRANS_CLIENT_KEY=SB-Mid-client-XXXXXXXXXXXXXXXXX

# Biarkan default untuk testing lokal
PORT=3000
BASE_URL=http://localhost:3000
```

> 🔄 Ganti `SB-Mid-server-XXXXXXXXX` dan `SB-Mid-client-XXXXXXXXX` dengan key yang kamu catat di Langkah 2.

**SIMPAN FILE.**

---

## 📦 Langkah 4: Install Dependencies (Library yang Dibutuhkan)

Masih di terminal/CMD (di folder project), jalankan:

```bash
npm install
```

Tunggu sampai selesai. Akan muncul folder baru bernama `node_modules`.

> ❓ Kalau error "npm not found" → berarti Node.js belum terinstall. Kembali ke Langkah Persiapan.

---

## 🚀 Langkah 5: Jalankan Server!

```bash
npm start
```

Jika berhasil, kamu akan lihat output seperti ini:

```
=========================================
🚀 Server running at http://localhost:3000
   Midtrans mode: SANDBOX
   GoPay Redirect: http://localhost:3000/gopay
=========================================
```

---

## 🌐 Langkah 6: Buka di Browser

Buka browser (Chrome/Firefox/Edge), ketik di address bar:

```
http://localhost:3000
```

🎉 **SELAMAT!** Kamu akan melihat halaman checkout ChatGPT Plus!

---

## 🧪 Langkah 7: Test Pembayaran (Mode Sandbox)

Karena masih mode SANDBOX, semua pembayaran adalah **simulasi** (uang tidak real).

### Test GoPay:
1. Di halaman checkout, pilih paket **ChatGPT Plus**
2. Pilih metode **GoPay**
3. Isi nama, email, dan nomor HP
4. Klik **"Bayar Rp 320.000"**
5. Kamu akan di-redirect ke halaman Midtrans Sandbox
6. Di halaman Midtrans sandbox, klik **"Pay"** atau **"Bayar"**
7. Selesai! Kamu akan diarahkan kembali ke halaman sukses

### Test Semua Metode:
1. Pilih metode **"Lainnya"**
2. Akan muncul popup Midtrans Snap
3. Pilih metode pembayaran (kartu kredit, BCA VA, dll)
4. Untuk test kartu kredit sandbox, gunakan:
   - **Nomor Kartu:** `4811 1111 1111 1114`
   - **CVV:** `123`
   - **Exp Date:** `01/25`
   - **OTP:** `112233`

---

## 📱 Halaman-Halaman yang Tersedia

| URL | Fungsi |
|-----|--------|
| `http://localhost:3000` | Halaman checkout utama |
| `http://localhost:3000/gopay` | Halaman khusus GoPay |
| `http://localhost:3000/api/orders` | Lihat semua pesanan (JSON) |
| `http://localhost:3000/api/status/ORDER-ID` | Cek status pesanan tertentu |

---

## 🌍 Langkah 8: Deploy ke Internet (Agar Bisa Diakses Orang Lain)

Agar website kamu bisa diakses dari mana saja, kamu perlu deploy ke server online. Berikut beberapa pilihan GRATIS:

### Opsi A: Railway.app (Paling Mudah)

1. Buka https://railway.app
2. Login dengan GitHub
3. Klik **"New Project"** → **"Deploy from GitHub Repo"**
4. Pilih repository `taufik22/kiro`
5. Tambahkan Environment Variables:
   - `MIDTRANS_IS_PRODUCTION` = `false`
   - `MIDTRANS_SERVER_KEY` = `SB-Mid-server-xxx`
   - `MIDTRANS_CLIENT_KEY` = `SB-Mid-client-xxx`
   - `BASE_URL` = `https://nama-app-kamu.up.railway.app`
   - `PORT` = `3000`
6. Klik Deploy!
7. Setelah selesai, kamu akan dapat URL seperti `https://kiro-production.up.railway.app`

### Opsi B: Render.com

1. Buka https://render.com
2. Sign up / Login
3. New → **Web Service**
4. Connect ke GitHub repo kamu
5. Isi:
   - **Name:** chatgpt-payment
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Tambahkan Environment Variables (sama seperti di atas)
7. Create Web Service

### Opsi C: VPS (Untuk yang Lebih Advanced)

Bisa pakai DigitalOcean, Vultr, atau IDCloudHost.

---

## 🏪 Langkah 9: Upgrade ke Mode PRODUCTION (Terima Uang Asli)

Ketika sudah siap menerima pembayaran nyata:

### 9.1 Daftar akun Midtrans Production
1. Buka https://account.midtrans.com/register
2. Lengkapi data bisnis (KTP, NPWP jika ada)
3. Tunggu verifikasi (biasanya 1-3 hari kerja)

### 9.2 Ambil Production Keys
1. Login ke https://dashboard.midtrans.com
2. Settings → Access Keys
3. Copy Server Key & Client Key PRODUCTION

### 9.3 Update file `.env`
```env
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_SERVER_KEY=Mid-server-XXXXXXXXXXXXXXXXX
MIDTRANS_CLIENT_KEY=Mid-client-XXXXXXXXXXXXXXXXX
BASE_URL=https://domain-kamu.com
```

### 9.4 Setup Webhook URL
1. Di dashboard Midtrans Production
2. Settings → Configuration
3. Set **Payment Notification URL** ke:
   ```
   https://domain-kamu.com/api/notification
   ```
4. Set **Finish Redirect URL** ke:
   ```
   https://domain-kamu.com/payment/finish
   ```
5. Set **Unfinish Redirect URL** ke:
   ```
   https://domain-kamu.com/payment/unfinish
   ```
6. Set **Error Redirect URL** ke:
   ```
   https://domain-kamu.com/payment/error
   ```

---

## ❓ Troubleshooting (Masalah Umum)

### "npm: command not found"
→ Node.js belum terinstall. Install ulang dari https://nodejs.org

### "MIDTRANS_SERVER_KEY belum di-set"
→ File `.env` belum dibuat atau key-nya masih kosong. Pastikan sudah diisi.

### "Error: Cannot find module 'express'"
→ Belum install dependencies. Jalankan `npm install` dulu.

### Server jalan tapi halaman kosong/error
→ Pastikan buka `http://localhost:3000` (bukan `https`)

### GoPay redirect tidak jalan
→ Di mode Sandbox, GoPay redirect akan ke halaman simulasi Midtrans. Ini normal.

### "EADDRINUSE: port 3000 sudah dipakai"
→ Ada program lain yang pakai port 3000. Ubah `PORT=3001` di file `.env`

### Webhook tidak masuk
→ Webhook hanya bekerja jika server online (bukan localhost). Untuk test lokal, bisa pakai ngrok.

---

## 🔧 Tips Tambahan

### Gunakan ngrok untuk test webhook di localhost:
```bash
# Install ngrok: https://ngrok.com
ngrok http 3000
```
Nanti akan dapat URL seperti `https://abc123.ngrok.io` — set ini sebagai `BASE_URL` dan Notification URL.

### Mode Development (Auto-restart saat edit file):
```bash
npm run dev
```

### Lihat semua pesanan:
Buka `http://localhost:3000/api/orders` di browser.

---

## 📁 Struktur File Project

```
kiro/
├── .env.example      ← Template konfigurasi (copy jadi .env)
├── .env              ← File konfigurasi RAHASIA (jangan commit!)
├── package.json      ← Info project & dependencies
├── server.js         ← Backend server (logic utama)
└── public/
    ├── index.html          ← Halaman checkout utama
    ├── gopay.html          ← Halaman checkout GoPay
    ├── payment-finish.html ← Halaman sukses bayar
    ├── payment-unfinish.html ← Halaman belum selesai
    └── payment-error.html  ← Halaman error
```

---

## 📞 Butuh Bantuan?

- Dokumentasi Midtrans: https://docs.midtrans.com
- Midtrans Sandbox Dashboard: https://dashboard.sandbox.midtrans.com
- Node.js Download: https://nodejs.org

---

**Selamat! 🎉 Kamu sudah berhasil membuat payment gateway sendiri!**
