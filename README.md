# Mom Health

Website PWA berada di `health_dashboard/`. GitHub Actions menerbitkan aset statis ke GitHub Pages. Data dan autentikasi diproses oleh Google Apps Script, bukan dari browser secara langsung.

## GitHub Pages

Untuk repository `Alpinsil/mom-health`, alamat default Pages adalah `https://alpinsil.github.io/mom-health/`.

1. Pastikan `health_dashboard/config.js` menggunakan URL deployment Web App Apps Script yang benar. Jika `HEALTH_GAS_URL` bot dioverride di environment, samakan URL tersebut.
2. Pada GitHub, pilih **Settings → Pages → Source: GitHub Actions**.
3. Push perubahan ke branch `main`; workflow `.github/workflows/deploy-health-dashboard.yml` akan menerbitkan situs.

## Google Apps Script

Salin versi terbaru `health_reminder.gs` dan `health_web_bridge.html` dari project bot ke project Apps Script yang sama dengan endpoint bot, lalu deploy sebagai versi baru. Atur Script Properties `HEALTH_BOT_TOKEN` dan `HEALTH_WEB_ALLOWED_ORIGIN=https://alpinsil.github.io`. Website tidak lagi memakai `HEALTH_WEB_ACCESS_TOKEN`.

Pastikan tab `USER` memiliki header `nohp` di A1 dan `password` di B1, dengan nomor dan password pada baris yang sama. Batasi akses editor spreadsheet dan gunakan password kuat yang unik. Jalankan `setupHealthSheets()`, lalu deploy sebagai Web App yang berjalan sebagai pemilik. Akses web app harus mengizinkan pengguna web karena bridge dipanggil dari GitHub Pages; operasi data hanya tersedia setelah login WhatsApp atau verifikasi nomor dan password.

Atur `HEALTH_WEB_URL=https://alpinsil.github.io/mom-health/` di `bot/.env.local`, lalu restart bot. Pengguna terdaftar dapat mengirim `LOGIN` atau `MASUK` ke bot lewat chat pribadi untuk menerima tautan login satu kali, atau login dengan nomor dan password dari tab `USER`.

Jangan commit file `.env.local`, token, nomor penerima reminder, atau data kesehatan.
