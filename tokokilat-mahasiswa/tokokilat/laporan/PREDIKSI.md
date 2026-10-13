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

---

## P-05: Halaman loncat saat dimuat

Tiket terkait: TK-1078
Tanggal dan hash commit entri ini: 2026-10-13

### Sebelum perbaikan

- Yang teramati di trace (baseline):
  Di rekaman S0 (muat halaman, diam 10 detik), track Layout Shifts menunjukkan ada layout shift besar di sekitar detik ke-9.5. Di panel Summary, shift score-nya 0.1369 dan elemen yang bergeser adalah div id=alat, div id=kisi, dan p id=ringkasan. Culprit-nya ditunjukkan sebagai "Unsized image: 1.svg". CLS total dari alat ukur konsisten 0.473 di ketiga pengukuran (jauh di atas target 0.1).

  Di screenshot S0-pasangbannerpromo.png terlihat bahwa banner promo disisipkan lewat prepend ke elemen utama setelah API /api/promo selesai (delay sekitar 1800ms). Saat banner masuk, semua konten yang sudah di-render (alat, kisi produk, ringkasan) tergeser ke bawah. Ini persis yang dikeluhkan Kak Rara, mau pencet barang tapi halamannya loncat dan yang kepencet malah iklan promo.

  Di screenshot S0-samakantinggijudul.png terlihat fungsi samakanTinggiJudul di katalog.js yang menulis style.height di elemen kartu-judul yang sudah ter-render. Ini juga bikin layout shift tambahan karena mengubah dimensi elemen setelah browser sudah menghitung layout awal.

- Dugaan mekanisme:
  Ada dua penyebab layout shift:

  Penyebab pertama (banner promo, promo.js baris 51-66): fungsi pasangBannerPromo melakukan fetch ke /api/promo yang sengaja lambat (delay 1800ms dari server). Selama menunggu, halaman sudah selesai render produk. Saat response akhirnya datang, banner dibuat dan di-prepend ke elemen utama. Prepend artinya disisipkan di posisi paling atas, sehingga semua konten di bawahnya (toolbar, kisi produk, ringkasan) tergeser turun. Ini menghasilkan layout shift besar karena pergeserannya mempengaruhi banyak elemen sekaligus.

  Penyebab kedua (samakan tinggi judul, katalog.js baris 67-78): fungsi samakanTinggiJudul dipanggil di renderProduk setelah semua kartu sudah di-append ke DOM. Fungsi ini membaca offsetHeight (forced reflow) lalu langsung menulis style.height di loop. Setelah loop, semua judul di-set ke tinggi yang sama. Ini mengubah dimensi elemen yang sudah ter-render -> layout shift tambahan.

- Rencana perubahan:
  1. Banner promo: reservasi ruang di HTML untuk banner sebelum halaman dimuat. Tambahkan elemen placeholder dengan min-height yang sesuai (sekitar 132px, sesuai CSS .promo-banner). Saat data promo datang, isi placeholder tersebut alih-alih prepend elemen baru. Dengan begitu tidak ada konten yang bergeser karena ruangnya sudah disediakan sejak awal.
  2. Samakan tinggi judul: daripada mengukur dan menulis height satu per satu di loop (layout thrashing), kumpulkan dulu semua pengukuran, cari yang tertinggi, baru tulis sekaligus. Atau lebih baik lagi, gunakan CSS saja (min-height atau flexbox) supaya ga perlu JS sama sekali untuk menyamakan tinggi.

- Prediksi terukur:
  Setelah perubahan, CLS turun dari 0.473 menjadi di bawah 0.1 (target tugas). Layout shift dari banner promo seharusnya hilang sepenuhnya karena ruangnya sudah disiapkan. Layout shift dari samakanTinggiJudul juga berkurang atau hilang.

  Prediksi efek samping: kalau API promo gagal atau responsnya beda ukuran dari yang disiapkan, bisa ada ruang kosong sementara atau sedikit pergeseran saat banner terisi. Tapi ini jauh lebih baik daripada pergeseran besar yang sekarang terjadi.

- Alternatif yang dipertimbangkan dan alasan tidak dipilih:
  1. Kenapa tidak sembunyikan banner sepenuhnya sampai data siap? Karena itu berarti banner tetap muncul tiba-tiba dan menggeser konten, cuma waktunya ditunda. Masalah layout shift-nya ga hilang, cuma tertunda.
  2. Kenapa tidak taruh banner di bawah produk supaya ga ganggu? Karena tugas menyebutkan fitur harus tetap ada dan posisinya boleh disesuaikan tapi harus ada alasan. Menaruh banner di bawah mengurangi visibilitas promo, yang mungkin ga disetujui bisnis. Reservasi ruang di atas lebih tepat karena tetap mempertahankan posisi tanpa mengorbankan UX.
  3. Kenapa tidak pakai skeleton screen (kotak abu-abu placeholder)? Skeleton screen sebenarnya solusi yang bagus dan bisa dipakai. Tapi untuk kasus ini, cukup reservasi ruang dengan min-height sudah menyelesaikan masalah CLS. Skeleton screen menambah kompleksitas yang belum tentu perlu.

### Sesudah perbaikan

- Hash commit perbaikan: ....
- Hasil ukur (median 3 kali): ....
- Prediksi vs kenyataan: ....
- Efek samping: ....
