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

  Di screenshot flame chart sebelum perbaikan ([S6-idle-overview.png](gambar/S6-idle-overview.png)), track Main penuh sesak dengan balok-balok kuning kecil yang mepet tanpa jeda dari detik 1 sampai 12. Kalau di-search "timer" di panel Performance, muncul 265 hasil Timer fired, masing-masing berdurasi sekitar 20ms dan memicu Scripting 7ms + Rendering 2ms + System 12ms.

  Sesudah perbaikan ([After-S6-idle-overview.png](gambar/After-S6-idle-overview.png)), track Main terlihat jauh lebih lega. Ada banyak ruang kosong antar task. Kalau di-search "timer", cuma muncul 11 hasil, dan durasinya cuma 0.59ms per Timer fired (kemungkinan dari SDK analitik, bukan dari promo.js lagi). Aktivitas yang tersisa di main thread sebagian besar adalah callback rAF (fungsi perbarui) yang berjalan ~30 kali per detik untuk update angka hitung mundur.

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

  Di screenshot [gambar/S0-pasangbannerpromo.png](gambar/S0-pasangbannerpromo.png) terlihat bahwa banner promo disisipkan lewat prepend ke elemen utama setelah API /api/promo selesai (delay sekitar 1800ms). Saat banner masuk, semua konten yang sudah di-render (alat, kisi produk, ringkasan) tergeser ke bawah. Ini persis yang dikeluhkan Kak Rara, mau pencet barang tapi halamannya loncat dan yang kepencet malah iklan promo.

  Di screenshot [gambar/S0-samakantinggijudul.png](gambar/S0-samakantinggijudul.png) terlihat fungsi samakanTinggiJudul di katalog.js yang menulis style.height di elemen kartu-judul yang sudah ter-render. Ini juga bikin layout shift tambahan karena mengubah dimensi elemen setelah browser sudah menghitung layout awal.

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

- Hash commit perbaikan: 8104a24

- Hasil ukur (median 3 kali, S0):

  Sebelum -> Sesudah:
  - CLS: 0.473 -> 0.003 (turun 99.4%, target tugas <= 0.1 tercapai)
  - totalBlokir: 4726ms -> 1044ms (turun 78%)
  - jumlahLongTask: 160 -> 26 (turun 84%)
  - frameLambat: 212 -> 120 (turun 43%)
  - frameTerburuk: 1127ms -> 860ms (turun 24%)

  Dari trace:
  - LayoutShift events tak terduga (hadRecentInput = false): hanya tersisa 1 shift mikro dengan skor 0.0025. Pergeseran besar 0.1369 yang menggeser div alat, kisi, dan ringkasan di detik ke-9.5 sepenuhnya hilang.
  - samakanTinggiJudul: durasi turun ke ~0ms karena penyeragaman tinggi diserahkan ke CSS min-height pada kartu-judul, menghapus 24 kali forced reflow berturut-turut.

  Di screenshot flame chart sebelum perbaikan ([gambar/S0-layoutshift-overview.png](gambar/S0-layoutshift-overview.png)), track Layout shifts memiliki balok ungu tebal di sekitar detik ke-9.5 dengan shift score 0.1369 yang menggeser elemen div id=alat, div id=kisi, dan p id=ringkasan. Di [gambar/S0-samakantinggijudul.png](gambar/S0-samakantinggijudul.png), fungsi samakanTinggiJudul memakan waktu 236ms karena loop 24 kali membaca offsetHeight (forced reflow) dan menulis style.height berulang kali.

  Sesudah perbaikan ([gambar/After-S0-layoutshift-overview.png](gambar/After-S0-layoutshift-overview.png)), balok ungu tebal di track Layout shifts sudah tidak ada lagi, hanya menyisakan satu cluster mikro di detik ke-4.6 dengan shift score 0.0025 (total CLS 0.0025, tercatat 0.003 di alat ukur). Di [gambar/After-S0-samakantinggijudul.png](gambar/After-S0-samakantinggijudul.png), fungsi samakanTinggiJudul sudah tidak muncul di flame chart (waktu eksekusi 0ms) karena penyeragaman tinggi diserahkan ke CSS min-height, sehingga renderProduk selesai jauh lebih cepat tanpa forced reflow.

- Prediksi vs kenyataan: sangat tepat.

  Dugaan bahwa banner promo yang di-prepend ke main dan fungsi samakanTinggiJudul menjadi biang kerok lonjakan CLS terbukti benar. Dengan memasang container banner kosong secara sinkron di detik ke-0 (sebelum fetch API promo) dan mengatur min-height di CSS, browser sudah mencadangkan ruang banner sejak awal. Saat response API datang setelah delay 1800ms, konten tinggal dimasukkan ke container tanpa mendorong elemen-elemen di bawahnya turun.

  Prediksi CLS turun di bawah 0.1 tercapai bahkan jauh melampaui ekspektasi: dari 0.473 anjlok ke 0.003 (turun 99.4%). Total waktu blokir juga ikut turun drastis dari 4726ms ke 1044ms (turun 78%) karena penghapusan loop layout thrashing di samakanTinggiJudul.

- Efek samping:
  1. Banner promo tampil sebagai kontainer kosong berwarna biru gelap selama ~1.8 detik sebelum teks dan tombol muncul. Secara UX ini trade-off yang jauh lebih baik daripada konten mendadak loncat turun dan memicu salah klik iklan.
  2. Judul produk yang hanya 1 baris memiliki sedikit ruang kosong ekstra di bawahnya karena min-height 3.8em disesuaikan untuk mengakomodasi judul hingga 3 baris. Tapi kartu-kartu dalam satu baris grid jadi sejajar rapi secara konsisten tanpa penalti performa JS.
  3. Semua fungsionalitas banner (klik promo, toast info, pelacakan event promo_click di SDK analitik) tetap bekerja normal.

---

## P-02: Layar freeze saat pakai voucher

Tiket terkait: TK-1057
Tanggal dan hash commit entri ini: 2026-10-13

### Sebelum perbaikan

- Yang teramati di trace (baseline):
  Di rekaman S4 (klik "Pakai voucher" dengan kode KILAT1212, lalu coba ketik di kolom cari), track Interactions menunjukkan satu interaksi Pointer dengan durasi 1.81 detik (input delay 14ms, processing duration 1697ms, presentation delay 97ms). Di flame chart, ada satu blok Task raksasa yang membentang dari detik ke-2.5 sampai ke-4.5. Di dalamnya terlihat Event: click -> Run microtasks -> terapkanVoucher yang memakan seluruh durasi tanpa jeda.

  Di tab Bottom-Up, fungsi yang mendominasi: Layout (584ms, 33.3%), simulasiCicilan dari harga-promo.js:14:25 (395ms, 22.5%), formatRupiah (211ms, 12%), get offsetHeight (95.5ms, 5.4%), dan Recalculate style (69.7ms, 4%). Dari alat ukur, median INP 1824ms (target <= 200ms), long task terlama 1808ms, dan total waktu blokir 8678ms. Selama perhitungan berlangsung, progress bar tidak pernah bergerak (langsung loncat dari 0% ke 100%) dan kolom cari tidak bisa diketik.

- Dugaan mekanisme:
  Di harga-promo.js, fungsi terapkanVoucher (baris 42-73) melakukan loop for-of atas seluruh produk (3000 buah). Setiap iterasi memanggil await hitungHargaPromo(produk, aturan) yang di-mark async (baris 31). Komentar Rudi di baris 30 berbunyi "Dibuat async supaya perhitungan tidak memblokir halaman."

  Masalahnya: hitungHargaPromo tidak mengandung operasi asinkron sejati (tidak ada fetch, setTimeout, atau I/O). Fungsi ini hanya melakukan komputasi sinkron (hitungHargaPromo -> simulasiCicilan 41 kali per produk). Karena tidak ada operasi asinkron di dalamnya, fungsi async ini langsung return resolved promise. Saat kita await sebuah resolved promise, kelanjutannya dijadwalkan sebagai microtask.

  Microtask dieksekusi segera setelah task saat ini selesai, sebelum browser mendapat rendering opportunity. Artinya: seluruh 3000 iterasi for-of berjalan sebagai rangkaian microtask yang tak terputus di satu task queue turn. Browser tidak pernah mendapat kesempatan untuk menjalankan tahap Style -> Layout -> Paint -> Composite di antara iterasi. Akibatnya:
  1. Progress bar tidak pernah diperbarui secara visual (penulisan isi.style.width dan teks.textContent masuk ke DOM tapi browser tidak pernah menggambarnya).
  2. Kolom cari tidak merespons input karena event handler keyboard menunggu di task queue, tapi task saat ini (yang berisi ribuan microtask) belum selesai.
  3. INP membengkak ke 1824ms karena dari sudut pandang browser, klik "Pakai voucher" sampai frame berikutnya ter-render memakan waktu segitu.

  Selain itu, di setiap iterasi fungsi hitungHargaPromo memanggil simulasiCicilan 41 kali (baris 37: loop 40 kali untuk "cek kestabilan pembulatan" + 1 kali di baris 38). Setiap panggilan simulasiCicilan punya nested loop (tenor 1-24, bulan 1-tenor), jadi total iterasi inner loop per produk sekitar 41 × (24 × 12.5) = ~12.300 kali. Dikalikan 3000 produk = ~37 juta iterasi. Ini yang membuat processing duration mencapai 1697ms.

- Rencana perubahan:
  1. Pecah loop perhitungan menjadi chunk (misal 100 produk per chunk). Setelah setiap chunk, sisipkan yield ke main thread lewat mekanisme yang memberikan rendering opportunity (setTimeout(0) atau scheduler.yield()). setTimeout(0) menjadwalkan kelanjutan sebagai task baru, bukan microtask, sehingga browser punya kesempatan menggambar di antara chunk.
  2. Progress bar jadi update bertahap per chunk karena browser mendapat rendering opportunity setelah setiap chunk selesai.
  3. Kolom cari tetap responsif karena event handler keyboard bisa masuk di sela-sela chunk.

- Prediksi terukur:
  Setelah perubahan, INP pada S4 turun dari ~1824ms menjadi di bawah 200ms (target tugas). Long task terlama turun dari 1808ms ke sekitar 50-100ms per chunk. Progress bar bergerak bertahap secara visual dari 0% ke 100%. Kolom cari tetap bisa diketik selama perhitungan berjalan.

  Total waktu perhitungan mungkin sedikit lebih lama dari sebelumnya karena overhead yield (setiap setTimeout menambah delay minimal ~4ms). Tapi perbedaannya kecil dan trade-off-nya sangat layak: pengguna melihat progres dan bisa berinteraksi, dibandingkan layar freeze 1.8 detik.

  Prediksi efek samping: kalau ukuran chunk terlalu kecil (misal 1 produk per chunk), overhead yield jadi signifikan dan total waktu perhitungan bisa jauh lebih lama. Kalau chunk terlalu besar (misal 1000 produk), masih ada long task yang terasa. Perlu cari titik tengah yang tepat.

- Alternatif yang dipertimbangkan dan alasan tidak dipilih:
  1. Kenapa tidak pakai Web Worker? Web Worker memindahkan komputasi ke thread terpisah sehingga main thread benar-benar bebas. Tapi trade-off-nya: data produk harus ditransfer via structured clone (3000 objek), lalu hasilnya ditransfer balik. Ini menambah kompleksitas (file worker terpisah, message passing) dan tugas menyebutkan "tanpa framework, library, atau bundler". Untuk kasus ini chunking dengan setTimeout sudah cukup menyelesaikan masalah.
  2. Kenapa tidak cukup kurangi jumlah simulasiCicilan dari 41 ke 1? Memang akan mempercepat komputasi, tapi loop 40 kali itu disebut "cek kestabilan pembulatan" yang merupakan aturan bisnis. Menghapusnya bisa mengubah hasil perhitungan. Lagipula, meski komputasi dipercepat, tanpa yield browser tetap tidak mendapat rendering opportunity (microtask tetap memblokir). Chunking menyelesaikan akar masalahnya: browser butuh rendering opportunity, bukan komputasi yang lebih cepat.
  3. Kenapa tidak pakai requestIdleCallback? rIC memang memberikan rendering opportunity, tapi dipanggil saat browser sedang idle dengan deadline yang pendek. Untuk komputasi yang harus selesai dalam waktu wajar, setTimeout(0) lebih prediktif karena dijadwalkan segera setelah rendering opportunity, bukan menunggu idle.

### Sesudah perbaikan

- Hash commit perbaikan: 68d63e5

- Hasil ukur (median 3 kali, S4):

  Sebelum -> Sesudah:
  - INP: 1824ms -> 104ms (turun 94.3%, target tugas <= 200ms tercapai)
  - longTaskTerlama: 1808ms -> 632ms (turun 65.0%, di trace sebagian besar chunk berkisar 40-70ms)
  - totalBlokir: 8678ms -> 1098ms (turun 87.3%)
  - jumlahLongTask: 125 -> 25 (turun 80%)
  - frameLambat: 157 -> 93 (turun 40.8%)
  - frameTerburuk: 1818ms -> 782ms (turun 57.0%)
  - CLS: 0.000 -> 0.035 (tetap aman jauh di bawah target 0.1)

  Catatan: median dihitung per metrik dari tiga pengukuran. INP, jumlahLongTask, frameLambat, dan CLS kebetulan jatuh pada After-S4-2, sedangkan longTaskTerlama, totalBlokir, dan frameTerburuk jatuh pada After-S4-3. Trace yang dipakai untuk screenshot adalah Trace2.

  Dari trace:
  - Interaksi Pointer (klik tombol "Pakai voucher" KILAT1212): berdurasi 100.81ms (Input delay 12ms, Processing duration 26ms, Presentation delay 63ms), turun drastis dari baseline yang mencapai 1.81 detik (processing duration 1697ms).
  - Pembagian komputasi (chunking): Task raksasa 1.8 detik yang memonopoli main thread pada baseline terpecah menjadi puluhan task kecil (sekitar 30 chunk untuk 3000 produk, dengan rata-rata durasi 40-60ms per chunk).
  - Jeda rendering (rendering opportunity): Di antara task chunk, terdapat jeda kosong di main thread yang memungkinkan browser mengeksekusi pipeline rendering (UpdateLayoutTree, Layout, Paint, Composite).
  - Progress bar visual: Progres bar tidak lagi diam di 0% lalu meloncat ke 100%, melainkan ter-render bergerak secara bertahap (terbukti di screenshot [gambar/After-S4-Progressbar-hitunghargapromo.png](gambar/After-S4-Progressbar-hitunghargapromo.png) saat mencapai 40% / 1200 dari 3000 produk).
  - Kolom cari: Input keyboard dapat dieksekusi di sela-sela antar chunk, sehingga halaman tidak freeze saat voucher diterapkan.

  Di screenshot flame chart sebelum perbaikan ([gambar/S4-longtask-overview.png](gambar/S4-longtask-overview.png)), track Main didominasi oleh satu balok Task kuning raksasa sepanjang 1.81 detik tanpa jeda sama sekali (Event: click -> Run microtasks -> terapkanVoucher memproses seluruh 3000 produk sekaligus), menghasilkan interaksi pointer merah dengan durasi 1.81 detik dan browser tidak dapat merender frame apa pun.
  
  Sesudah perbaikan ([gambar/After-S4-longtask-overview.png](gambar/After-S4-longtask-overview.png)), balok raksasa tersebut sepenuhnya lenyap. Track Main menampilkan deretan task-task kecil vertikal yang rapi (~40-50ms) dengan celah putih di antaranya. Track Interactions menampilkan balok Pointer normal dengan durasi hanya 100.81ms, dan track Frames terus menghasilkan frame rendering aktif. Di [gambar/After-S4-bottomup.png](gambar/After-S4-bottomup.png), fungsi simulasiCicilan dan Layout sudah tidak lagi memonopoli main thread dalam satu long task tak terputus.

- Prediksi vs kenyataan: sangat tepat.
  Dugaan bahwa fungsi hitungHargaPromo yang di-mark async menghasilkan resolved promise dan dirantai sebagai microtask tak berujung terbukti 100% benar. Dengan menghapus async tiruan tersebut dan memecah loop for-of menjadi chunk 100 produk yang diselingi pemanggilan yield via setTimeout(0), browser berhasil diberikan waktu bernapas (rendering opportunity) untuk menggambar DOM progress bar dan merespons antrean input pengguna.

  Prediksi INP turun di bawah 200ms tercapai sempurna (104ms). Prediksi bahwa progress bar bergerak bertahap terbukti nyata (seperti terlihat pada tangkapan layar [gambar/After-S4-Progressbar-hitunghargapromo.png](gambar/After-S4-Progressbar-hitunghargapromo.png)).

- Efek samping:
  1. Total durasi waktu perhitungan voucher bertambah sangat sedikit (sekitar beberapa puluh milidetik ekstra karena overhead minimal penundaan timer setTimeout(0) antar chunk), namun dampaknya sama sekali tidak terasa bagi pengguna karena antarmuka tetap responsif dan progres terlihat berjalan mulus.
  2. Ukuran chunk 100 produk terbukti menjadi titik kompromi yang ideal: cukup besar untuk meminimalkan overhead penjadwalan timer, namun cukup kecil untuk menjaga durasi per task tetap rendah (~40-60ms) sehingga tidak memicu long task ekstrem.
  3. Seluruh fitur voucher, diskon harga produk, simulasi cicilan, dan pembaruan tampilan kartu produk tetap berfungsi normal tanpa ada perubahan nilai kalkulasi maupun fitur yang rusak.

