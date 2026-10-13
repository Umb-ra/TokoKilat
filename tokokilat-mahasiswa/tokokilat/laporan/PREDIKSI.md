# Log prediksi

Aturan: satu entri per masalah. Bagian **Sebelum perbaikan** harus di-commit *sebelum* commit
perbaikannya. Bagian **Sesudah perbaikan** diisi setelah pengukuran ulang. Jangan menyunting
bagian "sebelum" setelah hasilnya diketahui; bila prediksi meleset, jelaskan di bagian "sesudah".

---

## P-04: HP panas dan baterai boros saat idle

**Tiket terkait:** TK-1070
**Tanggal dan hash commit entri ini:** 2026-10-13

### Sebelum perbaikan

- **Yang teramati di trace (baseline):**
  Di rekaman S6 (diam 10 detik tanpa sentuh apa-apa), track Main di flame chart terlihat penuh sesak dengan balok-balok kuning kecil yang berulang terus-menerus tanpa jeda. Tidak ada waktu idle sama sekali. Di Bottom-Up, fungsi yang paling dominan adalah callback dari promo.js:38:15 (teks berjalan) dan promo.js:40:19 (Layout dari penulisan style.left). Keduanya dipicu oleh Timer fired, yaitu setInterval yang berjalan setiap 10ms. Dari alat ukur, median frame lambat (>50ms) ada 271 buah dalam 10 detik, dan frame terburuk mencapai 1260ms. Target tugas adalah paling banyak 2 frame lambat per 10 detik.

- **Dugaan mekanisme:**
  Di promo.js ada dua setInterval dengan interval 10ms (baris 22 dan 38). Artinya ada sekitar 200 callback per detik yang masuk ke task queue dan dieksekusi di main thread.

  Masalah pertama (hitung mundur, baris 22-32): setiap callback membaca wadah.offsetWidth (memaksa browser menghitung layout / forced reflow) lalu langsung menulis garis.style.width. Pola baca-tulis-baca-tulis ini disebut layout thrashing - browser harus menghitung ulang layout setiap kali ada pembacaan setelah penulisan.

  Masalah kedua (teks berjalan, baris 38-42): setiap callback menulis teks.style.left = x + 'px'. Properti left mempengaruhi layout, jadi setiap penulisan memicu tahap Style -> Layout -> Paint di rendering pipeline. Ini terjadi 100 kali per detik.

  Akibatnya, CPU tidak pernah masuk kondisi idle. Pada perangkat HP kelas bawah, ini bikin prosesor terus bekerja keras -> panas -> baterai cepat habis, persis seperti yang dikeluhkan Pak Yusuf.

- **Rencana perubahan:**
  1. Hitung mundur: Ganti setInterval(10ms) dengan requestAnimationFrame. Angka jam/menit/detik cukup diperbarui saat nilainya berubah (per detik), centidetik diperbarui setiap frame (~60fps, sudah cukup mulus). Untuk garis progress, simpan nilai offsetWidth sekali saja (cache), jangan baca ulang setiap frame. Hitung lebar garis pakai persentase CSS (width: ...%) supaya tidak perlu baca offsetWidth sama sekali.
  2. Teks berjalan: Ganti setInterval(10ms) + style.left dengan CSS animation menggunakan transform: translateX(). Animasi transform berjalan di compositor thread, jadi main thread benar-benar bebas dan browser bisa idle.

- **Prediksi terukur:**
  Setelah perubahan, frame lambat (>50ms) per 10 detik turun dari ~271 menjadi sekitar 0-2 frame, karena main thread tidak lagi dibanjiri 200 callback per detik. Aktivitas main thread saat idle seharusnya mendekati nol - hanya rAF yang berjalan ~60fps untuk hitung mundur, dan teks berjalan sepenuhnya di compositor.

  Prediksi efek samping: Angka centidetik mungkin terlihat sedikit kurang mulus dibanding sebelumnya. setInterval(10ms) mengupdate 100 kali per detik, sedangkan requestAnimationFrame hanya ~60 kali per detik. Tapi perbedaannya kecil dan tidak terasa oleh mata biasa. Teks berjalan dengan CSS animation mungkin kecepatannya sedikit beda dari versi JS - perlu disesuaikan durasinya supaya terasa mirip.

- **Alternatif yang dipertimbangkan dan alasan tidak dipilih:**
  1. Kenapa tidak cukup turunkan frekuensi setInterval ke 100ms saja? - Memang akan mengurangi beban, tapi tetap memicu layout di main thread (masih pakai style.left dan offsetWidth). CPU tetap tidak bisa idle sepenuhnya. Dan angka centidetik jadi sangat patah-patah kalau cuma update 10 kali per detik.
  2. Kenapa pilih CSS animation untuk teks berjalan, bukan requestAnimationFrame? - rAF memang lebih baik dari setInterval, tapi tetap berjalan di main thread. CSS animation dengan transform bisa di-offload ke compositor thread, jadi main thread benar-benar kosong saat idle. Ini solusi paling bersih untuk animasi yang tidak butuh logika JS.

### Sesudah perbaikan

- Hash commit perbaikan: 369d6d7

- Hasil ukur (median 3 kali, tanpa CPU throttling):

  Sebelum -> Sesudah:
  - frameLambat: 271 -> 163 (turun 40%)
  - frameTerburuk: 1260ms -> 206ms (turun 84%)
  - jumlahLongTask: 156 -> 132 (turun 15%)
  - totalBlokir: 4593ms -> 3109ms (turun 32%)

  Dari trace:
  - TimerFire: 265 -> 11 (turun 96%)
  - requestAnimationFrame: 140 -> 316 (naik, memang diharapkan karena rAF menggantikan setInterval)

  Di screenshot flame chart sebelum perbaikan (S6-idle-overview.png), track Main penuh sesak dengan balok-balok kuning kecil yang mepet tanpa jeda dari detik 1 sampai 12. Kalau di-search "timer" di panel Performance, muncul 265 hasil Timer fired, masing-masing berdurasi sekitar 20ms dan memicu Scripting 7ms + Rendering 2ms + System 12ms.

  Sesudah perbaikan (After-S6-idle-overview.png), track Main terlihat jauh lebih lega. Ada banyak ruang kosong antar task. Kalau di-search "timer", cuma muncul 11 hasil, dan durasinya cuma 0.59ms per Timer fired (kemungkinan dari SDK analitik, bukan dari promo.js lagi). Aktivitas yang tersisa di main thread sebagian besar adalah callback rAF (fungsi perbarui) yang berjalan ~30 kali per detik untuk update angka hitung mundur.

- Prediksi vs kenyataan: sebagian tepat, sebagian meleset.

  Dugaan bahwa setInterval 10ms di promo.js jadi penyebab utama main thread ga pernah idle ternyata benar. Setelah diganti rAF dan CSS animation, TimerFire turun dari 265 ke 11 (96%). Flame chart sesudah perbaikan keliatan jauh lebih lega dibanding sebelumnya. frameTerburuk juga turun dari 1260ms ke 206ms (84%).

  Tapi prediksi frameLambat turun ke 0-2 per 10 detik ternyata meleset, kenyataannya masih 163. Setelah dilihat lagi di trace, ternyata masih ada script lain yang jalan di main thread saat idle, terutama fungsi pantauFrame (dari alat ukur) dan fungsi gambar (kemungkinan dari lazy loading atau observer di script lain). Jadi promo.js memang sumber utama timer, tapi bukan satu-satunya penyebab frame lambat. Script lain yang belum disentuh (katalog.js, harga-promo.js) masih ikut berkontribusi.

- Efek samping:
  1. Angka hundredths secara visual ga ada bedanya. Sebelumnya update 100x/detik via setInterval, sekarang ~60x/detik lewat rAF. Perbedaannya ga terasa di mata.
  2. Kecepatan teks berjalan sedikit beda dari versi JS karena durasi CSS animation di-set 15 detik per siklus, sedangkan versi JS tergantung lebar parent. Tapi secara visual tetap mulus.
  3. Semua fitur tetap jalan normal, ga ada yang hilang atau rusak.
