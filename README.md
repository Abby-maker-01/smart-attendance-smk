# Absensi SMK Mandiri Haurgeulis — source web hasil pemulihan

## Perubahan yang diterapkan
- Pilihan akun Murid dihilangkan. Halaman awal hanya menampilkan **Guru** di kiri dan **Admin** di kanan.
- Pendaftaran mandiri hanya tersedia untuk Guru; akun Guru tetap menunggu persetujuan Admin.
- Bagian data/rekap Murid dihapus dari tampilan.
- Rekap absensi Admin memakai pemilih **Bulan riwayat**. Bulan berjalan otomatis dipilih saat aplikasi dibuka.
- Data bulan sebelumnya tidak dihapus dari Firestore. Pilih bulan sebelumnya (misalnya Januari) untuk melihat arsipnya; bulan baru akan mulai dengan hitungan 0 karena rekap difilter per bulan.
- Unduhan CSV mengikuti bulan yang sedang dipilih.

## Isi paket
- `www/` — HTML, CSS, JavaScript, logo, manifest, dan konfigurasi Firebase yang dipulihkan dari APK yang diberikan.
- `capacitor.config.json` dan `package.json` — konfigurasi dasar Capacitor.

## Penting: batas pemulihan
File yang diberikan adalah **APK hasil build**, bukan folder proyek asli. Karena itu paket ini memulihkan dan mengubah sumber web yang tertanam di APK. Folder native Android asli, konfigurasi signing, dan file proyek pengembangan asli tidak tersedia di APK dan tidak dapat dipulihkan utuh dari berkas ini. Paket ini belum merupakan APK baru dan belum diuji terhubung ke Firebase.

## Mengunggah lewat HP Android ke GitHub
1. Ekstrak ZIP di HP.
2. Buka repository GitHub yang akan dipakai.
3. Unggah isi folder hasil ekstrak ke repository (folder `www`, `package.json`, `capacitor.config.json`, dan `README.md`).
4. Jangan menghapus atau menimpa konfigurasi Firebase di `www/firebase-config.js` kecuali memang ingin mengganti proyek Firebase.
5. Setelah diunggah, cek file `www/app.js` dan `www/index.html` di GitHub untuk memastikan perubahan ikut tersimpan.

## Catatan data
Arsip bulanan hanya mengubah tampilan/filter rekap. Dokumen absensi yang sudah tersimpan di koleksi Firestore `attendance` tetap dipertahankan. Jangan menghapus koleksi tersebut jika ingin riwayat bulan lalu tetap tersedia.
