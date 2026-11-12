# Mom Health

Website PWA berada di `health_dashboard/`. GitHub Actions menerbitkan aset statis ke GitHub Pages. Data dan autentikasi diproses oleh Google Apps Script, bukan dari browser secara langsung.

## GitHub Pages

Untuk repository `Alpinsil/mom-health`, alamat default Pages adalah `https://alpinsil.github.io/mom-health/`.

1. Pastikan `health_dashboard/config.js` menggunakan URL deployment Web App Apps Script yang benar. Jika `HEALTH_GAS_URL` bot dioverride di environment, samakan URL tersebut.
2. Pada GitHub, pilih **Settings → Pages → Source: GitHub Actions**.
3. Push perubahan ke branch `main`; workflow `.github/workflows/deploy-health-dashboard.yml` akan menerbitkan situs.

## Google Apps Script

Salin `health_reminder.gs` dan `health_web_bridge.html` ke project Apps Script yang sama dengan endpoint bot. Atur Script Properties `HEALTH_BOT_TOKEN`, `HEALTH_WEB_ACCESS_TOKEN`, `HEALTH_WEB_ALLOWED_ORIGIN=https://alpinsil.github.io`, dan properti gateway WhatsApp untuk reminder.

Jalankan `setupHealthSheets()`, pastikan daftar nomor terdaftar ada di tab `USER` kolom A di bawah header `nohp`, lalu deploy ulang sebagai Web App yang berjalan sebagai pemilik. Akses web app harus mengizinkan pengguna web karena bridge dipanggil dari GitHub Pages; operasi data tetap memerlukan token atau sesi yang sah.

Atur `HEALTH_WEB_URL=https://alpinsil.github.io/mom-health/` di `bot/.env.local`, lalu restart bot. Pengguna terdaftar dapat mengirim `LOGIN` atau `MASUK` ke bot lewat chat pribadi untuk menerima tautan login satu kali.

Jangan commit file `.env.local`, token, nomor penerima reminder, atau data kesehatan.
